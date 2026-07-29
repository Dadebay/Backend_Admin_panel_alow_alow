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
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import { CreateStaffDto, UpdateStaffDto } from "./users.dto";
import {
  CourierSummaryResponseDto,
  StaffMutationResponseDto,
  StaffResponseDto,
} from "./users-response.dto";
import { UsersService } from "./users.service";

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  @ApiOkResponse({ type: [StaffResponseDto] })
  list(@Query("role") role?: Role) {
    return this.users.list(role);
  }

  @Get("couriers")
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOkResponse({ type: [CourierSummaryResponseDto] })
  couriers() {
    return this.users.couriers();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: StaffMutationResponseDto })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateStaffDto,
  ) {
    return this.users.create(actor, dto);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: StaffMutationResponseDto })
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.users.update(actor, id, dto);
  }
}
