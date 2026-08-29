// Taizé meditations — the source behind Phoebe's first INBOX practice.
//
// Owner: "what about creating a way with these weekly reflections? … it could
// go into your routine, and if you finish it, it goes into done, and then you
// don't have it until the next one is posted. But say you didn't do it that
// day, they have the next day as well. Kind of like an inbox."
//
// WHY AN INBOX AND NOT A DAILY. Every other practice in Phoebe is scoped to a
// day: it appears in the morning and it is gone at midnight whether or not you
// kept it. That is right for prayer and wrong for a piece of writing someone
// published on Thursday. Measured on their own index, the meditations arrive
// irregularly — 27 Aug, 13 Aug, 6 Aug, 30 Jul, 23 Jul, 16 Jul — so "this
// week's" cannot be computed from a date at all. The only honest question is
// "has a new one been posted since the last one this person read", which is
// what the client tracks against the `id` below.
//
// Taizé publishes no feed (their SPIP backend is 410 and no RSS alternate is
// declared), but the index IS server-rendered — each meditation is an
// <article> carrying a slug, an <h2>/<h3> title and a long-form date. So this
// parses the index rather than a feed, and does it here rather than on-device
// so one fetch serves everyone and no phone is scraping a monastery's website.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const INDEX_URL = "https://www.taize.fr/en/tag/meditations";
const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export type TaizeMeditation = {
  /** The slug — stable, and what "have they read THIS one" is keyed on. */
  id: string;
  title: string;
  url: string;
  /** YYYY-MM-DD, so the client can say how long it has been waiting. */
  published: string | null;
};

let cache: { at: number; value: TaizeMeditation[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

function parse(html: string): TaizeMeditation[] {
  const out: TaizeMeditation[] = [];
  // Split on <article>, which is what each meditation is wrapped in. The
  // title and date sit several hundred characters past the link (a <picture>
  // block comes between), so a single regex over the whole page misses them —
  // it found nothing at all until this was split per block.
  const blocks = html.split(/<article\b/).slice(1);
  for (const b of blocks) {
    const slug = /href="\/en\/([a-z0-9-]+)"/.exec(b);
    const heading = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/.exec(b);
    const date = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(\w+),\s+(20\d\d)/.exec(b);
    if (!slug || !heading) continue;
    const title = heading[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title) continue;
    let published: string | null = null;
    if (date) {
      const m = MONTHS.indexOf((date[2] ?? "").toLowerCase());
      if (m >= 0) {
        published = `${date[3]}-${String(m + 1).padStart(2, "0")}-${String(Number(date[1])).padStart(2, "0")}`;
      }
    }
    out.push({ id: slug[1]!, title, url: `https://www.taize.fr/en/${slug[1]}`, published });
  }
  return out;
}

export async function taizeMeditations(): Promise<TaizeMeditation[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(INDEX_URL, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`taize ${res.status}`);
    const list = parse(await res.text());
    // Never cache an empty parse: if their markup changes, we want the next
    // request to try again rather than serve nothing for half an hour.
    if (list.length > 0) cache = { at: Date.now(), value: list };
    return list;
  } catch {
    return cache?.value ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/taize/latest → the newest meditation, or 204 when none parsed.
// Public, no auth. The CLIENT decides whether it is unread; the server only
// ever says what the newest one IS.
router.get("/taize/latest", async (_req: Request, res: Response): Promise<void> => {
  const list = await taizeMeditations();
  res.setHeader("Cache-Control", "public, max-age=900");
  if (list.length === 0) { res.status(204).end(); return; }
  res.json(list[0]);
});

// GET /api/taize/meditations → the index, newest first.
router.get("/taize/meditations", async (_req: Request, res: Response): Promise<void> => {
  const list = await taizeMeditations();
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(list);
});

export default router;
