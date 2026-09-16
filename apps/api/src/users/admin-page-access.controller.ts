import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import {
  AdminPageAccessMatrixResponseDto,
  AdminUserPageAccessResponseDto,
  UpdateAdminPageAccessDto,
} from "./admin-page-access.dto";
import { AdminPageAccessService } from "./admin-page-access.service";

@ApiTags("admin page access")
@ApiBearerAuth()
@Controller("admin-page-access")
export class AdminPageAccessController {
  constructor(private readonly pageAccess: AdminPageAccessService) {}

  @Get("me")
  @Roles(
    Role.OPERATOR,
    Role.COOK,
    Role.COURIER,
    Role.ACCOUNTANT,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  )
  @ApiOkResponse({ type: AdminUserPageAccessResponseDto })
  mine(@CurrentUser() actor: AuthUser) {
    return this.pageAccess.mine(actor.id);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOkResponse({ type: AdminPageAccessMatrixResponseDto })
  matrix() {
    return this.pageAccess.matrix();
  }

  @Put(":userId")
  @Roles(Role.SUPER_ADMIN)
  @ApiOkResponse({ type: AdminUserPageAccessResponseDto })
  update(
    @CurrentUser() actor: AuthUser,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateAdminPageAccessDto,
  ) {
    return this.pageAccess.update(actor, userId, dto);
  }
}
