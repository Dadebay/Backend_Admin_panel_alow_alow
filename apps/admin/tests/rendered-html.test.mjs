import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href);

async function render(pathname = "/") {
  const { default: worker } = await workerPromise;
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the protected AlowAlow operations shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /AlowAlow — центр управления доставкой/);
  assert.match(html, /Проверяем защищённую сессию/);
  assert.match(
    html,
    /Администрирование заказов, кухни, курьеров, каталога, промокодов и наличных/,
  );
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("server-renders the courier tracking route", async () => {
  const response = await render("/courier");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Проверяем сессию/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});
