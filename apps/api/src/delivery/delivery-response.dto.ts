import { ApiProperty } from "@nestjs/swagger";

export class DeliverySettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fallbackPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackFreeDeliveryThreshold: number | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class DeliveryEtrapResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  welayatId: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty({ type: Number, nullable: true })
  queuePosition: number | null;

  @ApiProperty()
  price: number;

  @ApiProperty({ type: Number, nullable: true })
  freeDeliveryThreshold: number | null;

  @ApiProperty()
  isDeliveryEnabled: boolean;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class DeliveryWelayatResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [DeliveryEtrapResponseDto] })
  etraps: DeliveryEtrapResponseDto[];
}

export class DeliveryConfigResponseDto {
  @ApiProperty()
  fallbackPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackFreeDeliveryThreshold: number | null;

  @ApiProperty({ type: [DeliveryWelayatResponseDto] })
  welayats: DeliveryWelayatResponseDto[];
}

export class DeliveryQuoteWelayatResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty()
  sortOrder: number;
}

export class DeliveryQuoteResponseDto {
  @ApiProperty({ type: String, nullable: true })
  addressLine: string | null;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  fee: number;

  @ApiProperty()
  price: number;

  @ApiProperty({ type: Number, nullable: true })
  freeDeliveryThreshold: number | null;

  @ApiProperty({ type: DeliveryEtrapResponseDto, nullable: true })
  etrap: DeliveryEtrapResponseDto | null;

  @ApiProperty({ type: DeliveryQuoteWelayatResponseDto, nullable: true })
  welayat: DeliveryQuoteWelayatResponseDto | null;

  @ApiProperty({
    description:
      "True when reverse geocoding produced one unambiguous configured delivery area",
  })
  matched: boolean;
}
