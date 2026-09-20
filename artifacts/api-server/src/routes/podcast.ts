// Podcast content — shows registry + browse/listen API.
//
// Phoebe hosts a small curated set of podcasts you can browse and play
// IN-APP (think Hallow-style content, not just outbound links):
//   • Forward Movement daily offices (Morning / Evening Prayer, read
//     aloud) — also surfaced on the prayer chooser + offices page.
//   • Center for Action and Contemplation — their full slate of shows.
//   • Washington National Cathedral — the "Crossroads" podcast.
//
// Each SHOW is one RSS feed. PUBLISHERS group shows for the browse UI.
// Endpoints:
//   GET /api/podcast/:show/today        — newest episode of a show
//                                         (offices use this on the
//                                         chooser + player).
//   GET /api/podcasts/publisher/:pub    — a publisher + its show list
//                                         (registry metadata only; no
//                                         feed fetch, so it's instant).
//   GET /api/podcasts/show/:slug        — a show + its recent episodes
//                                         (fetches + parses the feed,
//                                         cached per show).
//
// Caching: per-feed short TTL. Feeds are light XML; the parse is a few
// regexes. On fetch failure we serve the last good cache (even stale)
// and only fall back to an empty payload when we've never succeeded.
//
// URL entity-decoding: enclosure + image URLs in feeds arrive XML-
// escaped (e.g. ...mp3?a=1&amp;b=2). A literal "&amp;" is a malformed
// URL the browser can't load — so every URL pulled from the XML is run
// through decodeXmlText before we hand it to the client.

import { Router, type IRouter, type Request, type Response } from "express";
import { db, fddAudioMarksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { safeFetch } from "../lib/ssrfGuard";
import { rateLimit } from "../lib/rate-limit";
import { FDD_TRANSCRIPTION_ENABLED } from "../lib/transcription/fddTranscription";

const router: IRouter = Router();

export type Show = {
  slug: string;
  title: string;
  artist: string;
  publisher: string; // PUBLISHERS key
  feedUrl: string;
  artwork: string | null;
  // "rss" (default) = standard podcast RSS. "scrape-roundtables" =
  // the Diocese of NC's "Roundtables on Race" page, which has no RSS
  // feed — episodes are MP3s embedded on a WordPress page, so we scrape
  // them (titles + audio URLs) into the same episode shape.
  kind?: "rss" | "scrape-roundtables";
  // Copy for the show page when the feed can't supply one — the scraped
  // Roundtables page has no <description>. The show route prefers it.
  description?: string;
  // Per-show glyph for the show page eyebrow; the publisher's otherwise.
  emoji?: string;
  // When true, the show's artwork is used as the imageUrl for EVERY
  // episode, ignoring per-episode <itunes:image> tags. Useful when the
  // feed omits episode art (or uses generic imagery) but we have a good
  // canonical portrait for the host — e.g. Bishop Budde's photo.
  overrideEpisodeArtwork?: boolean;
  /**
   * How many episodes the SHOW PAGE lists, when the default isn't right.
   *
   * The default covers every finite show we carry whole. A DAILY feed is a
   * different animal — the offices have 2,300 episodes each and Forward Day by
   * Day 2,695 — and nobody arrives at those pages to scroll back to 2019; they
   * come for today. So those keep a short window: it is what they have always
   * shown, and 2,000 rows in an unvirtualized list would be a real cost for
   * nobody's benefit.
   */
  browseEpisodes?: number;
  /**
   * Read a sermon's own name, its preacher and whether it IS a sermon out of
   * what the feed gives us. Only for shows whose titles and descriptions have
   * actually been looked at — see sermonMeta().
   */
  sermonMeta?: boolean;
};

// Show-level theme tags (slug → theme keys). A theme search surfaces a
// tagged show + ALL its episodes even when individual episode titles /
// descriptions don't contain the theme's keywords — e.g. "Roundtables
// on Race" is entirely about race/justice, but episode titles like
// "Judaism" or "Season Wrap-up" wouldn't keyword-match on their own.
// Centralized here (rather than a field per show) to keep tagging in
// one place.
const SHOW_THEMES: Record<string, string[]> = {
  "roundtables-on-race": ["justice", "go", "bless"],
  "cac-love-period": ["justice", "bless"],
  "cac-cosmic-we": ["justice", "contemplation", "pray"],
  // Way of Love is literally Bishop Curry's whole subject — tag every stage.
  "way-of-love-curry": ["justice", "prayer", "turn", "learn", "pray", "worship", "bless", "go", "rest"],
  "cac-learning-how-to-see": ["justice", "contemplation", "learn"],
  "cac-turning-to-the-mystics": ["contemplation", "mystics", "pray", "rest"],
  "cac-everything-belongs": ["contemplation", "rest"],
  "cac-another-name": ["contemplation", "pray"],
  // Bishop Budde — discipleship, spiritual practice, encountering Jesus.
  "experiencing-jesus": ["scripture", "prayer", "pray", "learn", "turn", "worship"],
  "morning-office": ["pray", "worship"],
  "evening-office": ["pray", "worship", "rest"],
  "nc-crossroads": ["learn", "worship"],
  "living-church": ["learn", "worship"],
  "national-cathedral-sermons": ["learn", "worship"],
  "ssje-sermons": ["learn", "worship"],
  "grace-church-nyc": ["learn", "worship"],
  "st-michael-albuquerque": ["learn", "worship"],
  "st-john-divine": ["learn", "worship"],
  "forward-day-by-day": ["pray", "learn"],
  "scripture-day-by-day": ["pray", "learn", "scripture"],
};
function showThemes(slug: string): string[] {
  return SHOW_THEMES[slug] ?? [];
}

// Ordered list of shows per publisher drives the browse grid.
// Browse-grid order (publisher object insertion order drives the cascade):
//   Way of Love → Sermons → Forward → From around the church → CAC.
// The offices publisher stays first but is filtered out of Discover (both its
// shows are HIDDEN_FROM_DISCOVER), so it never renders a section.
const PUBLISHERS: Record<string, { title: string; emoji: string; showSlugs: string[] }> = {
  "forward-movement": {
    title: "Forward Movement",
    emoji: "📖",
    showSlugs: ["morning-office", "evening-office"],
  },
  // Way of Love — The Episcopal Church's Rule of Life. Leads the grid; the
  // first two shows are Bishop Budde's rule-of-life series and Presiding
  // Bishop Curry's Way of Love.
  "way-of-love": {
    title: "Way of Love",
    emoji: "❤️",
    showSlugs: [
      "experiencing-jesus",
      "way-of-love-curry",
    ],
  },
  // Sermons — preaching from around the Episcopal world. This group is also
  // the source of truth for the app's Sermons page (/menu/sermons), so a
  // church added here appears there as well (GET /podcasts/sermon-sources).
  //
  // SSJE and Grace Church came OUT at the owner's word (2026-09-19, looking
  // at the list on his phone: "Take out SSJE and Grace"). SSJE's feed had
  // stopped being fetchable from the deploy, so its row could say nothing
  // about what it last preached. Both shows stay in SHOWS — their pages,
  // links and listening history still work — they are simply not offered
  // here. Putting either back is one line.
  sermons: {
    title: "Sermons",
    emoji: "🎙️",
    showSlugs: [
      "national-cathedral-sermons",
      "st-michael-albuquerque",
      "st-john-divine",
    ],
  },
  // Forward — Forward Movement's daily devotionals (Forward Day by Day +
  // Scripture Day by Day).
  "forward-movement-shows": {
    title: "Forward",
    emoji: "📖",
    showSlugs: [
      "forward-day-by-day",
      "scripture-day-by-day",
    ],
  },
  // From around the church — the rest of the Episcopal-world shows.
  "around-the-church": {
    title: "From around the church",
    emoji: "⛪",
    showSlugs: [
      "green-lectionary",
      "nc-crossroads",
      "roundtables-on-race",
      "living-church",
    ],
  },
  cac: {
    title: "Center for Action and Contemplation",
    emoji: "🌵",
    showSlugs: [
      "cac-everything-belongs",
      "cac-turning-to-the-mystics",
      "cac-another-name",
      "cac-learning-how-to-see",
      "cac-love-period",
      "cac-cosmic-we",
    ],
  },
};

// Shows that power the daily offices on the prayer chooser / office
// player. They have their own home there, so we keep them OUT of the
// Discover browse + search — the SHOWS entries stay (so
// /podcast/:show/today still serves them), they're just not listed.
const HIDDEN_FROM_DISCOVER = new Set<string>(["morning-office", "evening-office", "compline", "ssje-sermons", "pray-as-you-go", "abiding-way-lectio"]);

// Individual episodes hidden by title (matched apostrophe- and
// whitespace-insensitively). Filtered out when the feed is parsed, so
// they never surface in the show list, search, or "today".
function normEpisodeTitle(t: string): string {
  return t.toLowerCase().replace(/[‘’']/g, "").replace(/\s+/g, " ").trim();
}
const HIDDEN_EPISODE_TITLES = new Set<string>([
  normEpisodeTitle("The Presiding Bishop's Christmas Message: A Sign for You"),
]);
function isHiddenEpisode(title: string | null): boolean {
  return !!title && HIDDEN_EPISODE_TITLES.has(normEpisodeTitle(title));
}

// Thematic filter pills for the Discover page. Each searches episode
// titles + descriptions across the whole library for ANY of its
// keywords (case-insensitive substring). Keywords are deliberately
// broad/stemmed (e.g. "contempl" catches contemplate/contemplation/
// contemplative).
const THEMES: Array<{ key: string; label: string; emoji: string; keywords: string[] }> = [
  // ── Way of Love — the 7 stages of The Episcopal Church's Rule of Life ──
  // These surface as the primary suggestion pills on the podcast Discover
  // page. Keywords are intentionally broad so they catch episode-level
  // matching even when a show isn't explicitly tagged.
  { key: "turn", label: "Turn", emoji: "🔄",
    keywords: ["repent", "return", "conversion", "transform", "renewal", "new life", "metanoia", "turning", "begin again", "reconcil", "confession"] },
  { key: "learn", label: "Learn", emoji: "📖",
    keywords: ["formation", "discipleship", "study", "discern", "education", "catechesis", "scripture", "gospel", "bible", "lectionary", "reading", "teaching", "baptism", "confirmation"] },
  { key: "pray", label: "Pray", emoji: "🙏🏽",
    keywords: ["prayer", "pray", "contemplat", "intercession", "spiritual practice", "daily office", "morning prayer", "evening prayer", "compline", "vespers", "rule of life", "examen", "rosary"] },
  { key: "worship", label: "Worship", emoji: "⛪",
    keywords: ["worship", "eucharist", "liturgy", "preach", "sermon", "sunday", "praise", "hymn", "sacrament", "communion", "gathering", "mass", "rite", "blessing"] },
  { key: "bless", label: "Bless", emoji: "🤲🏽",
    keywords: ["bless", "neighbor", "welcome", "hospitality", "generosity", "stewardship", "tithe", "community", "service", "care", "beloved"] },
  { key: "go", label: "Go", emoji: "🌍",
    keywords: ["mission", "witness", "justice", "reconcil", "outreach", "evangelism", "serve", "immigrant", "poverty", "racial", "equity", "liberation", "peace"] },
  { key: "rest", label: "Rest", emoji: "🌙",
    keywords: ["sabbath", "rest", "retreat", "sabbatical", "solitude", "silence", "renewal", "delight", "play", "joy", "nature", "creation", "stillness", "sabbath"] },
  // ── Deeper thematic search (still used by future search UI if needed) ──
  { key: "contemplation", label: "Contemplation", emoji: "🕯️",
    keywords: ["contempl", "silence", "mystic", "meditat", "stillness", "presence", "centering prayer", "solitude"] },
  { key: "justice", label: "Justice & Race", emoji: "🫱🏽‍🫲🏿",
    keywords: ["justice", "race", "racism", "racial", "poverty", "oppress", "liberation", "equity", "beloved community", "reparation", "immigra"] },
  { key: "scripture", label: "Scripture", emoji: "📖",
    keywords: ["scripture", "gospel", "bible", "biblical", "psalm", "lectionary", "epistle", "parable", "exodus", "genesis"] },
  { key: "creation", label: "Creation", emoji: "🌎",
    keywords: ["creation", "ecolog", "earth", "climate", "environment", "nature", "creature", "land", "wilderness", "season"] },
  { key: "mystics", label: "Saints & Mystics", emoji: "😇",
    keywords: ["mystic", "saint", "merton", "julian of norwich", "teresa", "john of the cross", "francis", "desert", "hildegard", "eckhart", "thérèse", "therese"] },
  { key: "healing", label: "Grief & Healing", emoji: "🕊️",
    keywords: ["grief", "loss", "healing", "lament", "suffering", "comfort", "wholeness", "trauma", "mourning", "death"] },
  { key: "prayer", label: "Prayer", emoji: "🙏🏽",
    keywords: ["prayer", "pray", "intercession", "examen", "rule of life", "spiritual practice", "morning prayer", "evening prayer", "compline"] },
];

export const SHOWS: Record<string, Show> = {
  // ── Forward Movement daily offices ──────────────────────────────────
  "morning-office": {
    // A daily feed: people come here for the day's Morning Prayer, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "morning-office",
    title: "Daily Morning Prayer",
    artist: "Forward Movement",
    publisher: "forward-movement",
    feedUrl: "https://feeds.megaphone.fm/FDMV7144883457",
    artwork: null,
  },
  "evening-office": {
    // A daily feed: people come here for the day's Evening Prayer, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "evening-office",
    title: "An Evening at Prayer",
    artist: "Forward Movement",
    publisher: "forward-movement",
    feedUrl: "https://feeds.megaphone.fm/FDMV2784874884",
    artwork: null,
  },
  // Compline, read by Forward Movement (Fr. Wiley Ammons, the voice of "An
  // Evening at Prayer"). Owner, 2026-09-15: "I want the forward version." One
  // episode a night, titled by weekday and season ("Compline, Mondays in
  // Ordinary Time"); /today picks tonight's, not simply the newest.
  "compline": {
    // A daily feed: people come here for tonight's Compline, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "compline",
    title: "Compline",
    artist: "Forward Movement",
    publisher: "forward-movement",
    feedUrl: "https://feeds.megaphone.fm/FDMV3439145045",
    artwork: null,
  },
  // Pray As You Go — the Jesuits in Britain's daily prayer session: music,
  // a scripture reading and a few questions, about twelve minutes. Owner,
  // 2026-09-17, with a link to one of them: "we want it as a daily reflection,
  // but it comes up as an audio player", "instead of opening to there website"
  // / "open to play the podcast". So it is a reflection source whose card
  // plays the day's episode in Phoebe's own player (pages/reflect-payg).
  //
  // The feed is the one Apple Podcasts lists, and prayasyougo.org's robots.txt
  // is "User-Agent: * / Allow: /". Phoebe reads it as any podcast client does:
  // their page, their audio, their attribution.
  // ── Abiding Way Ministries — Guided Lectio Divina ────────────────────
  //
  // Owner, 2026-09-18, with their site: "can we add their daily lectio
  // podcast?" · "Call it Guided Lectio Divina" · "have it work like Pray as
  // You Go". A reading, silence and a guided lectio, about fourteen minutes,
  // posted for each day (their own titles ARE the day: "Friday, September 18,
  // 2026"). Their Squarespace feed is the public RSS their page links; Phoebe
  // reads it as any podcast client does — their page, their audio, their
  // attribution — and brings none of their text into the app.
  "abiding-way-lectio": {
    // A daily feed like the offices and Pray As You Go: keeps the short browse
    // window (see Show.browseEpisodes) rather than growing a row a day.
    browseEpisodes: 50,
    slug: "abiding-way-lectio",
    title: "Guided Lectio Divina",
    artist: "Abiding Way Ministries",
    publisher: "around-the-church",
    feedUrl: "https://www.abidingway.life/lectio-podcast?format=rss",
    artwork: null,
  },
  "pray-as-you-go": {
    // A daily feed: people come here for today's session, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "pray-as-you-go",
    title: "Pray As You Go Daily",
    artist: "Pray As You Go",
    publisher: "around-the-church",
    feedUrl: "https://admin.prayasyougo.org/api/feed.xml",
    artwork: null,
  },
  // ── Center for Action and Contemplation ─────────────────────────────
  "cac-everything-belongs": {
    slug: "cac-everything-belongs",
    title: "Everything Belongs",
    artist: "Center for Action and Contemplation",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC1704856390",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/93/ab/ef/93abef60-62cc-b944-ebee-8a30ce7508ff/mza_15647178321033802345.jpg/600x600bb.jpg",
  },
  "cac-turning-to-the-mystics": {
    slug: "cac-turning-to-the-mystics",
    title: "Turning to the Mystics",
    artist: "James Finley · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC7039433581",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/97/c9/52/97c95240-d332-155a-e2a4-c6a951b3d6f1/mza_6610056226181262829.jpg/600x600bb.jpg",
  },
  "cac-another-name": {
    slug: "cac-another-name",
    title: "Another Name For Every Thing",
    artist: "Richard Rohr · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC4279918867",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/1c/17/2e/1c172e85-cf25-c2c8-aa77-162c7c6d68c9/mza_9011558391357149453.jpg/600x600bb.jpg",
  },
  "cac-learning-how-to-see": {
    slug: "cac-learning-how-to-see",
    title: "Learning How to See",
    artist: "Brian McLaren · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC3846301578",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/cf/ff/bb/cfffbb3b-144c-743c-b707-d051eabbf59e/mza_13929123429956003752.jpg/600x600bb.jpg",
  },
  "cac-love-period": {
    slug: "cac-love-period",
    title: "Love Period",
    artist: "Jacqui Lewis · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC7740854822",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/b1/88/59/b1885906-bb3c-5c03-9c01-4cc643489757/mza_10724753065665227728.jpg/600x600bb.jpg",
  },
  "cac-cosmic-we": {
    slug: "cac-cosmic-we",
    title: "The Cosmic We",
    artist: "Barbara Holmes · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC6648912537",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/79/46/12/794612f8-accf-5683-521e-5805da51ae5d/mza_4535843137584053387.jpg/600x600bb.jpg",
  },
  // ── Creation Justice Ministries — The Green Lectionary ──────────────
  "green-lectionary": {
    slug: "green-lectionary",
    title: "The Green Lectionary Podcast",
    artist: "Creation Justice Ministries",
    publisher: "around-the-church",
    feedUrl: "https://feed.podbean.com/greenlectionary/feed.xml",
    artwork: "/podcast-art/green-lectionary.jpg",
  },
  // ── Washington National Cathedral ───────────────────────────────────
  "nc-crossroads": {
    slug: "nc-crossroads",
    title: "Crossroads with Dean Randy Hollerith",
    artist: "Washington National Cathedral",
    publisher: "around-the-church",
    feedUrl: "https://feed.podbean.com/crossroadsWNC/feed.xml",
    artwork: "/podcast-art/nc-crossroads.jpg",
  },
  // ── Diocese of Washington — Bishop Mariann Budde ────────────────────
  "experiencing-jesus": {
    slug: "experiencing-jesus",
    // ITS ACTUAL NAME (owner, 2026-09-19: "Rename the Budde course
    // experiencing Jesus as that was the actual name" — and then the reason:
    // "So that we can name the Micheal curry one The Way of Love"). Her feed
    // calls itself "Experiencing Jesus with Bishop Mariann"; the Way of Love
    // is what the episodes WALK, not what the series is called. The slug stays
    // `experiencing-jesus`, so nobody's progress moves.
    title: "Experiencing Jesus",
    artist: "Diocese of Washington",
    publisher: "way-of-love",
    feedUrl: "https://feeds.simplecast.com/1CBZhkXf",
    artwork: "/podcast-art/budde.jpg",
    // Use her portrait for every episode — the feed provides no per-episode
    // art and the generic show graphic is less recognizable than her face.
    overrideEpisodeArtwork: true,
  },
  // ── The Episcopal Church — Presiding Bishop Michael Curry ───────────
  "way-of-love-curry": {
    slug: "way-of-love-curry",
    // The name belongs to this one now (owner, above). Dropping "with Bishop
    // Michael Curry" from the title leaves nothing carrying his name, so the
    // byline does — the show IS his, and the Episcopal Church publishes it.
    title: "The Way of Love",
    artist: "Bishop Michael Curry",
    publisher: "way-of-love",
    feedUrl: "https://feeds.megaphone.fm/the-way-of-love",
    artwork: "/podcast-art/curry.jpg",
  },
  // ── The Living Church ───────────────────────────────────────────────
  "living-church": {
    slug: "living-church",
    title: "The Living Church Podcast",
    artist: "The Living Church",
    publisher: "around-the-church",
    feedUrl: "https://feeds.redcircle.com/2583ed91-dcdb-44c3-b2b1-13bff24fe10c",
    artwork: "/podcast-art/living-church.jpg",
  },
  // ── Episcopal Diocese of North Carolina ─────────────────────────────
  // No RSS feed — scraped from the diocese's WordPress page.
  // Owner (2026-09-11) lists it on the Courses page second after The Way of
  // Love, under the name "Round Table on Race" (the diocese writes
  // "Roundtables on Race"). Glyph: the two-tone handshake the Justice & Race
  // theme uses (owner, over a table — Unicode has none).
  "roundtables-on-race": {
    slug: "roundtables-on-race",
    title: "Round Table on Race",
    artist: "The Rev. Canon Kathy Walker · Diocese of North Carolina",
    publisher: "around-the-church",
    feedUrl: "https://episdionc.org/podcast-roundtables-on-race/",
    artwork: "/podcast-art/roundtables.jpg",
    kind: "scrape-roundtables",
    emoji: "🫱🏽‍🫲🏿",
    description:
      "Conversations about race and its reach into American life, from the Episcopal Diocese of North Carolina, " +
      "hosted by the Rev. Canon Kathy Walker, Canon Missioner for Black Ministries. Each season stays with one subject " +
      "\u2014 race and education, why race matters in voting and government \u2014 so every episode can go a layer deeper " +
      "than a single conversation usually allows. For people already doing the work of racial equity and reconciliation, " +
      "and for anyone wondering why we are still talking about it.",
  },
  // ── Forward + affiliated podcasts (Discover section under CAC) ──────
  "forward-day-by-day": {
    // A daily feed: people come here for today's reflection, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "forward-day-by-day",
    title: "Forward Day by Day",
    artist: "Forward Movement",
    publisher: "forward-movement-shows",
    feedUrl: "https://feeds.megaphone.fm/forwarddaybyday",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/b5/43/37/b5433758-400b-4d1b-c397-d3e6190ea0e7/mza_10011273729972074725.jpg/600x600bb.jpg",
  },
  // Grace Church in New York — preaching from the Episcopal parish in
  // Greenwich Village (Broadway at 10th, a Greenwich Village fixture since 1846).
  // SoundCloud-hosted audio feed.
  "grace-church-nyc": {
    slug: "grace-church-nyc",
    title: "Grace Church in New York",
    artist: "Grace Church in New York",
    publisher: "sermons",
    feedUrl: "https://feeds.soundcloud.com/users/soundcloud:users:666827156/sounds.rss",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/21/b8/b5/21b8b58d-7660-78b9-581e-a0266581e72f/mza_5763349292259453824.jpg/600x600bb.jpg",
  },
  // SSJE Sermons — preaching from the Society of Saint John the Evangelist
  // (the Cambridge MA Episcopal monastery). WordPress/Blubrry audio feed.
  "ssje-sermons": {
    slug: "ssje-sermons",
    title: "SSJE Sermons",
    artist: "Society of Saint John the Evangelist",
    publisher: "around-the-church",
    feedUrl: "https://www.ssje.org/category/sermon/feed/",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/7c/c6/91/7cc69120-abbd-ab9f-b7fd-6e8cb8c7c4ab/mza_6967511385700327856.jpg/600x600bb.jpg",
  },
  // Sermons by Washington National Cathedral — Sunday + feast-day preaching.
  // St. Michael and All Angels, Albuquerque — Sunday preaching, the preacher
  // named in each episode's title. RedCircle feed, no seasons.
  // Voices from the Cathedral — the Cathedral of St. John the Divine's own
  // preaching. Each item IS the sermon (8-22 minutes), titled after the
  // service it was preached at, with the preacher named in the description.
  // Anchor feed, no seasons. See sermonMeta for how both are read.
  "st-john-divine": {
    slug: "st-john-divine",
    title: "Voices from the Cathedral",
    artist: "Cathedral of St. John the Divine",
    publisher: "sermons",
    feedUrl: "https://anchor.fm/s/1349418/podcast/rss",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/46/a9/f8/46a9f83d-b1ff-0aa2-059e-57def6c1ec2a/mza_979478087588332071.jpg/600x600bb.jpg",
    sermonMeta: true,
  },
  "st-michael-albuquerque": {
    slug: "st-michael-albuquerque",
    sermonMeta: true,
    // The card says the parish; Albuquerque is the line underneath
    // (SERMON_SOURCE_ABOUT), the way the other churches read.
    title: "St. Michael and All Angels",
    // The parish's full legal name runs to two lines in a row that has one
    // (owner, 2026-09-19: "Take out episcopal church … so it fits in one
    // line"). Their own description, which is theirs, still names them whole.
    artist: "St. Michael and All Angels",
    publisher: "sermons",
    feedUrl: "https://feeds.redcircle.com/e7bd9cab-5e2b-41f3-a15a-d6a994fe5c3f",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/e8/3d/e0/e83de06e-dad1-07db-491b-aeb0b63bf66a/mza_8736870600381994675.jpg/600x600bb.jpg",
  },
  "national-cathedral-sermons": {
    slug: "national-cathedral-sermons",
    title: "National Cathedral Sermons",
    artist: "Washington National Cathedral",
    publisher: "sermons",
    feedUrl: "https://feed.podbean.com/nationalcathedral/feed.xml",
    artwork: "https://pbcdn1.podbean.com/imglogo/image-logo/5314698/Sermons_by_WNC6eo25.jpg",
  },
  // Scripture Day by Day — Fr. Wiley Ammons reads the day's lectionary
  // scripture aloud. Forward Movement / Megaphone, a fresh daily episode.
  "scripture-day-by-day": {
    // A daily feed: people come here for today's reading, not to scroll back
    // years. Keeps the short browse window (see Show.browseEpisodes).
    browseEpisodes: 50,
    slug: "scripture-day-by-day",
    title: "Scripture Day by Day",
    artist: "Forward Movement",
    publisher: "forward-movement-shows",
    feedUrl: "https://feeds.megaphone.fm/scripturedbd",
    artwork: "https://megaphone.imgix.net/podcasts/7bdb8cac-f23e-11ec-bd3d-6b7860fd93ef/image/RCL-bg.jpg?ixlib=rails-4.3.1&max-w=600&max-h=600&fit=crop&auto=format,compress",
  },
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type EpisodeFull = {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
  // <itunes:season> — CAC's shows use this to mark which teaching series
  // (e.g. which mystic, which Rohr book) an episode belongs to. Most other
  // shows in the registry don't set it, so this is null there.
  season: number | null;
  // The season's own name where the source gives one ("Race and Education");
  // the show page uses it as the group header. Only the Roundtables scraper
  // sets it today.
  seasonName?: string | null;
  // <itunes:episode> — the publisher's own place for this episode in its
  // season. Null where a feed doesn't number (most don't) and, tellingly, on
  // the trailers and one-off specials of feeds that otherwise do.
  episodeNumber?: number | null;
  // Sermon shows only (Show.sermonMeta). The quieter second line — the service
  // and date the sermon was preached at — once the sermon's own name has been
  // taken out of the title.
  subtitle?: string | null;
  // Who preached it, where the feed says.
  preacher?: string | null;
  // False for an episode from a sermon show that ISN'T preaching — a two-minute
  // prayer, a vigil, a panel. Nothing is hidden by this; it lets "play the
  // newest sermon" skip past one. Undefined means we never asked.
  sermon?: boolean;
  /**
   * The episode's own page on the publisher's site (<link>) — where the
   * session's text lives. Phoebe never copies that text: the player's
   * Transcript pill opens THIS page in the reader, the way the offices open
   * their readings (owner, 2026-09-18).
   */
  pageUrl?: string | null;
};
export type ParsedFeed = {
  feedTitle: string | null;
  feedImage: string | null;
  feedDescription: string | null;
  episodes: EpisodeFull[];
  /**
   * WE COULD NOT READ THE FEED — as opposed to reading it and finding nothing.
   * An empty 200 is indistinguishable from a church that has never preached,
   * which is what SSJE looked like on the Sermons page while its fetch was
   * failing from the deploy (2026-09-19). Callers pass this on so a page can
   * say so.
   */
  unavailable?: boolean;
};

const TTL_MS = 30 * 60_000;
// `limit` is how many episodes that parse was allowed to take — see loadFeed
// for why a cached parse can't answer a request bigger than the one that
// filled it.
const cache = new Map<string, { at: number; data: ParsedFeed; limit: number }>();

// Feed fetches hit fixed, trusted hosts (the static SHOWS registry — never a
// user-supplied URL), so this isn't an SSRF surface. These bounds are
// availability hardening: a hung or oversized trusted feed must not stall a
// request thread or exhaust memory. Feeds are light XML, so 8 MB / 10 s is
// generous headroom.
const FEED_TIMEOUT_MS = 10_000;
const FEED_MAX_BYTES = 8 * 1024 * 1024;

export async function fetchFeedText(url: string): Promise<string> {
  // SSRF-safe: follow redirects manually, re-validating each hop against the
  // public-address allowlist. Feeds can be user-supplied (weekly-plan episode
  // resolve), so a 30x to 169.254.169.254 / 127.0.0.1 / an internal host must
  // never be followed. safeFetch enforces assertPublicHttpUrl on every hop and
  // owns the request timeout.
  const res = await safeFetch(url, {
    timeoutMs: FEED_TIMEOUT_MS,
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, text/html" },
  });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  // Reject early when the server declares an oversized body…
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > FEED_MAX_BYTES) {
    throw new Error(`feed too large: ${declared} bytes`);
  }
  // …and bound the actual read too, since Content-Length can be absent
  // (chunked) or lie. Stream the body and stop once the cap is exceeded.
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > FEED_MAX_BYTES) {
        await reader.cancel();
        throw new Error("feed exceeded size cap");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function fromCodePoint(cp: number): string {
  try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; } catch { return ""; }
}
function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    // Numeric character refs — without these, en-dashes / curly quotes
    // leak as literal "&#8211;" / "&#8217;" in episode titles.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .trim();
}

// Strip HTML tags from a feed description + collapse whitespace, then
// truncate. Feed descriptions are often full HTML show notes; we only
// want a one/two-line preview on the episode row.
function plainText(raw: string | null): string | null {
  if (!raw) return null;
  const text = decodeXmlText(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}
function plainTextPreview(raw: string | null, max = 280): string | null {
  const text = plainText(raw);
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m ? m[1] : null;
}

/**
 * "…with The Very Reverend Winnie Varghese preaching." — and one item that
 * opens with the name instead of "with". Read from the WHOLE description, not
 * the 280-character preview the episode carries: the cathedral's lead-in often
 * runs past that, and parsing the preview found the preacher on 35 of 87 items
 * where the full text has it on 69.
 */
/** Anything but a full stop, plus a full stop that closes a short capitalised
 *  abbreviation — "Dr.", "Rev.", "W." — which is what an honorific or an
 *  initial looks like and what the end of a sentence does not. Nearly every
 *  one of these names has one ("The Reverend Dr. Herschel Wade"), and a
 *  pattern that stopped at the first period found 37 of the 69 the text has. */
const PREACHER_CHARS = "(?:[^.;]|\\b[A-Z][a-z]{0,3}\\.)";
const PREACHER_WITH = new RegExp(`\\bwith\\s+(${PREACHER_CHARS}{3,80}?)\\s+preaching\\b`);
const PREACHER_LEADING = new RegExp(`^(${PREACHER_CHARS}{3,80}?)\\s+preaching\\b`);

function preacherFrom(text: string | null): string | null {
  if (!text) return null;
  /**
   * "with <name> preaching" FIRST, and only then the one item that opens with
   * the name instead. Trying them as one alternation let the leading branch
   * win from character nought — and these descriptions all open with the
   * service and date, so it handed back "Sunday Holy Eucharist Service –
   * September 13" as the preacher on forty of eighty-seven items.
   */
  const m = PREACHER_WITH.exec(text) ?? PREACHER_LEADING.exec(text);
  return tidyPreacher(m?.[1]?.replace(/^(?:and|by)\s+/i, "") ?? null);
}

/**
 * A preacher's name, however we came by it — out of a description or out of a
 * title. ONE cleanup for both: a name read off a title used to skip this and
 * keep whatever the dash left behind, so "Reverend Jesse Jackson, Deans
 * Conference Lecture- 2 May, 1992" stood as a preacher (2026-09-19).
 *
 * A trailing role is theirs, not part of the name — but only cut it when what
 * is left is still a NAME. "Archdeacon, the Venerable Denise LaVetty" puts the
 * role first, and cutting the tail there left the word "Archdeacon" standing
 * alone. A year means we are reading a date or a lecture title, not a person.
 */
function tidyPreacher(raw: string | null | undefined): string | null {
  let name = raw?.trim().replace(/[.,;-]+$/, "").trim();
  if (!name) return null;
  const head = name.split(",")[0]?.trim() ?? name;
  if (name.includes(",") && head.split(/\s+/).length >= 2) name = head;
  name = name.replace(/[.,;-]+$/, "").trim();
  if (/\b\d{4}\b/.test(name)) return null;
  return /^[A-Za-z]/.test(name) && name.length >= 4 && name.length <= 70 ? name : null;
}

export function parseFeed(xml: string, limit: number, opts?: { sermons?: boolean }): ParsedFeed {
  const channelPart = xml.split(/<item[\s>]/)[0] ?? "";
  const feedTitle = firstMatch(channelPart, /<title>([\s\S]*?)<\/title>/);
  const feedImageRaw =
    firstMatch(channelPart, /<itunes:image[^>]*\bhref="([^"]+)"/i) ??
    firstMatch(channelPart, /<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i);
  // Channel-level blurb for the show header — same cleanup as episode
  // descriptions (decode entities + CDATA, strip HTML, truncate).
  const feedDescRaw =
    firstMatch(channelPart, /<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ??
    firstMatch(channelPart, /<description>([\s\S]*?)<\/description>/i);

  const episodes: EpisodeFull[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && episodes.length < limit) {
    const item = m[1] ?? "";
    const enclosure = firstMatch(item, /<enclosure[^>]*\burl="([^"]+)"/i);
    if (!enclosure) continue; // no audio → skip (e.g. a text-only post)
    const guid = firstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const title = firstMatch(item, /<title>([\s\S]*?)<\/title>/);
    const duration = firstMatch(item, /<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
    const pub = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const desc =
      firstMatch(item, /<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ??
      firstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    const itemImage = firstMatch(item, /<itunes:image[^>]*\bhref="([^"]+)"/i);
    const link = firstMatch(item, /<link>([\s\S]*?)<\/link>/i);
    const seasonRaw = firstMatch(item, /<itunes:season>([\s\S]*?)<\/itunes:season>/i);
    const season = seasonRaw && /^\d+$/.test(seasonRaw.trim()) ? parseInt(seasonRaw.trim(), 10) : null;
    const epNumRaw = firstMatch(item, /<itunes:episode>([\s\S]*?)<\/itunes:episode>/i);
    const episodeNumber = epNumRaw && /^\d+$/.test(epNumRaw.trim()) ? parseInt(epNumRaw.trim(), 10) : null;
    const decodedTitle = title ? decodeXmlText(title) : null;
    if (isHiddenEpisode(decodedTitle)) continue; // blocklisted episode
    episodes.push({
      id: (guid ? decodeXmlText(guid) : null) || decodeXmlText(enclosure),
      title: decodedTitle,
      audioUrl: decodeXmlText(enclosure),
      durationSeconds: parseDurationSeconds(duration),
      // DECODED like every other field. RedCircle writes the UTC offset as an
      // entity — "Sun, 13 Sep 2026 18:56:18 &#43;0000" — and pubDate was the
      // one field that never went through decodeXmlText, so Date.parse gave
      // NaN on all 176 St. Michael episodes: the church read as permanently
      // stale on the Sermons page and never got a home pill (2026-09-19).
      publishedAt: pub ? decodeXmlText(pub).trim() : null,
      description: plainTextPreview(desc),
      imageUrl: itemImage ? decodeXmlText(itemImage) : null,
      season,
      episodeNumber,
      ...(opts?.sermons ? { preacher: preacherFrom(plainText(desc)) } : {}),
      pageUrl: link ? decodeXmlText(link).trim() || null : null,
    });
  }
  return {
    feedTitle: feedTitle ? decodeXmlText(feedTitle) : null,
    feedImage: feedImageRaw ? decodeXmlText(feedImageRaw) : null,
    feedDescription: plainTextPreview(feedDescRaw, 360),
    episodes,
  };
}

// "Roundtables on Race" has no RSS feed — episodes are MP3s embedded on
// a WordPress page, each with a title="RoR – Season N, Episode M: …"
// (or "Season N, …") attribute. Titles and MP3 URLs both appear
// newest-first in document order, so we extract each list (de-duped,
// order-preserving) and zip them by index.
export function scrapeRoundtables(html: string, fallbackTitle: string): ParsedFeed {
  // 2026-09 layout: one <li class="wt26-pub-card"> per publication carrying
  // a date (MM/DD/YY), a titled link ("RoR – Season 4, Episode 3: …"), an
  // optional one-line summary and the <audio src>. Titles are no longer in a
  // title="" attribute, which is why the fallback below served "Episode N".
  const cards = html.split(/<li class="wt26-pub-card(?=[\s"])/).slice(1);
  const fromCards: EpisodeFull[] = [];
  const seenCard = new Set<string>();
  const seasonNames = new Map<number, string>();
  for (const raw of cards) {
    const card = raw.split("</ul>")[0] ?? raw;
    const audio = card.match(/<audio[^>]*\ssrc="([^"]+\.mp3)"/i);
    if (!audio?.[1] || seenCard.has(audio[1])) continue;
    seenCard.add(audio[1]);
    const strip = (x: string): string => decodeXmlText(x.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const title = strip(card.match(/class="wt26-pub-card__title">([\s\S]*?)<\/p>/i)?.[1] ?? "")
      .replace(/^RoR\s*[–—-]\s*/i, "");
    const summary = strip(card.match(/class="wt26-pub-card__summary">([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const d = card.match(/class="wt26-pub-card__date">\s*(\d{2})\/(\d{2})\/(\d{2})\s*</);
    // The summary, where present, is "Season 3: Race and Education Episode 1:
    // Critical Race Theory" — the season's THEME plus the title again. Keep the
    // theme as the description; Season 1 titles lack their "Season 1," prefix,
    // so lend it from there.
    const theme = summary.match(/^Season (\d+):\s*(.+?)\s+Episode \d+:/i);
    const seasonNo = title.match(/^Season (\d+)/i)?.[1] ?? theme?.[1];
    // Owner (2026-09-11): the page groups by season, so the title drops its
    // "Season N," prefix — "Episode 3: Why It Matters – Education". The pilot
    // (no season anywhere, a week before S1E1) opens Season 1.
    const shortTitle = title.replace(/^Season \d+,\s*/i, "");
    const season = seasonNo ? Number(seasonNo) : /pilot/i.test(title) ? 1 : null;
    if (theme && season != null && !seasonNames.has(season)) seasonNames.set(season, theme[2].trim());
    fromCards.push({
      id: audio[1],
      title: shortTitle || null,
      audioUrl: audio[1],
      durationSeconds: null,
      publishedAt: d ? `20${d[3]}-${d[1]}-${d[2]}T12:00:00.000Z` : null,
      description: null,
      imageUrl: null,
      season,
    });
  }
  if (fromCards.length > 0) {
    // A season the page never names (Season 4 has no summaries) is named by
    // the prefix its titles share — "Why It Matters – Education", "Why It
    // Matters – Voting, Part 1" → "Why It Matters".
    const bySeason = new Map<number, string[]>();
    for (const ep of fromCards) {
      if (ep.season == null || !ep.title) continue;
      bySeason.set(ep.season, [...(bySeason.get(ep.season) ?? []), ep.title.replace(/^Episode \d+:\s*/i, "")]);
    }
    for (const [season, titles] of bySeason) {
      if (seasonNames.has(season) || titles.length < 2) continue;
      const sep = /\s[–—-]\s/;
      const first = titles[0]!.split(sep)[0]!.trim();
      if (first && titles.every((t) => sep.test(t) && t.split(sep)[0]!.trim() === first)) seasonNames.set(season, first);
    }
    for (const ep of fromCards) ep.seasonName = ep.season != null ? seasonNames.get(ep.season) ?? null : null;
    return { feedTitle: fallbackTitle, feedImage: null, feedDescription: null, episodes: fromCards };
  }

  const titles: string[] = [];
  const seenTitle = new Set<string>();
  const titleRe = /title="((?:RoR|Season)[^"]+)"/gi;
  let tm: RegExpExecArray | null;
  while ((tm = titleRe.exec(html)) !== null) {
    const t = decodeXmlText(tm[1] ?? "").replace(/^RoR\s*[–—-]\s*/i, "");
    if (t && !seenTitle.has(t)) { seenTitle.add(t); titles.push(t); }
  }
  const urls: string[] = [];
  const seenUrl = new Set<string>();
  const urlRe = /https?:\/\/episdionc\.org\/wp-content\/uploads\/[^"'\s)]+\.mp3/gi;
  let um: RegExpExecArray | null;
  while ((um = urlRe.exec(html)) !== null) {
    const u = um[0];
    if (!seenUrl.has(u)) { seenUrl.add(u); urls.push(u); }
  }
  const episodes: EpisodeFull[] = urls.map((url, i) => ({
    id: url,
    title: titles[i] ?? `Episode ${urls.length - i}`,
    audioUrl: url,
    durationSeconds: null,
    publishedAt: null,
    description: null,
    imageUrl: null,
    season: null,
  }));
  return { feedTitle: fallbackTitle, feedImage: null, feedDescription: null, episodes };
}

// Apply show-level artwork overrides to a parsed feed — called after
// every fetch/parse and before caching, so the override is baked in and
// callers never need to think about it.
function applyShowOverrides(data: ParsedFeed, show: Show): ParsedFeed {
  const withSermon = show.sermonMeta
    ? { ...data, episodes: data.episodes.map(sermonMeta) }
    : data;
  if (!show.overrideEpisodeArtwork || !show.artwork) return withSermon;
  const art = show.artwork;
  return {
    ...withSermon,
    episodes: withSermon.episodes.map((ep) => ({ ...ep, imageUrl: art })),
  };
}

/**
 * WHAT A SERMON EPISODE IS CALLED, WHO PREACHED IT, AND WHETHER IT IS ONE.
 *
 * Owner, of the Cathedral of St. John the Divine (2026-09-19): "Make sure you
 * get the title and not just holy Eucharist" · "And the preachers name".
 *
 * That cathedral publishes an episode titled after the SERVICE ("Sunday Holy
 * Eucharist Service – September 13, 2026") and then goes back and puts the
 * sermon's own name in front of it ("Return and Forgiveness — Sunday Holy
 * Eucharist Service – September 13, 2026"). Both forms are in the feed at any
 * moment, so we read whichever is there: a name in front becomes the title and
 * the service line moves underneath; no name in front and the service line IS
 * the title, as before.
 *
 * The split is deliberately narrow, because the cost of a wrong split is a
 * title cut in half. It fires only when the tail begins with a service word
 * AND carries a year, and the head does neither — so "Historical Voices From
 * The Cathedral- Service of Confirmation … - March 5, 1989", a SERIES name
 * rather than a sermon name, is left whole. At the time of writing it fires on
 * nothing in the feed, which is correct: nothing has been re-titled yet.
 *
 * The preacher comes out of the description, which says "…with The Very
 * Reverend Winnie Varghese preaching." on 69 of 87 items (one says it without
 * the "with"). Anything that doesn't match leaves the preacher null rather
 * than guessing a name out of prose.
 */
const SERMON_SERVICE_WORDS = "Sunday|Saturday|Choral|Holy|Morning|Evening|Solemn|Special|Service|Evensong";
const SERMON_TITLE_SPLIT = new RegExp(
  `^(.{3,80}?)\\s+[\\u2014\\u2013-]\\s+((?:${SERMON_SERVICE_WORDS})\\b.*\\b\\d{4}.*)$`,
);
// A head that is itself a series or a date is not a sermon's name.
const SERMON_HEAD_STOP = new RegExp(`^(?:Historical|A Prayer|The Feast|Celebration of|${SERMON_SERVICE_WORDS})\\b|\\d{4}`);
// Titles that name something other than preaching.
const NOT_A_SERMON = /\b(Vigil|Dialogue on|Celebration of|Prayer for the Day|Ordination|Diaconate|Investiture|Historical Voices)\b/i;
/** Under this it is a prayer or a reading, not a sermon. */
const SERMON_MIN_SECONDS = 300;

/** "The Rev. Mike Angell", "The Very Reverend Winnie Varghese", "Bishop …". */
const PREACHER_STYLE = /^(?:The\s+)?(?:Rt\.?\s+|Very\s+|Right\s+)?(?:Rev|Reverend|Revd|Bishop|Canon|Archdeacon|Venerable|Deacon|Dean|Father|Fr|Mother|Br|Brother|Sister|Dr|Mtr)\b/i;

/**
 * THE DATE AND THE PREACHER ARE SHOWN SEPARATELY, so a title that is mostly
 * those two things wastes the line it is given.
 *
 * The Cathedral of St. John the Divine names every episode for the service and
 * the day — "Sunday Holy Eucharist Service – September 13, 2026" — and puts
 * the preacher in the description. I looked through all 87 items for a sermon
 * title in any other field (itunes:subtitle, summary, description, the lot):
 * THERE IS NONE. The feed does not carry one, so there is nothing to find and
 * nothing to invent (owner, 2026-09-19: "Try to find the title … in the
 * metadata"). What is left once the date goes — "Sunday Holy Eucharist" — is
 * the honest name of what you are about to hear, on one line, with the date
 * and the preacher already beside it in the row.
 *
 * Washington National Cathedral writes the date at the FRONT and the preacher
 * after a colon; both come off for the same reason.
 */
const TRAILING_DATE = /\s*[\u2014\u2013-]?\s*(?:on\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i;
const LEADING_DATE = /^\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*[:\u2014\u2013-]?\s*/i;
/** "… Service" adds nothing once the words before it name the service. */
const TRAILING_SERVICE = /\s+Service\s*$/i;

function tidySermonTitle(title: string | null, preacher: string | null): string | null {
  if (!title) return title;
  let out = title.trim().replace(LEADING_DATE, "").replace(TRAILING_DATE, "").trim();
  // "Sunday Sermon: The Rev. Canon Jan Naylor Cope" — the name is already the
  // row's second line, and only cut where what follows really is the preacher.
  const colon = out.indexOf(":");
  if (colon > 2 && preacher) {
    const tail = out.slice(colon + 1).trim();
    if (PREACHER_STYLE.test(tail) || tail.toLowerCase() === preacher.toLowerCase()) out = out.slice(0, colon).trim();
  }
  out = out.replace(TRAILING_SERVICE, "").trim().replace(/[\u2014\u2013-]\s*$/, "").trim();
  // Never cut a title down to nothing, or to a word: better whole than wrong.
  return out.length >= 4 ? out : title.trim();
}

function sermonMeta(ep: EpisodeFull): EpisodeFull {
  let title = ep.title;
  let subtitle: string | null = null;
  let titlePreacher: string | null = null;
  if (title) {
    // St. Michael's writes "Sermon | The Rev. Name | September 13, 2026" —
    // everything already separated, so take it as given rather than guessing.
    const parts = title.split("|").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0]) {
      title = parts[0];
      const rest = parts.slice(1);
      if (rest[0] && PREACHER_STYLE.test(rest[0])) titlePreacher = rest.shift() ?? null;
      subtitle = rest.join(" · ") || null;
    } else {
      const m = SERMON_TITLE_SPLIT.exec(title);
      if (m && m[1] && m[2] && !SERMON_HEAD_STOP.test(m[1])) {
        title = m[1].trim();
        subtitle = m[2].trim();
      } else {
        // "Life Comes Thru the Roots-The Rev. Mike Angell" — the same parish
        // writing the same thing without the pipes. Only when what follows the
        // dash reads as a name, so an ordinary hyphenated title is left alone.
        // Case-insensitive: the same parish writes "the Rev." as often as
        // "The Rev.", and without the flag four of their titles kept the name
        // glued on. The head is held to the same series/date stop as the
        // service split, and the tail through the same name cleanup, so
        // "Historical Voices From The Cathedral- Reverend Jesse Jackson, Deans
        // Conference Lecture- 2 May, 1992" is left whole rather than cut down
        // to the series name with a lecture title standing in for a preacher.
        const dashed = /^(.{3,90}?)\s*[\u2014\u2013-]\s*((?:The\s+)?(?:Rt\.?\s+|Very\s+|Right\s+)?(?:Rev|Reverend|Revd|Bishop|Canon|Father|Fr|Mother|Deacon|Dr|Br)\b.{2,60})$/i.exec(title);
        const dashedName = dashed?.[1] && !SERMON_HEAD_STOP.test(dashed[1]) ? tidyPreacher(dashed[2]) : null;
        if (dashed?.[1] && dashedName) {
          title = dashed[1].trim();
          titlePreacher = dashedName;
        }
      }
    }
  }
  // "…with The Very Reverend Winnie Varghese preaching." — and the one item
  // that opens with the name instead. A trailing role after a comma is theirs,
  // not part of the name we show.
  // parseFeed already read the description in full; a name in the title wins,
  // because it was written for this episode rather than inferred from prose.
  const preacher = titlePreacher ?? ep.preacher ?? null;
  /**
   * IS IT PREACHING? The feed saying someone was PREACHING settles it — an
   * ordination or an Easter Vigil has a sermon in it like any other liturgy,
   * and the title naming the service is not evidence against. Only when there
   * is no preacher named do we fall back to the title and the clock: a vigil,
   * a panel, a two-minute prayer.
   *
   * Nothing is hidden either way. This only lets "play the newest sermon"
   * step over an episode that isn't one.
   */
  const isSermon = preacher != null || (
    (ep.durationSeconds == null || ep.durationSeconds >= SERMON_MIN_SECONDS) &&
    !NOT_A_SERMON.test(ep.title ?? "")
  );
  return { ...ep, title: tidySermonTitle(title, preacher), subtitle, preacher, sermon: isSermon };
}

export async function loadFeed(show: Show, limit: number): Promise<ParsedFeed> {
  const hit = cache.get(show.slug);
  /**
   * A cached parse can serve a request no BIGGER than the one that filled it.
   *
   * The test here was `episodes.length >= Math.min(limit, 1)`, which is
   * `>= 1` for every limit — so any cached parse answered any request. Visit a
   * show page first (50 episodes, as it was) and the courses endpoint, asking
   * for 400, was handed those same 50 for the next half hour: seasons went
   * missing from a course depending on which page you happened to open first.
   * Nothing logged, and it healed itself when the entry expired.
   *
   * So: serve from cache when it was parsed at least as deep, or when the
   * parse came back short of its own cap, which means the feed ended and we
   * have all of it. Otherwise fall through and parse deeper.
   */
  const covers = hit && (hit.limit >= limit || hit.data.episodes.length < hit.limit);
  if (hit && covers && Date.now() - hit.at < TTL_MS) {
    return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) };
  }
  try {
    const body = await fetchFeedText(show.feedUrl);
    const parseLimit = Math.max(limit, 50);
    const parsed = show.kind === "scrape-roundtables"
      ? scrapeRoundtables(body, show.title)
      : parseFeed(body, parseLimit, { sermons: show.sermonMeta });
    const data = applyShowOverrides(parsed, show);
    cache.set(show.slug, { at: Date.now(), data, limit: parseLimit });
    return { ...data, episodes: data.episodes.slice(0, limit) };
  } catch (err) {
    logger.warn({ err, show: show.slug }, "[podcast] feed fetch failed");
    // Stale beats nothing, even if it is shallower than asked for.
    if (hit) return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) };
    return { feedTitle: show.title, feedImage: show.artwork, feedDescription: null, episodes: [], unavailable: true };
  }
}

// Church of England — "Daily Prayer: Common Worship Morning and Evening
// Prayer." ONE Captivate feed carries BOTH offices: two episodes a day,
// titled "… Morning Prayer …" (published ~00:15 UK) and "… Evening
// Prayer …" (~12:00 UK). Unlike Forward Movement (a separate feed per
// office) we load the combined feed and filter by title to pull the
// office the player asked for. Not browsed directly, so it isn't in
// SHOWS / PUBLISHERS — it's only reachable via ?source=church-of-england
// on the office /today endpoint below.
const COE_DAILY_PRAYER_FEED = "https://feeds.captivate.fm/cofe-daily-prayer/";
const COE_SHOW: Show = {
  slug: "coe-daily-prayer",
  title: "Daily Prayer",
  artist: "Church of England",
  publisher: "forward-movement",
  feedUrl: COE_DAILY_PRAYER_FEED,
  artwork: null,
};

// "Gregory" — The Daily Office Chanted: the Episcopal Daily Office sung in
// plainchant. Like the Church of England feed, ONE combined feed carries all
// the day's offices (Morning Prayer ~3am, Evening Prayer ~3pm, Compline ~6pm),
// each episode titled by its office, so we load the feed and filter by title.
const GREGORY_FEED = "https://feed.podbean.com/thedailyofficechanted/feed.xml";
const GREGORY_SHOW: Show = {
  slug: "gregory-daily-office",
  title: "The Daily Office Chanted",
  artist: "The Daily Office Chanted",
  publisher: "forward-movement",
  feedUrl: GREGORY_FEED,
  artwork: "https://pbcdn1.podbean.com/imglogo/image-logo/21622684/Logo_2048x2048.jpg",
};

// Sources whose feed carries BOTH offices in one channel, filtered by episode
// title (vs Forward Movement's separate feed per office). Keyed by the client's
// ?source= value.
const COMBINED_OFFICE_SOURCES: Record<string, { show: Show; feedTitle: string }> = {
  "church-of-england": { show: COE_SHOW, feedTitle: "Daily Prayer · Church of England" },
  "gregory": { show: GREGORY_SHOW, feedTitle: "The Daily Office Chanted" },
};

// ── GET /api/podcast/:show/today — newest episode (offices) ──────────────
// ?source=church-of-england swaps the Forward Movement office feed for
// the Church of England's Common Worship audio for the same office. Any
// other / missing source keeps the existing Forward Movement behaviour,
// so older clients are unaffected.
router.get("/podcast/:show/today", async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.params.show ?? "");
  const show = SHOWS[slug];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");

  // Compline: TONIGHT'S episode, not the newest. It posts about 5:30 PM
  // Eastern, so at midday the newest item is still last night's. Match the
  // episode published on the listener's own date (?date=YYYY-MM-DD); before it
  // posts, the same weekday from last week in the same season (the weekly
  // order repeats), then any episode for that weekday, then the newest.
  if (slug === "compline") {
    const feed = await loadFeed(show, 14);
    const eps = feed.episodes;
    const rawDate = String(req.query.date ?? "");
    const nyYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : nyYmd(new Date());
    let ep = eps.find((e) => !!e.publishedAt && nyYmd(new Date(e.publishedAt)) === ymd) ?? null;
    if (!ep) {
      const days = `${new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}s`;
      const season = /(?:Sundays|Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays)\s+(.+)$/i.exec(eps[0]?.title ?? "")?.[1] ?? null;
      const titled = (e: { title?: string | null }) => (e.title ?? "").toLowerCase();
      ep = (season ? eps.find((e) => titled(e).includes(`${days} ${season}`.toLowerCase())) : undefined)
        ?? eps.find((e) => titled(e).includes(days.toLowerCase()))
        ?? eps[0]
        ?? null;
    }
    res.json({
      feedTitle: feed.feedTitle ?? show.title,
      title: ep?.title ?? null,
      audioUrl: ep?.audioUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      publishedAt: ep?.publishedAt ?? null,
      imageUrl: feed.feedImage ?? ep?.imageUrl ?? null,
    });
    return;
  }

  /**
   * Pray As You Go: the session FOR THE LISTENER'S OWN DAY, not the newest.
   *
   * Every item is stamped 00:00:00 GMT on the day it is meant for, and the
   * next day's is usually up by the evening before — so the newest item is
   * often tomorrow's. The UTC date IS their publication date, so match that
   * against the listener's day (?date=YYYY-MM-DD, else the Eastern day);
   * then the newest session that isn't in the future; then the newest.
   */
  /**
   * Abiding Way's episode for the listener's own day. Their titles ARE the
   * date — "Friday, September 18, 2026" — which is the only reliable key:
   * an episode is posted the EVENING BEFORE the day it is for, so its
   * pubDate belongs to the day before and matching on that would hand back
   * yesterday's reading. The title is read first; the pubDate rules only
   * decide what to fall back to (the newest that is not still in the future).
   */
  if (slug === "abiding-way-lectio") {
    const feed = await loadFeed(show, 14);
    const eps = feed.episodes;
    const rawDate = String(req.query.date ?? "");
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    /**
     * Their titles ARE the date — and a weekend is ONE episode for two days,
     * titled "Saturday & Sunday, September 12/13, 2026", so a day-range has to
     * answer for both days or Sunday falls through to whatever was posted last
     * (which by Sunday evening is Monday's).
     */
    const titleYmds = (title: string | null | undefined): string[] => {
      if (!title) return [];
      const m = /([A-Z][a-z]+)\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}))?,\s*(\d{4})/.exec(title);
      if (!m) return [];
      const month = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
      ].indexOf(m[1]!.toLowerCase());
      if (month < 0) return [];
      const mm = String(month + 1).padStart(2, "0");
      const days = [m[2], m[3]].filter(Boolean) as string[];
      return days.map((d) => `${m[4]}-${mm}-${String(Number(d)).padStart(2, "0")}`);
    };
    const nowIso = new Date().toISOString();
    // Only items with audio: the feed also carries notices ("Special
    // Announcement", "Daily Lectio is on temporary hold") that have no
    // enclosure, and handing one of those back would open a player with
    // nothing to play.
    const playable = eps.filter((e) => !!e.audioUrl);
    const ep = playable.find((e) => titleYmds(e.title).includes(ymd))
      ?? playable.find((e) => !!e.publishedAt && e.publishedAt <= nowIso)
      ?? playable[0]
      ?? null;
    res.json({
      feedTitle: feed.feedTitle ?? show.title,
      title: ep?.title ?? null,
      audioUrl: ep?.audioUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      publishedAt: ep?.publishedAt ?? null,
      imageUrl: feed.feedImage ?? ep?.imageUrl ?? null,
      pageUrl: ep?.pageUrl ?? null,
    });
    return;
  }

  if (slug === "pray-as-you-go") {
    const feed = await loadFeed(show, 10);
    const eps = feed.episodes;
    const rawDate = String(req.query.date ?? "");
    const utcYmd = (iso: string) => new Date(iso).toISOString().slice(0, 10);
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const dated = eps.filter((e) => !!e.publishedAt);
    const ep = dated.find((e) => utcYmd(e.publishedAt!) === ymd)
      ?? dated.find((e) => utcYmd(e.publishedAt!) <= ymd)
      ?? eps[0]
      ?? null;
    res.json({
      feedTitle: feed.feedTitle ?? show.title,
      title: ep?.title ?? null,
      audioUrl: ep?.audioUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      publishedAt: ep?.publishedAt ?? null,
      imageUrl: feed.feedImage ?? ep?.imageUrl ?? null,
      // Their session page — what the player's Transcript pill opens.
      pageUrl: ep?.pageUrl ?? null,
    });
    return;
  }

  const source = String(req.query.source ?? "forward-movement");
  const isOffice = slug === "morning-office" || slug === "evening-office";
  const combined = COMBINED_OFFICE_SOURCES[source];
  if (combined && isOffice) {
    // Combined-feed sources (Church of England, Gregory) carry both offices in
    // one channel. Pull a handful of the newest episodes and pick the first
    // whose title names this office — robust to the morning/evening/compline
    // ordering within the day (today's later offices sit above today's morning).
    const feed = await loadFeed(combined.show, 10);
    const want = slug === "morning-office" ? "morning prayer" : "evening prayer";
    const ep = feed.episodes.find((e) => (e.title ?? "").toLowerCase().includes(want)) ?? null;
    res.json({
      feedTitle: combined.feedTitle,
      title: ep?.title ?? null,
      audioUrl: ep?.audioUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      publishedAt: ep?.publishedAt ?? null,
      // Offices: prefer the show's channel cover over the per-episode image —
      // these feeds give each episode a generic image, not the show cover.
      imageUrl: feed.feedImage ?? ep?.imageUrl ?? null,
    });
    return;
  }

  const feed = await loadFeed(show, 1);
  const ep = feed.episodes[0];

  // Forward Day by Day: attach the precomputed skip-marks (scripture start +
  // donation-appeal start) so Reflect & Sit can skip the intro/outro. Matched
  // to today's episode by guid; absent until the worker has analyzed it (and
  // it stays absent when transcription isn't provisioned — the client then
  // just plays the whole episode).
  let scriptureStartSec: number | null = null;
  let appealStartSec: number | null = null;
  if (slug === "forward-day-by-day") {
    try {
      const guid = ep?.id ?? ep?.audioUrl ?? null;
      const today = new Date().toISOString().slice(0, 10);
      const [mark] = await db
        .select()
        .from(fddAudioMarksTable)
        .where(eq(fddAudioMarksTable.episodeDate, today));
      if (mark && mark.status === "done" && (mark.episodeGuid == null || mark.episodeGuid === guid)) {
        scriptureStartSec = mark.scriptureStartSec;
        appealStartSec = mark.appealStartSec;
      } else if (FDD_TRANSCRIPTION_ENABLED && (!mark || mark.status === "pending")) {
        // On-demand fallback (no worker): kick off the transcribe+detect in
        // the background so a later poll / the next open gets the marks. The
        // dynamic import breaks a circular dependency — buildFddAlignment
        // imports SHOWS/loadFeed from this file.
        const { triggerOnce } = await import("../lib/transcription/alignInFlight");
        const { buildFddAlignment } = await import("../lib/transcription/buildFddAlignment");
        triggerOnce(`fdd:${today}`, () => buildFddAlignment());
      }
    } catch (err) {
      logger.warn({ err }, "[podcast] fdd marks lookup failed");
    }
  }

  res.json({
    feedTitle: feed.feedTitle ?? show.title,
    title: ep?.title ?? null,
    audioUrl: ep?.audioUrl ?? null,
    durationSeconds: ep?.durationSeconds ?? null,
    publishedAt: ep?.publishedAt ?? null,
    // Offices show the recognizable channel cover (their per-episode art is
    // a generic image); other shows keep their per-episode image.
    imageUrl: isOffice
      ? (feed.feedImage ?? show.artwork ?? ep?.imageUrl ?? null)
      : (ep?.imageUrl ?? feed.feedImage ?? show.artwork ?? null),
    scriptureStartSec,
    appealStartSec,
  });
});

/**
 * WHERE EACH CHURCH IS — the one line under its name on the Sermons page
 * (owner, 2026-09-19: "make a sermons page from the menu" · "it would show
 * churches to listen to them from"). A name alone doesn't say where you are
 * listening from, and that is most of what choosing between them is.
 */
const SERMON_SOURCE_ABOUT: Record<string, string> = {
  "national-cathedral-sermons": "Washington, DC · Sunday and feast-day preaching",
  "grace-church-nyc": "Greenwich Village, New York · Episcopal parish since 1846",
  "ssje-sermons": "Cambridge, Massachusetts · Society of Saint John the Evangelist",
  "st-michael-albuquerque": "Albuquerque, New Mexico · Sunday preaching",
  "st-john-divine": "Morningside Heights, New York · Sunday and feast-day preaching",
};

// ── GET /api/podcasts/sermon-sources — the churches you can hear ────────
// The Sermons page's list. The PUBLISHERS "sermons" group is the source of
// truth, so adding a church there adds it here; HIDDEN_FROM_DISCOVER is NOT
// applied, because that flag is about the Discover grid, not about whether a
// church preaches. Registry metadata only — the page asks each show's own
// route for its newest sermon.
//
// WITH ?latest=1 it also carries each church's NEWEST SERMON, so a caller that
// only wants "what did each church last preach" makes ONE request instead of
// one per church. That is what the home's reflections ticker needs (owner,
// 2026-09-19: "In the ticker with the reflections put the last sermons from
// each feed"), and the home must not pay a fan-out to render a row. The feeds
// come from the same 30-minute cache the show route fills, and a feed that
// fails simply has no `latest`.
router.get("/podcasts/sermon-sources", async (req: Request, res: Response): Promise<void> => {
  const group = PUBLISHERS.sermons;
  const shows = (group?.showSlugs ?? []).map((slug) => SHOWS[slug]).filter((s): s is Show => !!s);
  const wantLatest = req.query.latest === "1";
  // Shorter than the registry-only answer, because it carries feed content.
  res.setHeader("Cache-Control", `public, max-age=${wantLatest ? 900 : 3600}`);

  const latestBySlug = new Map<string, EpisodeFull | null>();
  /** Churches whose feed we could not READ — different from having nothing. */
  const unreadable = new Set<string>();
  if (wantLatest) {
    await Promise.all(shows.map(async (show) => {
      try {
        const feed = await loadFeed(show, 20);
        if (feed.unavailable) unreadable.add(show.slug);
        // The newest that IS a sermon: a feed carries other things, and the
        // cathedral's two-minute Prayer for the Day sits near the top.
        latestBySlug.set(show.slug, feed.episodes.find((ep) => (ep as EpisodeFull).sermon !== false) ?? null);
      } catch {
        latestBySlug.set(show.slug, null);
        unreadable.add(show.slug);
      }
    }));
  }

  res.json({
    sources: shows.map((s) => {
      const latest = latestBySlug.get(s.slug);
      return {
        slug: s.slug,
        title: s.artist || s.title,
        showTitle: s.title,
        artwork: s.artwork,
        about: SERMON_SOURCE_ABOUT[s.slug] ?? null,
        ...(wantLatest && unreadable.has(s.slug) ? { unavailable: true as const } : {}),
        ...(wantLatest
          ? {
              latest: latest
                ? {
                    id: latest.id,
                    title: latest.title,
                    publishedAt: latest.publishedAt,
                    preacher: (latest as EpisodeFull).preacher ?? null,
                  }
                : null,
            }
          : {}),
      };
    }),
  });
});

// ── GET /api/podcasts — the full library, grouped by publisher ──────────
// Powers the Discover index. Registry metadata only (no feed fetch), so
// it's instant and long-cacheable. Order follows the PUBLISHERS object's
// declaration order, which is intentionally curated (Forward Movement /
// the offices first).
router.get("/podcasts", (_req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    publishers: Object.entries(PUBLISHERS)
      .map(([key, pub]) => ({
        slug: key,
        title: pub.title,
        emoji: pub.emoji,
        shows: pub.showSlugs
          .map((s) => SHOWS[s])
          .filter((s): s is Show => !!s && !HIDDEN_FROM_DISCOVER.has(s.slug))
          .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork })),
      }))
      .filter((p) => p.shows.length > 0),
    // Thematic filter pills for the Discover page. Tapping one runs an
    // episode search across the whole library (see /podcasts/search).
    themes: THEMES.map((t) => ({ key: t.key, label: t.label, emoji: t.emoji })),
  });
});

// Relevancy score for a free-text query against an episode/show. A title
// hit outweighs a body hit; a leading/exact match outweighs a mid-string
// one; repeated body mentions add a small capped boost. Returns 0 when q
// is empty (theme-only search keeps its recency ordering).
function relevance(q: string, title: string, body: string): number {
  if (!q) return 0;
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  let score = 0;
  if (t.includes(q)) {
    score += 10;
    if (t.startsWith(q)) score += 6;
    if (t === q) score += 10;
  }
  if (b.includes(q)) {
    score += 3;
    if (q.length >= 3) score += Math.min(b.split(q).length - 1, 5);
  }
  return score;
}

// ── GET /api/podcasts/search — search SHOWS + EPISODES ───────────────────
// `?q=` is free-text; `?theme=` is one of the THEMES keys. Either or both
// (AND-combined). Episodes are matched on title + description across the
// whole library; shows on title/artist (free-text only). Loads every
// feed (cached per show) in parallel — the first search warms the cache,
// the rest are instant.
// Unauthenticated (search is open to guests) — rate-limited per IP so it
// can't be used to force repeated cache-miss feed fetches. Feed loads are
// cached (loadFeed, TTL-based) so a single warm search is cheap, but a
// scripted client sending many distinct queries in a burst before the
// cache warms would otherwise cost unbounded outbound fetches.
router.get("/podcasts/search", rateLimit({
  name: "podcasts_search",
  max: 60,
  windowMs: 60 * 1000,
  message: "Too many searches — please slow down and try again shortly.",
}), async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const themeKey = String(req.query.theme ?? "").trim();
  const theme = THEMES.find((t) => t.key === themeKey) ?? null;
  res.setHeader("Cache-Control", "public, max-age=300");

  if (!q && !theme) { res.json({ shows: [], episodes: [] }); return; }

  // Matching shows: free-text matches on title/artist, PLUS shows tagged
  // with the active theme (so a thematically-relevant show like
  // "Roundtables on Race" surfaces under "Justice & Race" even though
  // its episode titles don't keyword-match).
  const showMatches = Object.values(SHOWS)
    .filter((s) => {
      if (HIDDEN_FROM_DISCOVER.has(s.slug)) return false;
      if (q && (s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))) return true;
      if (theme && showThemes(s.slug).includes(theme.key)) return true;
      return false;
    })
    .sort((a, b) => relevance(q, b.title, b.artist) - relevance(q, a.title, a.artist))
    .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork }));

  // Aggregate episodes across all shows (cached feeds), filtered by q AND
  // theme (whichever are set). Office shows are excluded — they live on
  // the office screen, not in the podcast library.
  const all = Object.values(SHOWS).filter((s) => !HIDDEN_FROM_DISCOVER.has(s.slug));
  const feeds = await Promise.all(all.map(async (s) => {
    try { return { s, f: await loadFeed(s, 50) }; }
    catch { return { s, f: { feedTitle: null, feedImage: null, feedDescription: null, episodes: [] as EpisodeFull[] } }; }
  }));

  type Hit = EpisodeFull & { show: { slug: string; title: string; artist: string; artwork: string | null } };
  const scored: Array<{ hit: Hit; score: number }> = [];
  for (const { s, f } of feeds) {
    const showArt = f.feedImage ?? s.artwork ?? null;
    // A whole show tagged with the active theme contributes ALL its
    // episodes (covers shows whose episode titles don't keyword-match).
    const showTagged = !!theme && showThemes(s.slug).includes(theme.key);
    for (const ep of f.episodes) {
      const hay = `${ep.title ?? ""} ${ep.description ?? ""}`.toLowerCase();
      const matchesQ = !q || hay.includes(q);
      const matchesTheme = !theme || showTagged || theme.keywords.some((k) => hay.includes(k));
      if (matchesQ && matchesTheme) {
        scored.push({
          hit: { ...ep, show: { slug: s.slug, title: s.title, artist: s.artist, artwork: showArt } },
          score: relevance(q, ep.title ?? "", ep.description ?? ""),
        });
      }
    }
  }
  // Free-text: rank by relevancy, recency as tiebreaker. Theme-only (no
  // q): pure recency. Cap so a broad theme doesn't return hundreds.
  scored.sort((a, b) => {
    if (q && b.score !== a.score) return b.score - a.score;
    return new Date(b.hit.publishedAt ?? 0).getTime() - new Date(a.hit.publishedAt ?? 0).getTime();
  });

  res.json({ shows: showMatches, episodes: scored.slice(0, 80).map((x) => x.hit) });
});

// ── GET /api/podcasts/publisher/:publisher — publisher + show list ───────
router.get("/podcasts/publisher/:publisher", (req: Request, res: Response): void => {
  const key = String(req.params.publisher ?? "");
  const pub = PUBLISHERS[key];
  if (!pub) { res.status(404).json({ error: "Unknown publisher" }); return; }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    slug: key,
    title: pub.title,
    emoji: pub.emoji,
    shows: pub.showSlugs
      .map((s) => SHOWS[s])
      .filter((s): s is Show => !!s)
      .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork })),
  });
});

// ── GET /api/podcasts/show/:slug — show + recent episodes ────────────────
/**
 * HOW MANY EPISODES A SHOW PAGE LISTS.
 *
 * It was 50, which quietly hid the OLDEST episodes of any show with more —
 * The Way of Love has 54, so its page was missing the trailer and the first
 * two episodes of the season that is now a course. A show page that can't
 * reach a show's beginning is broken in a way nobody reports.
 *
 * 300 carries every finite show in the registry whole: the longest are Grace
 * Church at 228, The Living Church at 184 and Turning to the Mystics at 182.
 * At roughly 850 bytes an episode that is ~250 KB uncompressed at the very
 * top of the range and a fraction of that over the wire, for a list that is
 * searchable and sortable and grouped by season — and typically far less,
 * because most shows are nowhere near it. The daily feeds opt out via
 * Show.browseEpisodes rather than dragging the default down for everyone.
 */
const BROWSE_EPISODES = 300;

router.get("/podcasts/show/:slug", async (req: Request, res: Response): Promise<void> => {
  const show = SHOWS[String(req.params.slug ?? "")];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  /**
   * ?limit= — for a caller that wants the newest few rather than the show.
   *
   * The Sermons page draws five one-line rows and was pulling five WHOLE
   * feeds to do it, about 400 KB over a phone's connection, because the only
   * shape on offer was the browse list (2026-09-19). It asks for what it
   * shows: the newest sermon plus the seven under Previous.
   *
   * The cache is unaffected — a shallow request is served from a deep parse
   * and never overwrites it (see loadFeed).
   */
  const askedRaw = Number(req.query.limit);
  const asked = Number.isFinite(askedRaw) && askedRaw > 0 ? Math.min(Math.floor(askedRaw), BROWSE_EPISODES) : null;
  const feed = await loadFeed(show, asked ?? show.browseEpisodes ?? BROWSE_EPISODES);
  res.setHeader("Cache-Control", feed.unavailable ? "no-store" : "public, max-age=600");
  const pub = PUBLISHERS[show.publisher];
  res.json({
    show: {
      slug: show.slug,
      title: show.title,
      artist: show.artist,
      artwork: feed.feedImage ?? show.artwork ?? null,
      publisher: show.publisher,
      publisherTitle: pub?.title || show.artist,
      emoji: show.emoji ?? pub?.emoji ?? "🎧",
      description: show.description ?? feed.feedDescription ?? null,
    },
    episodes: feed.episodes,
    // "We could not read it", not "there is nothing in it" — and a failure is
    // not worth ten minutes of edge cache, because the next try might work.
    ...(feed.unavailable ? { unavailable: true as const } : {}),
  });
});

// Some CAC shows (e.g. "Turning to the Mystics") dedicate each whole season
// to one named subject — a mystic, a book — so a bare "Season 6" undersells
// what's actually there ("Julian of Norwich"). Episode titles usually name
// that subject somewhere ("Julian of Norwich: Listener Questions", "A
// Coaching Session on Brother Lawrence", …), so we extract the leading
// name-like phrase from each title, take the season's most frequent
// candidate, and only trust it when it's a clear majority — other shows
// (e.g. "Another Name For Every Thing") mix several guests/topics per
// season with no single dominant subject, and a low-confidence guess there
// would be worse than just "Season N".
const SEASON_NAME_STOP = /^(bonus|dialogue \d+|a coaching session|listener questions|introduction|part \d+|session \d+|the practice|questions about|coming soon)/i;
/**
 * LETTERS IN ANY SCRIPT (owner, 2026-09-15: "in turning to the mystics there
 * are two seasons without titles").
 *
 * These patterns were `[A-Z][\w.'’ ]`, and JavaScript's `\w` and `\b` are
 * ASCII-only — even with the u flag — so a name with an accent in it could
 * never be a candidate: every "Thérèse of Lisieux: Session 1" stopped at the
 * é, and Season 13 fell back to a bare "Season 13". `\p{L}` is any letter.
 * Replayed against every course show's live feed first: seasons 1–12 and
 * every other show came out identical; only 13 and 14 gained their names.
 */
function seasonNameCandidates(title: string): string[] {
  const out: string[] = [];
  const leading = title.match(/^(\p{Lu}[\p{L}\p{N}.'’ ]{2,40}?):\s/u);
  if (leading && !SEASON_NAME_STOP.test(leading[1])) out.push(leading[1].trim());
  const onPhrase = title.match(/(?<![\p{L}\p{N}_])on (\p{Lu}[\p{L}\p{N}.'’]+(?: \p{Lu}[\p{L}\p{N}.'’]+){0,3})/u);
  if (onPhrase) out.push(onPhrase[1].trim());
  const studyingPhrase = title.match(/(?<![\p{L}\p{N}_])Studying (\p{Lu}[\p{L}\p{N}.'’]+(?: \p{Lu}[\p{L}\p{N}.'’]+){0,3})/u);
  if (studyingPhrase) out.push(studyingPhrase[1].trim());
  return out;
}
/**
 * The season's own announcement, for a season too new to have a majority.
 *
 * "Turning to the Mystics" opens each season with "Coming Soon: Turning to
 * <the mystic>" and a welcome episode, "Turning to <the mystic>". A season
 * whose trailer is still its only episode (Season 14, Emily Dickinson, until
 * September 28, 2026) has one title and no majority to find, so this names it
 * — only when the majority finds nothing, and only when every such title in
 * the season names the same person.
 */
function announcedSeasonName(episodes: EpisodeFull[]): string | null {
  const names = new Set<string>();
  for (const ep of episodes) {
    const m = ep.title?.match(/^(?:Coming Soon:\s*)?Turning to (\p{Lu}[\p{L}\p{N}.'’ ]{2,60})$/u);
    if (m) names.add(m[1].trim());
  }
  return names.size === 1 ? [...names][0]! : null;
}
function deriveSeasonName(episodes: EpisodeFull[]): string | null {
  const counts = new Map<string, number>();
  for (const ep of episodes) {
    if (!ep.title) continue;
    for (const name of seasonNameCandidates(ep.title)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) { best = name; bestCount = count; }
  }
  // Require real majority support, not just "mentioned more than others" —
  // a single stray match out of 15 episodes shouldn't become the label.
  if (best && episodes.length > 0 && bestCount >= 3 && bestCount / episodes.length >= 0.3) {
    return best;
  }
  return announcedSeasonName(episodes);
}

// ── GET /api/podcasts/cac/courses — CAC shows grouped into season "courses" ──
// Beta feature. CAC's own shows tag episodes with <itunes:season> (each
// season is one teaching series — a mystic, a Rohr book, …); we group by
// season and hand back one "course" per (show, season), oldest episode
// first, so the client can walk it Coursera-style using the existing
// course-progress + podcast-player plumbing (see PlayingEpisode.courseComplete,
// the same mechanism way-of-love-course.tsx already uses).
export type CacCourse = {
  id: string;
  showSlug: string;
  showTitle: string;
  author: string;
  artwork: string | null;
  season: number;
  title: string;
  episodes: EpisodeFull[];
};

/**
 * HAND-CUT SEASONS, for a show whose feed carries more than the course does.
 *
 * Owner, of The Way of Love with Bishop Michael Curry (2026-09-19): "Let's
 * split them as different courses within the show, just like CAC turning to
 * the mystics" and then "You can leave out episodes that don't fit."
 *
 * A podcast season and a course are not the same object. A season is
 * everything the publisher put out under that number — the teaching run, the
 * bonus interviews afterwards, a Christmas message, a trailer. A course is the
 * through-line you can walk end to end. Where the two differ, this table says
 * so, PER SHOW: no show without an entry here changes in any way, which is the
 * point — the CAC courses people already have progress in must keep exactly
 * the episodes and the counts they have today.
 *
 * `numberedOnly` drops what the publisher itself never placed in sequence
 * (<itunes:episode> absent): on this feed that is the 65-second show trailer
 * and an unnumbered Christmas special, and it is the general shape of the
 * "trailer as lesson 1" problem the 2026-09-15 course audit left open.
 * min/maxEpisode then cut a season down to its run. A season with no entry
 * keeps everything it has.
 *
 * A title here is used VERBATIM and the derived-name heuristics are skipped,
 * so what a season is called is a decision written down rather than a guess
 * that can quietly change when a feed does.
 */
type ShowCourseMeta = {
  /**
   * The only seasons offered AS COURSES. Everything else the show published
   * stays exactly where it was — `/podcasts/show/:slug` hands back the feed
   * untouched, so the seasons left out here are still browsable and playable
   * in the audio library. This trims the course list, not the show.
   */
  courseSeasons?: readonly number[];
  numberedOnly?: boolean;
  seasons?: Record<number, { title?: string; minEpisode?: number; maxEpisode?: number }>;
};
const SHOW_COURSE_META: Record<string, ShowCourseMeta> = {
  "way-of-love-curry": {
    /**
     * THE TWO THE SHOW ITSELF NAMED (owner, 2026-09-19: "What if we just do
     * the first two two seasons of the curry one").
     *
     * Seasons 1 and 2 walk the seven practices and are the only ones the show
     * ever gave a name; 3, 4 and 5 are guest conversations nobody titled — and
     * two named seasons is, almost certainly, where the owner's "They have two
     * seasons" came from. The conversations are not deleted: they are still in
     * the library under the show, just not offered as courses to begin.
     */
    courseSeasons: [1, 2],
    numberedOnly: true,
    seasons: {
      // Episodes 1-8: "What is the Way of Love?" and then the seven practices.
      // 9-11 are bonus episodes recorded AFTER the season ("In this first
      // bonus episode following Season 1…"), by the show's own description.
      1: { title: "The Seven Practices", maxEpisode: 8 },
      // The show names this season itself — Season 1's bonus episode
      // announces 'the theme ("Beyond the Church Walls")' for Season 2. Again
      // 1-8 is the run; 9-18 are bonus interviews, a Christmas message, the
      // Rooted in Jesus live recordings and a cathedral sermon.
      2: { title: "Beyond the Church Walls", maxEpisode: 8 },
      // Not offered today (see courseSeasons) — kept so that restoring
      // Season 5 restores its cut with it: 1-9 are the conversations, 10 is
      // the Presiding Bishop's Christmas message. Seasons 3 and 4 need no cut.
      5: { maxEpisode: 9 },
    },
  },
};

// One "course" per season of a show, in feed order (oldest first). Shared by
// the CAC library and the per-show endpoint below, so course ids — the key
// the device's progress is stored under — are identical from both.
async function buildCourses(shows: Show[]): Promise<CacCourse[]> {
  const courses: CacCourse[] = [];
  // Fetch every show's feed concurrently — each is an independent external
  // request, so awaiting them one at a time in a for-loop meant a cold cache
  // (server just started, or the 30-min per-show TTL lapsed) paid the sum of
  // all the round-trips instead of just the slowest one.
  const showsWithFeeds = await Promise.all(
    shows.map(async (show) => ({ show, feed: await loadFeed(show, 400) })),
  );
  for (const { show, feed } of showsWithFeeds) {
    const slug = show.slug;
    // Prefer the curated SHOWS registry artwork over the feed's own channel
    // image — most CAC shows' feeds match it anyway, but "Love Period"'s
    // Podbean feed serves a different (non-branded) channel logo that broke
    // the otherwise-consistent CAC cover look across the course grid.
    const artwork = show.artwork ?? feed.feedImage ?? null;
    // Some feeds tag every real episode with a season but leave trailers /
    // bonus one-offs untagged — grouping those under a fabricated "Season 1"
    // would invent a season that never existed (e.g. a show whose real
    // seasons start at 3). So: if ANY episode in the feed carries a season
    // tag, drop the untagged stragglers entirely (they're still reachable
    // via the normal /podcasts/show browse page, just not as a "course").
    // Only when a show has NO season tags at all do we fall back to one
    // single course covering the whole feed, so nothing goes unorganized.
    const anyTagged = feed.episodes.some((ep) => ep.season !== null);
    const meta = SHOW_COURSE_META[slug];
    const bySeason = new Map<number, EpisodeFull[]>();
    for (const ep of feed.episodes) {
      // Not placed in the sequence by the publisher → not a lesson. Only for
      // a show that asked for it, and only where the feed numbers at all.
      if (meta?.numberedOnly && ep.episodeNumber == null) continue;
      if (ep.season === null) {
        if (anyTagged) continue; // untagged straggler — skip, not a real season
        const list = bySeason.get(1) ?? [];
        list.push(ep);
        bySeason.set(1, list);
        continue;
      }
      const list = bySeason.get(ep.season) ?? [];
      list.push(ep);
      bySeason.set(ep.season, list);
    }
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);
    for (const season of seasons) {
      // Offered as a course at all? A season left out stays in the library.
      if (meta?.courseSeasons && !meta.courseSeasons.includes(season)) continue;
      // The feed lists newest-first; a course plays oldest-first.
      let episodes = [...(bySeason.get(season) ?? [])].reverse();
      const seasonMeta = meta?.seasons?.[season];
      if (seasonMeta) {
        const { minEpisode, maxEpisode } = seasonMeta;
        episodes = episodes.filter((ep) => {
          const n = ep.episodeNumber;
          if (n == null) return minEpisode == null && maxEpisode == null;
          if (minEpisode != null && n < minEpisode) return false;
          if (maxEpisode != null && n > maxEpisode) return false;
          return true;
        });
      }
      // A hand-cut show plays in the publisher's OWN numbering where it has
      // one — publication order alone put Season 5's two episode 3s either
      // side of episode 4, which reads as a mistake in a lesson list. Ties and
      // unnumbered episodes keep their publication order (sort is stable).
      if (meta && episodes.every((ep) => ep.episodeNumber != null)) {
        episodes = [...episodes].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
      }
      if (episodes.length === 0) continue;
      // A feed that names its seasons (the Roundtables scraper) wins over the
      // title-pattern guess; a season nobody names is plain "Season N" (owner).
      // A season NAMED IN THE TABLE above wins over both, and skips the guess
      // entirely — a written-down title shouldn't drift with the feed.
      const seasonName = seasons.length > 1
        ? (seasonMeta?.title
          ?? (meta ? null : episodes.find((ep) => ep.seasonName)?.seasonName ?? deriveSeasonName(episodes)))
        : null;
      courses.push({
        id: `${slug}-s${season}`,
        showSlug: slug,
        showTitle: show.title,
        author: show.artist,
        artwork,
        season,
        title: seasons.length <= 1 ? show.title : seasonName ? `Season ${season}: ${seasonName}` : `Season ${season}`,
        episodes,
      });
    }
  }
  return courses;
}

/**
 * WHICH CAC SHOWS ARE OFFERED AS COURSES — a shorter list than the publisher's.
 *
 * Owner, 2026-09-11: "what if we added Turning to the Mystics and The Cosmic We
 * into the admin only courses … those i think are most relevant … hide the
 * other courses." A course is something you sit down and walk end to end, and
 * only these two read that way; the rest of CAC's catalogue is a podcast you
 * dip into. The other four shows are NOT removed from anything else — Discover
 * still lists them, search still finds them, /podcast/:show still plays them,
 * and /podcasts/show/:slug/courses still serves any show by slug for a direct
 * link. They are simply not presented as courses to begin.
 *
 * This one list narrows every surface at once (the Courses menu rows, the CAC
 * grid, the CAC home, the home's Learn section) because all four read this
 * endpoint. Widen it here and they all widen together.
 */
const CAC_COURSE_SHOW_SLUGS: readonly string[] = [
  "cac-turning-to-the-mystics",
  "cac-cosmic-we",
];

router.get("/podcasts/cac/courses", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "public, max-age=600");
  const shows = CAC_COURSE_SHOW_SLUGS
    .map((slug) => SHOWS[slug])
    .filter((show): show is Show => !!show);
  res.json({ courses: await buildCourses(shows) });
});

// One show's seasons in the same course shape, plus the show's own header
// copy. The season-card show page (pages/cac-show.tsx) reads this for ANY
// show; Round Table on Race is the first non-CAC one (owner, 2026-09-11:
// "more like this, with the description still").
router.get("/podcasts/show/:slug/courses", async (req: Request, res: Response): Promise<void> => {
  const show = SHOWS[String(req.params.slug ?? "")];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");
  const pub = PUBLISHERS[show.publisher];
  const courses = await buildCourses([show]);
  res.json({
    show: {
      slug: show.slug,
      title: show.title,
      artist: show.artist,
      artwork: courses[0]?.artwork ?? show.artwork ?? null,
      publisher: show.publisher,
      publisherTitle: pub?.title || show.artist,
      emoji: show.emoji ?? pub?.emoji ?? "🎧",
      description: show.description ?? null,
    },
    courses,
  });
});

export default router;
