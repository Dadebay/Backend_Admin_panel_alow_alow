import { Injectable, NotFoundException } from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddProductImageDto,
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog.dto";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        products: {
          where: includeInactive ? {} : { isActive: true },
          include: { images: { orderBy: { sortOrder: "asc" } } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return toApiResponse(categories);
  }

  async products(categoryId?: string, includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(includeInactive ? {} : { isActive: true, category: { isActive: true } }),
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return toApiResponse(products);
  }

  createCategory(actor: AuthUser, dto: CreateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.category.created",
          entityType: "Category",
          entityId: category.id,
          metadata: { name: category.name, slug: category.slug },
        },
      });
      return toApiResponse(category);
    });
  }

  updateCategory(actor: AuthUser, id: string, dto: UpdateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException("Category not found");
      const updated = await tx.category.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.category.updated",
          entityType: "Category",
          entityId: id,
          metadata: { changedFields: Object.keys(dto) },
        },
      });
      return toApiResponse(updated);
    });
  }

  createProduct(actor: AuthUser, dto: CreateProductDto) {
    const { imageUrls = [], ...product } = dto;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...product,
          images: {
            create: imageUrls.map((url, index) => ({
              url,
              sortOrder: index,
            })),
          },
        },
        include: { images: true, category: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product.created",
          entityType: "Product",
          entityId: created.id,
          metadata: { name: created.name, categoryId: created.categoryId },
        },
      });
      return toApiResponse(created);
    });
  }

  async updateProduct(actor: AuthUser, id: string, dto: UpdateProductDto) {
    const { imageUrls, ...product } = dto;
    const exists = await this.prisma.product.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Product not found");
    return this.prisma.$transaction(async (tx) => {
      if (imageUrls) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...product,
          ...(imageUrls
            ? {
                images: {
                  create: imageUrls.map((url, index) => ({
                    url,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
        include: { images: true, category: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product.updated",
          entityType: "Product",
          entityId: id,
          metadata: product,
        },
      });
      return toApiResponse(updated);
    });
  }

  addImage(actor: AuthUser, productId: string, dto: AddProductImageDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException("Product not found");
      const image = await tx.productImage.create({
        data: { productId, ...dto },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product-image.created",
          entityType: "Product",
          entityId: productId,
          metadata: { imageId: image.id },
        },
      });
      return toApiResponse(image);
    });
  }
}
