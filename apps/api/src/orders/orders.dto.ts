import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { OrderStatus } from "../generated/prisma/client";

export class CreateOrderItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    format: "uuid",
    deprecated: true,
    description:
      "Required by current clients for VARIANT products. Omission still selects the cheapest active variant only for legacy-client compatibility.",
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Reuse for retries of the same creation request; a different body with the same key is rejected",
  })
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description:
      "Delivery etrap selected from GET /delivery/config; also updates the selected saved address",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryEtrapId?: number;

  @ApiPropertyOptional({
    description: "Saved address owned by the current user",
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    example: "Дом",
    description: "Label used when an inline address is saved",
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  addressLabel?: string;

  @ApiPropertyOptional({
    example: "Magtymguly şaýoly, 72",
    description: "New address; omitted fields use the active saved address",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 37.9601 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 58.3261 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @ApiPropertyOptional({ example: "WELCOME15" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;
}

export class QuoteOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description:
      "Delivery etrap used to include the authoritative delivery fee in this quote",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryEtrapId?: number;

  @ApiPropertyOptional({ example: "WELCOME15" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;
}

export class CreateAssistedOrderDto extends CreateOrderDto {
  @ApiProperty({ example: "+99365123456" })
  @IsPhoneNumber()
  customerPhone: string;

  @ApiPropertyOptional({ example: "Aman" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerFirstName?: string;

  @ApiPropertyOptional({ example: "Ataýew" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerLastName?: string;
}

export class SearchAssistedCustomersQueryDto {
  @ApiProperty({
    example: "6512",
    description: "At least four phone digits; spaces and + are accepted",
  })
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  @Matches(/^[+\d\s()-]+$/)
  phone: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 10;
}

export class TransitionOrderDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: "Optimistic-lock version returned by the API" })
  @IsInt()
  @Min(1)
  version: number;
}

export class AssignCourierDto {
  @ApiProperty()
  @IsUUID()
  courierId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  version: number;
}

export class AdminEditOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryEtrapId: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty()
  @IsLatitude()
  latitude: number;

  @ApiProperty()
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entrance?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  courierId?: string;

  @ApiProperty({ description: "Optimistic-lock version returned by the API" })
  @IsInt()
  @Min(1)
  version: number;
}

export class ConfirmOrderPackingDto {
  @ApiProperty({
    type: [String],
    format: "uuid",
    description: "Every immutable order-line ID checked by the administrator",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  checkedItemIds: string[];

  @ApiProperty({ description: "Optimistic-lock version returned by the API" })
  @IsInt()
  @Min(1)
  version: number;
}

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  version: number;
}

export class RateOrderDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: OrderStatus,
    isArray: true,
    description:
      "Comma-separated workflow statuses for one role-specific order queue; ignored when status is present",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @ApiPropertyOptional({
    format: "uuid",
    description: "Filter operational order queues by assigned branch",
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: "Order number, customer phone/name, or delivery address",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Inclusive order creation timestamp in ISO 8601 format",
  })
  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Exclusive order creation timestamp in ISO 8601 format",
  })
  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
