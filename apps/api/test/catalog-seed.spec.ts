import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyCatalogSeed,
  loadCatalogSeedBundle,
  parseCatalogSeed,
} from "../prisma/catalog-seed";
import { PrismaClient } from "../src/generated/prisma/client";

function rawSeed(
  options: {
    categorySlug?: string;
    productSlug?: string;
    imageFile?: string;
    exportedAt?: string;
  } = {},
) {
  const categorySlug = options.categorySlug ?? "seed-category";
  const imageFile =
    options.imageFile ?? "11111111-1111-4111-8111-111111111111.webp";
  return {
    exportedAt: options.exportedAt ?? "2026-08-18T09:22:03.498Z",
    categories: [
      {
        slug: categorySlug,
        name: "Бургеры",
        sortOrder: 10,
        isActive: true,
        imageFile,
      },
    ],
    products: [
      {
        slug: options.productSlug ?? "alowalow-burger",
        name: "AlowAlow Burger",
        description: "Говяжья котлета",
        price: 48,
        sortOrder: 0,
        isActive: true,
        categorySlug,
        images: [{ imageFile, sortOrder: 0, alt: null }],
      },
    ],
    banners: [
      {
        title: "a",
        subtitle: "a",
        link: "https://example.com/foreign",
        sortOrder: 0,
        isActive: true,
        imageFile,
      },
    ],
  };
}

describe("catalog seed", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  beforeAll(async () => prisma.$connect());
  afterAll(async () => prisma.$disconnect());

  it("normalizes legacy brand text, placeholder banner fields and nullable images", () => {
    const raw = rawSeed();
    raw.products[0]!.images = null as never;
    const seed = parseCatalogSeed(raw);

    expect(seed.products[0]).toMatchObject({
      name: "A7-tagam Burger",
      images: [],
    });
    expect(seed.banners[0]).toMatchObject({
      title: "A7-tagam",
      subtitle: null,
      link: null,
    });
    expect(seed.normalization).toEqual({
      brandTextReplacements: 1,
      placeholderBannerFieldsRemoved: 2,
      externalBannerLinksRemoved: 1,
    });
  });

  it("rejects unknown fields, unsafe image names and missing category relations", () => {
    expect(() => parseCatalogSeed({ ...rawSeed(), unexpected: true })).toThrow(
      /unexpected field/,
    );

    const unsafe = rawSeed();
    unsafe.products[0]!.images[0]!.imageFile = "../image.webp";
    expect(() => parseCatalogSeed(unsafe)).toThrow(/UUID WebP filename/);

    const missingCategory = rawSeed();
    missingCategory.products[0]!.categorySlug = "not-imported";
    expect(() => parseCatalogSeed(missingCategory)).toThrow(/unknown category/);
  });

  it("validates the complete JSON and WebP file set before applying", async () => {
    const directory = await mkdtemp(join(tmpdir(), "a7-catalog-seed-"));
    try {
      const imageFile = `${randomUUID()}.webp`;
      const raw = rawSeed({ imageFile });
      const body = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: "#f77a18",
        },
      })
        .webp()
        .toBuffer();
      await mkdir(join(directory, "images"));
      await writeFile(join(directory, "seed_export.json"), JSON.stringify(raw));
      await writeFile(join(directory, "images", imageFile), body);

      const bundle = await loadCatalogSeedBundle(directory);
      expect(bundle.images).toHaveLength(1);
      expect(bundle.images[0]).toMatchObject({
        filename: imageFile,
        width: 64,
        height: 64,
      });

      await writeFile(join(directory, "images", `${randomUUID()}.webp`), body);
      await expect(loadCatalogSeedBundle(directory)).rejects.toThrow(
        /image set mismatch/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("applies idempotently, preserves variants and records an audit event", async () => {
    const suffix = randomUUID();
    const categorySlug = `seed-category-${suffix}`;
    const productSlug = `seed-product-${suffix}`;
    const imageFile = `${randomUUID()}.webp`;
    const exportedAt = new Date().toISOString();
    const seed = parseCatalogSeed(
      rawSeed({ categorySlug, productSlug, imageFile, exportedAt }),
    );
    const imageUrl = `/api/v1/media/${imageFile}`;

    try {
      const first = await applyCatalogSeed(prisma, seed);
      expect(first).toMatchObject({
        categories: { created: 1, updated: 0 },
        products: { created: 1, updated: 0 },
        banners: { created: 1, updated: 0 },
        productImages: 1,
      });

      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { variantLabel: "Размер" },
      });
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Большая",
          price: 65,
          isActive: true,
        },
      });

      const second = await applyCatalogSeed(prisma, seed);
      expect(second).toMatchObject({
        categories: { created: 0, updated: 1 },
        products: { created: 0, updated: 1 },
        banners: { created: 0, updated: 1 },
        productImages: 1,
      });

      const saved = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
        include: { images: true, variants: true },
      });
      expect(Number(saved.price)).toBe(65);
      expect(saved.name).toBe("A7-tagam Burger");
      expect(saved.images).toHaveLength(1);
      expect(saved.variants).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: "catalog.seed.imported", entityId: exportedAt },
        }),
      ).toBe(2);
      expect(await prisma.banner.count({ where: { imageUrl } })).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { action: "catalog.seed.imported", entityId: exportedAt },
      });
      await prisma.banner.deleteMany({ where: { imageUrl } });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });
});
