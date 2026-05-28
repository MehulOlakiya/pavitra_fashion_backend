import { IsNotEmpty, IsString } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  mobileNumber: string;

  @IsString()
  @IsNotEmpty()
  village: string;
}
