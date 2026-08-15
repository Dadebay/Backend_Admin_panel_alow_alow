import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_date: "2026-07-29",
  assets: {
    binding: "ASSETS",
    not_found_handling: "single-page-application",
  },
} as const;

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    build: {
      rollupOptions: {
        output: {
          // Turkmen Telecom's HTTP filter resets requests whose URL contains
          // the literal word "runtime". Keep production chunk paths opaque so
          // React's jsx-runtime chunk remains reachable before HTTPS is ready.
          chunkFileNames: "assets/chunk-[hash].js",
        },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    server: {
      watch: {
        ...(isCodexSeatbeltSandbox
          ? { useFsEvents: false, usePolling: true }
          : {}),
      },
    },
    plugins: [
      react(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "server" },
        config: localBindingConfig,
      }),
    ],
  };
});
