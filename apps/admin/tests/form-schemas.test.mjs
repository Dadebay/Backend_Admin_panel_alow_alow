import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  otpRequestSchema,
  otpVerifySchema,
} from "../src/features/otp-login/model/otp-login-form.ts";
import { branchFormSchema } from "../src/widgets/branch-manager/model/branch-form.ts";
import {
  categoryFormSchema,
  productFormSchema,
} from "../src/widgets/catalog-manager/model/catalog-forms.ts";
import {
  bannerFormSchema,
  promoFormSchema,
} from "../src/widgets/marketing-manager/model/marketing-forms.ts";
import { orderSearchFormSchema } from "../src/widgets/order-board/model/order-search-form.ts";
import { notificationFormSchema } from "../src/widgets/notification-manager/model/notification-form.ts";
import { staffFormSchema } from "../src/widgets/staff-manager/model/staff-form.ts";
import {
  assistedOrderFormSchema,
  buildAssistedDeliveryAddress,
  normalizeAssistedOrderCoordinates,
} from "../src/widgets/assisted-order/model/assisted-order-form.ts";

test("OTP schemas validate Turkmen phone and four- or six-digit verification code", () => {
  assert.equal(
    otpRequestSchema.parse({ phone: "+993 65 12 34 56", code: "" }).phone,
    "+99365123456",
  );
  assert.equal(
    otpRequestSchema.safeParse({ phone: "65123456", code: "" }).success,
    false,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "123456" })
      .success,
    true,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "1111" }).success,
    true,
  );
  assert.equal(
    otpVerifySchema.safeParse({ phone: "+99365123456", code: "12345" }).success,
    false,
  );
});

test("branch and staff forms trim values and validate required fields", () => {
  assert.deepEqual(
    branchFormSchema.parse({
      name: "  Berkarar  ",
      phone: "",
      address: "  Atatürk köçesi  ",
      isActive: true,
      isPrimary: false,
    }),
    {
      name: "Berkarar",
      phone: undefined,
      address: "Atatürk köçesi",
      isActive: true,
      isPrimary: false,
    },
  );
  assert.equal(
    branchFormSchema.safeParse({
      name: "Berkarar",
      phone: "65123456",
      address: "Atatürk köçesi",
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    staffFormSchema.safeParse({
      phone: "+99365123456",
      firstName: "Operator",
      lastName: "",
      role: "OPERATOR",
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    staffFormSchema.safeParse({
      phone: "+99365123456",
      firstName: "Operator",
      lastName: "",
      role: "CUSTOMER",
      isActive: true,
    }).success,
    false,
  );
});

test("catalog schemas reject invalid slug and money precision", () => {
  assert.equal(
    categoryFormSchema.safeParse({
      name: "Пицца",
      slug: "pizza",
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    categoryFormSchema.safeParse({
      name: "Пицца",
      slug: "Pizza с пробелом",
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Маргарита",
      slug: "margarita",
      description: "Пицца",
      price: 49.999,
      receiptPrinterIp: "192.168.1.50",
      variantLabel: "",
      variants: [],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Маргарита",
      slug: "margarita",
      description: "Пицца",
      price: 50,
      receiptPrinterIp: "192.168.1.50",
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "25 см",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
        {
          name: "Большая",
          description: "35 см",
          price: 75,
          sortOrder: 1,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    true,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Нарезка",
      slug: "cutting",
      description: "Мясо",
      price: 50,
      receiptPrinterIp: "192.168.1.50",
      variantLabel: "",
      variants: [
        {
          name: "Вручную",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
});

test("product variant schema rejects duplicate names and excess images", () => {
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Пицца",
      slug: "duplicate-sizes",
      description: "Повторяющиеся размеры",
      price: 50,
      receiptPrinterIp: "192.168.1.50",
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: [],
        },
        {
          name: " маленькая ",
          description: "",
          price: 55,
          sortOrder: 1,
          isActive: true,
          imageUrls: [],
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
      name: "Пицца",
      slug: "too-many-variant-images",
      description: "Слишком много изображений",
      price: 50,
      receiptPrinterIp: "192.168.1.50",
      variantLabel: "Размер",
      variants: [
        {
          name: "Маленькая",
          description: "",
          price: 50,
          sortOrder: 0,
          isActive: true,
          imageUrls: Array.from(
            { length: 11 },
            (_, index) => `/api/v1/media/${index}.webp`,
          ),
        },
      ],
      sortOrder: 0,
      isActive: true,
    }).success,
    false,
  );
});

test("product form accepts a LAN printer IPv4 address and rejects invalid IPs", () => {
  const product = {
    categoryId: "2d807991-e99f-4f17-9b9f-cc2fb7478820",
    name: "Манты",
    slug: "manty-printer",
    description: "Печатается на кухонном аппарате",
    price: 60,
    receiptPrinterIp: "192.168.10.51",
    variantLabel: "",
    variants: [],
    sortOrder: 0,
    isActive: true,
  };

  assert.equal(productFormSchema.safeParse(product).success, true);
  assert.equal(
    productFormSchema.safeParse({
      ...product,
      receiptPrinterIp: "192.168.10.999",
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      ...product,
      receiptPrinterIp: "8.8.8.8",
    }).success,
    false,
  );
});

test("marketing schemas normalize promo code and reject reversed dates", () => {
  assert.deepEqual(
    promoFormSchema.parse({
      code: " welcome15 ",
      type: "PERCENT",
      value: 15,
      minOrderAmount: undefined,
      maxDiscountAmount: undefined,
      totalUsageLimit: undefined,
      perUserLimit: 1,
      startsAt: "",
      endsAt: "",
      isActive: true,
    }).code,
    "WELCOME15",
  );
  assert.equal(
    bannerFormSchema.safeParse({
      title: "Летнее меню",
      subtitle: "",
      link: "",
      sortOrder: 0,
      startsAt: "2026-08-03T12:00",
      endsAt: "2026-08-02T12:00",
      isActive: true,
    }).success,
    false,
  );
});

test("order search schema trims query and limits its length", () => {
  assert.deepEqual(orderSearchFormSchema.parse({ search: "  +99365  " }), {
    search: "+99365",
  });
  assert.equal(
    orderSearchFormSchema.safeParse({ search: "x".repeat(201) }).success,
    false,
  );
});

test("notification schema accepts only internal application deep links", () => {
  assert.deepEqual(
    notificationFormSchema.parse({
      title: "  Заказ уже рядом ",
      body: " Проверьте статус доставки. ",
      deepLink: "/orders/current",
    }),
    {
      title: "Заказ уже рядом",
      body: "Проверьте статус доставки.",
      deepLink: "/orders/current",
    },
  );
  assert.equal(
    notificationFormSchema.safeParse({
      title: "Внешняя ссылка",
      body: "Такую ссылку отправлять нельзя",
      deepLink: "https://evil.example",
    }).success,
    false,
  );
});

test("assisted order keeps the optional unofficial address and always builds a delivery label", () => {
  const parsed = assistedOrderFormSchema.parse({
    customerPhone: "+993 65 12 34 56",
    customerFirstName: " Aman ",
    customerLastName: "",
    addressId: "",
    deliveryEtrapId: "25",
    addressLabel: " По телефону ",
    address: " около школы 26, второй поворот ",
    entrance: "",
    floor: "",
    apartment: "",
    customerNote: " позвонить ",
    promoCode: " welcome15 ",
    addressSearch: "",
  });

  assert.equal(parsed.customerPhone, "+99365123456");
  assert.equal(parsed.address, "около школы 26, второй поворот");
  assert.equal(parsed.deliveryEtrapId, 25);
  assert.equal(parsed.promoCode, "WELCOME15");
  assert.equal(
    assistedOrderFormSchema.parse({
      customerPhone: "+99365123456",
      customerFirstName: "",
      customerLastName: "",
      addressId: "",
      deliveryEtrapId: "",
      addressLabel: "",
      address: "",
      entrance: "",
      floor: "",
      apartment: "",
      customerNote: "",
      promoCode: "",
      addressSearch: "",
    }).deliveryEtrapId,
    undefined,
  );
  assert.equal(
    buildAssistedDeliveryAddress({
      officialAddress: "Garaşsyzlyk şaýoly 60",
      unofficialAddress: "синий подъезд",
      coordinates: { latitude: 37.96, longitude: 58.32 },
    }),
    "Garaşsyzlyk şaýoly 60 — ориентир: синий подъезд",
  );
  assert.equal(
    buildAssistedDeliveryAddress({
      coordinates: { latitude: 37.960123, longitude: 58.326789 },
    }),
    "Точка на карте: 37.96012, 58.32679",
  );
  assert.deepEqual(normalizeAssistedOrderCoordinates(37.960123456, 58.3261), {
    latitude: 37.9601235,
    longitude: 58.3261,
  });
  assert.equal(normalizeAssistedOrderCoordinates(91, 58.3261), null);
});

test("every admin form uses React Hook Form instead of manual FormData", async () => {
  const formFiles = [
    "../src/features/otp-login/ui/otp-login-card.tsx",
    "../src/widgets/branch-manager/ui/branch-manager.tsx",
    "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
    "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
    "../src/widgets/order-board/ui/order-board.tsx",
    "../src/widgets/assisted-order/ui/assisted-order-dialog.tsx",
    "../src/widgets/delivery-manager/ui/delivery-manager.tsx",
    "../src/widgets/notification-manager/ui/notification-manager.tsx",
    "../src/widgets/staff-manager/ui/staff-manager.tsx",
  ];

  for (const file of formFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /useForm/);
    assert.match(source, /zodResolver/);
    assert.doesNotMatch(source, /new FormData\(/);
  }
});
