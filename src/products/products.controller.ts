import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { BookingsService } from "../bookings/bookings.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly bookingsService: BookingsService,
  ) {}

  /**
   * POST /api/products
   * Create a new product
   */
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /**
   * GET /api/products?category=lehenga
   * List all active products, optionally filtered by category
   */
  @Get()
  findAll(@Query("category") category?: string) {
    return this.productsService.findAll(category);
  }

  /**
   * GET /api/products/serial/:serialNumber/inventory
   * Get product details + upcoming (future) bookings by serial number
   */
  @Get("serial/:serialNumber/inventory")
  async getInventoryDetail(@Param("serialNumber") serialNumber: string) {
    const product = await this.productsService.findBySerialNumber(serialNumber);
    const futureBookings =
      await this.bookingsService.findFutureBookingsBySerial(serialNumber);
    return { product, futureBookings };
  }

  /**
   * GET /api/products/:id
   * Get a single product by MongoDB id
   */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * PATCH /api/products/:id
   * Partially update a product
   */
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  /**
   * DELETE /api/products/:id
   * Hard-delete a product
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }
}
