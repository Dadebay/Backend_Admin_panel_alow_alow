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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  AccountingRangeQueryDto,
  ConfirmCashHandoffDto,
  SubmitCashHandoffDto,
} from "./accounting.dto";
import {
  AccountingReportResponseDto,
  AccountingSettingsResponseDto,
  AccountingShiftResponseDto,
  CashHandoffResponseDto,
} from "./accounting-response.dto";
import { AccountingService } from "./accounting.service";

@ApiTags("accounting")
@ApiBearerAuth()
@Controller("accounting")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get("settings")
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Read the legacy shift schedule for historical accounting periods",
  })
  @ApiOkResponse({ type: AccountingSettingsResponseDto })
  settings() {
    return this.accounting.settings();
  }

  @Get("days")
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "List Ashgabat calendar-day food revenue and cash handoff state",
  })
  @ApiOkResponse({ type: [AccountingShiftResponseDto] })
  shifts(@Query() query: AccountingRangeQueryDto) {
    return this.accounting.shifts(query);
  }

  // Legacy route retained for clients deployed before the daily accounting change.
  @Get("shifts")
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({ summary: "Legacy alias for daily cash totals" })
  @ApiOkResponse({ type: [AccountingShiftResponseDto] })
  legacyShifts(@Query() query: AccountingRangeQueryDto) {
    return this.accounting.shifts(query);
  }

  @Post("handoffs")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Submit one completed calendar day's cash to accounting",
  })
  @ApiOkResponse({ type: CashHandoffResponseDto })
  submit(@CurrentUser() actor: AuthUser, @Body() dto: SubmitCashHandoffDto) {
    return this.accounting.submit(actor, dto);
  }

  @Patch("handoffs/:id/confirm")
  @Roles(Role.ACCOUNTANT)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Confirm a submitted packet and reconcile every included order",
  })
  @ApiOkResponse({ type: CashHandoffResponseDto })
  confirm(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCashHandoffDto,
  ) {
    return this.accounting.confirm(actor, id, dto);
  }

  @Get("report")
  @Roles(Role.ACCOUNTANT)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary:
      "Get cash totals, handoffs, daily series and accountant/owner product analytics",
  })
  @ApiOkResponse({ type: AccountingReportResponseDto })
  report(
    @CurrentUser() actor: AuthUser,
    @Query() query: AccountingRangeQueryDto,
  ) {
    return this.accounting.report(actor, query);
  }
}
