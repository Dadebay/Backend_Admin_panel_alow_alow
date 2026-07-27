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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(Role.CUSTOMER, Role.ADMIN)
  @ApiOperation({ summary: "Create a cash-on-delivery order" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: "List orders visible to the current role" })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orders.list(user, query);
  }

  @Get("courier/route")
  @Roles(Role.COURIER, Role.ADMIN)
  @ApiOperation({
    summary: "Get all active courier stops for map and route planning",
  })
  route(@CurrentUser() user: AuthUser) {
    return this.orders.courierRoute(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order details and transition history" })
  get(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.orders.getById(user, id);
  }

  @Patch(":id/transition")
  @Roles(Role.OPERATOR, Role.COOK, Role.COURIER, Role.ACCOUNTANT, Role.ADMIN)
  @ApiOperation({ summary: "Move an order through a role-gated workflow" })
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
    summary: "Cancel before kitchen handoff, subject to role and ownership",
  })
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
  rate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RateOrderDto,
  ) {
    return this.orders.rate(user, id, dto);
  }
}
