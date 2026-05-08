import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { BookingStatus } from "../schemas/booking.schema";

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  productSerialNumber: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsNotEmpty()
  village: string;

  @IsNumber()
  @Min(0)
  advancePayment: number;

  @IsNumber()
  @Min(0)
  remainingPayment: number;

  @IsDateString()
  bookingDate: string;

  @IsDateString()
  returnDate: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
