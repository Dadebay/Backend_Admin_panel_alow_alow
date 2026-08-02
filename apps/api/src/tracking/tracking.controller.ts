import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Put,
  Sse,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import {
  DispatchSnapshotDto,
  DispatchLiveEventDto,
  StopCourierLocationResponseDto,
  UpdateCourierLocationDto,
  UpdateCourierLocationResponseDto,
} from "./tracking.dto";
import { TrackingService } from "./tracking.service";

@ApiTags("tracking")
@ApiBearerAuth()
@Controller("tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Put("me/location")
  @Roles(Role.COURIER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Publish courier GPS; update about every 15 seconds during active delivery",
  })
  @ApiOkResponse({ type: UpdateCourierLocationResponseDto })
  updateLocation(
    @CurrentUser() courier: AuthUser,
    @Body() dto: UpdateCourierLocationDto,
  ) {
    return this.tracking.updateLocation(courier, dto);
  }

  @Delete("me/location")
  @Roles(Role.COURIER)
  @ApiOperation({ summary: "Stop sharing the authenticated courier location" })
  @ApiOkResponse({ type: StopCourierLocationResponseDto })
  stopSharing(@CurrentUser() courier: AuthUser) {
    return this.tracking.stopSharing(courier);
  }

  @Get("dispatch")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Get active couriers, their latest locations, delivery stops and customer details",
  })
  @ApiOkResponse({ type: DispatchSnapshotDto })
  dispatch() {
    return this.tracking.getDispatchSnapshot();
  }

  @Sse("dispatch/live")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  @ApiOperation({
    summary: "Stream accepted courier GPS updates to authorized dispatchers",
  })
  @ApiProduces("text/event-stream")
  @ApiOkResponse({ type: DispatchLiveEventDto })
  dispatchLive() {
    return this.tracking.dispatchLive();
  }
}
