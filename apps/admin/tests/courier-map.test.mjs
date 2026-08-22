import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { COURIER_LOCATION_UPDATE_INTERVAL_MS } from "../src/features/courier-location-sharing/model/location-sharing.ts";
import {
  courierOverviewCounts,
  courierWorkLabel,
  courierWorkState,
} from "../src/widgets/courier-map/model/courier-status.ts";

test("courier workload distinguishes free couriers from one or several orders", () => {
  const free = { activeOrders: [], presence: "ONLINE" };
  const oneOrder = {
    activeOrders: [{ number: 179 }],
    presence: "ONLINE",
  };
  const severalOrders = {
    activeOrders: [{ number: 179 }, { number: 180 }],
    presence: "STALE",
  };

  assert.equal(courierWorkState(free), "FREE");
  assert.equal(courierWorkLabel(free), "Свободен");
  assert.equal(courierWorkState(oneOrder), "BUSY");
  assert.equal(courierWorkLabel(oneOrder), "В заказе #179");
  assert.equal(courierWorkLabel(severalOrders), "В заказах · 2");
});

test("courier overview counts workload, presence and GPS independently", () => {
  const counts = courierOverviewCounts([
    {
      activeOrders: [],
      presence: "ONLINE",
      location: { latitude: 37.96, longitude: 58.33 },
    },
    {
      activeOrders: [{ number: 179 }],
      presence: "STALE",
      location: { latitude: 37.97, longitude: 58.34 },
    },
    { activeOrders: [], presence: "OFFLINE", location: null },
    {
      activeOrders: [{ number: 180 }, { number: 181 }],
      presence: "ONLINE",
    },
  ]);

  assert.deepEqual(counts, {
    busy: 2,
    freeOnline: 1,
    located: 2,
    online: 2,
    total: 4,
  });
  assert.deepEqual(courierOverviewCounts([]), {
    busy: 0,
    freeOnline: 0,
    located: 0,
    online: 0,
    total: 0,
  });
});

test("dispatch map renders backend road geometry instead of joining order points", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/courier-map/ui/courier-map-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /\bPolyline\b/);
  assert.match(source, /route\.route\.geometry\.coordinates/);
  assert.match(source, /\[longitude, latitude\]/);
  assert.match(source, /courier\.location\.latitude/);
  assert.match(source, /order\.latitude/);
  assert.match(source, /branch\.latitude/);
});

test("dispatch and branch maps keep an operational working height", async () => {
  const styles = await readFile(
    new URL("../src/app/styles/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /height: clamp\(640px, 76vh, 920px\)/);
  assert.match(styles, /height: clamp\(560px, 68vh, 820px\)/);
});

test("dispatch applies authenticated server-pushed GPS events to TanStack cache", async () => {
  const liveSource = await readFile(
    new URL(
      "../src/entities/courier/api/dispatch-live.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const panel = await readFile(
    new URL(
      "../src/widgets/courier-map/ui/courier-map-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const querySource = await readFile(
    new URL(
      "../src/entities/courier/api/dispatch-query.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(liveSource, /\/tracking\/dispatch\/live/);
  assert.match(liveSource, /openApiEventStream/);
  assert.match(liveSource, /setQueryData<DispatchSnapshot>/);
  assert.match(liveSource, /courierQueryKeys\.route/);
  assert.match(querySource, /\/orders\/couriers\/\$\{courierId\}\/route/);
  assert.match(panel, /useDispatchLiveUpdates/);
  assert.match(panel, /useCourierRoute/);
  assert.match(panel, /dispatch-route-summary/);
});

test("dispatch opens with every located courier in view and keeps an explicit overview", async () => {
  const [canvas, panel] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/courier-map/ui/courier-map-canvas.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/courier-map/ui/courier-map-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(panel, /useState<string \| null>\(\s*null,?\s*\)/);
  assert.match(panel, /data-testid="dispatch-show-all-couriers"/);
  assert.match(panel, /data-testid={`dispatch-select-courier-\$\{courier\.id\}`\}/);
  assert.match(panel, /onClick=\{\(\) => setSelectedCourierId\(null\)\}/);
  assert.doesNotMatch(panel, /couriers\[0\]/);
  assert.match(canvas, /for \(const courier of couriers\)/);
  assert.match(
    canvas,
    /points\.push\(\[courier\.location\.latitude, courier\.location\.longitude\]\)/,
  );
  assert.match(
    canvas,
    /className=\{`courier-marker-tooltip \$\{workState\.toLowerCase\(\)\}`\}/,
  );
  assert.match(canvas, /<Tooltip[\s\S]*?permanent/);
  assert.match(canvas, /<strong>\{courierName\(courier\)\}<\/strong>/);
  assert.match(canvas, /<span>\{workLabel\}<\/span>/);
});

test("courier GPS remains a whole-shift feed after an order is delivered", async () => {
  const [sharing, context, mobileContract, qaContract] = await Promise.all([
    readFile(
      new URL(
        "../src/features/courier-location-sharing/ui/courier-location-sharing.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../../docs/PROJECT_CONTEXT.md", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../docs/MOBILE_DELIVERY_AND_COURIER_UPDATE.md",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../docs/COURIER_MAP_AND_PRINTER_ROUTING_QA.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.equal(COURIER_LOCATION_UPDATE_INTERVAL_MS, 15_000);
  assert.match(sharing, /COURIER_LOCATION_UPDATE_INTERVAL_MS/);
  assert.match(sharing, /data-testid="courier-location-sharing"/);
  assert.match(sharing, /data-testid="courier-location-sharing-start"/);
  assert.match(sharing, /data-testid="courier-location-sharing-stop"/);
  assert.match(sharing, /даже без активного заказа/);
  assert.match(sharing, /Не выключайте геолокацию после доставки/);
  assert.match(context, /after an order becomes `DELIVERED`/);
  assert.match(context, /COURIER_MAP_AND_PRINTER_ROUTING_QA\.md/);
  assert.match(mobileContract, /Завершение доставки не\s+должно останавливать GPS/);
  assert.match(qaContract, /may continue publishing new points after delivery/);
  assert.match(
    qaContract,
    /product\.receiptPrinterIp \?\? category\.receiptPrinterIp/,
  );
});

test("admin and production ingress share the public raster XYZ contract", async () => {
  const adminConfig = await readFile(
    new URL("../src/shared/map/config.ts", import.meta.url),
    "utf8",
  );
  const httpNginx = await readFile(
    new URL("../../../deploy/nginx/alowalow-http-temporary.conf", import.meta.url),
    "utf8",
  );
  const tlsNginx = await readFile(
    new URL("../../../deploy/nginx/alowalow-production.conf", import.meta.url),
    "utf8",
  );
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci-cd.yml", import.meta.url),
    "utf8",
  );

  assert.match(adminConfig, /DEFAULT_TILE_URL = "\/tile\/\{z\}\/\{x\}\/\{y\}\.png"/);
  for (const nginx of [httpNginx, tlsNginx]) {
    assert.match(nginx, /location ~ "\^\/tile\/\(\[0-9\]\{1,2\}\)/);
    assert.match(nginx, /rewrite "\^\/tile\/.+" \/styles\/alowalow\/\$1\/\$2\/\$3\.png break;/);
    assert.match(nginx, /proxy_hide_header Access-Control-Allow-Origin/);
    assert.match(nginx, /Access-Control-Allow-Origin "\*" always/);
  }
  assert.match(workflow, /VITE_MAP_TILE_URL:.*'\/tile\/\{z\}\/\{x\}\/\{y\}\.png'/);
  assert.match(workflow, /sudo systemctl reload nginx/);
});
