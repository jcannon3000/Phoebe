// Capture App Store-quality screenshots of withphoebe.app at iPhone
// Pro Max dimensions (1290×2796), signed in as the review account.
// Output goes to /screenshots/*.png in the repo root.
//
// Usage:
//   node scripts/capture-screenshots.mjs            (capture all)
//   node scripts/capture-screenshots.mjs dashboard  (capture one)
//
// The screenshots are real renders of the same web bundle that ships
// inside the iOS WebView, so what Apple's reviewer sees on iPhone is
// effectively what these PNGs show. Apple accepts non-device-framed
// screenshots at the right pixel size.

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_ROOT, "screenshots");

// 6.7" iPhone (Pro Max) — Apple's required screenshot size for that
// device class. We render at the device's logical viewport (430×932)
// at 3× scale so the PNG comes out as 1290×2796.
const VIEWPORT = { width: 430, height: 932 };
const DEVICE_SCALE = 3;

const BASE = "https://withphoebe.app";
const EMAIL = "review@withphoebe.app";
const PASSWORD = "Preview26";

const SHOTS = [
  { id: "01-dashboard",  path: "/dashboard",   waitFor: ".dash-shell, [data-dash-ready]" },
  { id: "02-prayer-list", path: "/prayer-list", waitFor: "h1, h2" },
  { id: "03-people",     path: "/people",      waitFor: "h1, h2" },
];

async function login(page) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // Wait for the email/password form. Some flows route logged-in
  // sessions straight to /dashboard, so we tolerate either.
  if (page.url().includes("/dashboard")) return;
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function main() {
  const onlyId = process.argv[2];
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPhone 15 Pro Max"].userAgent,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  console.log("Signing in as", EMAIL, "...");
  await login(page);
  console.log("Signed in. Capturing screenshots →", OUT_DIR);

  for (const shot of SHOTS) {
    if (onlyId && shot.id !== onlyId) continue;
    console.log("  →", shot.id, shot.path);
    await page.goto(BASE + shot.path, { waitUntil: "networkidle" });
    // Belt-and-suspenders settle: wait for some signal of mount, then
    // wait an extra beat for fonts and animations to land in their
    // resting state so the still-frame doesn't catch a fade-in.
    try {
      await page.waitForSelector(shot.waitFor, { timeout: 8000 });
    } catch { /* not all pages have the same skeleton */ }
    await page.waitForTimeout(1200);
    const file = resolve(OUT_DIR, `${shot.id}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("    ✓", file);
  }

  await browser.close();
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
