import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

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
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
