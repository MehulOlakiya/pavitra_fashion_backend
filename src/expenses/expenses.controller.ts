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
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { SearchExpenseDto } from "./dto/search-expense.dto";
import { UpdateExpenseStatusDto } from "./dto/update-expense-status.dto";

@UseGuards(JwtAuthGuard)
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /** POST /expenses — create */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }

  /** GET /expenses/summary — dashboard stats */
  @Get("summary")
  getSummary() {
    return this.expensesService.getSummary();
  }

  /** GET /expenses/search — filtered list */
  @Get("search")
  search(@Query() query: SearchExpenseDto) {
    return this.expensesService.search(query);
  }

  /** GET /expenses/by-party/:partyId */
  @Get("by-party/:partyId")
  findByParty(
    @Param("partyId") partyId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.expensesService.findByParty(
      partyId,
      parseInt(page ?? "1", 10),
      parseInt(limit ?? "10", 10),
    );
  }

  /** GET /expenses/by-product/:productId */
  @Get("by-product/:productId")
  findByProduct(
    @Param("productId") productId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.expensesService.findByProduct(
      productId,
      parseInt(page ?? "1", 10),
      parseInt(limit ?? "10", 10),
    );
  }

  /** GET /expenses — paginated list (alias for search with no filters) */
  @Get()
  findAll(@Query() query: SearchExpenseDto) {
    return this.expensesService.search(query);
  }

  /** GET /expenses/:id */
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.expensesService.findOne(id);
  }

  /** PATCH /expenses/:id/status */
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateExpenseStatusDto) {
    return this.expensesService.updateStatus(id, dto.status);
  }

  /** PATCH /expenses/:id */
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  /** DELETE /expenses/:id */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.expensesService.remove(id);
  }
}
