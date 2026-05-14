import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Client, RemoteAuth, MessageMedia } from "whatsapp-web.js";
import { MongoStore } from "wwebjs-mongo";
import * as qrcode from "qrcode";
import * as mongoose from "mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chromium from "@sparticuz/chromium";
import { BehaviorSubject, Observable } from "rxjs";
import { UsersService } from "../users/users.service";
import {
  WhatsAppSession,
  WhatsAppSessionDocument,
} from "./schemas/whatsapp-session.schema";

export type WhatsAppState =
  | "idle"
  | "initializing"
  | "qr"
  | "connected"
  | "disconnected";

export interface WhatsAppStatus {
  state: WhatsAppState;
  qr: string | null;
}

@Injectable()
export class WhatsAppService implements OnApplicationShutdown {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client | null = null;
  /** The user who called initialize() – used as the DB key for state updates. */
  private activeUserId: string | null = null;

  /**
   * BehaviorSubject – replays the latest value to every new SSE subscriber
   * immediately on connect, so late joins and reconnects always get current state.
   */
  private readonly statusSubject = new BehaviorSubject<WhatsAppStatus>({
    state: "idle",
    qr: null,
  });

  constructor(
    private readonly usersService: UsersService,
    @InjectModel(WhatsAppSession.name)
    private readonly whatsappSessionModel: Model<WhatsAppSessionDocument>,
  ) {}

  /** Returns an Observable that emits whenever state or QR changes. */
  getStatusStream(): Observable<WhatsAppStatus> {
    return this.statusSubject.asObservable();
  }

  /**
   * Persist state to MongoDB and emit to all SSE subscribers.
   * This is the single source of truth – no in-memory state/qr fields.
   */
  private push(state: WhatsAppState, qr: string | null): void {
    this.statusSubject.next({ state, qr });
    if (this.activeUserId) {
      const userId = this.activeUserId;
      this.whatsappSessionModel
        .findOneAndUpdate(
          { userId },
          { state, qr },
          { upsert: true, new: true },
        )
        .exec()
        .catch((err) =>
          this.logger.error("Failed to persist WhatsApp status:", err),
        );
    }
  }

  /**
   * Start the WhatsApp client if it isn't already running.
   * RemoteAuth will load any existing session from MongoDB so the QR
   * step is skipped on subsequent starts.
   *
   * NOTE: wwebjs-mongo reads from mongoose.connection (the default connection).
   * @nestjs/mongoose uses createConnection() internally which puts connections
   * in mongoose.connections[]. We find the already-connected NestJS connection
   * and pass a proxy object to MongoStore so no second connection is needed.
   */
  async initialize(userId: string): Promise<void> {
    // Read current state from DB – no in-memory state field.
    const existing = await this.whatsappSessionModel
      .findOne({ userId })
      .lean()
      .exec();
    const currentState = (existing?.state ?? "idle") as WhatsAppState;
    if (currentState === "connected" || currentState === "initializing") {
      return;
    }

    this.activeUserId = userId;
    this.push("initializing", null); // notify SSE clients immediately so the UI shows the spinner

    // Find the already-connected NestJS mongoose connection.
    // mongoose.connections[0] is always the default (unused by NestJS);
    // NestJS adds its connection at index 1+.
    const activeConn = mongoose.connections.find((c) => c.readyState === 1);
    if (!activeConn) {
      this.logger.error(
        "No active mongoose connection found. Ensure MongooseModule is initialized.",
      );
      this.push("disconnected", null);
      return;
    }

    // Build a proxy that satisfies MongoStore's interface without a second connect.
    const mongoProxy = {
      connection: activeConn,
      mongo: mongoose.mongo,
    };

    const store = new MongoStore({ mongoose: mongoProxy as typeof mongoose });

    // Use os.tmpdir() so RemoteAuth can write its session files in any
    // environment, including serverless runtimes (Vercel/Lambda) where only
    // /tmp is writable. process.cwd() ('/var/task') is read-only there.
    const dataPath = os.tmpdir();

    // In serverless (Vercel/Lambda) there is no bundled Chrome – use the
    // @sparticuz/chromium binary which is designed for these environments.
    const isServerless =
      !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

    const executablePath = isServerless
      ? await chromium.executablePath()
      : undefined;

    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      // Prevent Chromium from isolating each origin/site into its own process.
      // Without these flags, WhatsApp Web's mid-load navigations destroy the
      // Puppeteer execution context before whatsapp-web.js can inject its
      // scripts, causing the "Execution context was destroyed" error.
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      ...(isServerless ? chromium.args : []),
    ];

    this.client = new Client({
      authStrategy: new RemoteAuth({
        store,
        dataPath,
        backupSyncIntervalMs: 300_000,
      }),
      // Cache the WhatsApp Web page locally so the client doesn't re-fetch it
      // on every start. A fresh fetch causes an extra navigation mid-injection
      // which is another trigger for "Execution context was destroyed".
      webVersionCache: {
        type: "local",
        path: dataPath,
      },
      puppeteer: {
        ...(executablePath ? { executablePath } : {}),
        headless: true,
        args: puppeteerArgs,
      },
    });

    // Catch any stream/internal errors so they don't crash the process.
    this.client.on("error", (err: Error) => {
      this.logger.error("WhatsApp client error:", err);
    });

    this.client.on("qr", async (qr: string) => {
      try {
        this.logger.log("QR code generated – waiting for scan");
        const qrDataUrl = await qrcode.toDataURL(qr);
        this.push("qr", qrDataUrl);
      } catch (err) {
        this.logger.error("Failed to generate QR data URL:", err);
      }
    });

    this.client.on("ready", () => {
      try {
        this.logger.log("WhatsApp client connected");
        this.push("connected", null);
        if (this.activeUserId) {
          this.usersService
            .setWhatsappSessionEnable(this.activeUserId, true)
            .catch((err) =>
              this.logger.error("Failed to set isWhatsappSessionEnable", err),
            );
        }
      } catch (err) {
        this.logger.error("Error in ready handler:", err);
      }
    });

    this.client.on("remote_session_saved", () => {
      try {
        this.logger.log("Remote session saved to MongoDB");
      } catch (err) {
        this.logger.error("Error in remote_session_saved handler:", err);
      }
    });

    this.client.on("disconnected", (reason: string) => {
      try {
        this.logger.warn(`WhatsApp disconnected: ${reason}`);
        this.client = null;
        this.push("disconnected", null);
        if (this.activeUserId) {
          this.usersService
            .setWhatsappSessionEnable(this.activeUserId, false)
            .catch((err) =>
              this.logger.error("Failed to clear isWhatsappSessionEnable", err),
            );
          this.activeUserId = null;
        }
      } catch (err) {
        this.logger.error("Error in disconnected handler:", err);
      }
    });

    // initialize() is async – a synchronous try/catch will never catch its
    // rejections.  Attach a .catch() so unhandled-rejection warnings are gone
    // and the state is updated correctly when something goes wrong.
    this.client.initialize().catch((err: Error) => {
      this.logger.error("WhatsApp client initialization failed:", err);
      this.client = null;
      this.push("disconnected", null);
    });
  }

  async getStatus(userId: string): Promise<WhatsAppStatus> {
    const session = await this.whatsappSessionModel
      .findOne({ userId })
      .lean()
      .exec();
    if (!session) {
      return { state: "idle", qr: null };
    }
    return { state: session.state as WhatsAppState, qr: session.qr ?? null };
  }

  async sendMessage(
    userId: string,
    mobileNumber: string,
    message: string,
    imageUrl?: string,
  ): Promise<void> {
    // If the client is gone or the DB state is not connected, reinitialize so
    // a fresh QR code is generated, then surface a scannable error.
    const session = await this.whatsappSessionModel
      .findOne({ userId })
      .lean()
      .exec();
    const isConnected = this.client && session?.state === "connected";
    if (!isConnected) {
      // Kick off re-initialization in the background (generates QR via SSE).
      this.initialize(userId).catch((err) =>
        this.logger.error("Re-initialization during sendMessage failed:", err),
      );
      throw new BadRequestException(
        "WhatsApp session is not active. A new QR code is being generated – please scan it and try again.",
      );
    }
    const chatId = `91${mobileNumber}@c.us`;
    if (imageUrl) {
      try {
        const media = await MessageMedia.fromUrl(imageUrl, {
          unsafeMime: true,
        });
        await this.client.sendMessage(chatId, media, { caption: message });
      } catch (err) {
        this.logger.warn(
          `Could not fetch image from ${imageUrl}, sending text only: ${err}`,
        );
        await this.client.sendMessage(chatId, message);
      }
    } else {
      try {
        await this.client.sendMessage(chatId, message);
      } catch (err) {
        this.logger.error(
          `Failed to send text message to ${mobileNumber}:`,
          err,
        );
        throw err;
      }
    }
    this.logger.log(`Message sent to ${mobileNumber}`);
  }

  /**
   * Logout: clears the RemoteAuth session from MongoDB and destroys the client.
   * After this the next initialize() call will generate a fresh QR code.
   */
  async logout(): Promise<void> {
    if (this.client) {
      try {
        // logout() asks RemoteAuth to delete its stored session
        await this.client.logout();
      } catch {
        // ignore – session may already be invalid
      }
      try {
        await this.client.destroy();
      } catch {
        // ignore
      }
      this.client = null;
    }
    // Remove the local session dir and zip so RemoteAuth starts clean.
    // These are written inside dataPath (os.tmpdir()), not process.cwd().
    for (const entry of ["RemoteAuth", "RemoteAuth.zip"]) {
      const p = path.join(os.tmpdir(), entry);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }

    // Drop the GridFS collections used by wwebjs-mongo to store the session.
    const activeConn = mongoose.connections.find((c) => c.readyState === 1);
    if (activeConn) {
      try {
        const db = activeConn.db;
        const collections = await db.listCollections().toArray();
        const toDrop = [
          "whatsapp-RemoteAuth.chunks",
          "whatsapp-RemoteAuth.files",
        ];
        for (const name of toDrop) {
          if (collections.some((c) => c.name === name)) {
            await db.dropCollection(name);
            this.logger.log(`Dropped collection: ${name}`);
          }
        }
      } catch (err) {
        this.logger.error("Failed to drop GridFS session collections:", err);
      }
    }

    if (this.activeUserId) {
      await this.whatsappSessionModel
        .deleteOne({ userId: this.activeUserId })
        .exec()
        .catch((err) =>
          this.logger.error("Failed to delete WhatsApp session document:", err),
        );
      this.usersService
        .setWhatsappSessionEnable(this.activeUserId, false)
        .catch((err) =>
          this.logger.error("Failed to clear isWhatsappSessionEnable", err),
        );
      this.activeUserId = null;
    }
    this.statusSubject.next({ state: "idle", qr: null });
    this.logger.log("WhatsApp session logged out and cleared");
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      console.log("Shutting down WhatsApp client...");
      await this.client.destroy();
    }
  }
}
