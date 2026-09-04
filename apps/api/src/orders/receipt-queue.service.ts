import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  Prisma,
  ReceiptPrintTaskStatus,
  Role,
  type ReceiptPrintTask,
} from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "./orders.service";
import { ReceiptPrintPlanResponseDto } from "./orders-response.dto";
import {
  type ReceiptOutcomeDto,
  type ReceiptLeaseDto,
} from "./receipt-queue.dto";

export const RECEIPT_LEASE_MS = 180_000;
const waiting = [
  ReceiptPrintTaskStatus.PENDING,
  ReceiptPrintTaskStatus.PROCESSING,
];

@Injectable()
export class ReceiptQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  private authorize(actor: AuthUser) {
    if (
      !([Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN] as Role[]).includes(
        actor.role,
      )
    )
      throw new ForbiddenException(
        "Receipt queue is restricted to operations staff",
      );
  }
  private view(task: ReceiptPrintTask & { order: { number: number } }) {
    return {
      id: task.id,
      orderId: task.orderId,
      orderNumber: task.order.number,
      documentType: task.documentType,
      status: task.status,
      attempts: task.attempts,
      createdAt: task.createdAt.toISOString(),
      nextAttemptAt: task.nextAttemptAt.toISOString(),
      stationId: task.stationId,
      lastError: task.lastError,
      deliveredAt: task.deliveredAt?.toISOString() ?? null,
    };
  }
  private async lock(tx: Prisma.TransactionClient) {
    // Updating one permanent row obtains a transactional row lock. This makes
    // selection + claim atomic without a second in-memory scheduler or raw SQL.
    await tx.receiptPrintQueue.update({
      where: { id: "default" },
      data: { revision: { increment: 1 } },
    });
  }
  async list(actor: AuthUser) {
    this.authorize(actor);
    const [items, pending, needsAttention] = await Promise.all([
      this.prisma.receiptPrintTask.findMany({
        where: { status: { not: "DELIVERED" } },
        include: { order: { select: { number: true } } },
        orderBy: { sequence: "asc" },
        take: 50,
      }),
      this.prisma.receiptPrintTask.count({
        where: { status: { in: waiting } },
      }),
      this.prisma.receiptPrintTask.count({
        where: { status: { in: ["FAILED", "UNCERTAIN"] } },
      }),
    ]);
    return { items: items.map((t) => this.view(t)), pending, needsAttention };
  }
  async claim(actor: AuthUser, stationId: string) {
    this.authorize(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const now = new Date();
      await tx.receiptPrintTask.updateMany({
        where: { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        data: { status: "PENDING", lastError: "AGENT_UNAVAILABLE" },
      });
      if (
        await tx.receiptPrintTask.findFirst({
          where: { status: "PROCESSING" },
          select: { id: true },
        })
      )
        return { task: null };
      // A lost acknowledgment is replayed only on the original agent journal.
      // A different workstation must never resend an ambiguous dispatch.
      const next = await tx.receiptPrintTask.findFirst({
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: now },
          OR: [{ stationId: null }, { stationId }],
        },
        orderBy: { sequence: "asc" },
      });
      if (!next) return { task: null };
      const task = await tx.receiptPrintTask.update({
        where: { id: next.id },
        data: {
          status: "PROCESSING",
          stationId,
          claimedBy: actor.id,
          claimToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + RECEIPT_LEASE_MS),
          attempts: { increment: 1 },
        },
        include: { order: { select: { number: true } } },
      });
      return {
        task: {
          ...this.view(task),
          dispatchId: task.dispatchId,
          claimToken: task.claimToken!,
          leaseExpiresAt: task.leaseExpiresAt!.toISOString(),
          plan: task.plan as unknown as ReceiptPrintPlanResponseDto,
        },
      };
    });
  }
  async heartbeat(actor: AuthUser, id: string, dto: ReceiptLeaseDto) {
    this.authorize(actor);
    const result = await this.prisma.receiptPrintTask.updateMany({
      where: {
        id,
        stationId: dto.stationId,
        claimToken: dto.claimToken,
        claimedBy: actor.id,
        status: "PROCESSING",
        leaseExpiresAt: { gt: new Date() },
      },
      data: { leaseExpiresAt: new Date(Date.now() + RECEIPT_LEASE_MS) },
    });
    if (result.count !== 1)
      throw new ConflictException(
        "Receipt lease no longer belongs to this worker",
      );
    return { ok: true };
  }
  async acknowledge(actor: AuthUser, id: string, dto: ReceiptOutcomeDto) {
    this.authorize(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const task = await tx.receiptPrintTask.findUnique({
        where: { id },
        include: { order: { select: { number: true } } },
      });
      if (!task) throw new NotFoundException("Receipt task not found");
      if (
        task.claimedBy !== actor.id ||
        task.stationId !== dto.stationId ||
        task.claimToken !== dto.claimToken
      )
        throw new ConflictException("Receipt lease belongs to another worker");
      if (task.status !== "PROCESSING") {
        // An HTTP acknowledgment can itself be retried, but cannot change a
        // terminal outcome or overwrite a replacement claim token.
        if (task.status === "DELIVERED" && dto.outcome === "DELIVERED")
          return this.view(task);
        throw new ConflictException("Receipt task is not processing");
      }
      const status = dto.outcome === "RETRY" ? "PENDING" : dto.outcome;
      const updated = await tx.receiptPrintTask.update({
        where: { id },
        data: {
          status,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(60_000, 2_000 * 2 ** Math.min(task.attempts, 5)),
          ),
          deliveredAt: status === "DELIVERED" ? new Date() : null,
          lastError:
            status === "DELIVERED"
              ? null
              : (dto.errorCode ?? "AGENT_UNAVAILABLE"),
        },
        include: { order: { select: { number: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.delivery_result",
          entityType: "ReceiptPrintTask",
          entityId: id,
          metadata: {
            status,
            attempt: task.attempts,
            stationId: dto.stationId,
            paperConfirmed: false,
          },
        },
      });
      return this.view(updated);
    });
  }
  async retry(actor: AuthUser, id: string) {
    this.authorize(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const result = await tx.receiptPrintTask.updateMany({
        where: { id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "A processing or uncertain receipt cannot be automatically retried",
        );
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.retry_requested",
          entityType: "ReceiptPrintTask",
          entityId: id,
        },
      });
      return { ok: true };
    });
  }

  async reprint(actor: AuthUser, orderId: string, key: string) {
    this.authorize(actor);
    const eventKey = `MANUAL:${actor.id}:${key}`;
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const prior = await tx.receiptPrintTask.findUnique({
        where: { eventKey },
        include: { order: { select: { number: true } } },
      });
      if (prior) {
        if (prior.orderId !== orderId)
          throw new ConflictException(
            "Reprint key already belongs to another order",
          );
        return this.view(prior);
      }
      const task = await this.orders.enqueueReceipt(tx, orderId, eventKey);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.reprint_requested",
          entityType: "ReceiptPrintTask",
          entityId: task.id,
          metadata: { orderId },
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { number: true },
      });
      return this.view({ ...task, order });
    });
  }
}
