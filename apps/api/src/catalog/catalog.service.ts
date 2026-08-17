import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddProductImageDto,
  CreateCategoryDto,
  CreateProductDto,
  ProductVariantInputDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog.dto";

const MAX_PRODUCT_IMAGES = 10;
const productRelations = {
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    include: { images: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
  },
  category: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productRelations;
}>;

function activeVariants(product: ProductWithRelations) {
  return product.variants
    .filter(({ isActive }) => isActive)
    .sort(
      (left, right) =>
        Number(left.price) - Number(right.price) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    );
}

function productResponse(
  product: ProductWithRelations,
  includeInactiveVariants: boolean,
) {
  const active = activeVariants(product);
  const minPrice = active[0]?.price ?? product.price;
  const displayImageUrl =
    active[0]?.images[0]?.url ?? product.images[0]?.url ?? null;
  return toApiResponse({
    ...product,
    price: minPrice,
    minPrice,
    hasVariants: active.length > 0,
    displayImageUrl,
    variants: includeInactiveVariants
      ? product.variants
      : product.variants.filter(({ isActive }) => isActive),
  });
}

function normalizedVariantLabel(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validateVariantInputs(
  variants: ProductVariantInputDto[],
  options: { allowIds: boolean; variantLabel: string | null },
) {
  if (!variants.length) return;
  if (!options.variantLabel) {
    throw new BadRequestException(
      "variantLabel is required when product variants are configured",
    );
  }
  if (!options.allowIds && variants.some(({ id }) => id)) {
    throw new BadRequestException(
      "Variant IDs are not accepted when creating a product",
    );
  }
  const ids = variants.flatMap(({ id }) => (id ? [id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException("Variant IDs must be unique");
  }
  const names = variants.map(({ name }) => name.trim().toLocaleLowerCase());
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new BadRequestException("Variant names must be non-empty and unique");
  }
}

function variantCreateData(variant: ProductVariantInputDto) {
  return {
    name: variant.name.trim(),
    description: variant.description?.trim() || null,
    price: variant.price,
    isActive: variant.isActive ?? true,
    sortOrder: variant.sortOrder ?? 0,
    images: {
      create: (variant.imageUrls ?? []).map((url, index) => ({
        url,
        sortOrder: index,
      })),
    },
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        products: {
          where: includeInactive ? {} : { isActive: true },
          include: productRelations,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return toApiResponse(
      categories.map(({ products, ...category }) => ({
        ...category,
        products: products.map((product) =>
          productResponse(product, includeInactive),
        ),
      })),
    );
  }

  async products(categoryId?: string, includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(includeInactive
          ? {}
          : { isActive: true, category: { isActive: true } }),
      },
      include: productRelations,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return products.map((product) => productResponse(product, includeInactive));
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
    const {
      imageUrls = [],
      variants = [],
      variantLabel: rawVariantLabel,
      ...product
    } = dto;
    const variantLabel = normalizedVariantLabel(rawVariantLabel);
    validateVariantInputs(variants, { allowIds: false, variantLabel });
    const active = variants.filter(({ isActive }) => isActive ?? true);
    const effectivePrice = active.length
      ? Math.min(...active.map(({ price }) => price))
      : product.price;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...product,
          price: effectivePrice,
          variantLabel: variants.length ? variantLabel : null,
          images: {
            create: imageUrls.map((url, index) => ({ url, sortOrder: index })),
          },
          variants: { create: variants.map(variantCreateData) },
        },
        include: productRelations,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product.created",
          entityType: "Product",
          entityId: created.id,
          metadata: {
            name: created.name,
            categoryId: created.categoryId,
            imageCount: created.images.length,
            variantCount: created.variants.length,
          },
        },
      });
      return productResponse(created, true);
    });
  }

  async updateProduct(actor: AuthUser, id: string, dto: UpdateProductDto) {
    const {
      imageUrls,
      variants,
      variantLabel: rawVariantLabel,
      ...product
    } = dto;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id },
        include: { variants: true },
      });
      if (!existing) throw new NotFoundException("Product not found");

      const variantLabel = normalizedVariantLabel(
        rawVariantLabel === undefined ? existing.variantLabel : rawVariantLabel,
      );
      if (
        rawVariantLabel !== undefined &&
        existing.variants.length > 0 &&
        !variantLabel &&
        variants === undefined
      ) {
        throw new BadRequestException(
          "variantLabel is required while product variants are configured",
        );
      }
      if (variants !== undefined) {
        validateVariantInputs(variants, { allowIds: true, variantLabel });
        const existingIds = new Set(existing.variants.map(({ id }) => id));
        if (
          variants.some(
            ({ id: variantId }) => variantId && !existingIds.has(variantId),
          )
        ) {
          throw new BadRequestException(
            "One or more variants do not belong to this product",
          );
        }
        const existingByName = new Map(
          existing.variants.map((variant) => [
            variant.name.trim().toLocaleLowerCase(),
            variant.id,
          ]),
        );
        if (
          variants.some((variant) => {
            const ownerId = existingByName.get(
              variant.name.trim().toLocaleLowerCase(),
            );
            return ownerId && ownerId !== variant.id;
          })
        ) {
          throw new BadRequestException(
            "A variant name is already used by this product",
          );
        }
        const submittedIds = variants.flatMap(({ id: variantId }) =>
          variantId ? [variantId] : [],
        );
        await tx.productVariant.updateMany({
          where: {
            productId: id,
            ...(submittedIds.length ? { id: { notIn: submittedIds } } : {}),
          },
          data: { isActive: false },
        });

        for (const variant of variants) {
          if (variant.id) {
            if (variant.imageUrls !== undefined) {
              await tx.productVariantImage.deleteMany({
                where: { productVariantId: variant.id },
              });
            }
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                name: variant.name.trim(),
                description: variant.description?.trim() || null,
                price: variant.price,
                isActive: variant.isActive ?? true,
                sortOrder: variant.sortOrder ?? 0,
                ...(variant.imageUrls !== undefined
                  ? {
                      images: {
                        create: variant.imageUrls.map((url, index) => ({
                          url,
                          sortOrder: index,
                        })),
                      },
                    }
                  : {}),
              },
            });
          } else {
            await tx.productVariant.create({
              data: { productId: id, ...variantCreateData(variant) },
            });
          }
        }
      }

      if (imageUrls !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }

      const activeVariantPrices =
        variants === undefined
          ? existing.variants
              .filter(({ isActive }) => isActive)
              .map(({ price }) => Number(price))
          : variants
              .filter(({ isActive }) => isActive ?? true)
              .map(({ price }) => price);
      const effectivePrice = activeVariantPrices.length
        ? Math.min(...activeVariantPrices)
        : (product.price ?? Number(existing.price));

      const updated = await tx.product.update({
        where: { id },
        data: {
          ...product,
          price: effectivePrice,
          ...(rawVariantLabel !== undefined || variants !== undefined
            ? { variantLabel: variants?.length === 0 ? null : variantLabel }
            : {}),
          ...(imageUrls !== undefined
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
        include: productRelations,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product.updated",
          entityType: "Product",
          entityId: id,
          metadata: {
            changedFields: Object.keys(dto),
            imageCount: updated.images.length,
            variantCount: updated.variants.length,
            activeVariantCount: updated.variants.filter(
              ({ isActive }) => isActive,
            ).length,
          },
        },
      });
      return productResponse(updated, true);
    });
  }

  addImage(actor: AuthUser, productId: string, dto: AddProductImageDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException("Product not found");
      const imageCount = await tx.productImage.count({ where: { productId } });
      if (imageCount >= MAX_PRODUCT_IMAGES) {
        throw new ConflictException(
          `A product can have at most ${MAX_PRODUCT_IMAGES} images`,
        );
      }
      const image = await tx.productImage.create({
        data: {
          productId,
          ...dto,
          sortOrder: dto.sortOrder ?? imageCount,
        },
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
