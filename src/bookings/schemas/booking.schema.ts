import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type BookingDocument = Booking & Document;

export enum BookingStatus {
  ACTIVE = "active",
  PENDING_RETURN = "pending_return",
  RETURNED = "returned",
  CANCELLED = "cancelled",
}

@Schema({ timestamps: true })
export class Booking {
  @Prop({ required: true, trim: true })
  productSerialNumber: string;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ required: true, trim: true })
  customerPhone: string;

  @Prop({ required: true, trim: true })
  village: string;

  @Prop({ required: true, min: 0 })
  advancePayment: number;

  @Prop({ required: true, min: 0 })
  remainingPayment: number;

  @Prop({ required: true })
  bookingDate: Date;

  @Prop({ required: true })
  returnDate: Date;

  @Prop({ enum: BookingStatus, default: BookingStatus.ACTIVE })
  status: BookingStatus;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// Compound index for fast lookups by serial number and customer name
BookingSchema.index({ productSerialNumber: 1 });
BookingSchema.index({ customerName: "text", customerPhone: 1 });
