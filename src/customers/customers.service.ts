import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Customer, CustomerDocument } from "./schemas/customer.schema";
import { Booking, BookingDocument } from "../bookings/schemas/booking.schema";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
  ) {}

  async getAnalytics(startDate?: Date, endDate?: Date) {
    let dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const total = await this.customerModel.countDocuments().exec();

    let newInPeriodQuery: any;
    if (startDate || endDate) {
      newInPeriodQuery = dateFilter;
    } else {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      newInPeriodQuery = { createdAt: { $gte: startOfMonth } };
    }

    const newThisMonth = await this.customerModel
      .countDocuments(newInPeriodQuery)
      .exec();

    // To find how many unique customers have active bookings (booked or rented)
    const activeCustomers = await this.bookingModel
      .distinct("customer", { status: { $in: ["booked", "rented"] } })
      .exec();
    const active = activeCustomers.length;

    return { total, active, newThisMonth };
  }

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const newCustomer = new this.customerModel(createCustomerDto);
    return newCustomer.save();
  }

  async findAll(
    search?: string,
    pageStr?: string,
    limitStr?: string,
  ): Promise<{
    data: Customer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, parseInt(pageStr ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "10", 10)));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { mobileNumber: regex }];
    }

    const [data, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerModel
      .findById(id)
      .populate("bookings")
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async getInsights(id: string) {
    const customer = await this.customerModel
      .findById(id)
      .populate("bookings")
      .exec();

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    let totalRevenue = 0;
    let pendingPayment = 0;
    const totalBookingsCount = customer.bookings.length;

    customer.bookings.forEach((b: any) => {
      if (b.status !== "cancelled") {
        totalRevenue += (b.advancePayment || 0) + (b.remainingPayment || 0);
        pendingPayment += b.remainingPayment || 0;
      }
    });

    const customerObj = customer.toObject();
    delete customerObj.bookings; // Exclude massive array from payload

    return {
      customer: customerObj,
      analytics: {
        totalRevenue,
        pendingPayment,
        totalBookingsCount,
      },
    };
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
  ): Promise<Customer> {
    const updatedCustomer = await this.customerModel
      .findByIdAndUpdate(id, updateCustomerDto, { new: true })
      .exec();
    if (!updatedCustomer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return updatedCustomer;
  }

  async remove(id: string): Promise<Customer> {
    const deletedCustomer = await this.customerModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedCustomer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return deletedCustomer;
  }
}
