import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";
import { Party } from "../../parties/schemas/party.schema";
import { Product } from "../../products/schemas/product.schema";

export type ExpenseDocument = Expense & Document;

// Built-in categories — kept for backward compat and status mapping
export enum ExpenseCategory {
  WASHING = "washing",
  STITCHING = "stitching",
  BLOUSE_STITCHING = "blouse_stitching",
}

export enum ExpenseStatus {
  SENT = "sent",
  RETURNED = "returned",
  PARTIAL_RETURN = "partial_return",
}

export const ALL_EXPENSE_STATUSES = [
  ...Object.values(ExpenseStatus),
  "sent_for_washing",
  "washing_in_progress",
  "returned_from_washing",
  "sent_for_stitching",
  "stitching_in_progress",
  "returned_from_stitching",
  "sent_for_blouse_stitching",
  "blouse_stitching_in_progress",
  "returned_from_blouse_stitching",
  "in_progress",
  "partial_return"
];

@Schema()
export class ExpenseItem {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true })
  product: Product;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ default: false })
  isReturned: boolean;
}

export const ExpenseItemSchema = SchemaFactory.createForClass(ExpenseItem);

@Schema({ timestamps: true })
export class Expense {
  @Prop({ unique: true, sparse: true })
  expenseNo: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true })
  party: Party;

  // Free-form string — built-in values are the ExpenseCategory enum values;
  // users can pass any custom string
  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ type: [ExpenseItemSchema], default: [] })
  items: ExpenseItem[];

  @Prop({ required: true, min: 0 })
  perPiecePrice: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalQuantity: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalPrice: number;

  @Prop({ required: false, trim: true })
  remarks: string;

  @Prop({ required: true, enum: ALL_EXPENSE_STATUSES })
  status: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ party: 1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ status: 1 });
ExpenseSchema.index({ "items.product": 1 });
