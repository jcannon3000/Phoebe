// Best-effort article-title fetcher.
//
// Given a URL, fetch the page and pull a human title from (in order):
//   1. <meta property="og:title">
//   2. <meta name="twitter:title">
//   3. <title>
//
// Used when a feed admin attaches a "Learn more" link to an
// intercession — the resolved title is stored on shared_moments
// .learnMoreTitle and shown above the "Learn more →" pill on the
// slide. Entirely best-effort: any failure (timeout, non-HTML,
// paywall, JS-only page, bad status) resolves to null and the slide
// just shows the bare pill. NEVER throws — callers can `await` it
// without a try/catch and treat null as "no title."
//
// Hardened against the obvious abuse vectors for a server-side
// fetch-by-user-URL:
//   • https/http scheme only, and the host must resolve to a PUBLIC
//     address (SSRF guard) — blocks localhost / private / link-local /
//     cloud-metadata (169.254.169.254) and DNS-rebinding.
//   • 6s timeout via AbortController.
//   • Cap the body read at ~512KB so a huge response can't balloon
//     memory — we only need the <head> anyway.
//   • Only parse when the response declares text/html.
//   • A desktop User-Agent so sites that branch on UA return markup
//     rather than a bot wall.

import { assertPublicHttpUrl } from "./ssrfGuard";

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…");
}

function extractTitle(html: string): string | null {
  // og:title / twitter:title — content attr can come before or after
  // the property attr, so try both orderings.
  const metaPatterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:title["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:title["']/i,
  ];
  for (const re of metaPatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const t = decodeEntities(m[1]).trim();
      if (t.length > 0) return t;
    }
  }
  // <title> fallback.
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    const t = decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
    if (t.length > 0) return t;
  }
  return null;
}

export async function fetchArticleTitle(rawUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // SSRF: block hosts resolving to private / loopback / link-local /
  // cloud-metadata addresses (learnMoreUrl is admin-supplied). Same guard
  // the other user-URL fetchers use; stays null-on-failure (never throws).
  try { await assertPublicHttpUrl(url.toString()); } catch { return null; }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) return null;

    // Read at most MAX_BYTES — the <head> is always near the top, so
    // we don't need the whole document. Falls back to res.text() if
    // the body isn't a readable stream (some runtimes).
    let html = "";
    const body = res.body;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
        // Stop once we've seen </head> or hit the byte cap.
        if (total >= MAX_BYTES || /<\/head>/i.test(html)) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }
    } else {
      html = (await res.text()).slice(0, MAX_BYTES);
    }

    const title = extractTitle(html);
    if (!title) return null;
    // Cap stored length so a pathological <title> can't bloat the row
    // or the slide. 200 chars is plenty for a headline.
    return title.length > 200 ? `${title.slice(0, 197)}…` : title;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
