import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Booking,
  BookingDocument,
  BookingStatus,
} from "../bookings/schemas/booking.schema";
import { Product, ProductDocument } from "../products/schemas/product.schema";

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const startOfLastMonth = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const endOfLastMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    // 1. Total Cloths
    const totalCloths = await this.productModel.countDocuments();
    const clothsThisWeek = await this.productModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    // 2. Active Bookings (Booked + Rented)
    const activeBookings = await this.bookingModel.countDocuments({
      status: { $in: ["booked", "rented"] },
    });
    const activeSinceYesterday = await this.bookingModel.countDocuments({
      status: { $in: ["booked", "rented"] },
      createdAt: { $gte: yesterday },
    });

    // 3. Pending Payments
    const pendingPaymentsData = await this.bookingModel.aggregate([
      { $match: { remainingPayment: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          total: { $sum: "$remainingPayment" },
          count: { $sum: 1 },
        },
      },
    ]);
    const pendingPayments = pendingPaymentsData[0]?.total || 0;
    const pendingInvoices = pendingPaymentsData[0]?.count || 0;

    // 4. Monthly Revenue
    const thisMonthRevenueData = await this.bookingModel.aggregate([
      { $match: { bookingDate: { $gte: startOfThisMonth } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $ifNull: ["$advancePayment", 0] },
                { $ifNull: ["$remainingPayment", 0] },
              ],
            },
          },
        },
      },
    ]);
    const thisMonthRevenue = thisMonthRevenueData[0]?.total || 0;

    const lastMonthRevenueData = await this.bookingModel.aggregate([
      {
        $match: {
          bookingDate: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $ifNull: ["$advancePayment", 0] },
                { $ifNull: ["$remainingPayment", 0] },
              ],
            },
          },
        },
      },
    ]);
    const lastMonthRevenue = lastMonthRevenueData[0]?.total || 0;

    let revenueTrend = 0;
    if (lastMonthRevenue > 0) {
      revenueTrend = Math.round(
        ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100,
      );
    } else if (thisMonthRevenue > 0) {
      revenueTrend = 100;
    }

    // 5. Returned (This Month)
    const returnedThisMonth = await this.bookingModel.countDocuments({
      returnDate: { $gte: startOfThisMonth },
      status: "returned",
    });

    // 6. Today's Returns
    const todaysReturnsTotal = await this.bookingModel.countDocuments({
      returnDate: { $gte: today, $lte: endOfToday },
      status: { $in: [BookingStatus.RENTED, BookingStatus.RETURNED] },
    });

    const todaysPendingReturns = await this.bookingModel.countDocuments({
      returnDate: { $gte: today, $lte: endOfToday },
      status: { $eq: BookingStatus.RENTED },
    });

    return {
      totalCloths: {
        value: totalCloths,
        trend:
          clothsThisWeek > 0
            ? `+${clothsThisWeek} this week`
            : "No new cloths this week",
      },
      activeBookings: {
        value: activeBookings,
        trend:
          activeSinceYesterday > 0
            ? `+${activeSinceYesterday} since yesterday`
            : "No new active bookings",
      },
      pendingPayments: {
        value: pendingPayments,
        trend: `${pendingInvoices} Invoices due`,
      },
      monthlyRevenue: {
        value: thisMonthRevenue,
        trend: `${revenueTrend > 0 ? "+" : ""}${revenueTrend}% vs last month`,
      },
      returnedThisMonth: {
        value: returnedThisMonth,
        trend: "- Stable",
      },
      todaysReturns: {
        value: todaysReturnsTotal,
        trend: `${todaysPendingReturns} pending returns`,
      },
    };
  }

  async getBookingStats(startDate: Date, endDate: Date) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const bookingDateData = await this.bookingModel.aggregate([
      {
        $match: {
          bookingDate: { $gte: start, $lte: end },
          status: { $in: ["booked", "rented", "cancelled"] },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$bookingDate",
                timezone: "+05:30",
              },
            },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const returnDateData = await this.bookingModel.aggregate([
      {
        $match: {
          returnDate: { $gte: start, $lte: end },
          status: { $in: ["pending_return", "returned"] },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$returnDate",
                timezone: "+05:30",
              },
            },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    const getOrInit = (date: string) => {
      if (!statsMap.has(date)) {
        statsMap.set(date, {
          booked: 0,
          rented: 0,
          pending_return: 0,
          returned: 0,
          cancelled: 0,
        });
      }
      return statsMap.get(date);
    };

    bookingDateData.forEach((item) => {
      getOrInit(item._id.date)[item._id.status] += item.count;
    });

    returnDateData.forEach((item) => {
      getOrInit(item._id.date)[item._id.status] += item.count;
    });

    const result = [];
    const current = new Date(start);
    current.setHours(12, 0, 0, 0);
    const loopEnd = new Date(end);

    while (current <= loopEnd) {
      const dateStr = current.toLocaleDateString("en-CA");
      const dayStats = statsMap.get(dateStr) || {
        booked: 0,
        rented: 0,
        pending_return: 0,
        returned: 0,
        cancelled: 0,
      };
      result.push({
        date: dateStr,
        ...dayStats,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  async getMonthlyRevenue(year: number) {
    const start = new Date(year, 0, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, 11, 31);
    end.setHours(23, 59, 59, 999);

    const revenueData = await this.bookingModel.aggregate([
      {
        $match: {
          bookingDate: { $gte: start, $lte: end },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: { $month: { date: "$bookingDate", timezone: "+05:30" } },
          totalRevenue: {
            $sum: {
              $add: [
                { $ifNull: ["$advancePayment", 0] },
                { $ifNull: ["$remainingPayment", 0] },
              ],
            },
          },
        },
      },
    ]);

    // Format output for 12 months
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const result = months.map((month, index) => {
      const monthData = revenueData.find((item) => item._id === index + 1);
      return {
        month,
        value: monthData ? monthData.totalRevenue : 0,
      };
    });

    return result;
  }
}
