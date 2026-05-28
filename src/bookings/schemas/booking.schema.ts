import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";
import { Customer } from "../../customers/schemas/customer.schema";
import { Product } from "../../products/schemas/product.schema";

export type BookingDocument = Booking & Document;

export enum BookingStatus {
  ACTIVE = "active",
  PENDING_RETURN = "pending_return",
  RETURNED = "returned",
  CANCELLED = "cancelled",
}

export enum BeltType {
  HB = "HB",
  FB = "FB",
}

@Schema()
export class BookingItem {
  @Prop({ required: true, trim: true })
  serialNumber: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ required: false, enum: BeltType })
  beltType: BeltType;

  @Prop({ default: false })
  freshPiece: boolean;

  @Prop({ required: false, min: 0 })
  freshPieceCost: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Product' })
  product: Product;
}

export const BookingItemSchema = SchemaFactory.createForClass(BookingItem);

@Schema({ timestamps: true })
export class Booking {
  @Prop({ unique: true, sparse: true })
  orderId: string;

  @Prop({ required: false, trim: true }) // Changed to false for backwards compatibility
  productSerialNumber: string;

  @Prop({ type: [BookingItemSchema], default: [] })
  items: BookingItem[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true })
  customer: Customer;

  @Prop({ required: false, min: 0 })
  advancePayment: number;

  @Prop({ required: false, min: 0 })
  remainingPayment: number;

  @Prop({ required: true })
  bookingDate: Date;

  @Prop({ required: true })
  returnDate: Date;

  @Prop({ enum: BookingStatus, default: BookingStatus.ACTIVE })
  status: BookingStatus;

  @Prop({ required: false, enum: BeltType })
  beltType: BeltType;

  @Prop({ required: false, trim: true })
  note: string;

  @Prop({ default: false })
  freshPiece: boolean;

  @Prop({ required: false, min: 0 })
  freshPieceCost: number;

  @Prop({ default: false })
  isBillSend: boolean;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// Compound index for fast lookups by serial number and customer
BookingSchema.index({ productSerialNumber: 1 });
BookingSchema.index({ customer: 1 });
