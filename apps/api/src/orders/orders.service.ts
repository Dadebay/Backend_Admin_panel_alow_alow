import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  CashSettlementStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  PromoType,
  Role,
} from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import { PrismaService } from "../prisma/prisma.service";
import { AddressesService } from "../users/addresses.service";
import { BranchesService } from "../branches/branches.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  RoutingService,
  RoutingUnavailableError,
} from "../routing/routing.service";
import { TrackingService } from "../tracking/tracking.service";
import {
  AssignCourierDto,
  CancelOrderDto,
  CreateAssistedOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  RateOrderDto,
  SearchAssistedCustomersQueryDto,
  TransitionOrderDto,
} from "./orders.dto";
import { assertOrderTransition, canCancelOrder } from "./order-policy";
import {
  CourierRouteWaypointKind,
  CourierRoutingStatus,
} from "./orders-response.dto";

const detailInclude = {
  customer: {
    select: { id: true, phone: true, firstName: true, lastName: true },
  },
  cook: { select: { id: true, firstName: true, lastName: true } },
  courier: {
    select: { id: true, phone: true, firstName: true, lastName: true },
  },
  items: {
    include: {
      // Only the item's own row fields go to the client (see
      // `withItemImages`) — the current product photo is looked up at read
      // time rather than snapshotted, since (unlike price) showing today's
      // photo for a past order is exactly what a customer expects.
      product: {
        include: {
          images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
        },
      },
    },
  },
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
type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof detailInclude;
}>;

/** Flattens each item's joined `product.images` down to the single
 * `productImageUrl` the client actually needs, instead of shipping the
 * whole nested product/image objects. */
function withItemImages<T extends OrderWithDetails>(order: T) {
  return {
    ...order,
    items: order.items.map(({ product, ...item }) => ({
      ...item,
      productImageUrl: product.images[0]?.url ?? null,
    })),
  };
}

const MAX_ROUTE_LOCATION_AGE_MS = 5 * 60 * 1_000;
const ROUTE_RECALCULATION_SECONDS = 15;
const NEXT_ROUTE_WAYPOINTS_LIMIT = 3;

/** Only the statuses a customer actually needs to hear about — the later
 * back-office accounting stages (cash returned/completed/reconciled) never
 * reach them, they've already got their food by then. Turkmen first: the
 * app's primary market and the only locale guaranteed to be understood if
 * a device never reported one. */
const CUSTOMER_STATUS_MESSAGES: Partial<
  Record<OrderStatus, (orderNumber: number) => { title: string; body: string }>
> = {
  CONFIRMED: (n) => ({
    title: `Sargyt #${n} tassyklandy`,
    body: "Sargydyňyz kabul edildi, ýakynda taýýarlanyp başlanar.",
  }),
  SENT_TO_KITCHEN: (n) => ({
    title: `Sargyt #${n} aşhanada`,
    body: "Sargydyňyz taýýarlanýar.",
  }),
  COOKING: (n) => ({
    title: `Sargyt #${n} taýýarlanýar`,
    body: "Aşpezimiz sargydyňyzy taýýarlaýar.",
  }),
  READY: (n) => ({
    title: `Sargyt #${n} taýýar`,
    body: "Sargydyňyz kurýere berilmäge taýýar.",
  }),
  ASSIGNED_TO_COURIER: (n) => ({
    title: `Sargyt #${n} kurýerde`,
    body: "Kurýer sargydyňyzy almaga barýar.",
  }),
  OUT_FOR_DELIVERY: (n) => ({
    title: `Sargyt #${n} ýolda`,
    body: "Kurýer sargydyňyzy size getirýär.",
  }),
  DELIVERED: (n) => ({
    title: `Sargyt #${n} gowşuryldy`,
    body: "Işdäňiz açyk bolsun! Sargydyňyzy nähili baha berýärsiňiz?",
  }),
  CANCELLED: (n) => ({
    title: `Sargyt #${n} ýatyryldy`,
    body: "Sargydyňyz ýatyryldy. Jikme-jiklikler üçin programma serediň.",
  }),
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: AddressesService,
    private readonly branches: BranchesService,
    private readonly tracking: TrackingService,
    private readonly routing: RoutingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Fire-and-forget: a push failure must never fail the status change
   * that triggered it, so this is called without `await`ing its result
   * into the transaction's own success/failure path. */
  private notifyCustomer(
    customerId: string,
    orderNumber: number,
    status: OrderStatus,
  ) {
    const message = CUSTOMER_STATUS_MESSAGES[status]?.(orderNumber);
    if (!message) return;
    void this.notifications.sendDirectPush(customerId, message);
  }

  create(user: AuthUser, dto: CreateOrderDto) {
    return this.prisma.$transaction((tx) =>
      this.createForCustomer(tx, {
        actorId: user.id,
        customerId: user.id,
        dto,
        source: OrderSource.CUSTOMER_APP,
      }),
    );
  }

  async searchAssistedCustomers(query: SearchAssistedCustomersQueryDto) {
    const digits = query.phone.replace(/\D/g, "");
    const phoneFragment = digits.startsWith("993") ? `+${digits}` : digits;
    const items = await this.prisma.user.findMany({
      where: {
        role: Role.CUSTOMER,
        isActive: true,
        phone: { contains: phoneFragment },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        addresses: {
          select: {
            id: true,
            label: true,
            address: true,
            latitude: true,
            longitude: true,
            entrance: true,
            floor: true,
            apartment: true,
            isActive: true,
          },
          orderBy: [
            { isActive: "desc" },
            { lastUsedAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return toApiResponse({ items });
  }

  createAssisted(actor: AuthUser, dto: CreateAssistedOrderDto) {
    const { customerPhone, customerFirstName, customerLastName, ...orderDto } =
      dto;
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.resolveAssistedCustomer(tx, actor, {
        phone: customerPhone,
        firstName: customerFirstName,
        lastName: customerLastName,
      });
      return this.createForCustomer(tx, {
        actorId: actor.id,
        customerId: customer.id,
        dto: orderDto,
        source: OrderSource.STAFF_PHONE,
      });
    });
  }

  private async resolveAssistedCustomer(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    input: { phone: string; firstName?: string; lastName?: string },
  ) {
    const phone = this.normalizePhone(input.phone);
    const existingBeforeUpsert = await tx.user.findUnique({ where: { phone } });
    const existing =
      existingBeforeUpsert ??
      (await tx.user.upsert({
        where: { phone },
        create: {
          phone,
          role: Role.CUSTOMER,
          firstName: input.firstName?.trim() || undefined,
          lastName: input.lastName?.trim() || undefined,
        },
        update: {},
      }));
    if (existing.role !== Role.CUSTOMER) {
      throw new ConflictException(
        "This phone belongs to a staff account and cannot receive a customer order",
      );
    }
    if (!existing.isActive) {
      throw new ConflictException("Customer account is inactive");
    }
    if (!existingBeforeUpsert) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "customer.resolved_for_phone_order",
          entityType: "User",
          entityId: existing.id,
          metadata: { channel: "PHONE_ORDER" },
        },
      });
      return existing;
    }

    const firstName = existing.firstName ?? (input.firstName?.trim() || null);
    const lastName = existing.lastName ?? (input.lastName?.trim() || null);
    if (firstName === existing.firstName && lastName === existing.lastName) {
      return existing;
    }
    const updated = await tx.user.update({
      where: { id: existing.id },
      data: { firstName, lastName },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "customer.profile_completed_by_staff",
        entityType: "User",
        entityId: updated.id,
        metadata: { channel: "PHONE_ORDER" },
      },
    });
    return updated;
  }

  private normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }

  private async createForCustomer(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      customerId: string;
      dto: CreateOrderDto;
      source: OrderSource;
    },
  ) {
    const { actorId, customerId, dto, source } = input;
    const quantityByProduct = new Map<string, number>();
    for (const item of dto.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const products = await tx.product.findMany({
      where: {
        id: { in: [...quantityByProduct.keys()] },
        isActive: true,
        category: { isActive: true },
      },
    });
    if (products.length !== quantityByProduct.size) {
      throw new BadRequestException("One or more products are unavailable");
    }

    const subtotal = products.reduce(
      (sum, product) =>
        sum + Number(product.price) * (quantityByProduct.get(product.id) ?? 0),
      0,
    );
    const now = new Date();
    const promo = dto.promoCode
      ? await tx.promoCode.findUnique({
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
      const usedByCustomer = await tx.promoRedemption.count({
        where: { promoCodeId: promo.id, userId: customerId },
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

    const selectedAddress = await this.addresses.selectForOrder(
      tx,
      customerId,
      dto,
      actorId,
    );
    const nearest = await this.branches.findNearestActive(tx, {
      latitude: Number(selectedAddress.latitude),
      longitude: Number(selectedAddress.longitude),
    });

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
        customerId,
        source,
        branchId: nearest.branch.id,
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
        branchName: nearest.branch.name,
        branchAddress: nearest.branch.address,
        branchLatitude: nearest.branch.latitude,
        branchLongitude: nearest.branch.longitude,
        branchDistanceMeters: nearest.distanceMeters,
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
                  userId: customerId,
                },
              },
            }
          : {}),
      },
      include: detailInclude,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action:
          source === OrderSource.STAFF_PHONE
            ? "order.created_by_staff"
            : "order.created",
        entityType: "Order",
        entityId: order.id,
        metadata: {
          number: order.number,
          total,
          source,
          customerId,
          branchId: nearest.branch.id,
          branchDistanceMeters: nearest.distanceMeters,
        },
      },
    });
    return toApiResponse(withItemImages(order));
  }

  async list(user: AuthUser, query: ListOrdersQueryDto) {
    const roleFilter: Prisma.OrderWhereInput =
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
    const search = query.search?.trim();
    const orderNumber = search && /^\d+$/.test(search) ? Number(search) : null;
    const statusFilter: Prisma.OrderWhereInput = query.status
      ? { status: query.status }
      : query.statuses?.length
        ? { status: { in: query.statuses } }
        : {};
    const searchFilter: Prisma.OrderWhereInput = search
      ? {
          OR: [
            ...(orderNumber ? [{ number: orderNumber }] : []),
            { address: { contains: search, mode: "insensitive" as const } },
            {
              branchName: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
            {
              customer: {
                OR: [
                  { phone: { contains: search } },
                  {
                    firstName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    lastName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            },
          ],
        }
      : {};
    const where: Prisma.OrderWhereInput = {
      AND: [
        roleFilter,
        statusFilter,
        query.branchId ? { branchId: query.branchId } : {},
        searchFilter,
      ],
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
    return toApiResponse({
      items: items.map(withItemImages),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    });
  }

  async getById(user: AuthUser, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertCanRead(user, order);
    return toApiResponse(withItemImages(order));
  }

  async transition(user: AuthUser, id: string, dto: TransitionOrderDto) {
    let notifyTarget: { customerId: string; number: number } | null = null;
    const response = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { cashSettlement: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      assertOrderTransition(order.status, dto.status, user.role);
      if (user.role === Role.COOK && order.cookId && order.cookId !== user.id) {
        throw new ForbiddenException("This order belongs to another cook");
      }
      if (user.role === Role.COURIER && order.courierId !== user.id) {
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
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.transitioned",
          entityType: "Order",
          entityId: id,
          metadata: { fromStatus: order.status, toStatus: dto.status },
        },
      });
      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      notifyTarget = { customerId: result.customerId, number: result.number };
      return toApiResponse(withItemImages(result));
    });
    const transitionTarget = notifyTarget as {
      customerId: string;
      number: number;
    } | null;
    if (transitionTarget) {
      this.notifyCustomer(
        transitionTarget.customerId,
        transitionTarget.number,
        dto.status,
      );
    }
    return response;
  }

  async assignCourier(user: AuthUser, id: string, dto: AssignCourierDto) {
    let notifyTarget: { customerId: string; number: number } | null = null;
    const response = await this.prisma.$transaction(async (tx) => {
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
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.courier-assigned",
          entityType: "Order",
          entityId: id,
          metadata: { courierId: courier.id },
        },
      });
      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      notifyTarget = { customerId: result.customerId, number: result.number };
      return toApiResponse(withItemImages(result));
    });
    const assignTarget = notifyTarget as {
      customerId: string;
      number: number;
    } | null;
    if (assignTarget) {
      this.notifyCustomer(
        assignTarget.customerId,
        assignTarget.number,
        OrderStatus.ASSIGNED_TO_COURIER,
      );
    }
    return response;
  }

  async cancel(user: AuthUser, id: string, dto: CancelOrderDto) {
    let notifyTarget: { customerId: string; number: number } | null = null;
    const response = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (
        !canCancelOrder(order.status, user.role, order.customerId === user.id)
      ) {
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
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.cancelled",
          entityType: "Order",
          entityId: id,
          metadata: { fromStatus: order.status, reason: dto.reason },
        },
      });
      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      notifyTarget = { customerId: result.customerId, number: result.number };
      return toApiResponse(withItemImages(result));
    });
    const cancelTarget = notifyTarget as {
      customerId: string;
      number: number;
    } | null;
    if (cancelTarget) {
      this.notifyCustomer(
        cancelTarget.customerId,
        cancelTarget.number,
        OrderStatus.CANCELLED,
      );
    }
    return response;
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
      return await this.prisma.$transaction(async (tx) => {
        const rating = await tx.rating.create({
          data: {
            orderId: id,
            customerId: user.id,
            score: dto.score,
            comment: dto.comment,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "order.rated",
            entityType: "Order",
            entityId: id,
            metadata: { score: dto.score },
          },
        });
        return toApiResponse(rating);
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
    return this.buildCourierRoute(user.id);
  }

  async dispatchCourierRoute(courierId: string) {
    const courier = await this.prisma.user.findFirst({
      where: { id: courierId, role: Role.COURIER, isActive: true },
      select: { id: true },
    });
    if (!courier) throw new NotFoundException("Active courier not found");
    return this.buildCourierRoute(courier.id);
  }

  private async buildCourierRoute(courierId: string) {
    const [orders, courierLocation] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          courierId,
          status: {
            in: [OrderStatus.ASSIGNED_TO_COURIER, OrderStatus.OUT_FOR_DELIVERY],
          },
        },
        include: {
          customer: {
            select: { phone: true, firstName: true, lastName: true },
          },
          items: true,
        },
        orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }],
      }),
      this.tracking.getCourierLocation(courierId),
    ]);
    const stops = orders.map((order, index) => ({
      sequence: index + 1,
      orderId: order.id,
      orderNumber: order.number,
      status: order.status,
      address: order.address,
      latitude: order.latitude,
      longitude: order.longitude,
      entrance: order.entrance,
      floor: order.floor,
      apartment: order.apartment,
      customerNote: order.customerNote,
      assignedAt: order.assignedAt,
      branch: order.branchId
        ? {
            branchId: order.branchId,
            name: order.branchName,
            address: order.branchAddress,
            latitude: order.branchLatitude,
            longitude: order.branchLongitude,
          }
        : null,
      customer: order.customer,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      items: order.items.map(({ productName, quantity }) => ({
        productName,
        quantity,
      })),
      cashToCollect: order.total,
    }));
    if (!orders.length) {
      return toApiResponse({
        courierId,
        stops,
        routingStatus: CourierRoutingStatus.NO_STOPS,
        recalculateAfterSeconds: ROUTE_RECALCULATION_SECONDS,
        route: null,
      });
    }

    const routePoints: Array<{
      kind: CourierRouteWaypointKind;
      latitude: number;
      longitude: number;
      branchId: string | null;
      orderId: string | null;
    }> = [];
    if (
      courierLocation &&
      Date.now() - Date.parse(courierLocation.recordedAt) <=
        MAX_ROUTE_LOCATION_AGE_MS
    ) {
      routePoints.push({
        kind: CourierRouteWaypointKind.COURIER,
        latitude: courierLocation.latitude,
        longitude: courierLocation.longitude,
        branchId: null,
        orderId: null,
      });
    }

    const includedBranches = new Set<string>();
    for (const order of orders) {
      if (
        order.status === OrderStatus.ASSIGNED_TO_COURIER &&
        order.branchId &&
        order.branchLatitude !== null &&
        order.branchLongitude !== null &&
        !includedBranches.has(order.branchId)
      ) {
        includedBranches.add(order.branchId);
        routePoints.push({
          kind: CourierRouteWaypointKind.PICKUP,
          latitude: Number(order.branchLatitude),
          longitude: Number(order.branchLongitude),
          branchId: order.branchId,
          orderId: null,
        });
      }
    }
    for (const order of orders) {
      routePoints.push({
        kind: CourierRouteWaypointKind.DELIVERY,
        latitude: Number(order.latitude),
        longitude: Number(order.longitude),
        branchId: order.branchId,
        orderId: order.id,
      });
    }

    if (routePoints.length < 2) {
      return toApiResponse({
        courierId,
        stops,
        routingStatus: CourierRoutingStatus.UNAVAILABLE,
        recalculateAfterSeconds: ROUTE_RECALCULATION_SECONDS,
        route: null,
      });
    }

    try {
      const planned = await this.routing.planDrivingRoute(routePoints);
      const waypoints = routePoints.map((point, index) => {
        const snapped = planned.waypoints[index];
        if (!snapped) throw new RoutingUnavailableError();
        return {
          sequence: index + 1,
          kind: point.kind,
          requestedLatitude: point.latitude,
          requestedLongitude: point.longitude,
          latitude: snapped.latitude,
          longitude: snapped.longitude,
          distanceToRoadMeters: snapped.distanceToRoadMeters,
          branchId: point.branchId,
          orderId: point.orderId,
        };
      });
      const planId = createHash("sha256")
        .update(
          JSON.stringify({
            courierId,
            routePoints,
            geometry: planned.geometry,
          }),
        )
        .digest("hex");
      return toApiResponse({
        courierId,
        stops,
        routingStatus: CourierRoutingStatus.READY,
        recalculateAfterSeconds: ROUTE_RECALCULATION_SECONDS,
        route: {
          planId,
          generatedAt: new Date(),
          distanceMeters: planned.distanceMeters,
          durationSeconds: planned.durationSeconds,
          geometry: planned.geometry,
          waypoints,
          nextWaypoints: waypoints
            .filter(({ kind }) => kind !== CourierRouteWaypointKind.COURIER)
            .slice(0, NEXT_ROUTE_WAYPOINTS_LIMIT),
          legs: planned.legs,
        },
      });
    } catch (error) {
      if (!(error instanceof RoutingUnavailableError)) throw error;
      return toApiResponse({
        courierId,
        stops,
        routingStatus: CourierRoutingStatus.UNAVAILABLE,
        recalculateAfterSeconds: ROUTE_RECALCULATION_SECONDS,
        route: null,
      });
    }
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
    if (user.role === Role.COURIER && order.courierId !== user.id) {
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
