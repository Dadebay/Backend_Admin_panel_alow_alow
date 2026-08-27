import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  AdminEditOrderDto,
  AssignCourierDto,
  CancelOrderDto,
  ConfirmOrderPackingDto,
  CreateAssistedOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  QuoteOrderDto,
  RateOrderDto,
  SearchAssistedCustomersQueryDto,
  TransitionOrderDto,
} from "./orders.dto";
import { OrdersService } from "./orders.service";
import {
  AssistedCustomerListResponseDto,
  CourierRouteResponseDto,
  OrderListResponseDto,
  OrderQuoteResponseDto,
  OrderRatingResponseDto,
  OrderResponseDto,
  ReceiptPrintPlanResponseDto,
} from "./orders-response.dto";

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post("quote")
  @HttpCode(HttpStatus.OK)
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary:
      "Preview authoritative variant prices, promo discount and delivery totals without creating an order",
  })
  @ApiOkResponse({ type: OrderQuoteResponseDto })
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteOrderDto) {
    return this.orders.quote(user, dto);
  }

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Create a cash-on-delivery order" })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get("assisted/customers")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: "Find customers by phone for an operator-assisted order",
  })
  @ApiOkResponse({ type: AssistedCustomerListResponseDto })
  assistedCustomers(@Query() query: SearchAssistedCustomersQueryDto) {
    return this.orders.searchAssistedCustomers(query);
  }

  @Post("assisted")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Create a cash order for a caller without issuing a customer session",
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  createAssisted(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateAssistedOrderDto,
  ) {
    return this.orders.createAssisted(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: "List orders visible to the current role" })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQueryDto) {
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
  dispatchRoute(@Param("courierId", ParseUUIDPipe) courierId: string) {
    return this.orders.dispatchCourierRoute(courierId);
  }

  @Get(":id/receipt-print-plan")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Build an order or cancellation receipt for the main and snapshotted kitchen printers",
  })
  @ApiOkResponse({ type: ReceiptPrintPlanResponseDto })
  receiptPrintPlan(@Param("id", ParseUUIDPipe) id: string) {
    return this.orders.receiptPrintPlan(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order details and transition history" })
  @ApiOkResponse({ type: OrderResponseDto })
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getById(user, id);
  }

  @Patch(":id/transition")
  @Roles(Role.OPERATOR, Role.COOK, Role.COURIER, Role.ADMIN)
  @ApiOperation({
    summary:
      "Move an order through the role-gated workflow; courier pickup is OUT_FOR_DELIVERY and completion is DELIVERED",
  })
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
    summary:
      "Assign a ready order or correct its courier before delivery starts",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.orders.assignCourier(user, id, dto);
  }

  @Patch(":id/admin-edit")
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      "Edit administrator-managed order content and recalculate authoritative totals",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  adminEdit(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminEditOrderDto,
  ) {
    return this.orders.adminEdit(user, id, dto);
  }

  @Patch(":id/confirm-packing")
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      "Confirm that an administrator checked every order line before courier handoff",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  confirmPacking(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConfirmOrderPackingDto,
  ) {
    return this.orders.confirmPacking(user, id, dto);
  }

  @Patch(":id/cancel")
  @Roles(Role.CUSTOMER, Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Cancel an own order within 15 minutes as customer or an active unsettled order as administrator",
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
