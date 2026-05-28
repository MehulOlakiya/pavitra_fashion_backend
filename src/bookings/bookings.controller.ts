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
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { BookingsService } from "./bookings.service";
import { PdfService } from "../pdf/pdf.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { SearchBookingDto } from "./dto/search-booking.dto";
import { UpdateBookingDto } from "./dto/update-booking.dto";

@UseGuards(JwtAuthGuard)
@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * POST /api/bookings
   * Create a new booking
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  /**
   * GET /api/bookings/analytics?fromDate=&toDate=
   * Returns status-based counts in a single aggregation query, optionally filtered by date range
   */
  @Get("analytics")
  getAnalytics(
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ) {
    return this.bookingsService.getAnalytics({ fromDate, toDate });
  }

  /**
   * GET /api/bookings/search?customerName=&serialNumber=&customerPhone=&status=&fromDate=&toDate=
   * Search / filter bookings — must come before :id route
   */
  @Get("search")
  search(@Query() query: SearchBookingDto) {
    return this.bookingsService.search(query);
  }

  /**
   * GET /api/bookings?page=1&limit=10
   * List all bookings (most recent first), paginated
   */
  @Get()
  findAll(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.bookingsService.findAll(
      parseInt(page ?? "1", 10),
      parseInt(limit ?? "10", 10),
    );
  }

  /**
   * GET /api/bookings/:id
   * Get a single booking by MongoDB id
   */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.bookingsService.findOne(id);
  }

  /**
   * GET /api/bookings/:id/pdf
   * Download booking invoice as PDF
   */
  @Get(":id/pdf")
  async downloadPdf(@Param("id") id: string, @Res() res: Response) {
    const booking = await this.bookingsService.findOne(id);
    const pdfBuffer = await this.pdfService.generateInvoice(booking);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${id}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  /**
   * PATCH /api/bookings/:id
   * Partially update a booking (e.g. change status)
   */
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(id, dto);
  }

  /**
   * PATCH /api/bookings/:id/bill-sent
   * Mark that the WhatsApp bill was successfully sent for this booking
   */
  @Patch(":id/bill-sent")
  markBillSent(@Param("id") id: string) {
    return this.bookingsService.markBillSent(id);
  }

  /**
   * DELETE /api/bookings/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.bookingsService.remove(id);
  }
}
