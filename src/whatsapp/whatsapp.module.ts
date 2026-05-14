import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WhatsAppService } from "./whatsapp.service";
import { WhatsAppController } from "./whatsapp.controller";
import { UsersModule } from "../users/users.module";
import {
  WhatsAppSession,
  WhatsAppSessionSchema,
} from "./schemas/whatsapp-session.schema";

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: WhatsAppSession.name, schema: WhatsAppSessionSchema },
    ]),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
