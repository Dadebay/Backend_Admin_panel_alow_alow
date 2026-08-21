import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateDeliverySettingsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackPrice?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery for legacy addresses without an etrap",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackFreeDeliveryThreshold?: number | null;
}

export class UpdateDeliveryEtrapDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 2_147_483_647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  welayatId?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(240)
  nameEn?: string | null;

  @ApiPropertyOptional({ maxLength: 240 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameRu?: string;

  @ApiPropertyOptional({ maxLength: 240 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameTk?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  queuePosition?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery for this etrap",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  freeDeliveryThreshold?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isDeliveryEnabled?: boolean;
}

export class CreateDeliveryWelayatDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  nameEn?: string | null;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameRu: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameTk: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000, default: 0 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}

export class UpdateDeliveryWelayatDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  nameEn?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameRu?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameTk?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}

export class CreateDeliveryEtrapDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  welayatId: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(240)
  nameEn?: string | null;

  @ApiProperty({ maxLength: 240 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameRu: string;

  @ApiProperty({ maxLength: 240 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameTk: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  queuePosition?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000, default: 15 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    default: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  freeDeliveryThreshold?: number | null;

  @ApiPropertyOptional({ default: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isDeliveryEnabled?: boolean;
}
