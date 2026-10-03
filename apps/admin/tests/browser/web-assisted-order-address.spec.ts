import { expect, test, type Page } from "@playwright/test";

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product = {
  id: productId,
  name: "Лагман",
  slug: "lagman",
  description: "",
  isActive: true,
  pricingType: "FIXED",
  price: 30,
  minPrice: 30,
  variants: [],
  categoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  category: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Горячее",
    sortOrder: 1,
    isActive: true,
  },
  displayImageUrl: null,
};

const browserIssues = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const issues: string[] = [];
  browserIssues.set(page, issues);
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      if (message.type() === "warning" && /MouseEvent\.(mozPressure|mozInputSource) is deprecated/.test(message.text())) {
        // Firefox emits these browser-level warnings from Leaflet's existing mouse fallback.
        return;
      }
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(browserIssues.get(page)).toEqual([]);
});

async function mockOnlineWebOrders(page: Page, customers: unknown[] = []) {
  const orders: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("alowalow.session.v1", JSON.stringify({
      accessToken: "web-test-access",
      refreshToken: "web-test-refresh",
      expiresInSeconds: 3600,
      accessExpiresAt: Date.now() + 3_600_000,
      loginMethod: "CENTRAL_OTP",
      user: {
        id: "77777777-7777-4777-8777-777777777777",
        phone: "+99365123456",
        firstName: "Operator",
        lastName: null,
        role: "OPERATOR",
      },
    }));
  });
  await page.route("**/tile/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8f0e9"/></svg>',
  }));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown = [];
    if (path === "/api/v1/admin-page-access/me") {
      body = { role: "OPERATOR", allowedPages: ["ORDERS"], availablePages: ["ORDERS"], expandedPages: [], editable: false, version: 1 };
    } else if (path === "/api/v1/orders") {
      body = { items: [], page: 1, limit: 100, total: 0, pages: 0 };
    } else if (path === "/api/v1/orders/assisted/customers") {
      body = { items: customers };
    } else if (path === "/api/v1/receipt-print-tasks") {
      body = { consumerMode: "DIRECT_AGENT", pending: 0, needsAttention: 0, items: [] };
    } else if (path === "/api/v1/catalog/admin/products") {
      body = [product];
    } else if (path === "/api/v1/delivery/config") {
      body = { distancePricingEnabled: false, welayats: [] };
    } else if (path === "/api/v1/delivery/tariff-quote" || path === "/api/v1/delivery/quote") {
      body = { fee: 10, tariff: "DAY", etrap: null, addressLine: "Ашхабад", validUntil: null };
    } else if (path === "/api/v1/orders/assisted" && method === "POST") {
      orders.push(route.request().postDataJSON() as Record<string, unknown>);
      body = { number: 71 + orders.length, branchName: "Филиал", total: 40 };
    }
    await route.fulfill({
      status: path === "/api/v1/orders/assisted" && method === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return orders;
}

async function openWebOrder(page: Page) {
  await page.goto("/orders");
  if ((page.viewportSize()?.width ?? 1440) < 1181) {
    await page.getByTestId("admin-navigation-toggle").click();
  }
  await expect(page.getByTestId("admin-nav-phone-order")).toBeVisible();
  await page.getByTestId("admin-nav-phone-order").click();
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByTestId("assisted-order-workspace")).toBeVisible();
  await page.getByTestId(`assisted-product-plus-${productId}`).click();
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-step-delivery")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("assisted-order-phone").fill("+99365112233");
}

test("web operator can create a phone order with only a typed address", async ({ page }, testInfo) => {
  const orders = await mockOnlineWebOrders(page);
  await openWebOrder(page);
  await expect(page.getByTestId("assisted-address-method-manual")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("assisted-order-map")).toHaveCount(0);
  await page.getByTestId("assisted-order-address").fill("Ашхабад, улица 1, дом 7, синий вход");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("web-phone-order-manual-entry.png") });
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-review-address-status")).toContainText("точка на карте не подтверждена");
  await page.screenshot({ path: testInfo.outputPath("web-phone-order-manual-address.png") });
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-order-success-another")).toBeVisible();
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    customerPhone: "+99365112233",
    address: "Ашхабад, улица 1, дом 7, синий вход",
    addressLocationStatus: "MANUAL_UNVERIFIED",
    items: [{ productId, quantity: 1 }],
  });
  expect(orders[0]).not.toHaveProperty("latitude");
  expect(orders[0]).not.toHaveProperty("longitude");
});

test("web operator can place an exact map point without a search result", async ({ page }, testInfo) => {
  const orders = await mockOnlineWebOrders(page);
  await openWebOrder(page);
  const mapOpenStarted = Date.now();
  await page.getByTestId("assisted-address-method-map").focus();
  await expect(page.getByTestId("assisted-address-method-map")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("assisted-order-map")).toBeVisible();
  const mapOpenMs = Date.now() - mapOpenStarted;
  await testInfo.attach("assisted-address-map-performance.json", {
    body: JSON.stringify({ mapOpenMs, viewport: page.viewportSize(), browser: testInfo.project.name }),
    contentType: "application/json",
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByTestId("assisted-order-address").fill("Вход со двора");
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByRole("alert")).toContainText("Поставьте точку на карте");
  await expect(page.getByTestId("assisted-order-review")).toHaveCount(0);
  await page.getByTestId("assisted-order-map").locator(".leaflet-container").click({ position: { x: 120, y: 140 } });
  await expect(page.getByTestId("assisted-map-instruction")).toContainText("Точка выбрана");
  await page.screenshot({ path: testInfo.outputPath("web-phone-order-map-entry.png") });
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-review-address-status")).toContainText("Точка на карте выбрана");
  await page.screenshot({ path: testInfo.outputPath("web-phone-order-map-point.png") });
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-order-success-another")).toBeVisible();
  expect(orders).toHaveLength(1);
  expect(orders[0]).toEqual(expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
  expect(orders[0]).not.toHaveProperty("addressLocationStatus", "MANUAL_UNVERIFIED");
});

test("switching from a map point to text removes coordinates before submission", async ({ page }) => {
  const orders = await mockOnlineWebOrders(page);
  await openWebOrder(page);
  await page.getByTestId("assisted-order-address").fill("Ашхабад, новый дом 9");
  await page.getByTestId("assisted-address-method-map").click();
  await page.getByTestId("assisted-order-map").locator(".leaflet-container").click({ position: { x: 120, y: 140 } });
  await expect(page.getByTestId("assisted-map-instruction")).toContainText("Точка выбрана");
  await page.getByTestId("assisted-address-method-manual").click();
  await expect(page.getByTestId("assisted-order-map")).toHaveCount(0);
  await expect(page.getByTestId("assisted-order-address")).toHaveValue("Ашхабад, новый дом 9");
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-review-address-status")).toContainText("точка на карте не подтверждена");
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-order-success-another")).toBeVisible();
  expect(orders[0]).toMatchObject({ address: "Ашхабад, новый дом 9", addressLocationStatus: "MANUAL_UNVERIFIED" });
  expect(orders[0]).not.toHaveProperty("latitude");
  expect(orders[0]).not.toHaveProperty("longitude");
});

test("typing a replacement for a saved address does not reuse its zone", async ({ page }) => {
  const savedAddressId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const orders = await mockOnlineWebOrders(page, [{
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    phone: "+99365112233",
    firstName: "Аман",
    lastName: null,
    addresses: [{
      id: savedAddressId,
      label: "Дом",
      address: "Старый адрес",
      locationStatus: "MANUAL_UNVERIFIED",
      latitude: null,
      longitude: null,
      deliveryEtrapId: 12,
      entrance: null,
      floor: null,
      apartment: null,
      isActive: true,
    }],
  }]);
  await openWebOrder(page);
  await expect(page.getByTestId("assisted-saved-address")).toHaveValue(savedAddressId);
  await page.getByTestId("assisted-order-address").fill("Ашхабад, новая улица 4");
  await expect(page.getByTestId("assisted-saved-address")).toHaveValue("");
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-review-address-status")).toContainText("точка на карте не подтверждена");
  await page.getByTestId("assisted-order-submit").click();
  await expect(page.getByTestId("assisted-order-success-another")).toBeVisible();
  expect(orders[0]).toMatchObject({ address: "Ашхабад, новая улица 4", addressLocationStatus: "MANUAL_UNVERIFIED" });
  expect(orders[0]).not.toHaveProperty("addressId");
  expect(orders[0]).not.toHaveProperty("deliveryEtrapId");
});
