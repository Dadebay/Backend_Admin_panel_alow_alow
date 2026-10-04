import { expect, test, type Page } from "@playwright/test";

const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lagmanId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mantyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const order = {
  id: orderId,
  number: 42,
  customerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  addressId: null,
  branchId: null,
  cookId: null,
  courierId: null,
  promoCodeId: null,
  deliveryEtrapId: 1,
  status: "COOKING",
  source: "STAFF_PHONE",
  paymentMethod: "CASH",
  subtotal: 30,
  discount: 0,
  deliveryFee: 10,
  total: 40,
  loyaltyPointsEarned: 0,
  loyaltyPointsSpent: 0,
  address: "Ашхабад, дом 7",
  addressLocationStatus: "MAP_CONFIRMED",
  latitude: 37.95,
  longitude: 58.38,
  addressLandmark: null,
  entrance: null,
  floor: null,
  apartment: null,
  deliveryWelayatName: "Ашхабад",
  deliveryEtrapName: "Центр",
  branchName: "Главный филиал",
  branchAddress: null,
  branchLatitude: null,
  branchLongitude: null,
  branchDistanceMeters: null,
  customerNote: null,
  cancellationReason: null,
  version: 1,
  createdAt: "2026-10-04T08:00:00.000Z",
  updatedAt: "2026-10-04T08:00:00.000Z",
  assignedAt: null,
  deliveredAt: null,
  completedAt: null,
  packingConfirmedAt: null,
  customer: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", phone: "+99365123456", firstName: "Клиент", lastName: null },
  cook: null,
  courier: null,
  items: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", orderId, productId: lagmanId, productVariantId: null, productName: "Лагман", variantName: null, preparationMinutes: 15, loyaltyPoints: 0, productImageUrl: null, unitPrice: 30, quantity: 1, lineTotal: 30 }],
  gifts: [],
  rating: null,
  cashSettlement: null,
  savedAddress: null,
  transitions: [],
};

async function mockOrders(page: Page) {
  const edits: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("alowalow.session.v1", JSON.stringify({
      accessToken: "order-edit-test-access",
      refreshToken: "order-edit-test-refresh",
      expiresInSeconds: 3600,
      accessExpiresAt: Date.now() + 3_600_000,
      loginMethod: "CENTRAL_OTP",
      user: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", phone: "+99365111111", firstName: "Администратор", lastName: null, role: "ADMIN" },
    }));
  });
  await page.route("**/tile/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO1ZV8QAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === "/api/v1/admin-page-access/me") {
      body = { role: "ADMIN", allowedPages: ["ORDERS"], availablePages: ["ORDERS"], expandedPages: [], editable: false, version: 1 };
    } else if (path === "/api/v1/orders") {
      body = { items: [order], page: 1, limit: 100, total: 1, pages: 1 };
    } else if (path === "/api/v1/receipt-print-tasks") {
      body = { consumerMode: "DIRECT_AGENT", pending: 0, needsAttention: 0, items: [] };
    } else if (path === "/api/v1/catalog/admin/products") {
      body = [
        { id: lagmanId, name: "Лагман", pricingType: "FIXED", price: 30, variants: [] },
        { id: mantyId, name: "Манты", pricingType: "FIXED", price: 40, variants: [] },
      ];
    } else if (path === "/api/v1/delivery/config") {
      body = { distancePricingEnabled: false, welayats: [{ id: 1, nameRu: "Ашхабад", etraps: [{ id: 1, nameRu: "Центр", price: 10 }] }] };
    } else if (path === "/api/v1/delivery/quote") {
      body = { latitude: 37.95, longitude: 58.38, addressLine: "Ашхабад, дом 7", etrap: { id: 1 }, fee: 10, total: 40, validUntil: null };
    } else if (path === `/api/v1/orders/${orderId}/admin-edit`) {
      edits.push(route.request().postDataJSON() as Record<string, unknown>);
      body = { ...order, version: 2 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return edits;
}

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 834, height: 760 }]) {
  test(`administrator can reach order edit controls on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const edits = await mockOrders(page);
    await page.goto("/orders");
    await page.getByTestId(`order-kanban-summary-${orderId}`).click();
    await page.getByTestId(`order-kanban-edit-${orderId}`).click();
    const dialog = page.getByTestId("order-admin-edit-dialog");
    const submit = page.getByTestId("order-admin-edit-submit");
    await expect(dialog).toBeVisible();
    await expect(submit).toBeInViewport();

    await page.getByTestId("order-admin-edit-product-select").selectOption(`${mantyId}:base`);
    await page.getByTestId("order-admin-edit-add-product").click();
    await page.getByRole("button", { name: "Убрать Лагман" }).click();
    await expect(dialog.locator(".assisted-cart-list strong", { hasText: "Манты" })).toBeVisible();
    await expect(dialog.locator(".assisted-cart-list strong", { hasText: "Лагман" })).toHaveCount(0);

    await page.getByTestId("order-admin-edit-note").scrollIntoViewIfNeeded();
    await expect.poll(() => dialog.locator(".assisted-order-layout").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(submit).toBeInViewport();
    await page.getByTestId("order-admin-edit-note").fill("Без лука");
    await page.screenshot({ path: testInfo.outputPath(`order-edit-${viewport.name}.png`) });
    await submit.click();
    await expect(dialog).toHaveCount(0);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ version: 1, items: [{ productId: mantyId, quantity: 1 }], customerNote: "Без лука" });
    expect(errors).toEqual([]);
  });
}
