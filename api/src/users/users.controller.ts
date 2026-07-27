import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateStaffDto } from "./users.dto";

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  list(@Query("role") role?: Role) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : { role: { not: Role.CUSTOMER } }),
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { courierOrders: true, cookedOrders: true } },
      },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
    });
  }

  @Get("couriers")
  @Roles(Role.ADMIN, Role.OPERATOR)
  couriers() {
    return this.prisma.user.findMany({
      where: { role: Role.COURIER, isActive: true },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        courierOrders: {
          where: {
            status: {
              in: [
                "ASSIGNED_TO_COURIER",
                "OUT_FOR_DELIVERY",
              ],
            },
          },
          select: { id: true, number: true, status: true },
        },
      },
      orderBy: { firstName: "asc" },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  async update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new NotFoundException("Staff member not found");

      const touchesSuperAdmin =
        target.role === Role.SUPER_ADMIN || dto.role === Role.SUPER_ADMIN;
      if (touchesSuperAdmin && actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          "Only a super administrator can manage the SUPER_ADMIN role",
        );
      }

      const removesActiveSuperAdmin =
        target.role === Role.SUPER_ADMIN &&
        target.isActive &&
        (dto.role !== Role.SUPER_ADMIN || dto.isActive === false);
      if (removesActiveSuperAdmin) {
        const activeSuperAdmins = await tx.user.count({
          where: { role: Role.SUPER_ADMIN, isActive: true },
        });
        if (activeSuperAdmins <= 1) {
          throw new BadRequestException(
            "At least one active super administrator is required",
          );
        }
      }

      const updated = await tx.user.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staff.updated",
          entityType: "User",
          entityId: updated.id,
          metadata: {
            previousRole: target.role,
            role: updated.role,
            previousIsActive: target.isActive,
            isActive: updated.isActive,
          },
        },
      });
      return updated;
    });
  }
}
