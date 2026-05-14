import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Sse,
  MessageEvent,
  Request,
} from "@nestjs/common";
import { Observable, map } from "rxjs";
import { WhatsAppService } from "./whatsapp.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Controller("whatsapp")
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * POST /api/whatsapp/initialize
   * Starts the WhatsApp client.  If a RemoteAuth session exists in MongoDB
   * the client reconnects silently; otherwise a QR is generated.
   */
  @Post("initialize")
  @HttpCode(HttpStatus.OK)
  async initialize(@Request() req: { user: { id: string } }) {
    await this.whatsappService.initialize(req.user.id);
    return { message: "WhatsApp initialization started" };
  }

  /**
   * GET /api/whatsapp/status
   * Returns the current connection state and, when in 'qr' state, the
   * base-64 data-URL of the QR code to display in the UI.
   * State is read from MongoDB so it persists across service restarts.
   */
  @Get("status")
  async getStatus(@Request() req: { user: { id: string } }) {
    return this.whatsappService.getStatus(req.user.id);
  }

  /**
   * GET /api/whatsapp/events  (SSE)
   * Streams state changes to the client in real-time.
   * The first event is the current state so the frontend can sync on connect.
   * Events: { state, qr }
   */
  @Sse("events")
  events(): Observable<MessageEvent> {
    // BehaviorSubject replays the latest value on subscribe, so every new SSE
    // connection instantly receives the current state (including qr data URL).
    return this.whatsappService
      .getStatusStream()
      .pipe(map((status) => ({ data: status }) as MessageEvent));
  }

  /**
   * POST /api/whatsapp/send
   * Body: { mobileNumber: string (digits only, with country code), message: string }
   */
  @Post("send")
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Body() dto: SendMessageDto,
  ) {
    await this.whatsappService.sendMessage(
      req.user.id,
      dto.mobileNumber,
      dto.message,
      dto.imageUrl,
    );
    return { message: "Message sent successfully" };
  }

  /**
   * POST /api/whatsapp/logout
   * Destroys the active client and wipes the RemoteAuth session from MongoDB.
   * The next call to /initialize will generate a fresh QR code.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: { user: { id: string } }) {
    await this.whatsappService.logout(req.user.id);
    return { message: "Logged out successfully" };
  }
}
