import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateAddressDto {
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

  @ApiProperty({ example: 37.9601 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3261 })
  @IsLongitude()
  longitude: number;

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
