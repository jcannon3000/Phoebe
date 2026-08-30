// Joan Chittister's weekly, as an INBOX source.
//
// Owner: "https://www.joanchittister.org/pages/newsletters try to integrate the
// weekly here."
//
// THE INBOX SHAPE IS TAIZÉ'S, deliberately (see routes/taize.ts and
// lib/taizeInbox.ts). A weekly piece of writing is not day-scoped: missing
// Tuesday does not mean you owe it on Wednesday, it means it is still there.
// So the server only ever says what the newest one IS, and the client tracks
// whether this person has read THAT id.
//
// This one is a REAL FEED, which is the difference from Taizé — that has no
// feed at all and its index has to be parsed. Chittister's weekly comes from
// the Benetvision Mailchimp archive feed: her newsletters page is a SUBSCRIBE
// form with no archive, and the "Teachings" Shopify blog last published in
// February 2025, so neither is the weekly. The public campaign archive is, and
// it carries every send.
//
// (The National Cathedral's sermons were a second source here and were removed
// at the owner's word — "let take out the catheral sermon actually" — after
// the reader over them was working. The RSS reader below is still written for
// more than one feed because that cost nothing and the next source will want
// it.)

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";
const TTL_MS = 30 * 60 * 1000;

export type WeeklyReading = {
  /** Stable identity — what "have they read THIS one" is keyed on. */
  id: string;
  title: string;
  url: string;
  /** YYYY-MM-DD, so the client can say how long it has been waiting. */
  published: string | null;
};

// ── A very small RSS reader ──────────────────────────────────────────────────
// Both feeds are ordinary RSS 2.0: <item> with <title>, <link>, <pubDate>.
// Titles arrive CDATA-wrapped from Mailchimp and entity-escaped from
// WordPress, so both are handled.

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1] ?? "") : null;
}

/** YYYY-MM-DD in UTC from an RFC-822 pubDate, or null. */
function ymdOf(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function parseRss(xml: string): Array<WeeklyReading & { pubDate: string | null }> {
  const out: Array<WeeklyReading & { pubDate: string | null }> = [];
  for (const raw of xml.split(/<item[\s>]/).slice(1)) {
    const block = raw.slice(0, raw.indexOf("</item>") + 1 || undefined);
    const title = tag(block, "title");
    // <link> in RSS is a text node; Mailchimp and WordPress both use that form.
    const link = tag(block, "link");
    const guid = tag(block, "guid");
    const pubDate = tag(block, "pubDate");
    if (!title || !link) continue;
    out.push({ id: guid || link, title, url: link, published: ymdOf(pubDate), pubDate });
  }
  return out;
}

async function fetchFeed(url: string): Promise<Array<WeeklyReading & { pubDate: string | null }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return parseRss(await res.text());
  } finally {
    clearTimeout(timeout);
  }
}

const caches = new Map<string, { at: number; value: WeeklyReading[] }>();

async function cached(key: string, load: () => Promise<WeeklyReading[]>): Promise<WeeklyReading[]> {
  const hit = caches.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const list = await load();
    // Never cache an empty parse — if a feed's shape changes we want the next
    // request to try again rather than serve nothing for half an hour.
    if (list.length > 0) caches.set(key, { at: Date.now(), value: list });
    return list;
  } catch {
    return hit?.value ?? [];
  }
}

// ── Joan Chittister · Vision & Viewpoint ─────────────────────────────────────
//
// The archive carries EVERY Benetvision send, not just the weekly: book
// promotions, "Your August Monastic Way Issue is Here", webinar notices. Those
// are not a reflection and must not become someone's practice.
//
// Two filters, and the date one is the reliable half. Measured across the
// archive: Vision & Viewpoint goes out on MONDAYS (08/24, 08/17, 08/10, 08/03,
// 07/27, 07/20 …) and the promotional sends land on other days (Tue 08/18, Fri
// 08/07, Wed 07/29). The title filter is a second line of defence for a promo
// that happens to fall on a Monday — it drops the shapes the archive actually
// uses rather than guessing at spam-like words.
const CHITTISTER_FEED =
  "https://us6.campaign-archive.com/feed?u=0bcd62516ffe48a23a1231c56&id=5f9ddc560c";

const PROMO_SHAPES = [
  /monastic way issue/i,
  /book club/i,
  /\bwebinar\b/i,
  /in community\b/i,
  /\bsale\b|\bdiscount\b|% off/i,
  /subscribe\b/i,
];

function isChittisterWeekly(item: WeeklyReading & { pubDate: string | null }): boolean {
  if (PROMO_SHAPES.some((re) => re.test(item.title))) return false;
  if (!item.pubDate) return true;              // undated: let it through
  const t = Date.parse(item.pubDate);
  if (Number.isNaN(t)) return true;
  // getUTCDay: 1 = Monday. The archive's own timestamps are what we compare,
  // not the reader's clock — this is a property of the send, not of "today".
  return new Date(t).getUTCDay() === 1;
}

export async function chittisterWeekly(): Promise<WeeklyReading[]> {
  return cached("chittister", async () => {
    const items = await fetchFeed(CHITTISTER_FEED);
    return items.filter(isChittisterWeekly).map(({ pubDate: _p, ...rest }) => rest);
  });
}

// (The National Cathedral's sermons lived here — feed, parser and routes.
// The owner removed the practice altogether: "let take out the catheral
// sermon actually". Joan Chittister's weekly above is unchanged.)

// ── Routes ───────────────────────────────────────────────────────────────────
// Public, no auth, mirroring /taize/latest: the server says what the newest one
// IS; the CLIENT decides whether this person has read it.

function serveLatest(list: WeeklyReading[], res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=900");
  if (list.length === 0) { res.status(204).end(); return; }
  res.json(list[0]);
}

router.get("/chittister/latest", async (_req: Request, res: Response): Promise<void> => {
  serveLatest(await chittisterWeekly(), res);
});

router.get("/chittister/weekly", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(await chittisterWeekly());
});

export default router;
