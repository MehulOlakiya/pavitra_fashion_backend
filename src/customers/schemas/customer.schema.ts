import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import * as mongoose from "mongoose";
import { Document } from "mongoose";
import { Booking } from "../../bookings/schemas/booking.schema";

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true })
  customerId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  mobileNumber: string;

  @Prop({ required: true, trim: true })
  village: string;

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
    default: [],
  })
  bookings: Booking[];

  @Prop({ default: 0 })
  totalBooking: number;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
