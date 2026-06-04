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
import {
  Customer,
  CustomerDocument,
} from "../customers/schemas/customer.schema";

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
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
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
    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const booking = new this.bookingModel({
      ...dto,
      orderId,
    });
    const saved = await booking.save();

    // Maintain bidirectional relationship
    if (dto.customer) {
      await this.customerModel
        .findByIdAndUpdate(dto.customer, {
          $addToSet: { bookings: saved._id },
          $inc: { totalBooking: 1 },
        })
        .exec();
    }

    return saved.populate("customer");
  }

  async search(query: SearchBookingDto): Promise<PaginatedBookings> {
    const filter: FilterQuery<BookingDocument> = { isDeleted: { $ne: true } };

    if (query.customerId) {
      filter.customer = query.customerId;
    } else if (query.customerName || query.customerPhone || query.orderId || query.serialNumber) {
      const orConditions: any[] = [];
      
      if (query.customerName || query.customerPhone) {
        const customerFilter: FilterQuery<CustomerDocument> = { $or: [] };
        if (query.customerName) {
          customerFilter.$or!.push({ name: { $regex: query.customerName.trim(), $options: "i" } });
        }
        if (query.customerPhone) {
          customerFilter.$or!.push({ mobileNumber: { $regex: query.customerPhone.trim(), $options: "i" } });
        }
        const matchingCustomers = await this.customerModel.find(customerFilter).select("_id").exec();
        const customerIds = matchingCustomers.map((c) => c._id);
        if (customerIds.length > 0) {
          orConditions.push({ customer: { $in: customerIds } });
        }
      }

      if (query.orderId) {
        orConditions.push({ orderId: { $regex: query.orderId.trim(), $options: "i" } });
      }

      if (query.serialNumber) {
        orConditions.push({ productSerialNumber: { $regex: query.serialNumber.trim(), $options: "i" } });
        orConditions.push({ "items.serialNumber": { $regex: query.serialNumber.trim(), $options: "i" } });
      }

      if (orConditions.length > 0) {
        filter.$or = orConditions;
      } else {
        // Nothing matched the search query, force empty result
        filter._id = null;
      }
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.overlap === "true" && query.fromDate && query.toDate) {
      const toInclusive = new Date(query.toDate);
      toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

      filter.bookingDate = { $lt: toInclusive };
      filter.returnDate = { $gte: new Date(query.fromDate) };
      if (!filter.status) {
        filter.status = {
          $nin: [BookingStatus.CANCELLED, BookingStatus.RETURNED],
        };
      }
    } else if (query.fromDate || query.toDate) {
      const toInclusive = new Date(query.toDate);
      toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

      filter.bookingDate = { $lt: toInclusive };
      filter.returnDate = { $gte: new Date(query.fromDate) };
    }

    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate("customer")
        .populate("items.product")
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
          { $match: { isDeleted: { $ne: true } } },
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
          {
            $lookup: {
              from: "customers",
              localField: "customer",
              foreignField: "_id",
              as: "customer",
            },
          },
          { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        ])
        .exec(),
      this.bookingModel.countDocuments({ isDeleted: { $ne: true } }).exec(),
    ]);

    return {
      data: data as BookingDocument[],
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getReport(params: { status?: string; fromDate?: string; toDate?: string }): Promise<BookingDocument[]> {
    const filter: FilterQuery<BookingDocument> = { isDeleted: { $ne: true } };
    if (params.status) filter.status = params.status;
    if (params.fromDate || params.toDate) {
      filter.bookingDate = {};
      if (params.fromDate) filter.bookingDate.$gte = new Date(params.fromDate);
      if (params.toDate) {
        const to = new Date(params.toDate);
        to.setUTCDate(to.getUTCDate() + 1);
        filter.bookingDate.$lt = to;
      }
    }
    return this.bookingModel
      .find(filter)
      .populate("customer")
      .sort({ bookingDate: -1 })
      .limit(5000)
      .exec();
  }

  async findOne(id: string): Promise<BookingDocument> {

    const booking = await this.bookingModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .populate("customer")
      .populate("items.product")
      .exec();
    if (!booking) throw new NotFoundException(`Booking "${id}" not found.`);
    return booking;
  }

  async update(id: string, dto: UpdateBookingDto): Promise<BookingDocument> {
    const updated = await this.bookingModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .populate("customer")
      .exec();
    if (!updated) throw new NotFoundException(`Booking "${id}" not found.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bookingModel.findByIdAndUpdate(id, { isDeleted: true }).exec();
    if (!result) throw new NotFoundException(`Booking "${id}" not found.`);

    if (result.customer) {
      await this.customerModel
        .findByIdAndUpdate(result.customer, {
          $pull: { bookings: result._id },
        })
        .exec();
    }
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
   * Finds all BOOKED or RENTED bookings whose returnDate falls on today (UTC calendar date)
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
          isDeleted: { $ne: true },
          status: { $in: [BookingStatus.BOOKED, BookingStatus.RENTED] },
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
    booked: number;
    rented: number;
    pending_return: number;
    returned: number;
    cancelled: number;
  }> {
    const matchStage: FilterQuery<BookingDocument> = { isDeleted: { $ne: true } };
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
      booked: 0,
      rented: 0,
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
   * Returns all distinct product serial numbers that have a BOOKED, RENTED or
   * PENDING_RETURN booking overlapping the given [from, to] date range.
   */
  async getBookedSerials(from: Date, to: Date): Promise<string[]> {
    // Shift 'to' to the next day so the range is inclusive at the day level
    const toInclusive = new Date(to);
    toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

    const filter = {
      isDeleted: { $ne: true },
      status: { $in: [BookingStatus.BOOKED, BookingStatus.RENTED, BookingStatus.PENDING_RETURN] },
      bookingDate: { $lt: toInclusive },
      returnDate: { $gte: from },
    };

    const distinctTopLevel = await this.bookingModel
      .distinct("productSerialNumber", filter)
      .exec();
    const distinctItems = await this.bookingModel
      .distinct("items.serialNumber", filter)
      .exec();

    const all = [...distinctTopLevel, ...distinctItems].filter(
      Boolean,
    ) as string[];
    return Array.from(new Set(all));
  }

  async findFutureBookingsBySerial(
    serialNumber: string,
  ): Promise<BookingDocument[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const serialRegex = new RegExp(`^${serialNumber.trim()}$`, "i");

    return this.bookingModel
      .find({
        isDeleted: { $ne: true },
        $or: [
          { productSerialNumber: serialRegex },
          { "items.serialNumber": serialRegex },
        ],
        returnDate: { $gte: today, $lte: endOfMonth },
        status: {
          $nin: [BookingStatus.CANCELLED, BookingStatus.RETURNED],
        },
      })
      .sort({ bookingDate: 1 })
      .exec();
  }
}
