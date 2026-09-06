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
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 400;

const cache = new Map<string, { at: number; html: string }>();

function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return READER_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
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
    const html = await upstream.text();
    // A page, not a download: anything this large is not a reading.
    if (!html || html.length > MAX_BYTES) { res.status(502).json({ error: "That page could not be read right now." }); return; }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), html });
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json({ url: key, html });
  } catch {
    if (hit) { res.setHeader("Cache-Control", "public, max-age=300"); res.json({ url: key, html: hit.html }); return; }
    res.status(502).json({ error: "That page could not be read right now." });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
