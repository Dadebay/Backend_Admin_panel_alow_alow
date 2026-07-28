import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStaffDto, UpdateStaffDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(role?: Role) {
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
              in: ["ASSIGNED_TO_COURIER", "OUT_FOR_DELIVERY"],
            },
          },
          select: { id: true, number: true, status: true },
        },
      },
      orderBy: { firstName: "asc" },
    });
  }

  async create(actor: AuthUser, dto: CreateStaffDto) {
    if (dto.role === Role.CUSTOMER) {
      throw new BadRequestException("Staff role cannot be CUSTOMER");
    }
    if (dto.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        "Only a super administrator can grant the SUPER_ADMIN role",
      );
    }
    const phone = this.normalizePhone(dto.phone);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing && existing.role !== Role.CUSTOMER) {
        throw new ConflictException("A staff member with this phone exists");
      }
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              role: dto.role,
              firstName: dto.firstName,
              lastName: dto.lastName,
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              phone,
              role: dto.role,
              firstName: dto.firstName,
              lastName: dto.lastName,
            },
          });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staff.created",
          entityType: "User",
          entityId: user.id,
          metadata: { phone: user.phone, role: user.role },
        },
      });
      return user;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateStaffDto) {
    if (dto.role === Role.CUSTOMER) {
      throw new BadRequestException("Staff role cannot be CUSTOMER");
    }
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

  private normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }
}
