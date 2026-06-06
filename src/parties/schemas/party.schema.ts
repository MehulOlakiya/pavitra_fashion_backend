import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PartyDocument = Party & Document;

@Schema({ timestamps: true })
export class Party {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const PartySchema = SchemaFactory.createForClass(Party);
PartySchema.index({ name: 1 });
