#!/usr/bin/env node
// Compose the Capacitor webDir (`www/`) from the mymonastery production
// build + our native shell. This script is the glue that keeps the web
// app unaware of the native shell:
//
//   1. Copy artifacts/mymonastery/dist/public/ → www/
//   2. Copy artifacts/phoebe-mobile/dist/native-shell.js → www/
//   3. Copy artifacts/phoebe-mobile/src/native.css → www/
//   4. Inject <script>/<link> tags into www/index.html so both load
//      before the mymonastery bundle runs.
//   5. Patch the <meta name="viewport"> tag to include viewport-fit=cover
//      (required for WKWebView to provide safe-area-inset values).
//   6. Add class="platform-ios" to <html> for iOS-only CSS scoping.
//
// On any failure we exit non-zero so CI/local builds halt loudly.

import { cp, mkdir, rm, readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..", "..");

const WEB_DIST = path.join(repoRoot, "artifacts/mymonastery/dist/public");
const SHELL_DIST = path.join(root, "dist/native-shell.js");
const SHELL_MAP = path.join(root, "dist/native-shell.js.map");
const NATIVE_CSS = path.join(root, "src/native.css");
const WWW = path.join(root, "www");

async function assertExists(p, label) {
  try {
    await access(p);
  } catch {
    console.error(`[compose-www] Missing ${label}: ${p}`);
    console.error("Run `pnpm --filter @workspace/phoebe-mobile build` which chains the steps in order.");
    process.exit(1);
  }
}

async function main() {
  // Prerequisites ─────────────────────────────────────────────────────────
  await assertExists(WEB_DIST, "mymonastery build output");
  await assertExists(SHELL_DIST, "phoebe-mobile native shell build");
  await assertExists(NATIVE_CSS, "phoebe-mobile native.css");

  // Fresh www/ ─────────────────────────────────────────────────────────────
  if (existsSync(WWW)) await rm(WWW, { recursive: true });
  await mkdir(WWW, { recursive: true });

  // 1. Copy the web build verbatim. Preserves hashed asset filenames so
  // the references in index.html keep working.
  await cp(WEB_DIST, WWW, { recursive: true });

  // 2. Copy the native shell JS + source map.
  await cp(SHELL_DIST, path.join(WWW, "native-shell.js"));
  if (existsSync(SHELL_MAP)) {
    await cp(SHELL_MAP, path.join(WWW, "native-shell.js.map"));
  }

  // 3. Copy native.css.
  await cp(NATIVE_CSS, path.join(WWW, "native.css"));

  // 4. Patch index.html ────────────────────────────────────────────────────
  const indexPath = path.join(WWW, "index.html");
  let html = await readFile(indexPath, "utf-8");

  // Add platform class to <html>. WKWebView + Capacitor don't set a UA
  // marker we can rely on, so we do it at bootstrap in native-shell.ts —
  // but adding it inline as a class on <html> means the CSS applies from
  // the first paint, avoiding a flicker.
  html = html.replace(/<html\b([^>]*)>/i, (_m, attrs) => {
    if (/class\s*=/.test(attrs)) {
      return `<html${attrs.replace(/class\s*=\s*"([^"]*)"/, (_, cls) => `class="${cls} platform-ios"`)}>`;
    }
    return `<html${attrs} class="platform-ios">`;
  });

  // Add viewport-fit=cover. mymonastery's viewport meta is
  // `width=device-width, initial-scale=1.0, maximum-scale=1` — we append
  // the missing fragment without disturbing the rest.
  html = html.replace(
    /<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']\s*\/?>/i,
    (_m, content) => {
      if (/viewport-fit\s*=/.test(content)) return _m;
      return `<meta name="viewport" content="${content.trim().replace(/,\s*$/, "")}, viewport-fit=cover" />`;
    }
  );

  // Add our native.css BEFORE any mymonastery <link rel="stylesheet">
  // so mymonastery's cascade wins when they collide, EXCEPT for rules
  // scoped to `.platform-ios` (those are authored specifically to
  // override). Injecting first + higher specificity gives us the right
  // precedence.
  const nativeCssLink = '<link rel="stylesheet" href="/native.css" />';
  if (!html.includes("/native.css")) {
    html = html.replace(/<\/head>/i, `    ${nativeCssLink}\n  </head>`);
  }

  // Inject the native shell as the FIRST script in <body>, before the
  // mymonastery bundle loads. It registers listeners synchronously so
  // any events the app fires during startup are caught.
  const shellScript = '<script src="/native-shell.js"></script>';
  if (!html.includes("/native-shell.js")) {
    html = html.replace(/<body(\b[^>]*)>/i, match => `${match}\n    ${shellScript}`);
  }

  await writeFile(indexPath, html, "utf-8");

  console.log("[compose-www] www/ built.");
  console.log(`[compose-www]   source:  ${path.relative(repoRoot, WEB_DIST)}`);
  console.log(`[compose-www]   target:  ${path.relative(repoRoot, WWW)}`);
  console.log("[compose-www]   next:    pnpm --filter @workspace/phoebe-mobile cap:sync");
}

main().catch(err => {
  console.error("[compose-www] Failed:", err);
  process.exit(1);
});
