import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateBannerDto,
  CreatePromoCodeDto,
  UpdateBannerDto,
  UpdatePromoCodeDto,
} from "./marketing.dto";

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  activeBanners() {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  allBanners() {
    return this.prisma.banner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  createBanner(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  updateBanner(id: string, dto: UpdateBannerDto) {
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  promoCodes() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  createPromoCode(dto: CreatePromoCodeDto) {
    return this.prisma.promoCode.create({
      data: {
        ...dto,
        code: dto.code.trim().toUpperCase(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  updatePromoCode(id: string, dto: UpdatePromoCodeDto) {
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.trim().toUpperCase(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }
}
