import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import {
  AssignCourierDto,
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  RateOrderDto,
  TransitionOrderDto,
} from "./orders.dto";
import { OrdersService } from "./orders.service";
import {
  CourierRouteResponseDto,
  OrderListResponseDto,
  OrderRatingResponseDto,
  OrderResponseDto,
} from "./orders-response.dto";

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(Role.CUSTOMER, Role.ADMIN)
  @ApiOperation({ summary: "Create a cash-on-delivery order" })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: "List orders visible to the current role" })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orders.list(user, query);
  }

  @Get("courier/route")
  @Roles(Role.COURIER)
  @ApiOperation({
    summary: "Get assigned stops and a real driving route for the courier",
  })
  @ApiOkResponse({ type: CourierRouteResponseDto })
  route(@CurrentUser() user: AuthUser) {
    return this.orders.courierRoute(user);
  }

  @Get("couriers/:courierId/route")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: "Get the same stops and road route shown to a selected courier",
  })
  @ApiOkResponse({ type: CourierRouteResponseDto })
  dispatchRoute(
    @Param("courierId", ParseUUIDPipe) courierId: string,
  ) {
    return this.orders.dispatchCourierRoute(courierId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order details and transition history" })
  @ApiOkResponse({ type: OrderResponseDto })
  get(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.orders.getById(user, id);
  }

  @Patch(":id/transition")
  @Roles(Role.OPERATOR, Role.COOK, Role.COURIER, Role.ACCOUNTANT, Role.ADMIN)
  @ApiOperation({ summary: "Move an order through a role-gated workflow" })
  @ApiOkResponse({ type: OrderResponseDto })
  transition(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
  ) {
    return this.orders.transition(user, id, dto);
  }

  @Patch(":id/assign-courier")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: "Assign a ready order to a courier; couriers may hold many orders",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.orders.assignCourier(user, id, dto);
  }

  @Patch(":id/cancel")
  @Roles(Role.CUSTOMER, Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Cancel before cooking starts; SENT_TO_KITCHEN requires trusted staff",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancel(user, id, dto);
  }

  @Post(":id/rating")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Rate and comment on a delivered order" })
  @ApiCreatedResponse({ type: OrderRatingResponseDto })
  rate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RateOrderDto,
  ) {
    return this.orders.rate(user, id, dto);
  }
}
