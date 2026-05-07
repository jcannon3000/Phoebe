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

const CACHE_VERSION = "v2";
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

// ─── Web Push (VAPID) ───────────────────────────────────────────────────────
// The server posts an encrypted JSON payload here when it's time to
// remind the user. We unwrap it and show a system notification — same
// lock-screen UX Android Chrome users get from native apps. Tap →
// notificationclick handler focuses an existing tab if there is one,
// otherwise opens a new one at the deep-link path.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    // Server should always send JSON. If we somehow get plain text,
    // fall back to showing the bare string so the user gets *something*
    // rather than a silent dropped notification.
    data = { title: "Phoebe", body: event.data.text(), path: "/" };
  }

  const title = data.title || "Phoebe";
  const options = {
    body: data.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    // tag groups duplicates — second push with same tag replaces the
    // first instead of stacking. Mirrors APNs collapse-id semantics.
    tag: data.tag || data.threadId || undefined,
    // Custom data threaded through to notificationclick so we know
    // where to deep-link.
    data: { path: data.path || "/" },
    // requireInteraction=false keeps Android's default behavior
    // (auto-dismisses after a few seconds). The bell isn't urgent
    // enough to camp on the lock screen.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.path) || "/";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer focusing an existing Phoebe tab — opening a fresh tab
      // every time a notification is tapped would litter the user's
      // browser. We navigate the existing tab to the deep-link path so
      // the in-app router lands on the right page.
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch { /* cross-origin nav not allowed; ignore */ }
          }
          return;
        }
      }
      // No existing tab — open a new one.
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// Fired when the push service rotates a subscription (rare but
// happens, especially on Firefox). We can't re-register from the
// service worker since we don't have the user's session — log it so
// the next page load picks it up via the WebPushPermissionPrompt
// re-registration check.
self.addEventListener("pushsubscriptionchange", (event) => {
  console.warn("[sw] pushsubscriptionchange — subscription rotated, awaiting re-register on next visit");
});
