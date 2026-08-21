import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);

const actionHeaders = [
  ["catalog", "../src/widgets/catalog-manager/ui/catalog-manager.tsx"],
  ["marketing", "../src/widgets/marketing-manager/ui/marketing-manager.tsx"],
  ["orders", "../src/widgets/order-board/ui/order-board.tsx"],
  ["staff", "../src/widgets/staff-manager/ui/staff-manager.tsx"],
  ["branch", "../src/widgets/branch-manager/ui/branch-manager.tsx"],
];

test("top-level admin actions share one bordered header surface", async () => {
  for (const [name, relativePath] of actionHeaders) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");

    assert.match(source, new RegExp(`data-testid="${name}-header"`));
    assert.match(source, /className="[^"]*section-header-actions[^"]*"/);
  }

  const styles = await readFile(stylesUrl, "utf8");
  assert.match(
    styles,
    /\.header-actions\.section-header-actions\s*\{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 14px;/s,
  );
});

test("security journal exposes stable grouped filter controls", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/login-attempt-manager/ui/login-attempt-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  for (const testId of [
    "login-attempt-manager",
    "login-attempt-summary",
    "login-attempt-filters",
    "login-attempt-phone",
    "login-attempt-status",
    "login-attempt-platform",
    "login-attempt-from",
    "login-attempt-to",
    "login-attempt-reset",
    "login-attempt-table-card",
  ]) {
    assert.match(source, new RegExp(`data-testid="${testId}"`));
  }

  assert.match(source, /<span>Начало периода<\/span>/);
  assert.match(source, /<span>Конец периода<\/span>/);
  assert.match(source, /className="table-card login-attempt-table"/);
});

test("summary and filter layouts collapse cleanly for tablet and phone", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.login-attempt-summary\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.login-attempt-summary\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.login-attempt-filter-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
});
