import { defineConfig } from "vite";
import path from "path";

// This Vite config builds ONLY the native-shell bootstrap into a single
// self-contained IIFE at `dist/native-shell.js`. scripts/compose-www.mjs
// copies that file into `www/` alongside the mymonastery production bundle
// and injects a <script> tag into index.html to invoke it.
//
// Keeping this separate from mymonastery's Vite config means the web app's
// bundle never pulls in Capacitor packages (they're only used on native).
export default defineConfig({
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // IIFE so the file can be dropped into any HTML with a single <script>
    // tag. We don't need ESM here — it's a top-level bootstrap, not a lib.
    lib: {
      entry: path.resolve(import.meta.dirname, "src/native-shell.ts"),
      name: "PhoebeNativeShell",
      formats: ["iife"],
      fileName: () => "native-shell.js",
    },
    rollupOptions: {
      // Capacitor plugins check for window.Capacitor at runtime, so we let
      // them be bundled in directly. No externals needed.
      output: { extend: true },
    },
    // Keep the bundle small — no tree-shaking of Capacitor plugins is
    // necessary because most of them are thin JS bridges into Swift.
    minify: "esbuild",
    sourcemap: true,
    target: "es2020",
  },
});
