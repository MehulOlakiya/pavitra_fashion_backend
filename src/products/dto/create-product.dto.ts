import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUrl,
  Min,
} from "class-validator";
import { ProductCategory } from "../schemas/product.schema";

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUrl()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @IsNumber()
  @Min(0)
  rentPrice: number;

  @IsEnum(ProductCategory)
  category: ProductCategory;
}
