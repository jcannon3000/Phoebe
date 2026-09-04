// "Andrew's Version" — a WEEKLY inbox practice, for admins only (for now).
//
// Owner: "create a weekly like taize version and make it admin only",
// pointing at https://abmcg.substack.com — Andrew McGowan of Berkeley Divinity
// School at Yale, a weekly comment on the Revised Common Lectionary as used in
// The Episcopal Church.
//
// THE INBOX SHAPE, for the same reason Taizé has it: this arrives on a Tuesday
// and is worth reading on Thursday. A day-scoped card would sit unread on the
// six days between and shame the reader for a piece that was never late. So
// the state is "have they read THIS one", keyed on the post's own link, and
// the card leaves Next when it is read and stays gone until a new one is
// posted. See lib/taizeInbox.ts on the client for the other half.
//
// Substack publishes real RSS at /feed, so unlike Taizé (whose index has to be
// scraped) this parses a feed — and, like Taizé, does it HERE rather than on
// device, so one fetch serves everyone.
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const FEED_URL = "https://abmcg.substack.com/feed";
const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";

export type WeeklyPost = {
  /** The post's own URL path — stable, and what "have they read THIS one" is
   *  keyed on. Substack's <guid> is empty in this feed, so the link is the id. */
  id: string;
  title: string;
  url: string;
  /** YYYY-MM-DD, so the client can say how long it has been waiting. */
  published: string | null;
};

let cache: { at: number; value: WeeklyPost[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

/** One tag's text, CDATA or not. */
function tag(item: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(item);
  return m?.[1]?.trim() ?? "";
}

function decode(s: string): string {
  return s
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8212;|&mdash;/g, "—").replace(/&#8211;|&ndash;/g, "–")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .trim();
}

function parse(xml: string): WeeklyPost[] {
  const out: WeeklyPost[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1] ?? "";
    const url = tag(item, "link");
    const title = decode(tag(item, "title"));
    if (!url || !title) continue;
    // The path is the id: stable across feed rebuilds, and short enough to
    // sit in a device's read-list without bloating it.
    let id = url;
    try { id = new URL(url).pathname.replace(/^\/+|\/+$/g, "") || url; } catch { /* keep the url */ }
    const pub = tag(item, "pubDate");
    const d = pub ? new Date(pub) : null;
    out.push({
      id, title, url,
      published: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

export async function weeklyPosts(): Promise<WeeklyPost[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  // Node's fetch has no default timeout, and a hung upstream would hold this
  // handler open — the same guard every other fetcher here carries.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const posts = parse(await res.text());
    if (posts.length > 0) cache = { at: Date.now(), value: posts };
    return posts.length > 0 ? posts : (cache?.value ?? []);
  } catch (err) {
    console.warn("[andrews] feed fetch failed:", err);
    // A stale answer beats an empty inbox: the card would otherwise say
    // "nothing new" on a week when there IS something new.
    return cache?.value ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/andrews/latest → the newest post, or 204 when none parsed.
// Public like its siblings: the CLIENT decides whether it is unread, and who
// may see the card at all (admins only, for now) — the server only ever says
// what the newest post IS. Nothing here is user-specific, so it caches.
router.get("/andrews/latest", async (_req: Request, res: Response): Promise<void> => {
  const list = await weeklyPosts();
  res.setHeader("Cache-Control", "public, max-age=900");
  if (list.length === 0) { res.status(204).end(); return; }
  res.json(list[0]);
});

// GET /api/andrews/posts → the newest posts, newest first, capped at ten.
// Feeds the reader's "Previous" menu (owner: "'previous', which would list
// the last 7") — the client takes the seven it shows.
router.get("/andrews/posts", async (_req: Request, res: Response): Promise<void> => {
  const list = await weeklyPosts();
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(list.slice(0, 10));
});

export default router;
