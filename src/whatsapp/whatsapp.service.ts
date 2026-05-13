import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, RemoteAuth, MessageMedia } from "whatsapp-web.js";
import { MongoStore } from "wwebjs-mongo";
import * as qrcode from "qrcode";
import * as mongoose from "mongoose";
import * as fs from "fs";
import * as path from "path";
import { BehaviorSubject, Observable } from "rxjs";
import { UsersService } from "../users/users.service";

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
  private qrDataUrl: string | null = null;
  private state: WhatsAppState = "idle";
  /** The user who called initialize() – their flag gets updated on ready/disconnect. */
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
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /** Returns an Observable that emits whenever state or QR changes. */
  getStatusStream(): Observable<WhatsAppStatus> {
    return this.statusSubject.asObservable();
  }

  /** Emit current state to all SSE subscribers. */
  private push(): void {
    this.statusSubject.next({ state: this.state, qr: this.qrDataUrl });
  }

  /**
   * Start the WhatsApp client if it isn't already running.
   * RemoteAuth will load any existing session from MongoDB so the QR
   * step is skipped on subsequent starts.
   *
   * NOTE: wwebjs-mongo reads from mongoose.connection (the default connection).
   * @nestjs/mongoose uses createConnection() internally, so the default
   * connection is never set by NestJS — we connect it explicitly here before
   * constructing MongoStore.
   */
  async initialize(userId: string): Promise<void> {
    if (this.state === "connected" || this.state === "initializing") {
      return;
    }

    this.activeUserId = userId;
    this.state = "initializing";
    this.qrDataUrl = null;
    this.push(); // notify SSE clients immediately so the UI shows the spinner

    try {
      // Ensure the default mongoose connection is open before MongoStore uses it.
      // readyState 0 = disconnected, 1 = connected.
      if (mongoose.connection.readyState === 0) {
        const uri = this.configService.get<string>("MONGODB_URI")!;
        await mongoose.connect(uri);
        this.logger.log("Default mongoose connection opened for wwebjs-mongo");
      }
    } catch (err) {
      this.logger.error(
        "Failed to open mongoose connection for wwebjs-mongo:",
        err,
      );
      this.state = "disconnected";
      this.push();
      return;
    }

    const store = new MongoStore({ mongoose });

    // wwebjs-mongo's save() always reads the zip from the process cwd
    // (e.g. `RemoteAuth.zip`), while RemoteAuth writes the zip into `dataPath`.
    // Setting dataPath to '.' keeps both libraries pointing at the same file.
    const dataPath = ".";

    this.client = new Client({
      authStrategy: new RemoteAuth({
        store,
        dataPath,
        backupSyncIntervalMs: 300_000,
      }),
      puppeteer: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      },
    });

    // Catch any stream/internal errors so they don't crash the process.
    this.client.on("error", (err: Error) => {
      this.logger.error("WhatsApp client error:", err);
    });

    this.client.on("qr", async (qr: string) => {
      try {
        this.logger.log("QR code generated – waiting for scan");
        this.qrDataUrl = await qrcode.toDataURL(qr);
        this.state = "qr";
        this.push();
      } catch (err) {
        this.logger.error("Failed to generate QR data URL:", err);
      }
    });

    this.client.on("ready", () => {
      try {
        this.logger.log("WhatsApp client connected");
        this.state = "connected";
        this.qrDataUrl = null;
        this.push();
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
        this.state = "disconnected";
        this.client = null;
        this.qrDataUrl = null;
        this.push();
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

    try {
      this.client.initialize();
    } catch (err) {
      this.logger.error("Failed to start WhatsApp client:", err);
      this.state = "disconnected";
      this.push();
    }
  }

  getStatus(): WhatsAppStatus {
    return { state: this.state, qr: this.qrDataUrl };
  }

  async sendMessage(
    mobileNumber: string,
    message: string,
    imageUrl?: string,
  ): Promise<void> {
    if (!this.client || this.state !== "connected") {
      throw new BadRequestException(
        "WhatsApp session is not active. Please scan the QR code first.",
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
    // With dataPath='.', RemoteAuth writes RemoteAuth/ and RemoteAuth.zip in cwd.
    for (const entry of ["RemoteAuth", "RemoteAuth.zip"]) {
      const p = path.resolve(entry);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }

    // Drop the GridFS collections used by wwebjs-mongo to store the session.
    if (mongoose.connection.readyState === 1) {
      try {
        const db = mongoose.connection.db;
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

    this.state = "idle";
    this.qrDataUrl = null;
    this.push();
    if (this.activeUserId) {
      this.usersService
        .setWhatsappSessionEnable(this.activeUserId, false)
        .catch((err) =>
          this.logger.error("Failed to clear isWhatsappSessionEnable", err),
        );
      this.activeUserId = null;
    }
    this.logger.log("WhatsApp session logged out and cleared");
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
  }
}
