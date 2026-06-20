import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { BookingsModule } from "../bookings/bookings.module";

@Module({
  imports: [BookingsModule, ConfigModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
