import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import type { Prisma } from "../generated/prisma/client";
import { GeocodingService } from "../geocoding/geocoding.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDeliveryEtrapDto,
  CreateDeliveryWelayatDto,
  QuoteDeliveryDto,
  UpdateDeliveryEtrapDto,
  UpdateDeliverySettingsDto,
  UpdateDeliveryWelayatDto,
} from "./delivery.dto";
import { calculateDeliveryFee } from "./delivery-pricing";
import { findDeliveryAreaForAddress } from "./delivery-area-matcher";

const SETTINGS_ID = "default";

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  publicConfig() {
    return this.getConfig(true);
  }

  adminConfig() {
    return this.getConfig(false);
  }

  async quote(dto: QuoteDeliveryDto) {
    const [addressLine, settings, etraps] = await Promise.all([
      this.geocoding.reverseGeocode(dto.latitude, dto.longitude),
      this.prisma.deliverySettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.etrap.findMany({
        where: { isDeliveryEnabled: true },
        include: { welayat: true },
      }),
    ]);
    if (!settings) throw new NotFoundException("Delivery settings not found");

    const etrap = findDeliveryAreaForAddress(etraps, addressLine);
    const price = Number(etrap?.price ?? settings.fallbackPrice);
    const freeDeliveryThreshold = etrap
      ? etrap.freeDeliveryThreshold === null
        ? null
        : Number(etrap.freeDeliveryThreshold)
      : settings.fallbackFreeDeliveryThreshold === null
        ? null
        : Number(settings.fallbackFreeDeliveryThreshold);

    return toApiResponse({
      addressLine,
      latitude: dto.latitude,
      longitude: dto.longitude,
      subtotal: dto.subtotal,
      fee: calculateDeliveryFee(dto.subtotal, price, freeDeliveryThreshold),
      price,
      freeDeliveryThreshold,
      etrap,
      welayat: etrap?.welayat ?? null,
      matched: Boolean(etrap),
    });
  }

  async resolvePricing(
    tx: Prisma.TransactionClient,
    subtotal: number,
    deliveryEtrapId: number | null,
  ) {
    if (deliveryEtrapId !== null) {
      const etrap = await tx.etrap.findUnique({
        where: { id: deliveryEtrapId },
        include: { welayat: true },
      });
      if (!etrap) throw new BadRequestException("Delivery etrap not found");
      if (!etrap.isDeliveryEnabled) {
        throw new BadRequestException(
          "Delivery is not available for the selected etrap",
        );
      }
      return {
        fee: calculateDeliveryFee(
          subtotal,
          Number(etrap.price),
          etrap.freeDeliveryThreshold === null
            ? null
            : Number(etrap.freeDeliveryThreshold),
        ),
        etrap,
      };
    }

    const settings = await tx.deliverySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!settings) {
      throw new NotFoundException("Delivery settings not found");
    }
    return {
      fee: calculateDeliveryFee(
        subtotal,
        Number(settings.fallbackPrice),
        settings.fallbackFreeDeliveryThreshold === null
          ? null
          : Number(settings.fallbackFreeDeliveryThreshold),
      ),
      etrap: null,
    };
  }

  updateSettings(actor: AuthUser, dto: UpdateDeliverySettingsDto) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException(
        "At least one delivery setting is required",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.deliverySettings.findUnique({
        where: { id: SETTINGS_ID },
      });
      if (!before) throw new NotFoundException("Delivery settings not found");
      const settings = await tx.deliverySettings.update({
        where: { id: SETTINGS_ID },
        data: dto,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.settings_updated",
          entityType: "DeliverySettings",
          entityId: SETTINGS_ID,
          metadata: {
            changedFields: Object.keys(dto),
            previous: toApiResponse(before),
          },
        },
      });
      return toApiResponse(settings);
    });
  }

  createWelayat(actor: AuthUser, dto: CreateDeliveryWelayatDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertUniqueWelayat(tx, dto.nameRu, dto.nameTk);
      const welayat = await tx.welayat.create({
        data: {
          nameEn: dto.nameEn ?? null,
          nameRu: dto.nameRu,
          nameTk: dto.nameTk,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { etraps: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.welayat_created",
          entityType: "Welayat",
          entityId: String(welayat.id),
          metadata: { nameRu: welayat.nameRu, nameTk: welayat.nameTk },
        },
      });
      return toApiResponse(welayat);
    });
  }

  updateWelayat(actor: AuthUser, id: number, dto: UpdateDeliveryWelayatDto) {
    const update = {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameRu !== undefined ? { nameRu: dto.nameRu } : {}),
      ...(dto.nameTk !== undefined ? { nameTk: dto.nameTk } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    if (!Object.keys(update).length) {
      throw new BadRequestException("At least one welayat field is required");
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.welayat.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Delivery welayat not found");
      await this.assertUniqueWelayat(
        tx,
        dto.nameRu ?? before.nameRu,
        dto.nameTk ?? before.nameTk,
        id,
      );
      const welayat = await tx.welayat.update({
        where: { id },
        data: update,
        include: {
          etraps: {
            orderBy: [
              { queuePosition: { sort: "asc", nulls: "last" } },
              { nameRu: "asc" },
              { id: "asc" },
            ],
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.welayat_updated",
          entityType: "Welayat",
          entityId: String(id),
          metadata: {
            changedFields: Object.keys(update),
            previous: toApiResponse(before),
          },
        },
      });
      return toApiResponse(welayat);
    });
  }

  createEtrap(actor: AuthUser, dto: CreateDeliveryEtrapDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertWelayatExists(tx, dto.welayatId);
      await this.assertUniqueEtrap(tx, dto.welayatId, dto.nameRu, dto.nameTk);
      const etrap = await tx.etrap.create({
        data: {
          welayatId: dto.welayatId,
          nameEn: dto.nameEn ?? null,
          nameRu: dto.nameRu,
          nameTk: dto.nameTk,
          queuePosition: dto.queuePosition ?? null,
          price: dto.price ?? 15,
          freeDeliveryThreshold:
            dto.freeDeliveryThreshold === undefined
              ? 150
              : dto.freeDeliveryThreshold,
          isDeliveryEnabled: dto.isDeliveryEnabled ?? false,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.etrap_created",
          entityType: "Etrap",
          entityId: String(etrap.id),
          metadata: {
            welayatId: etrap.welayatId,
            nameRu: etrap.nameRu,
            nameTk: etrap.nameTk,
          },
        },
      });
      return toApiResponse(etrap);
    });
  }

  updateEtrap(actor: AuthUser, id: number, dto: UpdateDeliveryEtrapDto) {
    const update = {
      ...(dto.welayatId !== undefined ? { welayatId: dto.welayatId } : {}),
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameRu !== undefined ? { nameRu: dto.nameRu } : {}),
      ...(dto.nameTk !== undefined ? { nameTk: dto.nameTk } : {}),
      ...(dto.queuePosition !== undefined
        ? { queuePosition: dto.queuePosition }
        : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.freeDeliveryThreshold !== undefined
        ? { freeDeliveryThreshold: dto.freeDeliveryThreshold }
        : {}),
      ...(dto.isDeliveryEnabled !== undefined
        ? { isDeliveryEnabled: dto.isDeliveryEnabled }
        : {}),
    };
    if (!Object.keys(update).length) {
      throw new BadRequestException("At least one etrap setting is required");
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.etrap.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Delivery etrap not found");
      const nextWelayatId = dto.welayatId ?? before.welayatId;
      await this.assertWelayatExists(tx, nextWelayatId);
      await this.assertUniqueEtrap(
        tx,
        nextWelayatId,
        dto.nameRu ?? before.nameRu,
        dto.nameTk ?? before.nameTk,
        id,
      );
      const etrap = await tx.etrap.update({ where: { id }, data: update });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.etrap_updated",
          entityType: "Etrap",
          entityId: String(id),
          metadata: {
            changedFields: Object.keys(update),
            previous: toApiResponse(before),
          },
        },
      });
      return toApiResponse(etrap);
    });
  }

  private async assertWelayatExists(
    tx: Prisma.TransactionClient,
    welayatId: number,
  ) {
    const welayat = await tx.welayat.findUnique({
      where: { id: welayatId },
      select: { id: true },
    });
    if (!welayat) throw new NotFoundException("Delivery welayat not found");
  }

  private async assertUniqueWelayat(
    tx: Prisma.TransactionClient,
    nameRu: string,
    nameTk: string,
    excludeId?: number,
  ) {
    const duplicate = await tx.welayat.findFirst({
      where: {
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        OR: [{ nameRu }, { nameTk }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        "A welayat with the same Russian or Turkmen name already exists",
      );
    }
  }

  private async assertUniqueEtrap(
    tx: Prisma.TransactionClient,
    welayatId: number,
    nameRu: string,
    nameTk: string,
    excludeId?: number,
  ) {
    const duplicate = await tx.etrap.findFirst({
      where: {
        welayatId,
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        OR: [{ nameRu }, { nameTk }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        "An etrap with the same Russian or Turkmen name already exists in this welayat",
      );
    }
  }

  private async getConfig(enabledOnly: boolean) {
    const [settings, welayats] = await this.prisma.$transaction([
      this.prisma.deliverySettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.welayat.findMany({
        where: enabledOnly
          ? { etraps: { some: { isDeliveryEnabled: true } } }
          : undefined,
        include: {
          etraps: {
            where: enabledOnly ? { isDeliveryEnabled: true } : undefined,
            orderBy: [
              { queuePosition: { sort: "asc", nulls: "last" } },
              { nameRu: "asc" },
              { id: "asc" },
            ],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }],
      }),
    ]);
    if (!settings) throw new NotFoundException("Delivery settings not found");
    return toApiResponse({
      fallbackPrice: settings.fallbackPrice,
      fallbackFreeDeliveryThreshold: settings.fallbackFreeDeliveryThreshold,
      welayats,
    });
  }
}
