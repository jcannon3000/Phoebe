import { Router, type IRouter, type Request, type Response } from "express";

/**
 * GET /api/scripture/passage-text?ref=John 9:18-25 — the passage TEXT as the
 * reader shows it, for the device to keep. (/api/scripture/passage, beside
 * it, serves the bundled public-domain translation by verse.)
 *
 * Every reader in the app opens bible.oremus.org; offline that is a blank
 * page (owner, 2026-09-05: "right now the readers are just black"). This
 * fetches the same page the reader would and returns its text as verse-
 * numbered paragraphs, which the client saves (lib/passageCache) for the
 * coming weeks' lessons, Lectio and Visio readings. The NRSV Anglicized text
 * is oremus's; the version line travels with it and the sheet prints it.
 *
 * Cached in-process for a day (a passage is a passage) and served with a
 * day's public max-age: the same reference asked by thirty devices is one
 * fetch upstream.
 */
const router: IRouter = Router();

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 2000;
const cache = new Map<string, { at: number; value: Passage }>();

export type Passage = { ref: string; paragraphs: string[]; version: string };

function decode(s: string): string {
  return s
    .replace(/&#145;|&#8216;|&lsquo;/g, "‘").replace(/&#146;|&#8217;|&rsquo;/g, "’")
    .replace(/&#147;|&#8220;|&ldquo;/g, "“").replace(/&#148;|&#8221;|&rdquo;/g, "”")
    .replace(/&#151;|&mdash;/g, "—").replace(/&#150;|&ndash;/g, "–")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** oremus's `.bibletext` → paragraphs of "18 The Jews did not…" — verse
 *  numbers kept inline, footnote markers dropped, tags stripped. */
export function parseOremus(html: string): { paragraphs: string[]; version: string } | null {
  const start = html.indexOf('class="bibletext"');
  if (start < 0) return null;
  const open = html.indexOf(">", start);
  const end = html.indexOf('<!-- class="bibletext" -->', open);
  if (open < 0 || end < 0) return null;
  let body = html.slice(open + 1, end);
  body = body.replace(/<a\b[^>]*>\s*<sup class="fnote">[^<]*<\/sup>\s*<\/a>/gi, "");
  body = body.replace(/<sup class="fnote">[^<]*<\/sup>/gi, "");
  const paragraphs = Array.from(body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => decode(m[1]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return null;
  const cite = html.match(/<cite>([^<]+)<\/cite>/i);
  return { paragraphs, version: cite ? decode(cite[1]!.trim()) : "New Revised Standard Version Bible: Anglicized Edition" };
}

async function fetchPassage(ref: string): Promise<Passage | null> {
  const key = ref.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://bible.oremus.org/?passage=${encodeURIComponent(ref)}`, {
      headers: { "User-Agent": UA, Accept: "text/html" }, signal: controller.signal,
    });
    if (!res.ok) return hit?.value ?? null;
    const parsed = parseOremus(await res.text());
    if (!parsed) return hit?.value ?? null;
    const value: Passage = { ref, ...parsed };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/scripture/passage-text", async (req: Request, res: Response): Promise<void> => {
  const ref = String(req.query["ref"] ?? "").replace(/\s+/g, " ").trim();
  // A lectionary reference: letters, digits, spaces, and the punctuation the
  // RCL uses — never a URL or a script.
  if (!ref || ref.length > 120 || !/^[A-Za-z0-9 .:;,()\-–]+$/.test(ref)) {
    res.status(400).json({ error: "A scripture reference is needed." }); return;
  }
  const passage = await fetchPassage(ref);
  if (!passage) { res.status(502).json({ error: "The passage could not be read right now." }); return; }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(passage);
});

export default router;
