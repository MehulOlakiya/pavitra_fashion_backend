import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { BookingStatus, BeltType } from "../schemas/booking.schema";

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  productSerialNumber: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsNotEmpty()
  village: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  advancePayment?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remainingPayment?: number;

  @IsDateString()
  bookingDate: string;

  @IsDateString()
  returnDate: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsEnum(BeltType)
  beltType?: BeltType;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  freshPiece?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freshPieceCost?: number;
}
