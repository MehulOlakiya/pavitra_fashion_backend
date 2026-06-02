import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { BookingStatus, BeltType } from "../schemas/booking.schema";

export class BookingItemDto {
  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @IsString()
  @IsNotEmpty()
  product: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsEnum(BeltType)
  beltType?: BeltType;

  @IsOptional()
  @IsBoolean()
  freshPiece?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freshPieceCost?: number;
}

export class CreateBookingDto {
  @IsOptional()
  @IsString()
  productSerialNumber?: string; // Kept for backwards compatibility

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingItemDto)
  items: BookingItemDto[];

  @IsString()
  @IsNotEmpty()
  customer: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  advancePayment?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remainingPayment?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPayment?: number;

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
