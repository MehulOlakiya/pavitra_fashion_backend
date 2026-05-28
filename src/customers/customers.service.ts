import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Customer, CustomerDocument } from "./schemas/customer.schema";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const newCustomer = new this.customerModel(createCustomerDto);
    return newCustomer.save();
  }

  async findAll(search?: string): Promise<Customer[]> {
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      return this.customerModel
        .find({
          $or: [{ name: regex }, { mobileNumber: regex }],
        })
        .limit(20)
        .exec();
    }
    return this.customerModel.find().exec();
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
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
    const deletedCustomer = await this.customerModel.findByIdAndDelete(id).exec();
    if (!deletedCustomer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return deletedCustomer;
  }
}
