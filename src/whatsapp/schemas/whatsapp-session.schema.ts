import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type WhatsAppSessionDocument = WhatsAppSession & Document;

@Schema({ timestamps: true })
export class WhatsAppSession {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: "idle" })
  state: string;

  @Prop({ type: String, default: null })
  qr: string | null;
}

export const WhatsAppSessionSchema =
  SchemaFactory.createForClass(WhatsAppSession);
