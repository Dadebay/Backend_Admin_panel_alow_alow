import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateAdminPageAccessDto } from "./admin-page-access.dto";
import {
  ADMIN_PAGES,
  availableAdminPages,
  effectiveAdminPages,
  expandedAdminPages,
  isConfigurableAdminPageRole,
} from "./admin-page-access.policy";

const userAccessSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  adminPageAccess: {
    select: { allowedPages: true, version: true },
  },
} satisfies Prisma.UserSelect;

type UserWithAccess = Prisma.UserGetPayload<{ select: typeof userAccessSelect }>;

@Injectable()
export class AdminPageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userAccessSelect,
    });
    if (!user) throw new NotFoundException("User not found");
    return this.toResponse(user);
  }

  async matrix() {
    const users = await this.prisma.user.findMany({
      where: { role: { not: Role.CUSTOMER } },
      orderBy: [
        { role: "asc" },
        { firstName: "asc" },
        { lastName: "asc" },
        { phone: "asc" },
      ],
      select: userAccessSelect,
    });
    return { users: users.map((user) => this.toResponse(user)) };
  }

  async update(
    actor: AuthUser,
    userId: string,
    dto: UpdateAdminPageAccessDto,
  ) {
    const normalized = ADMIN_PAGES.filter((page) =>
      dto.allowedPages.includes(page),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: userAccessSelect,
        });
        if (!target) throw new NotFoundException("Employee not found");
        if (!isConfigurableAdminPageRole(target.role)) {
          throw new BadRequestException(
            "Page access cannot be changed for this employee",
          );
        }

        const currentVersion = target.adminPageAccess?.version ?? 0;
        if (currentVersion !== dto.version) {
          throw new ConflictException(
            "Page access changed in another session. Reload and try again",
          );
        }

        const saved = target.adminPageAccess
          ? await this.updateExisting(tx, userId, normalized, currentVersion)
          : await tx.adminUserPageAccess.create({
              data: { userId, allowedPages: normalized, version: 1 },
            });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "admin_user_page_access.updated",
            entityType: "AdminUserPageAccess",
            entityId: userId,
            metadata: {
              targetRole: target.role,
              previousAllowedPages: effectiveAdminPages(
                target.role,
                target.adminPageAccess?.allowedPages ?? null,
              ),
              allowedPages: normalized,
              previousVersion: currentVersion,
              version: saved.version,
            },
          },
        });

        return this.toResponse({
          ...target,
          adminPageAccess: saved,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Page access changed in another session. Reload and try again",
        );
      }
      throw error;
    }
  }

  private async updateExisting(
    tx: Prisma.TransactionClient,
    userId: string,
    allowedPages: AdminPage[],
    version: number,
  ) {
    const updated = await tx.adminUserPageAccess.updateMany({
      where: { userId, version },
      data: { allowedPages, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "Page access changed in another session. Reload and try again",
      );
    }
    return tx.adminUserPageAccess.findUniqueOrThrow({ where: { userId } });
  }

  private toResponse(user: UserWithAccess) {
    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      allowedPages: effectiveAdminPages(
        user.role,
        user.adminPageAccess?.allowedPages ?? null,
      ),
      availablePages: availableAdminPages(user.role),
      expandedPages: expandedAdminPages(
        user.role,
        user.adminPageAccess?.allowedPages ?? null,
      ),
      editable: isConfigurableAdminPageRole(user.role),
      version: user.adminPageAccess?.version ?? 0,
    };
  }
}
