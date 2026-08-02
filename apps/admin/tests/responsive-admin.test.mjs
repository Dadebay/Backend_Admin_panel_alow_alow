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
  assert.match(
    styles,
    /@container admin-data-table \(max-width: 760px\)/,
  );
  assert.match(styles, /height: max-content;/);
  assert.match(styles, /content: attr\(data-label\);/);
  assert.match(
    styles,
    /\.split-tables\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
  );
});

test("mobile navigation and cash tabs do not require horizontal scrolling", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.integrated-shell \.main-nav\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*overflow: visible;/s,
  );
  assert.match(
    styles,
    /\.cash-tabs\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*overflow: visible;/s,
  );
});
