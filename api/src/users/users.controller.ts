import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/auth.decorators";
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
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.prisma.user.update({ where: { id }, data: dto });
  }
}
