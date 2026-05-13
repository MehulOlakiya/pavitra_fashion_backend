import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";
import { ProductCategory } from "../schemas/product.schema";

export class CreateProductDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  imageUrl: string;

  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  sellingPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice: number;

  @IsNumber()
  @Min(0)
  rentPrice: number;

  @IsOptional()
  @IsEnum(ProductCategory)
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value,
  )
  category?: ProductCategory;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
