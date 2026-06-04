import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Controller("customers")
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Get()
  findAll(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.customersService.findAll(search, page, limit);
  }

  @Get("analytics")
  getAnalytics(
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ) {
    const start = fromDate ? new Date(fromDate) : undefined;
    const end = toDate ? new Date(toDate) : undefined;
    return this.customersService.getAnalytics(start, end);
  }

  @Get("report")
  getReport() {
    return this.customersService.getAllForReport();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.customersService.findOne(id);
  }

  @Get(":id/insights")
  getInsights(@Param("id") id: string) {
    return this.customersService.getInsights(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, updateCustomerDto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.customersService.remove(id);
  }
}
