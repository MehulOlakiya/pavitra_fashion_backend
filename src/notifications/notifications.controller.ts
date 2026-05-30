import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Fetch all active notifications (pickups + returns + pending payments) */
  @Get()
  async getNotifications() {
    return this.notificationsService.getNotifications();
  }

  /**
   * Call this after updating user notification times in Settings
   * so the cron jobs reschedule immediately without a restart.
   */
  @Post('reschedule')
  async reschedule() {
    await this.notificationsService.scheduleNotificationCrons();
    return { message: 'Notification crons rescheduled successfully.' };
  }
}
