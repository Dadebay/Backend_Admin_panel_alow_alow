import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CatalogProductImageResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ type: String, nullable: true })
  alt: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class CatalogProductVariantImageResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productVariantId: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ type: String, nullable: true })
  alt: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class CatalogProductVariantResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  price: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: [CatalogProductVariantImageResponseDto] })
  images: CatalogProductVariantImageResponseDto[];
}

export class CatalogCategorySummaryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class CatalogProductResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  categoryId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  minPrice: number;

  @ApiProperty()
  hasVariants: boolean;

  @ApiProperty({ type: String, nullable: true })
  variantLabel: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayImageUrl: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: [CatalogProductImageResponseDto] })
  images: CatalogProductImageResponseDto[];

  @ApiProperty({ type: [CatalogProductVariantResponseDto] })
  variants: CatalogProductVariantResponseDto[];

  @ApiPropertyOptional({ type: CatalogCategorySummaryResponseDto })
  category?: CatalogCategorySummaryResponseDto;
}

export class CatalogAdminProductResponseDto extends CatalogProductResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: "192.168.1.50",
    description:
      "Explicit product override; null means inherit the category route",
  })
  receiptPrinterIp: string | null;

  @ApiProperty({ type: String, nullable: true, example: "192.168.1.51" })
  effectiveReceiptPrinterIp: string | null;
}

export class CatalogCategoryResponseDto extends CatalogCategorySummaryResponseDto {
  @ApiProperty({ type: [CatalogProductResponseDto] })
  products: CatalogProductResponseDto[];
}

export class CatalogAdminCategorySummaryResponseDto extends CatalogCategorySummaryResponseDto {
  @ApiProperty({ type: String, nullable: true, example: "192.168.1.51" })
  receiptPrinterIp: string | null;
}

export class CatalogAdminCategoryResponseDto extends CatalogAdminCategorySummaryResponseDto {
  @ApiProperty({ type: [CatalogAdminProductResponseDto] })
  products: CatalogAdminProductResponseDto[];
}

export class ReceiptPrintSettingsResponseDto {
  @ApiProperty({ type: String, nullable: true, example: "192.168.1.50" })
  mainPrinterIp: string | null;

  @ApiProperty({ format: "date-time", type: String, nullable: true })
  updatedAt: string | null;
}
