import { ApiProperty } from "@nestjs/swagger";
import {
  CashSettlementStatus,
  OrderStatus,
  PaymentMethod,
  Role,
} from "../generated/prisma/client";

export class OrderCustomerResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class OrderStaffResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class OrderCourierResponseDto extends OrderStaffResponseDto {
  @ApiProperty()
  phone: string;
}

export class OrderItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  lineTotal: number;
}

export class OrderRatingResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  customerId: string;

  @ApiProperty()
  score: number;

  @ApiProperty({ type: String, nullable: true })
  comment: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class OrderCashSettlementResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  courierId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  operatorId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  accountantId: string | null;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: CashSettlementStatus })
  status: CashSettlementStatus;

  @ApiProperty({ format: "date-time" })
  courierGivenAt: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  operatorTakenAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reconciledAt: string | null;
}

export class OrderSavedAddressResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class OrderTransitionActorResponseDto extends OrderStaffResponseDto {
  @ApiProperty({ enum: Role })
  role: Role;
}

export class OrderTransitionResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  actorId: string;

  @ApiProperty({ enum: OrderStatus })
  fromStatus: OrderStatus;

  @ApiProperty({ enum: OrderStatus })
  toStatus: OrderStatus;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: OrderTransitionActorResponseDto })
  actor: OrderTransitionActorResponseDto;
}

export class OrderResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ format: "uuid" })
  customerId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  addressId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  cookId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  courierId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  promoCodeId: string | null;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty()
  deliveryFee: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerNote: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  @ApiProperty()
  version: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  assignedAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deliveredAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: OrderCustomerResponseDto })
  customer: OrderCustomerResponseDto;

  @ApiProperty({ type: OrderStaffResponseDto, nullable: true })
  cook: OrderStaffResponseDto | null;

  @ApiProperty({ type: OrderCourierResponseDto, nullable: true })
  courier: OrderCourierResponseDto | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty({ type: OrderRatingResponseDto, nullable: true })
  rating: OrderRatingResponseDto | null;

  @ApiProperty({ type: OrderCashSettlementResponseDto, nullable: true })
  cashSettlement: OrderCashSettlementResponseDto | null;

  @ApiProperty({ type: OrderSavedAddressResponseDto, nullable: true })
  savedAddress: OrderSavedAddressResponseDto | null;

  @ApiProperty({ type: [OrderTransitionResponseDto] })
  transitions: OrderTransitionResponseDto[];
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  pages: number;
}

export class CourierRouteCustomerResponseDto {
  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class CourierRouteStopResponseDto {
  @ApiProperty()
  sequence: number;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty()
  orderNumber: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: CourierRouteCustomerResponseDto })
  customer: CourierRouteCustomerResponseDto;

  @ApiProperty()
  itemCount: number;

  @ApiProperty()
  cashToCollect: number;
}

export class CourierRouteResponseDto {
  @ApiProperty({ format: "uuid" })
  courierId: string;

  @ApiProperty({ type: [CourierRouteStopResponseDto] })
  stops: CourierRouteStopResponseDto[];
}
