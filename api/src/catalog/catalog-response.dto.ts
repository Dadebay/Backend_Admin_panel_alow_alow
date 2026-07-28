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
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: [CatalogProductImageResponseDto] })
  images: CatalogProductImageResponseDto[];

  @ApiPropertyOptional({ type: CatalogCategorySummaryResponseDto })
  category?: CatalogCategorySummaryResponseDto;
}

export class CatalogCategoryResponseDto extends CatalogCategorySummaryResponseDto {
  @ApiProperty({ type: [CatalogProductResponseDto] })
  products: CatalogProductResponseDto[];
}
