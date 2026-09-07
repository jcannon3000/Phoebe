import { Router, type IRouter, type Request, type Response } from "express";

/**
 * GET /api/reader/page?url=… — one reading's PAGE, for the device to keep.
 *
 * Owner (2026-09-06): "no you should not be extracting text, that's a
 * copyright issue … you should have the page downloaded just like how Safari
 * mobile has a read later, then overlay the reader over the saved page, and
 * get the same result."
 *
 * So this is a proxy, not a parser: it returns the publisher's page as sent,
 * and the device keeps it the way a browser keeps a page for reading later.
 * The reader that runs over the live page then runs over the saved one, which
 * is why the offline reading looks identical — it is the same code over the
 * same page.
 *
 * Only the hosts Phoebe's reader already opens, so this cannot be turned into
 * a general-purpose fetcher: the same list BibleWebViewController.
 * isReaderHostName keeps (oremus, SSJE, Nouwen, Forward Movement, Sojourners).
 */
const router: IRouter = Router();

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const READER_HOSTS = ["oremus.org", "ssje.org", "henrinouwen.org", "forwardmovement.org", "sojo.net"];
const MAX_BYTES = 3 * 1024 * 1024;
/** Per-asset and total budgets for what gets inlined into the saved page. */
const MAX_ASSET_BYTES = 512 * 1024;
const MAX_INLINE_TOTAL = 1.5 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 400;

const cache = new Map<string, { at: number; html: string }>();

function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return READER_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * INLINE WHAT THE PAGE NEEDS TO LOOK LIKE ITSELF.
 *
 * The reader loads the saved page with its own URL as base, so relative links
 * resolve — but offline nothing can be FETCHED, and oremus's whole appearance
 * (the red masthead, the serif, the checkboxes) lives in four stylesheets it
 * links. Saved without them, "Standard" offline is unstyled HTML, which is
 * exactly what the owner said must not happen: "if I hit Standard I should see
 * the actual oremus page."
 *
 * So the stylesheets — and any small images and scripts — travel INSIDE the
 * saved page. Budgeted, and best-effort per asset: one that can't be fetched
 * simply stays a link, which is no worse than before.
 */
async function inlineAssets(html: string, pageUrl: string, signal: AbortSignal): Promise<{ html: string; missed: number }> {
  let budget = MAX_INLINE_TOTAL;
  const get = async (rawHref: string): Promise<{ text: string; bytes: number; type: string } | null> => {
    if (budget <= 0) return null;
    let target: URL;
    try { target = new URL(rawHref, pageUrl); } catch { return null; }
    if (target.protocol !== "https:" || !allowedHost(target.hostname)) return null;
    try {
      const res = await fetch(target.toString(), { headers: { "User-Agent": UA }, signal });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_ASSET_BYTES || buf.byteLength > budget) return null;
      budget -= buf.byteLength;
      return { text: buf.toString("utf8"), bytes: buf.byteLength, type: res.headers.get("content-type")?.split(";")[0] ?? "" };
    } catch { return null; }
  };

  /**
   * HOW MANY ASSETS WE COULD NOT INLINE. A page whose stylesheets timed out
   * still LOOKS like a page: it was cached for a day and every phone that
   * saved that reading in the next 24 hours got a permanently half-styled
   * copy — and "Standard" showing unstyled markup is precisely what the owner
   * called out. The caller refuses to cache a page with misses.
   */
  let missed = 0;

  // Stylesheets → <style>, in place, so the cascade keeps its order.
  const links = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map((m) => m[0]);
  for (const tag of links) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const media = tag.match(/media\s*=\s*["']([^"']+)["']/i)?.[1];
    const asset = await get(href);
    if (!asset) { missed++; continue; }
    // A FUNCTION, not a string: `$&`, "$`" and `$'` inside fetched CSS/JS are
    // substitution patterns to String.replace and would corrupt the asset.
    // oremus has no `$` today; the allowlist also carries jQuery-era pages
    // where `$(…)` is on every line.
    html = html.replace(tag, () => `<style${media ? ` media="${media}"` : ""}>\n${asset.text}\n</style>`);
  }

  // Scripts the page loads for itself (oremus's dark-mode toggle lives in one).
  // The closing tag may sit far from the opening one (oremus's overlib script
  // has a newline and a comment between), so match the OPENING tag and swap
  // just that, leaving the </script> where it is.
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi));
  for (const [tag, src] of scripts) {
    const asset = await get(src!);
    if (!asset) { missed++; continue; }
    html = html.replace(tag, () => `<script>\n${asset.text}\n//`);
  }

  // Images, as data URIs — oremus has none today, but SSJE and Nouwen do.
  const imgs = Array.from(html.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi));
  for (const [tag, src] of imgs) {
    if (!src || src.startsWith("data:")) continue;
    let target: URL;
    try { target = new URL(src, pageUrl); } catch { continue; }
    if (target.protocol !== "https:" || !allowedHost(target.hostname)) continue;
    if (budget <= 0) break;
    try {
      const res = await fetch(target.toString(), { headers: { "User-Agent": UA }, signal });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_ASSET_BYTES || buf.byteLength > budget) continue;
      budget -= buf.byteLength;
      const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      html = html.replace(tag, tag.replace(src, `data:${type};base64,${buf.toString("base64")}`));
    } catch { /* leave the link */ }
  }
  return { html, missed };
}

router.get("/reader/page", async (req: Request, res: Response): Promise<void> => {
  const raw = String(req.query["url"] ?? "").trim();
  let target: URL;
  try { target = new URL(raw); } catch { res.status(400).json({ error: "A page URL is needed." }); return; }
  if (target.protocol !== "https:" || !allowedHost(target.hostname)) {
    res.status(400).json({ error: "That page isn't one Phoebe's reader opens." });
    return;
  }
  const key = target.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json({ url: key, html: hit.html });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(key, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: controller.signal });
    if (!upstream.ok) { res.status(502).json({ error: "That page could not be read right now." }); return; }
    const { html, missed } = await inlineAssets(await upstream.text(), key, controller.signal);
    // A page, not a download: anything this large is not a reading.
    if (!html || html.length > MAX_BYTES) { res.status(502).json({ error: "That page could not be read right now." }); return; }
    /**
     * A HALF-INLINED PAGE IS NOT SAVED — not here for a day, and not on the
     * phone. One slow moment mid-inline used to be baked into the day cache
     * and handed to every device that saved that reading, permanently
     * half-styled, and nothing on either side ever checked. `partial` tells
     * the client not to store it; the page is still returned, because a
     * reader who is on the network right now can perfectly well read it.
     */
    if (missed === 0) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), html });
      res.setHeader("Cache-Control", "public, max-age=86400");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    res.json({ url: key, html, ...(missed > 0 ? { partial: true } : {}) });
  } catch {
    if (hit) { res.setHeader("Cache-Control", "public, max-age=300"); res.json({ url: key, html: hit.html }); return; }
    res.status(502).json({ error: "That page could not be read right now." });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
