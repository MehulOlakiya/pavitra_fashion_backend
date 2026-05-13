import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { SearchBookingDto } from "./dto/search-booking.dto";
import { UpdateBookingDto } from "./dto/update-booking.dto";
import {
  Booking,
  BookingDocument,
  BookingStatus,
} from "./schemas/booking.schema";

export interface PaginatedBookings {
  data: BookingDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
  ) {}

  /** Normalise any date input to IST (Asia/Kolkata, +05:30) midnight */
  private toISTMidnight(value: string | Date): Date {
    const d = new Date(value);
    // Extract wall-clock date in IST (UTC+5:30 = 330 minutes)
    const istOffset = 330 * 60 * 1000;
    const istMs = d.getTime() + istOffset;
    const istDate = new Date(istMs);
    const y = istDate.getUTCFullYear();
    const mo = istDate.getUTCMonth();
    const day = istDate.getUTCDate();
    // IST midnight = UTC midnight - 5h30m  (i.e. previous day 18:30 UTC)
    return new Date(Date.UTC(y, mo, day, 0, 0, 0) - istOffset);
  }

  async create(dto: CreateBookingDto): Promise<BookingDocument> {
    const booking = new this.bookingModel({
      ...dto,
    });
    return booking.save();
  }

  async search(query: SearchBookingDto): Promise<PaginatedBookings> {
    const filter: FilterQuery<BookingDocument> = {};

    if (query.serialNumber || query.customerName || query.customerPhone) {
      const orClauses: FilterQuery<BookingDocument>[] = [];

      if (query.serialNumber) {
        orClauses.push({
          productSerialNumber: {
            $regex: query.serialNumber.trim(),
            $options: "i",
          },
        });
      }

      if (query.customerName) {
        orClauses.push({
          customerName: {
            $regex: query.customerName.trim(),
            $options: "i",
          },
        });
      }

      if (query.customerPhone) {
        orClauses.push({
          customerPhone: {
            $regex: query.customerPhone.trim(),
            $options: "i",
          },
        });
      }

      filter.$or = orClauses;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      filter.bookingDate = {};
      if (query.fromDate) filter.bookingDate.$gte = new Date(query.fromDate);
      if (query.toDate) filter.bookingDate.$lte = new Date(query.toDate);
    }

    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ bookingDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAll(page = 1, limit = 10): Promise<PaginatedBookings> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.bookingModel
        .aggregate([
          {
            $addFields: {
              _sortPriority: {
                $cond: {
                  if: {
                    $in: [
                      "$status",
                      [BookingStatus.CANCELLED, BookingStatus.RETURNED],
                    ],
                  },
                  then: 1,
                  else: 0,
                },
              },
            },
          },
          { $sort: { _sortPriority: 1, createdAt: -1 } },
          { $skip: skip },
          { $limit: safeLimit },
          { $unset: "_sortPriority" },
        ])
        .exec(),
      this.bookingModel.countDocuments().exec(),
    ]);

    return {
      data: data as BookingDocument[],
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findOne(id: string): Promise<BookingDocument> {
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Booking "${id}" not found.`);
    return booking;
  }

  async update(id: string, dto: UpdateBookingDto): Promise<BookingDocument> {
    const updated = await this.bookingModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!updated) throw new NotFoundException(`Booking "${id}" not found.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Booking "${id}" not found.`);
  }

  async markBillSent(id: string): Promise<BookingDocument> {
    const updated = await this.bookingModel
      .findByIdAndUpdate(id, { isBillSend: true }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException(`Booking "${id}" not found.`);
    return updated;
  }

  /**
   * Called by the daily cron job.
   * Finds all ACTIVE bookings whose returnDate falls on today (UTC calendar date)
   * and flips their status to PENDING_RETURN.
   * Returns the count of updated documents.
   */
  async markDueBookingsPendingReturn(): Promise<number> {
    const now = new Date();
    // Start and end of today in UTC (dates are stored as UTC midnight)
    const todayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const todayEnd = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const result = await this.bookingModel
      .updateMany(
        {
          status: BookingStatus.ACTIVE,
          returnDate: { $gte: todayStart, $lte: todayEnd },
        },
        { $set: { status: BookingStatus.PENDING_RETURN } },
      )
      .exec();

    return result.modifiedCount;
  }

  async getAnalytics(
    params: {
      fromDate?: string;
      toDate?: string;
    } = {},
  ): Promise<{
    total: number;
    active: number;
    pending_return: number;
    returned: number;
    cancelled: number;
  }> {
    const matchStage: FilterQuery<BookingDocument> = {};
    if (params.fromDate || params.toDate) {
      matchStage.bookingDate = {};
      if (params.fromDate)
        matchStage.bookingDate.$gte = new Date(params.fromDate);
      if (params.toDate) matchStage.bookingDate.$lte = new Date(params.toDate);
    }

    const groups = await this.bookingModel
      .aggregate<{
        _id: string;
        count: number;
      }>([
        ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .exec();

    const result = {
      total: 0,
      active: 0,
      pending_return: 0,
      returned: 0,
      cancelled: 0,
    };
    for (const g of groups) {
      const key = g._id as keyof typeof result;
      if (key in result) result[key] = g.count;
      result.total += g.count;
    }
    return result;
  }

  /**
   * Returns all distinct product serial numbers that have an ACTIVE or
   * PENDING_RETURN booking overlapping the given [from, to] date range.
   */
  async getBookedSerials(from: Date, to: Date): Promise<string[]> {
    // Shift 'to' to the next day so the range is inclusive at the day level
    const toInclusive = new Date(to);
    toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

    return this.bookingModel
      .distinct("productSerialNumber", {
        status: { $in: [BookingStatus.ACTIVE, BookingStatus.PENDING_RETURN] },
        bookingDate: { $lt: toInclusive },
        returnDate: { $gte: from },
      })
      .exec() as Promise<string[]>;
  }

  async findFutureBookingsBySerial(
    serialNumber: string,
  ): Promise<BookingDocument[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return this.bookingModel
      .find({
        productSerialNumber: serialNumber.trim(),
        returnDate: { $gte: today, $lte: endOfMonth },
        status: {
          $nin: [BookingStatus.CANCELLED, BookingStatus.RETURNED],
        },
      })
      .sort({ bookingDate: 1 })
      .exec();
  }
}
