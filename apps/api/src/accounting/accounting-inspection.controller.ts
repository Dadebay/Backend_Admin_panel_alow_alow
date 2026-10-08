import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import { AccountingInspectionService } from "./accounting-inspection.service";
import {
  AccountingSalesPageDto,
  AccountingSalesQueryDto,
  InspectionAuditPageDto,
  InspectionAuditQueryDto,
  InspectionCarryoverPageDto,
  InspectionCarryoverQueryDto,
  InspectionOrderDetailDto,
  InspectionOrdersPageDto,
  InspectionOrdersQueryDto,
  InspectionOverviewDto,
  InspectionPageDto,
  InspectionRangeDto,
} from "./accounting-inspection.dto";

@ApiTags("accounting")
@ApiBearerAuth()
@Roles(Role.ACCOUNTANT)
@AdminPages(AdminPage.ACCOUNTING)
@Controller("accounting")
export class AccountingInspectionController {
  constructor(private readonly inspection: AccountingInspectionService) {}

  @Get("sales")
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Read paginated cash-shift sales with food/delivery totals; cancelled orders excluded",
  })
  @ApiOkResponse({ type: AccountingSalesPageDto })
  sales(
    @CurrentUser() actor: AuthUser,
    @Query() query: AccountingSalesQueryDto,
  ) {
    return this.inspection.sales(actor, query);
  }

  @Get("carryover")
  @ApiOperation({
    summary:
      "Unfinished orders entering/leaving a shift, reconstructed at its boundary; cancelled and cash-returned orders are excluded",
  })
  @ApiOkResponse({ type: InspectionCarryoverPageDto })
  carryover(
    @CurrentUser() actor: AuthUser,
    @Query() query: InspectionCarryoverQueryDto,
  ) {
    return this.inspection.carryover(actor, query);
  }

  @Get("overview")
  @ApiOperation({
    summary:
      "Read shift/date order counts, cancellations, demand and location analytics (accountant/owner only)",
  })
  @ApiOkResponse({ type: InspectionOverviewDto })
  overview(@CurrentUser() actor: AuthUser, @Query() query: InspectionRangeDto) {
    return this.inspection.overview(actor, query);
  }

  @Get("orders")
  @ApiOperation({
    summary: "Inspect orders created in a shift/date interval; read only",
  })
  @ApiOkResponse({ type: InspectionOrdersPageDto })
  orders(
    @CurrentUser() actor: AuthUser,
    @Query() query: InspectionOrdersQueryDto,
  ) {
    return this.inspection.orders(actor, query);
  }

  @Get("orders/:id")
  @ApiOperation({
    summary:
      "Inspect order contents, customer, cash and status history; read only",
  })
  @ApiOkResponse({ type: InspectionOrderDetailDto })
  order(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.inspection.order(actor, id);
  }

  @Get("orders/:id/audit")
  @ApiOperation({
    summary:
      "Paginated lifetime order audit, independent of selected date interval",
  })
  @ApiOkResponse({ type: InspectionAuditPageDto })
  orderAudit(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: InspectionPageDto,
  ) {
    return this.inspection.audit(actor, query, id);
  }

  @Get("audit")
  @ApiOperation({
    summary:
      "Read persisted audit actions across admin domains, by event time, actor, action and entity",
  })
  @ApiOkResponse({ type: InspectionAuditPageDto })
  audit(
    @CurrentUser() actor: AuthUser,
    @Query() query: InspectionAuditQueryDto,
  ) {
    return this.inspection.audit(actor, query);
  }
}
