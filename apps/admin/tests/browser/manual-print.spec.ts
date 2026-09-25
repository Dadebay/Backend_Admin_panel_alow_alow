import { expect, test } from "@playwright/test";

const orderId = "11111111-1111-4111-8111-111111111111";
const firstItemId = "22222222-2222-4222-8222-222222222222";
const secondItemId = "33333333-3333-4333-8333-333333333333";
const printerId = "44444444-4444-4444-8444-444444444444";
const now = "2026-09-25T10:00:00.000Z";
const items = [
  { id: firstItemId, orderId, productId: "55555555-5555-4555-8555-555555555555", productVariantId: null, productName: "Манты", variantName: null, preparationMinutes: 10, loyaltyPoints: 1, productImageUrl: null, unitPrice: 30, quantity: 1, lineTotal: 30 },
  { id: secondItemId, orderId, productId: "66666666-6666-4666-8666-666666666666", productVariantId: null, productName: "Шашлык", variantName: null, preparationMinutes: 30, loyaltyPoints: 1, productImageUrl: null, unitPrice: 50, quantity: 1, lineTotal: 50 },
];
const order = {
  id: orderId, number: 72, customerId: "77777777-7777-4777-8777-777777777777",
  addressId: null, branchId: null, cookId: null, courierId: null, promoCodeId: null,
  deliveryEtrapId: null, status: "RECONCILED", source: "CUSTOMER_APP", paymentMethod: "CASH",
  subtotal: 80, discount: 0, deliveryFee: 15, total: 95, loyaltyPointsEarned: 2,
  loyaltyPointsSpent: 0, address: "Тестовый адрес", latitude: 37.96, longitude: 58.33,
  entrance: null, floor: null, apartment: null, deliveryWelayatName: null,
  deliveryEtrapName: null, branchName: null, branchAddress: null,
  branchLatitude: null, branchLongitude: null, branchDistanceMeters: null,
  customerNote: null, cancellationReason: null, version: 1, createdAt: now,
  updatedAt: now, assignedAt: null, deliveredAt: now, completedAt: now,
  packingConfirmedAt: now,
  customer: { id: "77777777-7777-4777-8777-777777777777", phone: "+99365123456", firstName: "Клиент", lastName: null },
  cook: null, courier: null, items, gifts: [], rating: null, cashSettlement: null,
  savedAddress: null, transitions: [],
};

test("manual print chooses the dishes and sends omissions to the API", async ({ page }) => {
  const session = {
    accessToken: "test-access", refreshToken: "test-refresh", expiresInSeconds: 3600,
    accessExpiresAt: Date.now() + 3_600_000,
    user: { id: "88888888-8888-4888-8888-888888888888", phone: "+99365120000", firstName: "Admin", lastName: null, role: "ADMIN" },
  };
  await page.addInitScript((value) => sessionStorage.setItem("alowalow.session.v1", JSON.stringify(value)), session);
  const requests: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    const method = route.request().method();
    let json: unknown = [];
    let status = 200;
    if (path === "/admin-page-access/me")
      json = { role: "ADMIN", allowedPages: ["ORDERS"], availablePages: ["ORDERS"], expandedPages: [], editable: false, version: 1 };
    else if (path === "/orders" && method === "GET")
      json = { items: [order], page: 1, limit: 25, total: 1, pages: 1 };
    else if (path === `/orders/${orderId}/receipt-print-plan`)
      json = { orderId, orderNumber: 72, mainCopies: 2, mainJob: { printerIp: "192.168.0.10", printerPort: 9100, transport: "RAW_TCP", items }, jobs: [{ printerIp: "192.168.0.11", printerPort: 9100, transport: "RAW_TCP", items }], unassignedItems: [], summary: { subtotal: 80, discount: 0, deliveryFee: 15, total: 95, deliveryAreaName: null }, metadata: null, documentType: "ORDER", cancellationReason: null };
    else if (path === "/catalog/admin/receipt-printers")
      json = [{ id: printerId, name: "Кухня", ipAddress: "192.168.0.11", port: 9100, transport: "RAW_TCP", isActive: true, createdAt: now, updatedAt: now }];
    else if (path === `/receipt-print-tasks/orders/${orderId}/reprint` && method === "POST") {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      json = { id: "99999999-9999-4999-8999-999999999999", orderId, orderNumber: 72, documentType: "ORDER", status: "PENDING", attempts: 0, createdAt: now, nextAttemptAt: now, stationId: null, lastError: null, deliveredAt: null };
      status = 201;
    } else if (path === "/receipt-print-tasks")
      json = { items: [], pending: 0, needsAttention: 0, consumerMode: "DIRECT_AGENT" };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });

  await page.goto("/orders");
  await expect(async () => {
    const tableTab = page.getByTestId("orders-view-table");
    await tableTab.click();
    await expect(tableTab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.getByTestId(`order-table-print-${orderId}`).click();
  await expect(page.getByTestId("manual-receipt-form")).toBeVisible();
  await page.getByTestId(`manual-receipt-route-${firstItemId}`).selectOption("SKIP");
  await page.getByTestId(`manual-receipt-route-${secondItemId}`).selectOption(printerId);
  await page.getByTestId("manual-receipt-submit").click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]?.itemRoutes).toEqual([
    { itemId: firstItemId, printerId: null, skip: true },
    { itemId: secondItemId, printerId },
  ]);
  expect(errors).toEqual([]);
});
