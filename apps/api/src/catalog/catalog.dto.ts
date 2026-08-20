import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsIP,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const MEDIA_IMAGE_PATH =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

function normalizeOptionalIp(value: unknown) {
  return typeof value === "string" ? value.trim() || null : value;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ProductVariantInputDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "Existing variant ID when updating a product",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: "Маленькая, 25 см" })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: "На тонком тесте" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 55 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: "Ordered WebP paths used only for this product variant",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  @Matches(MEDIA_IMAGE_PATH, {
    each: true,
    message:
      "each variant image URL must be a WebP path returned by the media API",
  })
  imageUrls?: string[];
}

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  slug: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  description: string;

  @ApiProperty({
    example: 49.9,
    description:
      "Base price for products without variants; when active variants exist the backend stores and returns their minimum price",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "192.168.1.50",
    description:
      "Private IPv4 address of the LAN receipt printer assigned to this product",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalIp(value))
  @IsIP(4)
  receiptPrinterIp?: string | null;

  @ApiPropertyOptional({
    example: "Размер",
    description:
      "Customer-facing selector label, for example Size or Cutting method",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  variantLabel?: string;

  @ApiPropertyOptional({ type: () => [ProductVariantInputDto], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    example: [
      "/api/v1/media/2d807991-e99f-4f17-9b9f-cc2fb7478820.webp",
      "/api/v1/media/c9949db2-cf7c-4f28-8a0f-81776210d2f1.webp",
    ],
    description:
      "Ordered image paths returned by POST /media/images; the first image is primary",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  @Matches(MEDIA_IMAGE_PATH, {
    each: true,
    message: "each image URL must be a WebP path returned by the media API",
  })
  imageUrls?: string[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AddProductImageDto {
  @ApiProperty({
    example: "/api/v1/media/2d807991-e99f-4f17-9b9f-cc2fb7478820.webp",
  })
  @IsString()
  @MaxLength(1000)
  @Matches(MEDIA_IMAGE_PATH, {
    message: "image URL must be a WebP path returned by the media API",
  })
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  alt?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
