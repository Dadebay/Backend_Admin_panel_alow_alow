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

test("OTP schemas validate Turkmen phone and six-digit verification code", () => {
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
    }),
    {
      name: "Berkarar",
      phone: undefined,
      address: "Atatürk köçesi",
      isActive: true,
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
      sortOrder: 0,
      isActive: true,
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

test("every admin form uses React Hook Form instead of manual FormData", async () => {
  const formFiles = [
    "../src/features/otp-login/ui/otp-login-card.tsx",
    "../src/widgets/branch-manager/ui/branch-manager.tsx",
    "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
    "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
    "../src/widgets/order-board/ui/order-board.tsx",
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
