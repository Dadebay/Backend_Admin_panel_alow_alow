import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

type Fixture = {
  session: { accessToken: string; user: { id: string } };
  busyStaffId: string;
  ownerId: string;
};

async function setup(page: Page) {
  const fixture = JSON.parse(
    await readFile(process.env.STAFF_SALES_QA_SESSION!, "utf8"),
  ) as Fixture;
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      ["error", "warning"].includes(message.type()) &&
      !message.text().includes("409")
    )
      errors.push(message.text());
  });
  await page.addInitScript((session) => {
    sessionStorage.setItem("alowalow.session.v1", JSON.stringify(session));
    const metrics = {
      lcp: 0,
      cls: 0,
      maxEventDuration: 0,
      supported: PerformanceObserver.supportedEntryTypes,
    };
    Object.assign(window, { staffSalesMetrics: metrics });
    if (
      PerformanceObserver.supportedEntryTypes.includes(
        "largest-contentful-paint",
      )
    ) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes("event")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          metrics.maxEventDuration = Math.max(
            metrics.maxEventDuration,
            entry.duration,
          );
      }).observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    }
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  }, fixture.session);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const response = await route.fetch({
      url: `http://127.0.0.1:4015${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  return { fixture, requests, errors };
}

test.beforeEach(() => {
  test.skip(
    !process.env.STAFF_SALES_QA_SESSION,
    "Requires the isolated alofood_test fixture and local Nest API",
  );
});

test("administrator removes staff through the real API and sees assignment conflicts", async ({
  page,
  request,
}, testInfo) => {
  const { fixture, requests, errors } = await setup(page);
  const phoneDigits = randomUUID()
    .replace(/\D/g, "")
    .slice(0, 6)
    .padEnd(6, "0");
  const created = await request.post("http://127.0.0.1:4015/api/v1/staff", {
    headers: { Authorization: `Bearer ${fixture.session.accessToken}` },
    data: {
      phone: `+99365${phoneDigits}`,
      firstName: "Удаляемый тестовый сотрудник",
      role: "COOK",
    },
  });
  expect(created.status()).toBe(201);
  const employee = (await created.json()) as { id: string };
  const started = Date.now();
  await page.goto("/staff");
  const open = page.getByTestId(`staff-delete-open-${employee.id}`);
  await expect(open).toBeVisible();
  const readyMs = Date.now() - started;
  await expect(
    page.getByTestId(`staff-delete-open-${fixture.session.user.id}`),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(`staff-delete-open-${fixture.ownerId}`),
  ).toHaveCount(0);
  await open.click();
  await expect(page.getByTestId("staff-delete-dialog")).toBeVisible();
  await page.getByTestId("staff-delete-cancel").click();
  expect(requests.filter((value) => value.startsWith("DELETE "))).toHaveLength(
    0,
  );
  await open.click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("staff-delete-dialog")).toHaveCount(0);
  await open.click();
  await page.getByTestId("staff-delete-confirm").click();
  await expect(open).toHaveCount(0);
  await expect(page.getByTestId("staff-delete-success")).toBeVisible();
  expect(
    requests.filter((value) => value === `DELETE /api/v1/staff/${employee.id}`),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("staff-manager")).toBeVisible();
  await expect(open).toHaveCount(0);
  await page.getByTestId(`staff-delete-open-${fixture.busyStaffId}`).click();
  await page.getByTestId("staff-delete-confirm").click();
  await expect(page.getByTestId("staff-delete-dialog")).toContainText(
    "Сначала завершите или переназначьте",
  );
  await page
    .getByTestId("staff-delete-dialog")
    .screenshot({ path: testInfo.outputPath("staff-deletion-conflict.png") });
  await page.getByTestId("staff-delete-cancel").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  const verification = JSON.stringify({
    readyMs,
    requests,
    errors,
    viewport: page.viewportSize(),
    browser: testInfo.project.name,
  });
  await writeFile(testInfo.outputPath("verification.json"), verification);
  await testInfo.attach("verification.json", {
    body: verification,
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("administrator sees real shift sales, money-return dates, totals and pagination", async ({
  page,
}, testInfo) => {
  const { requests, errors } = await setup(page);
  const started = Date.now();
  await page.goto("/accounting?fromDate=2026-10-06&toDate=2026-10-07");
  await expect(page.getByTestId("accounting-sales-table")).toBeVisible();
  const readyMs = Date.now() - started;
  await expect(page.getByTestId("accounting-inspection")).toHaveCount(0);
  await expect(page.getByTestId("accounting-summary")).toHaveCount(0);
  await page.getByTestId("accounting-sales-open-2026-10-07:day").click();
  await expect(page.getByTestId("accounting-sales-shift")).toHaveValue(
    "2026-10-07:day",
  );
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "2 403,00 ТМТ",
  );
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "277,00 ТМТ",
  );
  await expect(
    page.getByTestId("accounting-sales-table").locator("tbody tr"),
  ).toHaveCount(25);
  const interactionStarted = Date.now();
  await page.getByTestId("accounting-sales-next").click();
  await expect(
    page.getByTestId("accounting-sales-table").locator("tbody tr"),
  ).toHaveCount(10);
  const interactionMs = Date.now() - interactionStarted;
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "2 403,00 ТМТ",
  );
  await page.getByTestId("accounting-sales-basis").selectOption("created");
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "848,00 ТМТ",
  );
  await expect(page.getByTestId("accounting-sales-explanation")).toContainText(
    "не означают, что деньги уже возвращены",
  );
  await page
    .getByTestId("accounting-sales-shift")
    .selectOption("2026-10-06:day");
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "1 555,00 ТМТ",
  );
  await expect(
    page.getByTestId("accounting-sales-table").locator("tbody tr"),
  ).toHaveCount(5);
  await expect(page.getByTestId("accounting-sales-table")).toContainText(
    "06.10.2026",
  );
  await expect(page.getByTestId("accounting-sales-table")).toContainText(
    "07.10.2026",
  );
  await page.screenshot({
    path: testInfo.outputPath("shift-created-vs-cash.png"),
    fullPage: true,
  });
  await page.getByTestId("accounting-sales-basis").selectOption("cashReturned");
  await expect(page.getByTestId("accounting-sales-empty")).toBeVisible();
  await expect(page.getByTestId("accounting-sales-summary")).toContainText(
    "0,00 ТМТ",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  expect(
    requests.some((value) =>
      /\/(report|overview|audit|carryover)\?/.test(value),
    ),
  ).toBe(false);
  const salesRequests = requests.filter((value) =>
    value.includes("/accounting/sales?"),
  );
  expect(new Set(salesRequests).size).toBe(salesRequests.length);
  const metrics = await page.evaluate(
    () =>
      (window as unknown as { staffSalesMetrics: { lcp: number; cls: number } })
        .staffSalesMetrics,
  );
  const verification = JSON.stringify({
    ...metrics,
    readyMs,
    interactionMs,
    requests,
    errors,
    viewport: page.viewportSize(),
    browser: testInfo.project.name,
  });
  await writeFile(testInfo.outputPath("verification.json"), verification);
  await testInfo.attach("verification.json", {
    body: verification,
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
