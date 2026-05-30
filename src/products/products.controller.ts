import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
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
   * POST /api/products/import
   * Import products from a CSV or Excel file
   */
  @Post("import")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "text/csv",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
        ];
        if (
          allowed.includes(file.mimetype) ||
          file.originalname.match(/\.(csv|xlsx|xls)$/i)
        ) {
          cb(null, true);
        } else {
          cb(new Error("Only CSV and Excel files are allowed."), false);
        }
      },
    }),
  )
  importProducts(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error("No file uploaded.");
    }
    return this.productsService.importFromFile(file.buffer, file.mimetype);
  }

  /**
   * POST /api/products
   * Create a new product
   */
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /**
   * GET /api/products/analytics
   * Returns active/inactive counts and distinct categories
   */
  @Get("analytics")
  getAnalytics(
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ) {
    const start = fromDate ? new Date(fromDate) : undefined;
    const end = toDate ? new Date(toDate) : undefined;
    return this.productsService.getAnalytics(start, end);
  }

  /**
   * GET /api/products?page=1&limit=10&category=lehenga&search=silk
   * List paginated active products, optionally filtered by category / search
   */
  @Get()
  findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("category") category?: string,
    @Query("search") search?: string,
  ) {
    return this.productsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      search,
    });
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
   * GET /api/products/available?from=ISO&to=ISO&page=1&limit=10&category=...&search=...
   * Returns paginated products that are NOT booked in the given date range.
   */
  @Get("available")
  findAvailable(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("category") category?: string,
    @Query("search") search?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException(
        "'from' and 'to' query parameters are required.",
      );
    }
    return this.productsService.findAvailable({
      from: new Date(from),
      to: new Date(to),
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      search,
    });
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
