import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN = "admin",
  MANAGER = "manager",
  STAFF = "staff",
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string; // stored as bcrypt hash

  @Prop({ enum: UserRole, default: UserRole.MANAGER })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: false })
  profileImage: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Remove password from JSON responses by default
UserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});
