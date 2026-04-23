/* Phoebe service worker.
 *
 * Goal: survive a flaky / captive-portal network. If the user has loaded
 * the app once, a later visit on bad Wi-Fi should still render the shell
 * from cache instead of showing Safari's "Can't establish secure
 * connection" page.
 *
 * Caching strategy:
 *   - Navigation requests (HTML)       → network-first, fall back to cached /.
 *   - Same-origin static assets (JS, CSS, fonts, images): stale-while-revalidate.
 *   - /api/* requests                 → passthrough (never cache).
 *   - Cross-origin fonts.googleapis /  fonts.gstatic → stale-while-revalidate.
 *
 * We bump CACHE_VERSION whenever the contract changes so old caches get
 * purged on activate. Build-hash-based cache keys would be stricter but
 * would require template substitution at build time; this version bump
 * is simpler and adequate for the "network degraded" scenario.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `phoebe-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `phoebe-assets-${CACHE_VERSION}`;
const SHELL_URLS = ["/", "/index.html", "/favicon.svg"];

self.addEventListener("install", (event) => {
  // Warm the shell cache with the app's HTML. We don't block on it —
  // if the first install happens on already-bad Wi-Fi, we'd rather not
  // hold up activation.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Is this a same-origin asset we should cache? Matches vite's hashed
// files under /assets/, plus fonts and top-level icon/image files.
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/assets/")) return true;
  if (/\.(?:js|mjs|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(url.pathname)) return true;
  return false;
}

function isGoogleFonts(url) {
  return url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API traffic — we never want a stale cached
  // /api/prayer-requests response served to a logged-in user.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigation requests: prefer live HTML, fall back to cached shell
  // if the network is down. We also cache the successful response so
  // future visits have a warm shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const copy = net.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy).catch(() => undefined));
          return net;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match("/")) ?? (await cache.match("/index.html"));
          if (cached) return cached;
          // Last-ditch: synthesize a minimal offline page. We won't
          // reach here once the shell has been cached at least once.
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title><style>body{font-family:system-ui;padding:40px;color:#2C1810;background:#FAF6F0}</style><h1>Offline</h1><p>Check your connection and try again.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // Same-origin assets / Google Fonts: stale-while-revalidate.
  if (isCacheableAsset(url) || isGoogleFonts(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            // Only cache successful, basic/opaque responses. Opaque
            // (CORS-less cross-origin) responses still work for <link>
            // and <script> tags via the HTTP cache.
            if (res && (res.ok || res.type === "opaque")) {
              cache.put(req, res.clone()).catch(() => undefined);
            }
            return res;
          })
          .catch(() => null);
        return cached ?? (await networkPromise) ?? new Response("", { status: 504 });
      })(),
    );
    return;
  }

  // Everything else: passthrough.
});
