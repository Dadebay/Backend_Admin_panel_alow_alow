import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsInt,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { AddressLocationStatus } from "../generated/prisma/client";

export class CreateAddressDto {
  @ApiPropertyOptional({
    description: "Delivery etrap selected from GET /delivery/config",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryEtrapId?: number;

  @ApiPropertyOptional({ example: "Дом" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiProperty({ example: "Magtymguly şaýoly, 72" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ enum: AddressLocationStatus })
  @IsOptional()
  @IsEnum(AddressLocationStatus)
  locationStatus?: AddressLocationStatus;

  @ApiPropertyOptional({ example: 37.9601 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 58.3261 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: "Вход со стороны школы" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  landmark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entrance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
