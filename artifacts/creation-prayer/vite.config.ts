import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// The Creation Prayer app — a standalone frontend that REUSES the Phoebe
// components from ../mymonastery/src. The "@" alias therefore points at the
// shared Phoebe source (so those components' own "@/…" imports resolve), and
// "@cp" is this app's own small source (its App + home). It runs on the same
// Phoebe Railway backend: dev proxies /api to production; the packaged app
// reaches /api via CapacitorHttp exactly like the Phoebe app.

const MYMON = path.resolve(import.meta.dirname, "..", "mymonastery", "src");
const rawPort = process.env.PORT ?? "24010";
const port = Number(rawPort);
const API_TARGET = process.env.CP_API_TARGET ?? "https://withphoebe.app";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": MYMON,
      "@cp": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@radix-ui")) return "vendor-radix";
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    // The CP app runs on the Phoebe Railway backend — proxy API calls there.
    proxy: { "/api": { target: API_TARGET, changeOrigin: true, secure: true } },
  },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});
