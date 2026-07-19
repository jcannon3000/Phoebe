import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "23896";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
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
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
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
        // Split the heaviest, leaf-level dependencies into their own
        // vendor chunks (frontend audit). These libs change far less
        // often than app code, so a separate hashed chunk stays cached
        // across deploys — on a repeat visit after an app update the
        // browser re-downloads only the small app chunk, not framer-
        // motion / radix again. Matters most for a daily-habit app
        // where repeat opens dominate.
        //
        // framer-motion and @radix-ui are leaf libraries (they depend on
        // react, nothing depends on them) so there's no chunk-ordering
        // risk. The React runtime (react + react-dom + scheduler + the JSX
        // runtime) is carved into ONE chunk — grouped so it's never SPLIT
        // apart, which is the only load-order hazard; the whole unit loads
        // before app code that imports it, exactly as before. React and
        // @tanstack/react-query change far less often than app code, so on
        // a repeat open after a routine deploy the browser re-downloads
        // only the small app chunk, not ~55–60 KB gzip of framework.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("/react-dom/") || id.includes("/scheduler/") || /\/react\//.test(id)) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
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
