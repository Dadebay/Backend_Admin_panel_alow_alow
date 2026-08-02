import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { distanceBetweenMeters } from "./branch-distance";
import { CreateBranchDto, UpdateBranchDto } from "./branches.dto";

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const branches = await this.prisma.branch.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { createdAt: "asc" }],
    });
    return toApiResponse(branches);
  }

  create(actor: AuthUser, dto: CreateBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          ...dto,
          name: dto.name.trim(),
          address: dto.address.trim(),
          phone: dto.phone?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "branch.created",
          entityType: "Branch",
          entityId: branch.id,
          metadata: { name: branch.name },
        },
      });
      return toApiResponse(branch);
    });
  }

  update(actor: AuthUser, id: string, dto: UpdateBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.branch.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException("Branch not found");
      const branch = await tx.branch.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone.trim() || null }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "branch.updated",
          entityType: "Branch",
          entityId: branch.id,
          metadata: { changedFields: Object.keys(dto) },
        },
      });
      return toApiResponse(branch);
    });
  }

  async findNearestActive(
    tx: Prisma.TransactionClient,
    destination: { latitude: number; longitude: number },
  ) {
    const branches = await tx.branch.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const [first, ...rest] = branches;
    if (!first) {
      throw new ConflictException("No active branch can accept orders");
    }

    let nearest = {
      branch: first,
      distanceMeters: distanceBetweenMeters(destination, {
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
      }),
    };
    for (const branch of rest) {
      const distanceMeters = distanceBetweenMeters(destination, {
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
      });
      if (distanceMeters < nearest.distanceMeters) {
        nearest = { branch, distanceMeters };
      }
    }
    return nearest;
  }
}
