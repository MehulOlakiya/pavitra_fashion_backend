import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { BookingsService } from "../bookings/bookings.service";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const cronExpr =
      this.configService.get<string>("CRON_PENDING_RETURN") ?? "30 2 * * *";

    const job = new CronJob(cronExpr, () => {
      this.runPendingReturnCheck();
    });

    this.schedulerRegistry.addCronJob("pending-return-check", job);
    job.start();

    this.logger.log(
      `Pending-return cron registered with expression: "${cronExpr}"`,
    );
  }

  private async runPendingReturnCheck(): Promise<void> {
    this.logger.log("Running daily pending-return check…");
    try {
      const updated = await this.bookingsService.markDueBookingsPendingReturn();
      this.logger.log(
        `Pending-return check complete. ${updated} booking(s) updated to PENDING_RETURN.`,
      );
    } catch (err) {
      this.logger.error("Pending-return check failed.", err);
    }
  }
}
