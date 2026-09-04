/**
 * Any Substack (or RSS site) as a WEEKLY newsletter source.
 *
 * Owner (2026-09-04): "create a feature where we could put any link in through
 * an admin tool to a substack and it would turn it into a weekly … maybe even
 * employ the ChatGPT AI to do this … ask the user for the title, subtitle and
 * description."
 *
 * This is the feed half: resolve a pasted link to its RSS feed, parse the
 * posts the way routes/andrews.ts parses Andrew's Version (the same shape the
 * inbox cards, the reader's "Previous" menu and the Fresh Off The Presses
 * push already consume), and propose title / subtitle / description for the
 * admin to edit — from OpenAI when a key is set, else from the feed's own
 * channel metadata. Nothing here is user-specific; posts cache per feed URL.
 */

export type WeeklyPost = { id: string; title: string; url: string; published: string | null };

const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";
const TTL_MS = 30 * 60 * 1000;
const MAX_POSTS = 10;

const cache = new Map<string, { at: number; value: WeeklyPost[] }>();

function tag(item: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(item);
  return m?.[1]?.trim() ?? "";
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8212;|&mdash;/g, "—").replace(/&#8211;|&ndash;/g, "–")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function parsePosts(xml: string): WeeklyPost[] {
  const out: WeeklyPost[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1] ?? "";
    const url = tag(item, "link");
    const title = decodeEntities(tag(item, "title"));
    if (!url || !title) continue;
    let id = url;
    try { id = new URL(url).pathname.replace(/^\/+|\/+$/g, "") || url; } catch { /* keep the url */ }
    const pub = tag(item, "pubDate");
    const d = pub ? new Date(pub) : null;
    out.push({ id, title, url, published: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null });
    if (out.length >= MAX_POSTS) break;
  }
  return out;
}

/** The feed's own <channel> title and description. */
export function parseChannel(xml: string): { title: string; description: string } {
  const head = xml.split("<item>")[0] ?? xml;
  return { title: decodeEntities(tag(head, "title")), description: decodeEntities(tag(head, "description")) };
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Posts for a feed URL, newest first — cached; a stale answer beats an empty inbox. */
export async function feedPosts(feedUrl: string): Promise<WeeklyPost[]> {
  const hit = cache.get(feedUrl);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const posts = parsePosts(await fetchText(feedUrl));
    if (posts.length > 0) cache.set(feedUrl, { at: Date.now(), value: posts });
    return posts.length > 0 ? posts : (hit?.value ?? []);
  } catch (err) {
    console.warn("[weeklies] feed fetch failed:", feedUrl, err);
    return hit?.value ?? [];
  }
}

/**
 * A pasted link → its feed. Substack serves RSS at <origin>/feed; a custom
 * domain does the same. The link may be a post URL — only the origin counts.
 */
export function feedUrlFor(link: string): { siteUrl: string; feedUrl: string } | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`); } catch { return null; }
  if (!u.hostname.includes(".")) return null;
  const siteUrl = `${u.protocol}//${u.hostname}`;
  const feedUrl = u.pathname.endsWith("/feed") ? `${siteUrl}${u.pathname}` : `${siteUrl}/feed`;
  return { siteUrl, feedUrl };
}

/** A slug from the host: "abmcg.substack.com" → "abmcg"; "example.org" → "example-org". */
export function slugFor(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    const base = host.endsWith(".substack.com") ? host.slice(0, -".substack.com".length) : host;
    return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "weekly";
  } catch { return "weekly"; }
}

export type Proposal = { title: string; subtitle: string; description: string };

/**
 * Title / subtitle / description for the admin form. OpenAI writes them from
 * the channel and the recent titles when OPENAI_API_KEY is set (one short
 * chat call, cents); otherwise the feed's own words stand in.
 */
export async function proposeCopy(channel: { title: string; description: string }, posts: WeeklyPost[]): Promise<{ proposal: Proposal; by: "ai" | "feed" }> {
  const fallback: Proposal = {
    title: channel.title.slice(0, 60),
    subtitle: channel.description.slice(0, 80),
    description: channel.description.slice(0, 200),
  };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { proposal: fallback, by: "feed" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_COPY_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You write short, warm copy for a Christian prayer app's newsletter cards. Reply with JSON {\"title\",\"subtitle\",\"description\"}. title: the newsletter's name, at most 40 characters. subtitle: one line under 60 characters saying what it is and who writes it (e.g. \"A weekly lectionary commentary from Yale Divinity School\"). description: one or two sentences, under 180 characters, plain and unhyped, no exclamation marks." },
          { role: "user", content: JSON.stringify({ feedTitle: channel.title, feedDescription: channel.description, recentTitles: posts.slice(0, 6).map((p) => p.title) }) },
        ],
      }),
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Partial<Proposal>;
    const pick = (v: unknown, fb: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fb);
    return {
      proposal: { title: pick(parsed.title, fallback.title, 60), subtitle: pick(parsed.subtitle, fallback.subtitle, 80), description: pick(parsed.description, fallback.description, 200) },
      by: "ai",
    };
  } catch (err) {
    console.warn("[weeklies] copy proposal failed, using the feed's words:", err);
    return { proposal: fallback, by: "feed" };
  }
}

/** Resolve a pasted link: the feed, its channel, and its posts (throws when it isn't a feed). */
export async function resolveLink(link: string): Promise<{ siteUrl: string; feedUrl: string; channel: { title: string; description: string }; posts: WeeklyPost[] }> {
  const at = feedUrlFor(link);
  if (!at) throw new Error("That doesn't look like a link.");
  const xml = await fetchText(at.feedUrl);
  const posts = parsePosts(xml);
  const channel = parseChannel(xml);
  if (posts.length === 0 && !channel.title) throw new Error("No RSS feed found at that address.");
  return { ...at, channel, posts };
}
