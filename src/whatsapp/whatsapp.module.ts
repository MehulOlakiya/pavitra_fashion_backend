import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { WhatsAppService } from "./whatsapp.service";
import { WhatsAppController } from "./whatsapp.controller";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
