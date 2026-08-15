import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const kanbanUrl = new URL(
  "../src/widgets/order-board/ui/order-kanban.tsx",
  import.meta.url,
);
const boardUrl = new URL(
  "../src/widgets/order-board/ui/order-board.tsx",
  import.meta.url,
);
const courierUrl = new URL(
  "../src/widgets/courier-tracking/ui/courier-tracking-screen.tsx",
  import.meta.url,
);

test("kanban exposes stable automation hooks for lanes, cards, and actions", async () => {
  const source = await readFile(kanbanUrl, "utf8");

  assert.match(source, /data-testid="order-kanban"/);
  assert.match(source, /data-testid=\{`order-kanban-column-\$\{lane\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-card-\$\{order\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-transition-\$\{order\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-cancel-\$\{order\.id\}`\}/);
  assert.match(source, /canOpenDetails &&/);
});

test("kanban actions reuse backend-owned transition, assignment, and cancellation mutations", async () => {
  const source = await readFile(boardUrl, "utf8");

  assert.match(source, /actions\.transition\.mutate/);
  assert.match(source, /actions\.assignCourier\.mutate/);
  assert.match(source, /actions\.cancel\.mutate/);
  assert.match(source, /version: order\.version/);
  assert.match(source, /limit: viewMode === "kanban" \? 100 : 25/);
  assert.match(source, /kanbanQueueStatusesForRole\(role\)/);
  assert.match(source, /data-testid="orders-view-kanban"/);
  assert.match(source, /data-testid="orders-view-table"/);
});

test("courier workspace renders assigned orders beside GPS sharing", async () => {
  const source = await readFile(courierUrl, "utf8");

  assert.match(source, /<CourierLocationSharing \/>/);
  assert.match(source, /title="Мои доставки"/);
  assert.match(source, /defaultView="kanban"/);
});
