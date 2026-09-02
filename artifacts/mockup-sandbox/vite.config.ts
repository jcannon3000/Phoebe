import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

/**
 * PORT AND BASE_PATH ARE REQUIRED TO SERVE, NOT TO BUILD — and throwing here
 * for a missing PORT broke the Railway deploy.
 *
 * Railway's build step runs `pnpm -r --if-present run build` from the repo
 * root, which builds EVERY workspace, this sandbox included. Neither variable
 * is set in that environment, so this file threw while Vite was still loading
 * its config — before a single module was compiled — and took the whole
 * deploy down with it. Nothing about the app was wrong; a sandbox nobody
 * deploys refused to be built.
 *
 * `port` is only ever read by the dev server and the preview server below, so
 * it cannot affect build output: it falls back, and an explicitly INVALID
 * value is still an error, because that is a mistake worth hearing about.
 * `basePath` does affect output, so it keeps its meaning and defaults to "/"
 * — the correct base for a sandbox served from a root, and harmless for a
 * build that is never shipped.
 */
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5175;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    mockupPreviewPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
