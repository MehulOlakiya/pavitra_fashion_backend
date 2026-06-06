import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { ExpenseCategory } from "../schemas/expense.schema";

export class CreateExpenseItemDto {
  @IsMongoId()
  product: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  isReturned?: boolean;
}

export class CreateExpenseDto {
  @IsMongoId()
  party: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items: CreateExpenseItemDto[];

  @IsNumber()
  @Min(0)
  perPiecePrice: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
