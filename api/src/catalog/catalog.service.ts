import { Injectable, NotFoundException } from "@nestjs/common";
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

  categories(includeInactive = false) {
    return this.prisma.category.findMany({
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
  }

  products(categoryId?: string, includeInactive = false) {
    return this.prisma.product.findMany({
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
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  createProduct(dto: CreateProductDto) {
    const { imageUrls = [], ...product } = dto;
    return this.prisma.product.create({
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
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const { imageUrls, ...product } = dto;
    const exists = await this.prisma.product.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Product not found");
    return this.prisma.$transaction(async (tx) => {
      if (imageUrls) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }
      return tx.product.update({
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
    });
  }

  addImage(productId: string, dto: AddProductImageDto) {
    return this.prisma.productImage.create({
      data: { productId, ...dto },
    });
  }
}
