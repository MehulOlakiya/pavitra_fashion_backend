import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { ALL_EXPENSE_STATUSES } from "../schemas/expense.schema";

export class UpdateExpenseStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(ALL_EXPENSE_STATUSES)
  status: string;
}
