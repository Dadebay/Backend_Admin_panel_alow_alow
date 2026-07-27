import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class RequestOtpDto {
  @ApiProperty({ example: "+99365123456" })
  @IsPhoneNumber()
  phone: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiPropertyOptional({ example: "Aman" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: "Ataýew" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: "Opaque refresh token returned by OTP verification or refresh",
  })
  @IsString()
  @MaxLength(500)
  refreshToken: string;
}
