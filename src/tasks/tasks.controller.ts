import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TasksService } from "./tasks.service";

/**
 * Vercel Cron jobs cannot run in-process timers because serverless functions
 * are ephemeral.  Instead, Vercel calls an HTTP endpoint on a schedule defined
 * in vercel.json.  This controller exposes that endpoint and protects it with
 * a secret token so only Vercel (or an authorised caller) can trigger it.
 *
 * Set the env var CRON_SECRET to a long random string in Vercel's project
 * settings.  Vercel automatically forwards it as the Authorization header.
 */
@Controller("tasks")
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly configService: ConfigService,
  ) {}

  @Post("run-pending-return")
  @HttpCode(HttpStatus.OK)
  async runPendingReturn(
    @Headers("authorization") authHeader: string,
  ): Promise<{ updated: number }> {
    const secret = this.configService.get<string>("CRON_SECRET");

    // Validate bearer token if a secret is configured
    if (secret) {
      const expected = `Bearer ${secret}`;
      if (authHeader !== expected) {
        this.logger.warn("Unauthorized attempt to trigger pending-return cron");
        throw new UnauthorizedException("Invalid cron secret");
      }
    }

    this.logger.log("HTTP cron trigger received → running pending-return check");
    const updated = await this.tasksService.runPendingReturnCheck();
    return { updated };
  }
}
