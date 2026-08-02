import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
