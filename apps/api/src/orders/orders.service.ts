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
  ProductPricingType,
  ReceiptPrinterTransport,
  Role,
} from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { AddressesService } from "../users/addresses.service";
import { BranchesService } from "../branches/branches.service";
import { NotificationsService } from "../notifications/notifications.service";
import { DeliveryService } from "../delivery/delivery.service";
import {
  RoutingService,
  RoutingUnavailableError,
} from "../routing/routing.service";
import { TrackingService } from "../tracking/tracking.service";
import {
  AdminEditOrderDto,
  AssignCourierDto,
  CancelOrderDto,
  ConfirmOrderPackingDto,
  CreateAssistedOrderDto,
  CreateOrderDto,
  CreateOrderItemDto,
  ListOrdersQueryDto,
  QuoteOrderDto,
  RateOrderDto,
  SearchAssistedCustomersQueryDto,
  TransitionOrderDto,
} from "./orders.dto";
import {
  assertOrderTransition,
  canAdministratorEditOrder,
  canCancelOrder,
  returnsInventoryOnCancellation,
  canEditCourierAssignment,
  canManageCourierAssignment,
  CUSTOMER_CANCELLATION_WINDOW_MS,
} from "./order-policy";
import {
  allocateDiscountAcrossLines,
  calculatePromoDiscount,
  roundMoney,
} from "./order-pricing";
import {
  CourierRouteWaypointKind,
  CourierRoutingStatus,
} from "./orders-response.dto";
import {
  buildReceiptPrintMetadata,
  buildReceiptPrintPlan,
} from "./receipt-print-plan";

type ReceiptPrinterRouteSource = {
  receiptPrinterId: string | null;
  receiptPrinterIp: string | null;
  receiptPrinter: {
    ipAddress: string;
    port: number;
    transport: ReceiptPrinterTransport;
    isActive: boolean;
  } | null;
};

function routeSnapshot(source: ReceiptPrinterRouteSource) {
  if (source.receiptPrinterId) {
    return source.receiptPrinter?.isActive
      ? {
          receiptPrinterIp: source.receiptPrinter.ipAddress,
          receiptPrinterPort: source.receiptPrinter.port,
          receiptPrinterTransport: source.receiptPrinter.transport,
        }
      : {
          receiptPrinterIp: null,
          receiptPrinterPort: null,
          receiptPrinterTransport: null,
        };
  }
  return source.receiptPrinterIp
    ? {
        receiptPrinterIp: source.receiptPrinterIp,
        receiptPrinterPort: 80,
        receiptPrinterTransport: ReceiptPrinterTransport.JSPEED_HTTP,
      }
    : null;
}

function productRouteSnapshot(
  product: ReceiptPrinterRouteSource & { category: ReceiptPrinterRouteSource },
) {
  return routeSnapshot(product) ?? routeSnapshot(product.category);
}

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
      product: {
        include: {
          images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
        },
      },
      productVariant: {
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

/** Returns the current selected-variant image first, then the common product
 * image. Prices and names remain immutable snapshots on the order item. */
function withItemImages<T extends OrderWithDetails>(order: T) {
  return {
    ...order,
    items: order.items.map(
      ({
        product,
        productVariant,
        id,
        orderId,
        productId,
        productVariantId,
        productName,
        variantName,
        unitPrice,
        quantity,
        lineTotal,
      }) => ({
        id,
        orderId,
        productId,
        productVariantId,
        productName,
        variantName,
        unitPrice,
        quantity,
        lineTotal,
        productImageUrl:
          productVariant?.images[0]?.url ?? product.images[0]?.url ?? null,
      }),
    ),
  };
}

const MAX_ROUTE_LOCATION_AGE_MS = 5 * 60 * 1_000;
const ROUTE_RECALCULATION_SECONDS = 15;
const NEXT_ROUTE_WAYPOINTS_LIMIT = 3;
const ITEM_EDIT_RESET_STATUSES: OrderStatus[] = [
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
];

/** Only the statuses a customer actually needs to hear about — the later
 * back-office accounting stages (cash returned/reconciled) never
 * reach them, they've already got their food by then. Turkmen first: the
 * app's primary market and the only locale guaranteed to be understood if
 * a device never reported one. */
const CUSTOMER_STATUS_MESSAGES: Partial<
  Record<OrderStatus, (orderNumber: number) => { title: string; body: string }>
> = {
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
    private readonly delivery: DeliveryService,
    private readonly inventory: InventoryService,
  ) {}

  quote(user: AuthUser, dto: QuoteOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const { resolvedItems, subtotal } = await this.resolveOrderItems(
        tx,
        dto.items,
      );
      const { promo, discount } = await this.resolvePromoPricing(
        tx,
        user.id,
        dto.promoCode,
        subtotal,
      );
      const deliveryPricing = await this.delivery.resolvePricing(
        tx,
        subtotal,
        dto.deliveryEtrapId ?? null,
        new Date(),
        dto.latitude !== undefined && dto.longitude !== undefined
          ? { latitude: dto.latitude, longitude: dto.longitude }
          : undefined,
      );
      const originalLineTotals = resolvedItems.map(
        ({ product, variant, quantity }) =>
          roundMoney(Number(variant?.price ?? product.price) * quantity),
      );
      const lineDiscounts = allocateDiscountAcrossLines(
        originalLineTotals,
        discount,
      );
      const items = resolvedItems.map(
        ({ product, variant, quantity }, index) => {
          const originalLineTotal = originalLineTotals[index] ?? 0;
          const lineDiscount = lineDiscounts[index] ?? 0;
          return {
            productId: product.id,
            productVariantId: variant?.id ?? null,
            productName: product.name,
            variantName: variant?.name ?? null,
            productImageUrl:
              variant?.images[0]?.url ?? product.images[0]?.url ?? null,
            quantity,
            unitPrice: Number(variant?.price ?? product.price),
            originalLineTotal,
            discount: lineDiscount,
            discountedLineTotal: roundMoney(originalLineTotal - lineDiscount),
          };
        },
      );
      const discountedSubtotal = roundMoney(subtotal - discount);

      return toApiResponse({
        items,
        promo: promo
          ? {
              code: promo.code,
              type: promo.type,
              value: promo.value,
              discount,
            }
          : null,
        subtotal,
        discount,
        discountedSubtotal,
        deliveryFee: deliveryPricing.fee,
        total: roundMoney(discountedSubtotal + deliveryPricing.fee),
        deliveryEtrapId: deliveryPricing.etrap?.id ?? null,
        deliveryWelayatName: deliveryPricing.etrap?.welayat.nameRu ?? null,
        deliveryEtrapName: deliveryPricing.etrap?.nameRu ?? null,
      });
    });
  }

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

  private notifyCourier(courierId: string, orderNumber: number) {
    void this.notifications.sendDirectPush(courierId, {
      title: `Täze sargyt #${orderNumber}`,
      body: "Sargyt size berkidildi. Jikme-jiklikleri açyň.",
    });
  }

  create(user: AuthUser, dto: CreateOrderDto) {
    return this.createOnce(user.id, dto, (tx) =>
      this.createForCustomer(tx, {
        actorId: user.id,
        customerId: user.id,
        dto,
        source: OrderSource.CUSTOMER_APP,
      }),
    );
  }

  private async createOnce<T extends CreateOrderDto>(
    actorId: string,
    dto: T,
    create: (
      tx: Prisma.TransactionClient,
    ) => ReturnType<OrdersService["createForCustomer"]>,
  ) {
    const key = dto.idempotencyKey;
    const hash = createHash("sha256")
      .update(
        JSON.stringify(dto, (_key, value: unknown) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            );
          }
          return value;
        }),
      )
      .digest("hex");
    const prior = async () => {
      if (!key) return null;
      const record = await this.prisma.orderCreationRequest.findUnique({
        where: { actorId_key: { actorId, key } },
      });
      if (!record) return null;
      if (record.requestHash !== hash)
        throw new ConflictException(
          "Idempotency key already used for different order content",
        );
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: record.orderId },
        include: detailInclude,
      });
      return toApiResponse(withItemImages(order));
    };
    const existing = await prior();
    if (existing) return existing;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await create(tx);
        if (key)
          await tx.orderCreationRequest.create({
            data: { actorId, key, requestHash: hash, orderId: order.id },
          });
        return order;
      });
    } catch (error) {
      // A concurrent identical request may have committed while this attempt
      // failed a now-changed product/promo precondition, not only a unique key.
      if (key) {
        const existing = await prior();
        if (existing) return existing;
      }
      throw error;
    }
  }

  async enqueueReceipt(
    tx: Prisma.TransactionClient,
    orderId: string,
    eventKey: string,
  ) {
    const plan = await this.receiptPrintPlan(orderId, tx);
    return tx.receiptPrintTask.create({
      data: {
        orderId,
        eventKey,
        documentType: plan.documentType,
        plan,
      },
    });
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
            deliveryEtrapId: true,
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
    return this.createOnce(actor.id, dto, async (tx) => {
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

  private async resolveOrderItems(
    tx: Prisma.TransactionClient,
    items: CreateOrderItemDto[],
  ) {
    const productIds = [...new Set(items.map(({ productId }) => productId))];
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
        category: { isActive: true, cafe: { isActive: true } },
      },
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        variants: {
          include: {
            images: { orderBy: { sortOrder: "asc" }, take: 1 },
          },
        },
        receiptPrinter: true,
        category: { include: { cafe: true, receiptPrinter: true } },
      },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException("One or more products are unavailable");
    }
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const resolvedBySelection = new Map<
      string,
      {
        product: (typeof products)[number];
        variant: (typeof products)[number]["variants"][number] | null;
        quantity: number;
      }
    >();
    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new BadRequestException("One or more products are unavailable");
      }
      const activeVariants = product.variants
        .filter(({ isActive }) => isActive)
        .sort(
          (left, right) =>
            Number(left.price) - Number(right.price) ||
            left.sortOrder - right.sortOrder ||
            left.name.localeCompare(right.name),
        );
      if (product.pricingType === ProductPricingType.FIXED && item.variantId) {
        throw new BadRequestException(
          "A FIXED product does not accept a variant",
        );
      }
      const variant =
        product.pricingType === ProductPricingType.VARIANT
          ? item.variantId
            ? activeVariants.find(({ id }) => id === item.variantId)
            : activeVariants[0]
          : null;
      if (product.pricingType === ProductPricingType.VARIANT && !variant) {
        throw new BadRequestException(
          "One or more product variants are unavailable",
        );
      }
      const selectionKey = `${product.id}:${variant?.id ?? "base"}`;
      const existingSelection = resolvedBySelection.get(selectionKey);
      const quantity = (existingSelection?.quantity ?? 0) + item.quantity;
      if (quantity > 50) {
        throw new BadRequestException(
          "A product variant quantity cannot exceed 50",
        );
      }
      resolvedBySelection.set(selectionKey, {
        product,
        variant: variant ?? null,
        quantity,
      });
    }
    const resolvedItems = [...resolvedBySelection.values()];
    const subtotal = roundMoney(
      resolvedItems.reduce(
        (sum, { product, variant, quantity }) =>
          sum + Number(variant?.price ?? product.price) * quantity,
        0,
      ),
    );
    return { resolvedItems, subtotal };
  }

  private async resolvePromoPricing(
    tx: Prisma.TransactionClient,
    customerId: string,
    promoCode: string | undefined,
    subtotal: number,
  ) {
    if (!promoCode) return { promo: null, discount: 0 };

    const now = new Date();
    const promo = await tx.promoCode.findUnique({
      where: { code: promoCode.trim().toUpperCase() },
    });
    if (
      !promo?.isActive ||
      (promo.startsAt && promo.startsAt > now) ||
      (promo.endsAt && promo.endsAt < now) ||
      (promo.totalUsageLimit != null &&
        promo.usedCount >= promo.totalUsageLimit) ||
      (promo.minOrderAmount != null && subtotal < Number(promo.minOrderAmount))
    ) {
      throw new BadRequestException("Promo code is unavailable");
    }
    const usedByCustomer = await tx.promoRedemption.count({
      where: { promoCodeId: promo.id, userId: customerId },
    });
    if (usedByCustomer >= promo.perUserLimit) {
      throw new BadRequestException("Promo code usage limit reached");
    }

    return {
      promo,
      discount: calculatePromoDiscount(
        {
          type: promo.type,
          value: Number(promo.value),
          maxDiscountAmount:
            promo.maxDiscountAmount === null
              ? null
              : Number(promo.maxDiscountAmount),
        },
        subtotal,
      ),
    };
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
    const createdAt = new Date();
    const { resolvedItems, subtotal } = await this.resolveOrderItems(
      tx,
      dto.items,
    );
    const { promo, discount } = await this.resolvePromoPricing(
      tx,
      customerId,
      dto.promoCode,
      subtotal,
    );

    const usesMapPricing = await this.delivery.usesMapPricing(tx);
    const selectedAddress = await this.addresses.selectForOrder(
      tx,
      customerId,
      usesMapPricing ? { ...dto, deliveryEtrapId: undefined } : dto,
      actorId,
    );
    const deliveryPricing = await this.delivery.resolvePricing(
      tx,
      subtotal,
      selectedAddress.deliveryEtrapId,
      createdAt,
      {
        latitude: Number(selectedAddress.latitude),
        longitude: Number(selectedAddress.longitude),
      },
    );
    if (
      selectedAddress.deliveryEtrapId !== (deliveryPricing.etrap?.id ?? null)
    ) {
      await tx.userAddress.update({
        where: { id: selectedAddress.id },
        data: { deliveryEtrapId: deliveryPricing.etrap?.id ?? null },
      });
    }
    const deliveryFee = deliveryPricing.fee;
    const total = roundMoney(subtotal - discount + deliveryFee);
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
        createdAt,
        source,
        status: OrderStatus.COOKING,
        branchId: nearest.branch.id,
        promoCodeId: promo?.id,
        addressId: selectedAddress.id,
        deliveryEtrapId: deliveryPricing.etrap?.id,
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
        deliveryWelayatName: deliveryPricing.etrap?.welayat.nameRu,
        deliveryEtrapName: deliveryPricing.etrap?.nameRu,
        branchName: nearest.branch.name,
        branchAddress: nearest.branch.address,
        branchLatitude: nearest.branch.latitude,
        branchLongitude: nearest.branch.longitude,
        branchDistanceMeters: nearest.distanceMeters,
        customerNote: dto.customerNote?.trim() || null,
        items: {
          create: resolvedItems.map(({ product, variant, quantity }) => {
            const unitPrice = variant?.price ?? product.price;
            const receiptRoute = productRouteSnapshot(product);
            return {
              productId: product.id,
              productVariantId: variant?.id,
              productName: product.name,
              variantName: variant?.name,
              receiptPrinterIp: receiptRoute?.receiptPrinterIp,
              receiptPrinterPort: receiptRoute?.receiptPrinterPort,
              receiptPrinterTransport: receiptRoute?.receiptPrinterTransport,
              unitPrice,
              quantity,
              lineTotal: Number(unitPrice) * quantity,
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
          deliveryEtrapId: deliveryPricing.etrap?.id ?? null,
          deliveryFee,
        },
      },
    });
    await this.inventory.allocateOrder(tx, { id: actorId }, order);
    await this.enqueueReceipt(tx, order.id, `ORDER_CREATED:${order.id}`);
    return toApiResponse(withItemImages(order));
  }

  async list(user: AuthUser, query: ListOrdersQueryDto) {
    if (user.role === Role.ACCOUNTANT) {
      throw new ForbiddenException("Use the accounting workspace");
    }
    const roleFilter: Prisma.OrderWhereInput =
      user.role === Role.CUSTOMER
        ? { customerId: user.id }
        : user.role === Role.COURIER
          ? { courierId: user.id }
          : user.role === Role.COOK
            ? {
                OR: [
                  { cookId: user.id },
                  { status: OrderStatus.COOKING, cookId: null },
                ],
              }
            : {};
    const search = query.search?.trim();
    const createdFrom = query.createdFrom
      ? new Date(query.createdFrom)
      : undefined;
    const createdTo = query.createdTo ? new Date(query.createdTo) : undefined;
    if (createdFrom && createdTo && createdFrom >= createdTo) {
      throw new BadRequestException(
        "createdFrom must be earlier than createdTo",
      );
    }
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
        createdFrom || createdTo
          ? {
              createdAt: {
                ...(createdFrom ? { gte: createdFrom } : {}),
                ...(createdTo ? { lt: createdTo } : {}),
              },
            }
          : {},
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

  async receiptPrintPlan(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const [order, settings, contact] = await Promise.all([
      db.order.findUnique({
        where: { id },
        select: {
          id: true,
          number: true,
          status: true,
          cancellationReason: true,
          subtotal: true,
          discount: true,
          deliveryFee: true,
          total: true,
          deliveryEtrapName: true,
          createdAt: true,
          branchName: true,
          address: true,
          entrance: true,
          floor: true,
          apartment: true,
          customerNote: true,
          customer: {
            select: { phone: true, firstName: true, lastName: true },
          },
          items: {
            select: {
              id: true,
              productName: true,
              variantName: true,
              receiptPrinterIp: true,
              receiptPrinterPort: true,
              receiptPrinterTransport: true,
              unitPrice: true,
              quantity: true,
            },
            orderBy: { id: "asc" },
          },
        },
      }),
      db.receiptPrintSettings.findUnique({
        where: { id: "default" },
        include: { mainPrinter: true },
      }),
      db.contactSettings.findUnique({
        where: { id: "default" },
        select: { phone: true },
      }),
    ]);
    if (!order) throw new NotFoundException("Order not found");
    const mainPrinter = settings?.mainPrinterId
      ? settings.mainPrinter?.isActive
        ? {
            printerIp: settings.mainPrinter.ipAddress,
            printerPort: settings.mainPrinter.port,
            transport: settings.mainPrinter.transport,
          }
        : null
      : settings?.mainPrinterIp
        ? {
            printerIp: settings.mainPrinterIp,
            printerPort: 80,
            transport: ReceiptPrinterTransport.JSPEED_HTTP,
          }
        : null;
    return toApiResponse(
      buildReceiptPrintPlan(
        order,
        mainPrinter,
        buildReceiptPrintMetadata(order, contact?.phone ?? null),
      ),
    );
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
        user.role === Role.COOK &&
        order.status === OrderStatus.COOKING &&
        dto.status === OrderStatus.READY &&
        !order.cookId
      ) {
        updateData.cookId = user.id;
      }
      if (dto.status === OrderStatus.COOKING) {
        updateData.packingConfirmedAt = null;
      }
      if (
        order.status === OrderStatus.ASSIGNED_TO_COURIER &&
        dto.status === OrderStatus.READY
      ) {
        updateData.courierId = null;
        updateData.assignedAt = null;
      }
      if (dto.status === OrderStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }
      if (dto.status === OrderStatus.CASH_RETURNED) {
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
            amount: order.total.minus(order.deliveryFee),
            operatorTakenAt: new Date(),
            status: CashSettlementStatus.CONFIRMED,
          },
        });
      } else if (dto.status === OrderStatus.RECONCILED) {
        if (order.cashSettlement?.cashHandoffId) {
          throw new ConflictException(
            "This order belongs to a cash handoff and must be confirmed there",
          );
        }
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

  async adminEdit(user: AuthUser, id: string, dto: AdminEditOrderDto) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true, promoCode: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (!canAdministratorEditOrder(order.status, user.role)) {
        throw new ForbiddenException(
          "Only an administrator can edit an order before courier pickup",
        );
      }
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }

      const { resolvedItems, subtotal } = await this.resolveOrderItems(
        tx,
        dto.items,
      );
      const deliveryPricing = await this.delivery.resolvePricing(
        tx,
        subtotal,
        dto.deliveryEtrapId,
        order.createdAt,
        { latitude: dto.latitude, longitude: dto.longitude },
      );
      const nearest = await this.branches.findNearestActive(tx, {
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
      const currentItems = order.items
        .map(
          (item) =>
            `${item.productId}:${item.productVariantId ?? "base"}:${item.quantity}`,
        )
        .sort();
      const nextItems = resolvedItems
        .map(
          ({ product, variant, quantity }) =>
            `${product.id}:${variant?.id ?? "base"}:${quantity}`,
        )
        .sort();
      const itemsChanged = currentItems.join("|") !== nextItems.join("|");

      let courierId = order.courierId;
      let cookId = order.cookId;
      let nextStatus = order.status;
      let assignedAt = order.assignedAt;
      let packingConfirmedAt = order.packingConfirmedAt;
      if (itemsChanged && ITEM_EDIT_RESET_STATUSES.includes(order.status)) {
        nextStatus = OrderStatus.COOKING;
        cookId = null;
        courierId = null;
        assignedAt = null;
        packingConfirmedAt = null;
      } else if (
        dto.courierId &&
        order.status === OrderStatus.ASSIGNED_TO_COURIER
      ) {
        const courier = await tx.user.findUnique({
          where: { id: dto.courierId },
        });
        if (!courier || courier.role !== Role.COURIER || !courier.isActive) {
          throw new BadRequestException("Courier is unavailable");
        }
        courierId = courier.id;
        if (courier.id !== order.courierId) assignedAt = new Date();
      }

      let discount = 0;
      if (order.promoCode) {
        const promo = order.promoCode;
        if (
          promo.minOrderAmount === null ||
          subtotal >= Number(promo.minOrderAmount)
        ) {
          discount = calculatePromoDiscount(
            {
              type: promo.type,
              value: Number(promo.value),
              maxDiscountAmount:
                promo.maxDiscountAmount === null
                  ? null
                  : Number(promo.maxDiscountAmount),
            },
            subtotal,
          );
        }
      }
      const total = roundMoney(subtotal - discount + deliveryPricing.fee);

      const updated = await tx.order.updateMany({
        where: { id, version: dto.version, status: order.status },
        data: {
          status: nextStatus,
          addressId: null,
          address: dto.address.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          entrance: dto.entrance?.trim() || null,
          floor: dto.floor?.trim() || null,
          apartment: dto.apartment?.trim() || null,
          customerNote: dto.customerNote?.trim() || null,
          deliveryEtrapId: deliveryPricing.etrap?.id ?? null,
          deliveryWelayatName: deliveryPricing.etrap?.welayat.nameRu ?? null,
          deliveryEtrapName: deliveryPricing.etrap?.nameRu ?? null,
          subtotal,
          discount,
          deliveryFee: deliveryPricing.fee,
          total,
          branchId: nearest.branch.id,
          branchName: nearest.branch.name,
          branchAddress: nearest.branch.address,
          branchLatitude: nearest.branch.latitude,
          branchLongitude: nearest.branch.longitude,
          branchDistanceMeters: nearest.distanceMeters,
          cookId,
          courierId,
          assignedAt,
          packingConfirmedAt,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }

      if (itemsChanged) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: resolvedItems.map(({ product, variant, quantity }) => {
            const unitPrice = variant?.price ?? product.price;
            const receiptRoute = productRouteSnapshot(product);
            return {
              orderId: id,
              productId: product.id,
              productVariantId: variant?.id,
              productName: product.name,
              variantName: variant?.name,
              receiptPrinterIp: receiptRoute?.receiptPrinterIp,
              receiptPrinterPort: receiptRoute?.receiptPrinterPort,
              receiptPrinterTransport: receiptRoute?.receiptPrinterTransport,
              unitPrice,
              quantity,
              lineTotal: Number(unitPrice) * quantity,
            };
          }),
        });
      }
      if (nextStatus !== order.status) {
        await tx.orderTransition.create({
          data: {
            orderId: id,
            actorId: user.id,
            fromStatus: order.status,
            toStatus: nextStatus,
            note: "Order items changed; kitchen, packing and courier assignment reset",
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.admin-edited",
          entityType: "Order",
          entityId: id,
          metadata: {
            previousVersion: order.version,
            previousStatus: order.status,
            nextStatus,
            itemsChanged,
            previousCourierId: order.courierId,
            courierId,
            deliveryEtrapId: deliveryPricing.etrap?.id ?? null,
            branchId: nearest.branch.id,
            subtotal,
            discount,
            deliveryFee: deliveryPricing.fee,
            total,
          },
        },
      });

      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      if (itemsChanged || order.branchId !== result.branchId) {
        await this.inventory.allocateOrder(tx, user, result, true);
      }
      return {
        response: toApiResponse(withItemImages(result)),
        courierToNotify: courierId !== order.courierId ? courierId : null,
      };
    });
    const { response, courierToNotify } = outcome;
    if (courierToNotify) {
      this.notifyCourier(courierToNotify, response.number);
    }
    return response;
  }

  async confirmPacking(
    user: AuthUser,
    id: string,
    dto: ConfirmOrderPackingDto,
  ) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        "Only an administrator can confirm order packing",
      );
    }

    let notifyTarget: { customerId: string; number: number } | null = null;
    const response = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: { select: { id: true } } },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (
        order.status !== OrderStatus.COOKING &&
        order.status !== OrderStatus.READY
      ) {
        throw new ConflictException(
          "Only a cooking or ready order can be confirmed as packed",
        );
      }
      if (order.packingConfirmedAt) {
        throw new ConflictException("Order packing is already confirmed");
      }

      const checkedItemIds = new Set(dto.checkedItemIds);
      if (
        checkedItemIds.size !== order.items.length ||
        order.items.some((item) => !checkedItemIds.has(item.id))
      ) {
        throw new BadRequestException(
          "Check every order item before confirming packing",
        );
      }

      const confirmedAt = new Date();
      const updated = await tx.order.updateMany({
        where: {
          id,
          version: dto.version,
          status: order.status,
          packingConfirmedAt: null,
        },
        data: {
          status: OrderStatus.READY,
          packingConfirmedAt: confirmedAt,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }

      if (order.status === OrderStatus.COOKING) {
        await tx.orderTransition.create({
          data: {
            orderId: order.id,
            actorId: user.id,
            fromStatus: OrderStatus.COOKING,
            toStatus: OrderStatus.READY,
            note: "All order items checked during packing",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "order.packing-confirmed",
          entityType: "Order",
          entityId: id,
          metadata: {
            checkedItemIds: dto.checkedItemIds,
            confirmedAt: confirmedAt.toISOString(),
            previousStatus: order.status,
          },
        },
      });

      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      if (order.status === OrderStatus.COOKING) {
        notifyTarget = {
          customerId: result.customerId,
          number: result.number,
        };
      }
      return toApiResponse(withItemImages(result));
    });
    const target = notifyTarget as {
      customerId: string;
      number: number;
    } | null;
    if (target) {
      this.notifyCustomer(target.customerId, target.number, OrderStatus.READY);
    }
    return response;
  }

  async assignCourier(user: AuthUser, id: string, dto: AssignCourierDto) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const [order, courier] = await Promise.all([
        tx.order.findUnique({ where: { id } }),
        tx.user.findUnique({ where: { id: dto.courierId } }),
      ]);
      if (!order) throw new NotFoundException("Order not found");
      if (!courier || courier.role !== Role.COURIER || !courier.isActive) {
        throw new BadRequestException("Courier is unavailable");
      }
      if (!canManageCourierAssignment(user.role)) {
        throw new ForbiddenException(
          "This role cannot manage courier assignments",
        );
      }
      if (!canEditCourierAssignment(order.status)) {
        throw new ConflictException(
          "Courier assignment cannot be changed after delivery starts",
        );
      }
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (order.status === OrderStatus.READY && !order.packingConfirmedAt) {
        throw new ConflictException(
          "Confirm order packing before assigning a courier",
        );
      }
      const isReassignment = order.status === OrderStatus.ASSIGNED_TO_COURIER;
      if (isReassignment && order.courierId === courier.id) {
        throw new BadRequestException("Courier is already assigned");
      }
      const updated = await tx.order.updateMany({
        where: { id, version: dto.version, status: order.status },
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
      if (!isReassignment) {
        await tx.orderTransition.create({
          data: {
            orderId: id,
            actorId: user.id,
            fromStatus: OrderStatus.READY,
            toStatus: OrderStatus.ASSIGNED_TO_COURIER,
            note: `Assigned to courier ${courier.id}`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: isReassignment
            ? "order.courier-reassigned"
            : "order.courier-assigned",
          entityType: "Order",
          entityId: id,
          metadata: {
            previousCourierId: order.courierId,
            courierId: courier.id,
          },
        },
      });
      const result = await tx.order.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      return {
        response: toApiResponse(withItemImages(result)),
        isReassignment,
      };
    });
    const { response, isReassignment } = outcome;
    if (!isReassignment) {
      this.notifyCustomer(
        response.customerId,
        response.number,
        OrderStatus.ASSIGNED_TO_COURIER,
      );
    }
    this.notifyCourier(dto.courierId, response.number);
    return response;
  }

  async cancel(user: AuthUser, id: string, dto: CancelOrderDto) {
    let notifyTarget: { customerId: string; number: number } | null = null;
    const response = await this.prisma.$transaction(async (tx) => {
      const cancelledAt = new Date();
      const customerCancellationCutoff = new Date(
        cancelledAt.getTime() - CUSTOMER_CANCELLATION_WINDOW_MS,
      );
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.version !== dto.version) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (
        !canCancelOrder(
          order.status,
          user.role,
          order.customerId === user.id,
          order.createdAt,
          cancelledAt,
        )
      ) {
        throw new ForbiddenException(
          "This role cannot cancel the order at its current stage",
        );
      }
      const cancelled = await tx.order.updateMany({
        where: {
          id,
          version: dto.version,
          status: order.status,
          ...(user.role === Role.CUSTOMER
            ? {
                customerId: user.id,
                createdAt: { gte: customerCancellationCutoff },
              }
            : {}),
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException("Order changed; reload and try again");
      }
      if (returnsInventoryOnCancellation(order.status)) {
        await this.inventory.releaseOrderReservation(tx, user, order);
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
      await this.enqueueReceipt(tx, id, `ORDER_CANCELLED:${id}`);
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
      items: order.items.map(({ productName, variantName, quantity }) => ({
        productName,
        variantName,
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
    if (user.role === Role.ACCOUNTANT) {
      throw new ForbiddenException("Use the accounting workspace");
    }
    if (user.role === Role.CUSTOMER && order.customerId !== user.id) {
      throw new ForbiddenException();
    }
    if (user.role === Role.COURIER && order.courierId !== user.id) {
      throw new ForbiddenException();
    }
    if (
      user.role === Role.COOK &&
      order.cookId !== user.id &&
      !(order.status === OrderStatus.COOKING && order.cookId === null)
    ) {
      throw new ForbiddenException();
    }
  }
}
