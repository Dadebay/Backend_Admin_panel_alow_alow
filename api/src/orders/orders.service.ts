import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CashSettlementStatus,
  OrderStatus,
  Prisma,
  PromoType,
  Role,
} from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { AddressesService } from "../users/addresses.service";
import {
  AssignCourierDto,
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  RateOrderDto,
  TransitionOrderDto,
} from "./orders.dto";
import {
  assertOrderTransition,
  canCancelOrder,
} from "./order-policy";

const detailInclude = {
  customer: {
    select: { id: true, phone: true, firstName: true, lastName: true },
  },
  cook: { select: { id: true, firstName: true, lastName: true } },
  courier: {
    select: { id: true, phone: true, firstName: true, lastName: true },
  },
  items: true,
  rating: true,
  cashSettlement: true,
  savedAddress: true,
  transitions: {
    orderBy: { createdAt: "asc" as const },
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
    },
  },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: AddressesService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const quantityByProduct = new Map<string, number>();
    for (const item of dto.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...quantityByProduct.keys()] },
        isActive: true,
        category: { isActive: true },
      },
    });
    if (products.length !== quantityByProduct.size) {
      throw new BadRequestException(
        "One or more products are unavailable",
      );
    }

    const subtotal = products.reduce(
      (sum, product) =>
        sum + Number(product.price) * (quantityByProduct.get(product.id) ?? 0),
      0,
    );
    const now = new Date();
    const promo = dto.promoCode
      ? await this.prisma.promoCode.findUnique({
          where: { code: dto.promoCode.trim().toUpperCase() },
        })
      : null;

    let discount = 0;
    if (dto.promoCode) {
      if (
        !promo?.isActive ||
        (promo.startsAt && promo.startsAt > now) ||
        (promo.endsAt && promo.endsAt < now) ||
        (promo.totalUsageLimit != null &&
          promo.usedCount >= promo.totalUsageLimit) ||
        (promo.minOrderAmount != null &&
          subtotal < Number(promo.minOrderAmount))
      ) {
        throw new BadRequestException("Promo code is unavailable");
      }
      const usedByCustomer = await this.prisma.promoRedemption.count({
        where: { promoCodeId: promo.id, userId: user.id },
      });
      if (usedByCustomer >= promo.perUserLimit) {
        throw new BadRequestException("Promo code usage limit reached");
      }
      discount =
        promo.type === PromoType.PERCENT
          ? subtotal * (Number(promo.value) / 100)
          : Number(promo.value);
      if (promo.maxDiscountAmount != null) {
        discount = Math.min(discount, Number(promo.maxDiscountAmount));
      }
      discount = Math.min(subtotal, Math.round(discount * 100) / 100);
    }

    const deliveryFee = subtotal >= 150 ? 0 : 15;
    const total = Math.max(0, subtotal - discount + deliveryFee);

    return this.prisma.$transaction(async (tx) => {
      const selectedAddress = await this.addresses.selectForOrder(
        tx,
        user.id,
        dto,
      );

      if (promo) {
        const incremented = await tx.promoCode.updateMany({
          where: {
            id: promo.id,
            usedCount: promo.usedCount,
            ...(promo.totalUsageLimit != null
              ? { usedCount: { lt: promo.totalUsageLimit } }
              : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (incremented.count !== 1) {
          throw new ConflictException("Promo code was just exhausted");
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: user.id,
          promoCodeId: promo?.id,
          addressId: selectedAddress.id,
          subtotal,
          discount,
          deliveryFee,
          total,
          address: selectedAddress.address,
          latitude: selectedAddress.latitude,
          longitude: selectedAddress.longitude,
          entrance: selectedAddress.entrance,
          floor: selectedAddress.floor,
          apartment: selectedAddress.apartment,
          customerNote: dto.customerNote,
          items: {
            create: products.map((product) => {
              const quantity = quantityByProduct.get(product.id) ?? 0;
              return {
                productId: product.id,
                productName: product.name,
                unitPrice: product.price,
                quantity,
                lineTotal: Number(product.price) * quantity,
              };
            }),
          },
          ...(promo
            ? {
                promoRedemption: {
                  create: {
                    promoCodeId: promo.id,
                    userId: user.id,
                  },
                },
              }
            : {}),
        },
        include: detailInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.created",
          entityType: "Order",
          entityId: order.id,
          metadata: { number: order.number, total },
        },
      });
      return order;
    });
  }

  async list(user: AuthUser, query: ListOrdersQueryDto) {
    const roleFilter =
      user.role === Role.CUSTOMER
        ? { customerId: user.id }
        : user.role === Role.COURIER
          ? { courierId: user.id }
          : user.role === Role.COOK
            ? {
                OR: [
                  { cookId: user.id },
                  { status: OrderStatus.SENT_TO_KITCHEN },
                ],
              }
            : {};
    const where = {
      ...roleFilter,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: detailInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }

  async getById(user: AuthUser, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertCanRead(user, order);
    return order;
  }

  async transition(user: AuthUser, id: string, dto: TransitionOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { cashSettlement: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      assertOrderTransition(order.status, dto.status, user.role);
      if (
        user.role === Role.COOK &&
        order.cookId &&
        order.cookId !== user.id
      ) {
        throw new ForbiddenException("This order belongs to another cook");
      }
      if (
        user.role === Role.COURIER &&
        order.courierId !== user.id
      ) {
        throw new ForbiddenException("This order is not assigned to you");
      }

      const updateData: Record<string, unknown> = {
        status: dto.status,
        version: { increment: 1 },
      };
      if (
        order.status === OrderStatus.SENT_TO_KITCHEN &&
        dto.status === OrderStatus.COOKING
      ) {
        updateData.cookId = user.id;
      }
      if (dto.status === OrderStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }
      if (dto.status === OrderStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }

      const updated = await tx.order.updateMany({
        where: { id, version: dto.version, status: order.status },
        data: updateData,
      });
      if (updated.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }

      if (dto.status === OrderStatus.CASH_RETURNED) {
        if (!order.courierId) {
          throw new ConflictException("Courier is missing");
        }
        await tx.cashSettlement.create({
          data: {
            orderId: order.id,
            courierId: order.courierId,
            amount: order.total,
          },
        });
      } else if (dto.status === OrderStatus.COMPLETED) {
        await tx.cashSettlement.update({
          where: { orderId: order.id },
          data: {
            operatorId: user.id,
            operatorTakenAt: new Date(),
            status: CashSettlementStatus.CONFIRMED,
          },
        });
      } else if (dto.status === OrderStatus.RECONCILED) {
        await tx.cashSettlement.update({
          where: { orderId: order.id },
          data: {
            accountantId: user.id,
            reconciledAt: new Date(),
            status: CashSettlementStatus.RECONCILED,
          },
        });
      }

      await tx.orderTransition.create({
        data: {
          orderId: order.id,
          actorId: user.id,
          fromStatus: order.status,
          toStatus: dto.status,
          note: dto.note,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
    });
  }

  async assignCourier(user: AuthUser, id: string, dto: AssignCourierDto) {
    return this.prisma.$transaction(async (tx) => {
      const [order, courier] = await Promise.all([
        tx.order.findUnique({ where: { id } }),
        tx.user.findUnique({ where: { id: dto.courierId } }),
      ]);
      if (!order) throw new NotFoundException("Order not found");
      if (!courier || courier.role !== Role.COURIER || !courier.isActive) {
        throw new BadRequestException("Courier is unavailable");
      }
      if (order.status !== OrderStatus.READY) {
        throw new ConflictException("Only a ready order can be assigned");
      }
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      const updated = await tx.order.updateMany({
        where: { id, version: dto.version, status: OrderStatus.READY },
        data: {
          status: OrderStatus.ASSIGNED_TO_COURIER,
          courierId: courier.id,
          assignedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }
      await tx.orderTransition.create({
        data: {
          orderId: id,
          actorId: user.id,
          fromStatus: OrderStatus.READY,
          toStatus: OrderStatus.ASSIGNED_TO_COURIER,
          note: `Assigned to courier ${courier.id}`,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
    });
  }

  async cancel(user: AuthUser, id: string, dto: CancelOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (!canCancelOrder(order.status, user.role, order.customerId === user.id)) {
        throw new ForbiddenException(
          "Cancellation is allowed only for authorized staff before cooking starts",
        );
      }
      const cancelled = await tx.order.updateMany({
        where: { id, version: dto.version, status: order.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }
      await tx.orderTransition.create({
        data: {
          orderId: id,
          actorId: user.id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          note: dto.reason,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
    });
  }

  async rate(user: AuthUser, id: string, dto: RateOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== user.id) {
      throw new ForbiddenException("You can rate only your own order");
    }
    const deliveredStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.CASH_RETURNED,
      OrderStatus.COMPLETED,
      OrderStatus.RECONCILED,
    ];
    if (!deliveredStatuses.includes(order.status)) {
      throw new ConflictException("Order has not been delivered yet");
    }
    try {
      return await this.prisma.rating.create({
        data: {
          orderId: id,
          customerId: user.id,
          score: dto.score,
          comment: dto.comment,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Order has already been rated");
      }
      throw error;
    }
  }

  async courierRoute(user: AuthUser) {
    const orders = await this.prisma.order.findMany({
      where: {
        courierId: user.id,
        status: {
          in: [
            OrderStatus.ASSIGNED_TO_COURIER,
            OrderStatus.OUT_FOR_DELIVERY,
          ],
        },
      },
      include: {
        customer: {
          select: { phone: true, firstName: true, lastName: true },
        },
        items: true,
      },
      orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }],
    });
    return {
      courierId: user.id,
      stops: orders.map((order, index) => ({
        sequence: index + 1,
        orderId: order.id,
        orderNumber: order.number,
        status: order.status,
        address: order.address,
        latitude: order.latitude,
        longitude: order.longitude,
        customer: order.customer,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        cashToCollect: order.total,
      })),
    };
  }

  private assertCanRead(
    user: AuthUser,
    order: {
      customerId: string;
      cookId: string | null;
      courierId: string | null;
      status: OrderStatus;
    },
  ) {
    if (user.role === Role.CUSTOMER && order.customerId !== user.id) {
      throw new ForbiddenException();
    }
    if (
      user.role === Role.COURIER &&
      order.courierId !== user.id
    ) {
      throw new ForbiddenException();
    }
    if (
      user.role === Role.COOK &&
      order.cookId !== user.id &&
      order.status !== OrderStatus.SENT_TO_KITCHEN
    ) {
      throw new ForbiddenException();
    }
  }
}
