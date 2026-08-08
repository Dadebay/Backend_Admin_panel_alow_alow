import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientHtmlUrl = new URL("../dist/client/index.html", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);

test("builds a static React entry document", async () => {
  const html = await readFile(clientHtmlUrl, "utf8");

  assert.match(html, /<div id="root" data-testid="admin-root">/);
  assert.match(html, /A7-tagam — центр управления доставкой/);
  assert.match(html, /\/a7-tagam-logo\.png/);
  assert.match(html, /\/a7-tagam-logo\.webp/);
  assert.match(
    html,
    /Администрирование заказов, кухни, курьеров, каталога, промокодов и наличных/,
  );
  assert.match(html, /<script type="module" crossorigin src="\/assets\/.+\.js">/);
  assert.doesNotMatch(html, /_next|__next|vinext|react-server-dom/);
});

test("Sites adapter only forwards requests to static assets", async () => {
  const { default: worker } = await import(workerUrl.href);
  const request = new Request("https://admin.example/courier");
  let forwardedRequest;

  const response = await worker.fetch(request, {
    ASSETS: {
      async fetch(value) {
        forwardedRequest = value;
        return new Response("static-spa", {
          headers: { "content-type": "text/html" },
        });
      },
    },
  });

  assert.equal(forwardedRequest, request);
  assert.equal(await response.text(), "static-spa");
});

test("Nginx serves browser routes through the SPA entry document", async () => {
  const config = await readFile(
    new URL("../nginx.conf", import.meta.url),
    "utf8",
  );

  assert.match(config, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.doesNotMatch(config, /proxy_pass|fastcgi_pass/);
});
