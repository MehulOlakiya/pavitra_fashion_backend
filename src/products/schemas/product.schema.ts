import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ProductDocument = Product & Document;

export enum ProductCategory {
  LEHENGA = "lehenga",
  SAREE = "saree",
  ACCESSORIES = "accessories",
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: false, trim: true })
  name: string;

  @Prop({ required: false, trim: true })
  imageUrl: string;

  @Prop({ required: true, unique: true, trim: true })
  serialNumber: string;

  @Prop({ required: false, min: 0 })
  sellingPrice: number;

  @Prop({ required: false, min: 0 })
  purchasePrice: number;

  @Prop({ required: true, min: 0 })
  rentPrice: number;

  @Prop({ required: true, enum: ProductCategory })
  category: ProductCategory;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isArchived: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
