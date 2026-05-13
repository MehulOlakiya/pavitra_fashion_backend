import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  Matches,
} from "class-validator";

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, {
    message:
      "Mobile number must be 10 digits including country code (e.g. 9328454608)",
  })
  mobileNumber: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
