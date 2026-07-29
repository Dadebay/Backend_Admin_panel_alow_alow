import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { Role } from "../generated/prisma/client";

export class RequestOtpDto {
  @ApiProperty({ example: "+99365123456" })
  @IsPhoneNumber()
  phone: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
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

export class RequestOtpResponseDto {
  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiPropertyOptional({
    description: "Development-only console SMS code",
    example: "123456",
  })
  devCode?: string;
}

export class AuthSessionUserDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: Role, enumName: "Role" })
  role: Role;
}

export class AuthSessionResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds: number;

  @ApiProperty({ type: AuthSessionUserDto })
  user: AuthSessionUserDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
