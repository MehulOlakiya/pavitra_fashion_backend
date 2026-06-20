import { Injectable, Logger } from "@nestjs/common";
import { BookingsService } from "../bookings/bookings.service";

/**
 * TasksService contains the business logic for scheduled / on-demand tasks.
 *
 * NOTE: @nestjs/schedule CronJob timers are NOT used here because this backend
 * is deployed on Vercel (serverless).  Serverless functions are ephemeral –
 * they spin up per request and shut down immediately, so in-process cron jobs
 * never fire.
 *
 * Instead, Vercel Cron (configured in vercel.json) calls the
 * POST /tasks/run-pending-return HTTP endpoint on schedule, which in turn
 * calls runPendingReturnCheck() below.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Marks all bookings whose return date has passed as PENDING_RETURN.
   * Returns the number of bookings updated.
   */
  async runPendingReturnCheck(): Promise<number> {
    this.logger.log("Running pending-return check…");
    try {
      const updated =
        await this.bookingsService.markDueBookingsPendingReturn();
      this.logger.log(
        `Pending-return check complete. ${updated} booking(s) updated to PENDING_RETURN.`,
      );
      return updated;
    } catch (err) {
      this.logger.error("Pending-return check failed.", err);
      throw err;
    }
  }
}
