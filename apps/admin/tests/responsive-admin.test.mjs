import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableSourceUrl = new URL(
  "../src/shared/ui/data-table.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);

test("shared data tables expose readable labels to responsive rows", async () => {
  const source = await readFile(tableSourceUrl, "utf8");

  assert.match(source, /data-label=\{responsiveLabel/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /--data-table-min-width/);
  assert.match(source, /variant\?: "default" \| "orders"/);
});

test("admin tables avoid nested horizontal scrolling on constrained screens", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /table-layout: auto;/);
  assert.match(styles, /container-name: admin-data-table;/);
  assert.match(styles, /@container admin-data-table \(max-width: 760px\)/);
  assert.match(
    styles,
    /@container admin-data-table \(max-width: 760px\)[\s\S]*?\.data-table--orders\s*\{/,
  );
  assert.doesNotMatch(
    styles,
    /@container admin-data-table \(max-width: 1200px\)/,
  );
  assert.match(styles, /height: max-content;/);
  assert.match(styles, /content: attr\(data-label\);/);
  assert.match(
    styles,
    /\.split-tables\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
  );
});

test("tablet navigation is a touch-safe drawer", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.integrated-shell \.sidebar\s*\{[^}]*visibility: hidden;[^}]*pointer-events: none;[^}]*transform: translateX\(-105%\);/,
  );
  assert.match(
    styles,
    /\.integrated-shell \.sidebar\.drawer-open\s*\{[^}]*visibility: visible;[^}]*pointer-events: auto;[^}]*transform: translateX\(0\);/,
  );
  assert.match(
    styles,
    /@media \(pointer: coarse\)[\s\S]*?\.integrated-shell button,[\s\S]*?min-height: 44px;[^}]*touch-action: manipulation;/,
  );
});

test("tablet drawer controls expose stable automation hooks", async () => {
  const dashboard = await readFile(
    new URL(
      "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(dashboard, /data-testid="admin-navigation-toggle"/);
  assert.match(dashboard, /data-testid="admin-navigation-scrim"/);
  assert.match(dashboard, /type="button"[\s\S]*?admin-navigation-toggle/);
});

test("order kanban wraps at desktop, tablet, and phone breakpoints", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.order-kanban\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.order-kanban\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.order-kanban\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(
    styles,
    /\.courier-screen \.order-kanban\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
  );
});
