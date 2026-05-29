import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking, BookingDocument, BookingStatus } from '../bookings/schemas/booking.schema';

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
export class NotificationsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
  ) {}

  async getNotifications(): Promise<NotificationDto[]> {
    const notifications: NotificationDto[] = [];
    const now = new Date();
    
    // Start of today in UTC
    const todayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      )
    );

    const endOfToday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23, 59, 59, 999
      )
    );

    // 1. Pickups: status is 'booked' and bookingDate is today or earlier
    const pickups = await this.bookingModel
      .find({
        status: BookingStatus.BOOKED,
        bookingDate: { $lte: endOfToday }
      })
      .populate('customer')
      .populate('items.product')
      .exec();

    for (const b of pickups) {
      const prodName = b.items && b.items.length > 0 && b.items[0].product ? (b.items[0].product as any).name : 'Various Items';
      notifications.push({
        id: `pickup_${b._id}`,
        type: 'pickup',
        title: 'Order Pickup Today',
        message: `Order #${b.orderId || 'Unknown'} for ${(b.customer as any)?.name || 'Unknown'} is scheduled for pickup.`,
        bookingId: b._id.toString(),
        orderId: b.orderId || '#RR-UNKNOWN',
        customerName: (b.customer as any)?.name || 'Unknown',
        productName: prodName,
        createdAt: b.bookingDate
      });
    }

    // 2. Returns: status is 'rented' or 'pending_return' and returnDate is today or earlier
    const returns = await this.bookingModel
      .find({
        status: { $in: [BookingStatus.RENTED, BookingStatus.PENDING_RETURN] },
        returnDate: { $lte: endOfToday }
      })
      .populate('customer')
      .populate('items.product')
      .exec();

    for (const b of returns) {
      const prodName = b.items && b.items.length > 0 && b.items[0].product ? (b.items[0].product as any).name : 'Various Items';
      notifications.push({
        id: `return_${b._id}`,
        type: 'return',
        title: 'Order Return Due',
        message: `Order #${b.orderId || 'Unknown'} from ${(b.customer as any)?.name || 'Unknown'} is due for return.`,
        bookingId: b._id.toString(),
        orderId: b.orderId || '#RR-UNKNOWN',
        customerName: (b.customer as any)?.name || 'Unknown',
        productName: prodName,
        createdAt: b.returnDate
      });
    }

    // 3. Payment Reminders: active/returned bookings with remainingPayment > 0
    // Only show if the returnDate is passed or it's already returned.
    const payments = await this.bookingModel
      .find({
        status: { $nin: [BookingStatus.CANCELLED] },
        remainingPayment: { $gt: 0 },
        $or: [
          { status: BookingStatus.RETURNED },
          { returnDate: { $lte: endOfToday } }
        ]
      })
      .populate('customer')
      .populate('items.product')
      .exec();

    for (const b of payments) {
      const prodName = b.items && b.items.length > 0 && b.items[0].product ? (b.items[0].product as any).name : 'Various Items';
      notifications.push({
        id: `payment_${b._id}`,
        type: 'pending_return',
        title: 'Pending Return / Payment',
        message: `Order #${b.orderId || 'Unknown'} has a pending payment of ₹${b.remainingPayment}.`,
        bookingId: b._id.toString(),
        orderId: b.orderId || '#RR-UNKNOWN',
        customerName: (b.customer as any)?.name || 'Unknown',
        productName: prodName,
        createdAt: (b as any).createdAt || new Date()
      });
    }

    // Sort notifications by date (newest first based on their relevance)
    return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
