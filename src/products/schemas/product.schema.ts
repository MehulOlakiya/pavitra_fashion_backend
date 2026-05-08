import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ProductDocument = Product & Document;

export enum ProductCategory {
  LEHENGA = "lehenga",
  SAREE = "saree",
  SHERWANI = "sherwani",
  SALWAR_SUIT = "salwar_suit",
  KURTA = "kurta",
  INDO_WESTERN = "indo_western",
  OTHER = "other",
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  imageUrl: string;

  @Prop({ required: true, unique: true, trim: true })
  serialNumber: string;

  @Prop({ required: true, min: 0 })
  sellingPrice: number;

  @Prop({ required: true, min: 0 })
  rentPrice: number;

  @Prop({ required: false, enum: ProductCategory })
  category: ProductCategory;

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
