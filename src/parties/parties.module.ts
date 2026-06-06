import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Party, PartySchema } from "./schemas/party.schema";
import { PartiesController } from "./parties.controller";
import { PartiesService } from "./parties.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Party.name, schema: PartySchema }]),
  ],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
