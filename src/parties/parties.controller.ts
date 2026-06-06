import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PartiesService } from "./parties.service";
import { CreatePartyDto } from "./dto/create-party.dto";
import { UpdatePartyDto } from "./dto/update-party.dto";

@UseGuards(JwtAuthGuard)
@Controller("parties")
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePartyDto) {
    return this.partiesService.create(dto);
  }

  @Get()
  findAll(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.partiesService.findAll(
      search,
      parseInt(page ?? "1", 10),
      parseInt(limit ?? "50", 10),
    );
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.partiesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePartyDto) {
    return this.partiesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.partiesService.remove(id);
  }
}
