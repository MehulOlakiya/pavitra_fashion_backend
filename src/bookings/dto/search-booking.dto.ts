import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";
import { BookingStatus } from "../schemas/booking.schema";

export class SearchBookingDto {
  /** Search by customer name (partial, case-insensitive) */
  @IsOptional()
  @IsString()
  customerName?: string;

  /** Search by product serial number (exact) */
  @IsOptional()
  @IsString()
  serialNumber?: string;

  /** Search by customer phone (partial) */
  @IsOptional()
  @IsString()
  customerPhone?: string;

  /** Filter by booking status */
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  /** Filter: bookings on or after this date (ISO) */
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /** Filter: bookings on or before this date (ISO) */
  @IsOptional()
  @IsDateString()
  toDate?: string;

  /** Page number (1-based, default 1) */
  @IsOptional()
  @IsNumberString()
  page?: string;

  /** Items per page (default 10) */
  @IsOptional()
  @IsNumberString()
  limit?: string;

  /** If "true", checks for overlapping bookings with fromDate and toDate */
  @IsOptional()
  @IsString()
  overlap?: string;
}
