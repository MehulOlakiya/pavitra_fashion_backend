import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Booking, BookingDocument, BookingStatus } from '../bookings/schemas/booking.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsGateway } from './notifications.gateway';

export interface NotificationDto {
  id: string;
  type: 'pickup' | 'return' | 'pending_return';
  title: string;
  message: string;
  bookingId: string;
  orderId: string;
  customerName: string;
  productName: string;
  createdAt: Date;
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ─── Module Lifecycle ────────────────────────────────────────────────────────

  async onModuleInit() {
    await this.scheduleNotificationCrons();
  }

  onModuleDestroy() {
    // Clean up dynamic crons on shutdown
    ['pickup-notification', 'return-notification'].forEach((name) => {
      try {
        const job = this.schedulerRegistry.getCronJob(name);
        if (job) job.stop();
        this.schedulerRegistry.deleteCronJob(name);
      } catch (_) {
        // cron not registered yet — that's fine
      }
    });
  }

  // ─── Dynamic Cron Scheduling ─────────────────────────────────────────────────

  /**
   * Reads the first active user's pickupNotificationTime / returnNotificationTime
   * and registers two cron jobs. Falls back to 08:00 / 18:00 IST if not set.
   */
  async scheduleNotificationCrons() {
    const user = await this.userModel.findOne({ isActive: true }).exec();

    // Use || so that empty strings also fall back to the defaults
    const pickupTime = user?.pickupNotificationTime || '08:00'; // "HH:MM" IST
    const returnTime = user?.returnNotificationTime || '18:00'; // "HH:MM" IST

    const toCron = (hhmm: string): string => {
      const parts = hhmm.split(':');
      const hh = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);

      // Validate parsed values — fall back to midnight if anything is NaN
      if (isNaN(hh) || isNaN(mm)) {
        this.logger.warn(`Invalid time string "${hhmm}", falling back to "0 0 * * *"`);
        return '0 0 * * *';
      }

      // Convert IST (UTC+5:30) → UTC by subtracting 330 minutes
      const totalUTCMinutes = ((hh * 60 + mm - 330) % 1440 + 1440) % 1440;
      const utcH = Math.floor(totalUTCMinutes / 60);
      const utcM = totalUTCMinutes % 60;
      return `${utcM} ${utcH} * * *`;
    };

    this.registerOrReplace('pickup-notification', toCron(pickupTime), () =>
      this.runPickupNotification(),
    );
    this.registerOrReplace('return-notification', toCron(returnTime), () =>
      this.runReturnNotification(),
    );

    this.logger.log(
      `Pickup cron: ${pickupTime} IST | Return cron: ${returnTime} IST`,
    );
  }

  private registerOrReplace(name: string, cronExpr: string, fn: () => void) {
    try {
      this.schedulerRegistry.deleteCronJob(name);
    } catch (_) {}

    const job = new CronJob(cronExpr, fn);
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Cron [${name}] registered: "${cronExpr}"`);
  }

  // ─── Cron Handlers ───────────────────────────────────────────────────────────

  async runPickupNotification() {
    this.logger.log('Running pickup notification cron…');
    const pickups = await this.getTodayPickups();
    for (const notif of pickups) {
      this.gateway.broadcastNotification(notif);
    }
    if (pickups.length > 0) this.gateway.broadcastRefresh();
    this.logger.log(`Pickup cron done. Sent ${pickups.length} notification(s).`);
  }

  async runReturnNotification() {
    this.logger.log('Running return notification cron…');
    const returns = await this.getTodayReturns();
    for (const notif of returns) {
      this.gateway.broadcastNotification(notif);
    }
    if (returns.length > 0) this.gateway.broadcastRefresh();
    this.logger.log(`Return cron done. Sent ${returns.length} notification(s).`);
  }

  // ─── REST API ─────────────────────────────────────────────────────────────────

  async getNotifications(): Promise<NotificationDto[]> {
    const [pickups, returns, payments] = await Promise.all([
      this.getTodayPickups(),
      this.getTodayReturns(),
      this.getPendingPayments(),
    ]);

    const all = [...pickups, ...returns, ...payments];
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ─── Data Helpers ─────────────────────────────────────────────────────────────

  private getDateRange() {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );
    return { todayStart, endOfToday };
  }

  private prodName(b: BookingDocument): string {
    return b.items && b.items.length > 0 && b.items[0].product
      ? (b.items[0].product as any).name
      : 'Various Items';
  }

  async getTodayPickups(): Promise<NotificationDto[]> {
    const { endOfToday } = this.getDateRange();
    const bookings = await this.bookingModel
      .find({ status: BookingStatus.BOOKED, bookingDate: { $lte: endOfToday } })
      .populate('customer')
      .populate('items.product')
      .exec();

    return bookings.map((b) => ({
      id: `pickup_${b._id}`,
      type: 'pickup' as const,
      title: 'Order Pickup Today',
      message: `Order #${b.orderId || 'Unknown'} for ${(b.customer as any)?.name || 'Unknown'} is scheduled for pickup.`,
      bookingId: b._id.toString(),
      orderId: b.orderId || '#RR-UNKNOWN',
      customerName: (b.customer as any)?.name || 'Unknown',
      productName: this.prodName(b),
      createdAt: b.bookingDate,
    }));
  }

  async getTodayReturns(): Promise<NotificationDto[]> {
    const { endOfToday } = this.getDateRange();
    const bookings = await this.bookingModel
      .find({
        status: { $in: [BookingStatus.RENTED, BookingStatus.PENDING_RETURN] },
        returnDate: { $lte: endOfToday },
      })
      .populate('customer')
      .populate('items.product')
      .exec();

    return bookings.map((b) => ({
      id: `return_${b._id}`,
      type: 'return' as const,
      title: 'Order Return Due',
      message: `Order #${b.orderId || 'Unknown'} from ${(b.customer as any)?.name || 'Unknown'} is due for return.`,
      bookingId: b._id.toString(),
      orderId: b.orderId || '#RR-UNKNOWN',
      customerName: (b.customer as any)?.name || 'Unknown',
      productName: this.prodName(b),
      createdAt: b.returnDate,
    }));
  }

  async getPendingPayments(): Promise<NotificationDto[]> {
    const { endOfToday } = this.getDateRange();
    const bookings = await this.bookingModel
      .find({
        status: { $nin: [BookingStatus.CANCELLED] },
        remainingPayment: { $gt: 0 },
        $or: [
          { status: BookingStatus.RETURNED },
          { returnDate: { $lte: endOfToday } },
        ],
      })
      .populate('customer')
      .populate('items.product')
      .exec();

    return bookings.map((b) => ({
      id: `payment_${b._id}`,
      type: 'pending_return' as const,
      title: 'Pending Return / Payment',
      message: `Order #${b.orderId || 'Unknown'} has a pending payment of ₹${b.remainingPayment}.`,
      bookingId: b._id.toString(),
      orderId: b.orderId || '#RR-UNKNOWN',
      customerName: (b.customer as any)?.name || 'Unknown',
      productName: this.prodName(b),
      createdAt: (b as any).createdAt || new Date(),
    }));
  }
}
