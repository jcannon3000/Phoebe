/**
 * Daily Office Routes
 *
 * GET  /office/morning          — returns assembled Morning Prayer slides (mounted at /api)
 * POST /office/morning/prefetch — warms cache for a future date (internal, mounted at /api)
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { assembleMorningPrayer } from "../lib/assembleMorningPrayer";
import { INVITATORY_CATALOG, canticlesForRite, buildCanticleRun, buildInvitatoryRun } from "../lib/officeSwap";
import { parseRite } from "../lib/officeRite";
import { assembleEveningPrayer } from "../lib/assembleEveningPrayer";
import { assembleDevotion, type DevotionKind } from "../lib/assembleDevotion";
import { assembleCreationDevotion } from "../lib/assembleCreationDevotion";
import { CREATION_COLLECTS, CREATION_PRAYERS, CREATION_BLESSINGS, CREATION_READINGS, CREATION_QUOTES, CREATION_CANTICLES, CREATION_AFFIRMATIONS, CREATION_LITANIES } from "../lib/creationLibrary";
import { assembleCompline } from "../lib/assembleCompline";
import { getOfficeDay } from "../lib/liturgicalCalendar";
import { getLectionaryReadings } from "../lib/lectionary";
import { buildOfficeOrdoDay, getOrdoCommonTexts } from "../lib/officeOrdo";
import { parsePsalmRef, sliceVersesByRange, slicePsalmToRef, displayPsalmRef, displayLessonRef } from "../lib/psalmRange";
import { isUserBeta } from "../lib/parishGate";
import { resolveLocale } from "../lib/officeI18n";
import { seedBcpTexts } from "../seeds/bcpTexts";
import { PSALTER } from "../seeds/bcpPsalter";
import { assembleScriptureReading, assembleSundayReading, parseScriptureParts } from "../lib/assembleScriptureReading";

const router = Router();

// Parse a ?date=YYYY-MM-DD by anchoring at LOCAL noon. A bare YYYY-MM-DD in
// new Date() parses as UTC MIDNIGHT, and the assembly pipeline reads it with
// local getters (startOfDay / getOfficeDay) — so any server west of UTC
// rolled the office back a day (prod's UTC clock masked this; local dev
// served yesterday's propers — caught comparing against the lectionary).
// Noon keeps the calendar day stable under both local and UTC getters for
// every timezone. Same anchor /psalms/today already uses.
function parseOfficeDate(raw: unknown): Date {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = typeof raw === "string" && raw ? new Date(raw) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

// GET /office/morning — public, no auth required (liturgical content is same for all users)
router.get("/office/morning", async (req, res) => {
  const date = parseOfficeDate(req.query.date);

  try {
    const userId = (req.user as { id: number } | undefined)?.id ?? 0;
    const locale = resolveLocale(req.query.locale);
    // Per-side confession override (Morning/Evening split): ?confession=1|0.
    const confessionOverride = req.query.confession === undefined ? undefined : req.query.confession === "1";
    const { slides, officeDay, fromCache } = await assembleMorningPrayer(
      date,
      userId,
      locale,
      confessionOverride,
      // Coerced to Rite II while RITE_I_ENABLED is false, so this is inert
      // end to end no matter what a client sends — see lib/officeRite.ts.
      parseRite(req.query["rite"]),
    );

    return res.json({
      slides,
      officeDay: {
        ...officeDay,
        totalSlides: slides.length,
      },
      fromCache,
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Morning Prayer assembly failed:", err);

    // Emergency fallback office — never return a 500 to the user
    const officeDay = getOfficeDay(date);
    const emergencySlides = [
      {
        id: "emergency_0",
        type: "opening",
        emoji: "✨",
        eyebrow: "",
        title: null,
        content: officeDay.weekdayLabel,
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: false,
        scrollHint: null,
        metadata: { season: officeDay.season, date: date.toISOString() },
      },
      {
        id: "emergency_1",
        type: "invitatory_psalm",
        emoji: "🎶",
        eyebrow: "VENITE · PSALM 95",
        title: null,
        content:
          "Come, let us sing to the Lord; *\n  let us shout for joy to the Rock of our salvation.\nLet us come before his presence with thanksgiving *\n  and raise a loud shout to him with psalms.\nFor the Lord is a great God, *\n  and a great King above all gods.\nIn his hand are the caverns of the earth, *\n  and the heights of the hills are his also.\nThe sea is his, for he made it, *\n  and his hands have molded the dry land.\nCome, let us bow down, and bend the knee, *\n  and kneel before the Lord our Maker.\nFor he is our God,\nand we are the people of his pasture and the sheep of his hand. *\n  Oh, that today you would hearken to his voice!",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: "BCP p. 82",
        isScrollable: false,
        scrollHint: null,
        metadata: {},
      },
      {
        id: "emergency_2",
        type: "general_thanksgiving",
        emoji: "🌾",
        eyebrow: "THE GENERAL THANKSGIVING",
        title: null,
        content:
          "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: "BCP p. 101",
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
        metadata: {},
      },
      {
        id: "emergency_3",
        type: "closing",
        emoji: "🙏🏽",
        eyebrow: "",
        title: null,
        content: "Morning Prayer",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: false,
        scrollHint: null,
        metadata: { date: date.toISOString() },
      },
    ];

    return res.json({
      slides: emergencySlides,
      officeDay: {
        season: officeDay.season,
        liturgicalYear: officeDay.liturgicalYear,
        sundayLabel: officeDay.sundayLabel,
        weekdayLabel: officeDay.weekdayLabel,
        properNumber: officeDay.properNumber,
        feastName: officeDay.feastName,
        isMajorFeast: officeDay.isMajorFeast,
        useAlleluia: officeDay.useAlleluia,
        totalSlides: emergencySlides.length,
      },
      fromCache: false,
      cacheDate: date.toISOString().slice(0, 10),
      isEmergency: true,
    });
  }
});

// GET /office/evening — public, no auth required
router.get("/office/evening", async (req, res) => {
  let date: Date;
  try {
    date = parseOfficeDate(req.query.date);
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

  try {
    const userId = (req.user as { id: number } | undefined)?.id ?? 0;
    const locale = resolveLocale(req.query.locale);
    const confessionOverride = req.query.confession === undefined ? undefined : req.query.confession === "1";
    const { slides, officeDay, fromCache } = await assembleEveningPrayer(date, userId, locale, confessionOverride, parseRite(req.query["rite"]));

    return res.json({
      slides,
      officeDay: { ...officeDay, totalSlides: slides.length },
      fromCache,
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Evening Prayer assembly failed:", err);

    const officeDay = getOfficeDay(date);
    const emergencySlides = [
      {
        id: "ep_emergency_0", type: "opening", emoji: "🌙", eyebrow: "",
        title: null, content: officeDay.weekdayLabel,
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: null, isScrollable: false, scrollHint: null,
        metadata: { season: officeDay.season, date: date.toISOString(), office: "evening" },
      },
      {
        id: "ep_emergency_1", type: "invitatory_psalm", emoji: "🕯️",
        eyebrow: "O GRACIOUS LIGHT · PHOS HILARON", title: null,
        content: "O gracious light,\npure brightness of the everliving Father in heaven,\nO Jesus Christ, holy and blessed!\n\nNow as we come to the setting of the sun,\nand our eyes behold the vesper light,\nwe sing your praises, O God: Father, Son, and Holy Spirit.\n\nYou are worthy at all times to be praised by happy voices,\nO Son of God, O Giver of Life,\nand to be glorified through all the worlds.",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: "BCP p. 118", isScrollable: false, scrollHint: null, metadata: {},
      },
      {
        id: "ep_emergency_2", type: "general_thanksgiving", emoji: "🌾",
        eyebrow: "THE GENERAL THANKSGIVING", title: null,
        content: "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: "BCP p. 125", isScrollable: true,
        scrollHint: "↓ continue · tap when ready", metadata: {},
      },
      {
        id: "ep_emergency_3", type: "closing", emoji: "🌙", eyebrow: "",
        title: null, content: "Evening Prayer",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: null, isScrollable: false, scrollHint: null,
        metadata: { date: date.toISOString(), office: "evening" },
      },
    ];

    return res.json({
      slides: emergencySlides,
      officeDay: {
        season: officeDay.season, liturgicalYear: officeDay.liturgicalYear,
        sundayLabel: officeDay.sundayLabel, weekdayLabel: officeDay.weekdayLabel,
        properNumber: officeDay.properNumber, feastName: officeDay.feastName,
        isMajorFeast: officeDay.isMajorFeast, useAlleluia: officeDay.useAlleluia,
        totalSlides: emergencySlides.length,
      },
      fromCache: false,
      cacheDate: date.toISOString().slice(0, 10),
      isEmergency: true,
    });
  }
});

// GET /office/compline — beta-only. Same shape as /office/morning and
// /office/evening (assembled slide deck for the night office, BCP
// pp. 127-135), but gated to beta users while we test the rotation +
// inline-lesson rendering. Returns 401 for unauthenticated callers
// and 403 for non-beta users; the client UI already hides every
// Compline entry point for non-beta users, so this is defense in
// depth for the direct-URL / API path.
router.get("/office/compline", async (req, res) => {
  const userId = (req.user as { id: number } | undefined)?.id ?? 0;
  if (!userId) {
    res.status(401).json({ error: "Sign in to pray Compline." });
    return;
  }
  if (!(await isUserBeta(userId))) {
    res.status(403).json({ error: "Compline is currently in beta." });
    return;
  }

  let date: Date;
  try {
    date = parseOfficeDate(req.query.date);
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

  try {
    const locale = resolveLocale(req.query.locale);
    const { slides, officeDay } = await assembleCompline(date, userId, locale);
    return res.json({
      slides,
      officeDay: { ...officeDay, totalSlides: slides.length },
      fromCache: false,
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Compline assembly failed:", err);

    // Emergency fallback — keep the office reachable even if the DB
    // hiccups on the psalm lookup. Renders the Nunc Dimittis +
    // blessing so a visitor at least gets a complete short
    // contemplative beat rather than a 500.
    const officeDay = getOfficeDay(date);
    const emergencySlides = [
      {
        id: "compline_emergency_0", type: "office_intro", emoji: "🌌", eyebrow: "Before you begin",
        title: "Compline", content: "Compline is the Church's prayer at the close of day.",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: null, isScrollable: false, scrollHint: null,
        metadata: { date: date.toISOString(), office: "compline" },
      },
      {
        id: "compline_emergency_1", type: "canticle", emoji: "🌌",
        eyebrow: "NUNC DIMITTIS · LUKE 2:29-32", title: "The Song of Simeon",
        content:
          "Lord, you now have set your servant free *\n  to go in peace as you have promised;\nFor these eyes of mine have seen the Savior, *\n  whom you have prepared for all the world to see:\nA Light to enlighten the nations, *\n  and the glory of your people Israel.",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: "BCP p. 135", isScrollable: true,
        scrollHint: "↓ continue · tap when ready", metadata: {},
      },
      {
        id: "compline_emergency_2", type: "closing", emoji: "🌌", eyebrow: "BLESSING",
        title: null,
        content: "The almighty and merciful Lord,\nFather, Son, and Holy Spirit,\nbless us and keep us. Amen.",
        isCallAndResponse: false, callAndResponseLines: null,
        bcpReference: "BCP p. 135", isScrollable: false, scrollHint: null,
        metadata: { date: date.toISOString(), office: "compline" },
      },
    ];

    return res.json({
      slides: emergencySlides,
      officeDay: {
        season: officeDay.season, liturgicalYear: officeDay.liturgicalYear,
        sundayLabel: officeDay.sundayLabel, weekdayLabel: officeDay.weekdayLabel,
        properNumber: officeDay.properNumber, feastName: officeDay.feastName,
        isMajorFeast: officeDay.isMajorFeast, useAlleluia: officeDay.useAlleluia,
        totalSlides: emergencySlides.length,
      },
      fromCache: false,
      cacheDate: date.toISOString().slice(0, 10),
      isEmergency: true,
    });
  }
});

// POST /office/morning/prefetch (internal, nightly cron at 11pm)
router.post("/office/morning/prefetch", async (req, res) => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  let date: Date;
  try {
    date = req.body?.date ? new Date(req.body.date) : new Date();
    // Default to tomorrow
    if (!req.body?.date) {
      date.setDate(date.getDate() + 1);
    }
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
    date.setDate(date.getDate() + 1);
  }

  try {
    const { fromCache } = await assembleMorningPrayer(date, 0);
    return res.json({
      cached: !fromCache,
      date: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Morning Prayer prefetch failed:", err);
    return res.status(500).json({ error: "Prefetch failed" });
  }
});

// POST /office/seed — one-time BCP texts seed (internal)
router.post("/office/seed", async (req, res) => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await seedBcpTexts();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("BCP seed failed:", err);
    return res.status(500).json({ error: "Seed failed", detail: String(err) });
  }
});

// GET /creation/library — the Season of Creation prayer library (collects,
// prayers, blessings, readings, quotes) for the "Prayers for the Climate" page.
// Static, public-domain / gift-licensed text; no per-user data.
router.get("/creation/library", (_req, res) => {
  res.json({
    collects: CREATION_COLLECTS,
    canticles: CREATION_CANTICLES,
    affirmations: CREATION_AFFIRMATIONS,
    litanies: CREATION_LITANIES,
    prayers: CREATION_PRAYERS,
    blessings: CREATION_BLESSINGS,
    readings: CREATION_READINGS,
    quotes: CREATION_QUOTES,
  });
});

// GET /devotion/:kind — Daily Devotions for Individuals and Families
// (1979 BCP pp. 137 / 139). Phoebe surfaces two of the four — In the
// Morning and In the Early Evening — per user direction. The psalm is
// the appointed lectionary psalm for the day; everything else is the
// short BCP devotion text. No cache: the assembly is cheap (one psalm
// lookup + the per-user intercessions queries).
router.get("/devotion/:kind", async (req, res) => {
  const kindParam = String(req.params.kind ?? "");

  let date: Date;
  try {
    date = parseOfficeDate(req.query.date);
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

  // Season of Creation devotion — the two-week creation Psalter + the guide's
  // creation-themed office texts (see assembleCreationDevotion). Not the BCP
  // Daily Devotions form, so it's dispatched separately here.
  if (kindParam === "creation-morning" || kindParam === "creation-evening") {
    const side = kindParam === "creation-morning" ? "morning" : "evening";
    // ?single=1 when the user prays Creation Prayer only once a day → the
    // four-week combined Psalter (so a once-a-day pray-er still covers every
    // psalm). The client passes it based on the user's morning/evening prefs.
    const single = req.query.single === "1";
    try {
      const userId = (req.user as { id: number } | undefined)?.id ?? 0;
      const { slides, officeDay } = await assembleCreationDevotion(date, userId, side, single);
      return res.json({
        slides,
        officeDay: { ...officeDay, totalSlides: slides.length },
        cacheDate: date.toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error(`Creation devotion assembly failed (${side}):`, err);
      return res.status(500).json({ error: "Failed to assemble creation devotion" });
    }
  }

  const kind: DevotionKind | null =
    kindParam === "morning" ? "morning"
      : kindParam === "early-evening" ? "early-evening"
      : null;
  if (!kind) {
    return res.status(400).json({ error: "Unknown devotion. Use 'morning' or 'early-evening'." });
  }

  try {
    const userId = (req.user as { id: number } | undefined)?.id ?? 0;
    const locale = resolveLocale(req.query.locale);
    const { slides, officeDay } = await assembleDevotion(date, userId, kind, locale);
    return res.json({
      slides,
      officeDay: { ...officeDay, totalSlides: slides.length },
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error(`Devotion assembly failed (${kind}):`, err);
    return res.status(500).json({ error: "Failed to assemble devotion" });
  }
});

/**
 * GET /office/swap-options — the picker lists for swapping a canticle or the
 * invitatory mid-office. Static catalogues (no DB), so the sheet can render
 * instantly when the reader taps the pill.
 */
/**
 * The Daily Scripture Reading deck (owner) — the day's psalms in full, then
 * the Old Testament, the Epistle and the Gospel as title cards that open the
 * passage in the reader view.
 *
 * Served in the same {slides, officeDay} shape as the offices so the existing
 * deck renderer can play it with no new client surface: one MODE_CONFIG entry
 * points at this endpoint and everything downstream — progress, resume, the
 * chime, read-aloud — works because it is the same deck.
 */
// GET /api/office/sunday?track=1|2[&date=YYYY-MM-DD] — a Sunday's RCL readings
// as the scripture deck: psalm in the office UI, then OT / NT / Gospel title
// cards. One track at a time; the This Sunday page carries the toggle.
//
// ?date= names WHICH Sunday (default: the coming one). The phone sends it so
// it can save four Sundays ahead — and so the deck's offline key is a real
// date that prunes when the day passes, instead of the literal "next", which
// sorted after every date and so could never be swept.
router.get("/office/sunday", async (req, res) => {
  const track: 1 | 2 = String(req.query.track ?? "1") === "2" ? 2 : 1;
  const dateParam = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : undefined;
  try {
    const { slides, dayInfo } = await assembleSundayReading(track, parseScriptureParts(req.query.parts), dateParam);
    // Ten minutes, like /lectionary/sunday: identical for every viewer, but the
    // body flips on ?track= and at the Sunday rollover — and with no header at
    // all the WebView was left to guess (the trap 580e545d hit).
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.json({
      slides,
      officeDay: { ...(dayInfo as Record<string, unknown>), totalSlides: slides.length },
      cacheDate: `${(dayInfo as { sundayDate?: string | null }).sundayDate ?? "none"}-t${track}`,
    });
  } catch (err) {
    console.error("Sunday reading assembly failed:", err);
    return res.json({ slides: [], officeDay: { totalSlides: 0 }, cacheDate: "none" });
  }
});

router.get("/office/scripture", async (req, res) => {
  const date = parseOfficeDate(req.query.date);
  try {
    // ?parts=psalms,ot,nt,gospel — absent means all four.
    const { slides, dayInfo } = await assembleScriptureReading(date, parseScriptureParts(req.query.parts));
    return res.json({
      slides,
      officeDay: { ...(dayInfo as Record<string, unknown>), totalSlides: slides.length },
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Scripture reading assembly failed:", err);
    // Never a 500 into a practice. An empty deck is honest and the client
    // already handles "nothing to show" better than an error page.
    return res.json({ slides: [], officeDay: { totalSlides: 0 }, cacheDate: date.toISOString().slice(0, 10) });
  }
});

router.get("/office/swap-options", (req, res) => {
  // Rite-scoped: Rite I offers canticles 1-7, Rite II offers 8-21. Mixing the
  // two series inside one office is a category error — the BCP prints each
  // series in its own rite. (parseRite coerces to II while Rite I is gated
  // off, so this is today's list unchanged.)
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.json({ canticles: canticlesForRite(parseRite(req.query["rite"])), invitatories: INVITATORY_CATALOG });
});

/**
 * GET /office/swap?kind=canticle|invitatory&key=<key> — the replacement
 * slides for one swap, built by the SAME chunking the assemblers use so a
 * swapped canticle is indistinguishable from an appointed one. The client
 * splices them over the run it's replacing; see lib/officeSwap.ts.
 *
 * Public and read-only — it returns canonical BCP text, nothing per-user.
 */
router.get("/office/swap", async (req, res) => {
  const kind = String(req.query["kind"] ?? "");
  const key = String(req.query["key"] ?? "");
  // A slide-id prefix that cannot collide with the deck's own ids (which are
  // plain counters) no matter how many swaps happen in one sitting.
  const idPrefix = `swap-${kind}-${key}-${Date.now().toString(36)}`;
  try {
    const slides = kind === "canticle"
      ? await buildCanticleRun(key, idPrefix)
      : kind === "invitatory"
        ? await buildInvitatoryRun(key, idPrefix)
        : null;
    if (!slides) { res.status(404).json({ error: "unknown_swap" }); return; }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json({ slides });
  } catch (err) {
    console.error("[office/swap] failed:", err);
    return res.status(500).json({ error: "swap_failed" });
  }
});

// GET /office/psalter — public, returns the full 1979 BCP Psalter
router.get("/office/psalter", (_req, res) => {
  const psalms = Object.entries(PSALTER)
    .map(([n, p]) => ({
      number: Number(n),
      title: p.title,
      bcpRef: p.bcpRef,
      content: p.content,
    }))
    .sort((a, b) => a.number - b.number);
  return res.json({ psalms });
});

// GET /office/readings?side=morning|evening&date=YYYY-MM-DD&level=office|devotion
// Public. A PURE lectionary lookup — just the appointed psalm + lesson
// REFERENCES for one office on one day. No slide assembly, no scripture/psalm
// bodies, no DB writes: this is what the home screen's office hero card shows
// under its title, so it has to be cheap enough to run on every app open.
// (The /office/morning + /office/evening endpoints assemble the whole deck and
// must never be called for this.) Pass the viewer's LOCAL date.
router.get("/office/readings", (req, res) => {
  try {
    const date = parseOfficeDate(req.query.date);
    const side: "morning" | "evening" = req.query.side === "evening" ? "evening" : "morning";
    const level = req.query.level === "devotion" ? "devotion" : "office";
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (level === "devotion") {
      // A devotion reads the day's appointed psalm(s) plus ONE short lesson —
      // morning takes lesson2 (the Epistle), early evening lesson3 (the
      // Gospel). Mirrors assembleDevotion so the card can't disagree with
      // what the devotion actually prays.
      const lect = getLectionaryReadings(getOfficeDay(date), side);
      const raw = (side === "morning" ? lect.lesson2 : lect.lesson3) ?? "";
      const ok = raw.trim().length > 0 && !/^-+$/.test(raw.trim());
      // Psalms formatted for a READER — the raw lectionary strings carry the
      // printed book's notation ("95* & 32", "[58]", a literal tab) and this
      // response feeds the home card's readings line verbatim.
      return res.json({ date: stamp, side, psalms: (lect.psalms ?? []).map(displayPsalmRef).filter(Boolean), lessons: ok ? [displayLessonRef(raw)] : [] });
    }

    // Full office — reuse the ordo builder (pure/synchronous, and the same
    // selectors the assemblers use, including the "Eve of …" evening fallback).
    const day = buildOfficeOrdoDay(date);
    const o = side === "evening" ? day.evening : day.morning;
    return res.json({ date: day.date, side, psalms: (o.psalms ?? []).map(displayPsalmRef).filter(Boolean), lessons: o.lessons.map((l) => displayLessonRef(l.ref)) });
  } catch (err) {
    console.error("office readings lookup failed:", err);
    // Never 500 — the card just omits the line.
    return res.json({ psalms: [], lessons: [] });
  }
});

// GET /office/collect — public. Today's Collect of the Day (BCP p. 98's "one
// or more Collects, the Collect of the Day being first"), the SAME collect
// the office's own closing slide shows (assembleMorningPrayer.ts) — a single
// bcp_texts lookup by liturgicalDay.collectKey, not a full slide assembly, so
// it's cheap enough for a tail slide (Simple Guided Prayer's closing) to fetch
// on every open. Pass the viewer's LOCAL date.
router.get("/office/collect", async (req, res) => {
  try {
    const date = parseOfficeDate(req.query.date);
    const day = getOfficeDay(date);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const [row] = await db.select().from(bcpTextsTable).where(eq(bcpTextsTable.textKey, day.collectKey)).limit(1);
    // No seeded row: the Sunday label is the only title available, and it is
    // right on a Sunday. When there IS a row, its own title wins below — the
    // collect names its own day (Ash Wednesday, Good Friday), which is not
    // the same thing as the week it falls in.
    if (!row) return res.json({ title: day.sundayLabel ?? null, text: null, bcpReference: null });
    return res.json({ title: row.title ?? day.sundayLabel, text: row.content, bcpReference: row.bcpReference ?? "BCP p. 211" });
  } catch (err) {
    console.error("office collect lookup failed:", err);
    // Never 500 — the caller just omits the slide.
    return res.json({ title: null, text: null, bcpReference: null });
  }
});

// GET /office/ordo-week — public. The per-day ordo (order of service + the
// day's appointments) for Morning + Evening Prayer across a span of days, built
// from the SAME selectors/pickers the office assemblers use — so the printable
// weekly-office grid matches exactly what's prayed in the app or from a physical
// BCP. Returns the office's fixed prayers once (`common`) to print beneath the
// grid, and the 30-day Coverdale psalter portion per side (`cyclePsalms`) for
// the Praying-the-Psalms guide. ?start=YYYY-MM-DD (default today), ?days=N (1–14).
router.get("/office/ordo-week", async (req, res) => {
  try {
    const startRaw = typeof req.query.start === "string" ? new Date(req.query.start) : new Date();
    const base = isNaN(startRaw.getTime()) ? new Date() : startRaw;
    const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const day = buildOfficeOrdoDay(d);
      // The 30-day Coverdale psalter portion for this day — for the
      // Praying-the-Psalms guide (a different cycle than the office psalms).
      const dom = Math.min(Math.max(d.getDate(), 1), 30);
      const cyc = MONTHLY_PSALTER[dom];
      out.push({
        ...day,
        morning: { ...day.morning, cyclePsalms: cyc?.morning ?? [] },
        evening: { ...day.evening, cyclePsalms: cyc?.evening ?? [] },
      });
    }
    const common = await getOrdoCommonTexts();
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json({ days: out, common });
  } catch (err) {
    console.error("ordo-week assembly failed:", err);
    // Degrade to an empty week rather than 500 — the printout just omits the
    // office-guide pages if this can't be built.
    return res.json({ days: [], common: [] });
  }
});

// ── Praying the Psalms ──────────────────────────────────────────────────────
// The traditional BCP "30-day" Psalter — the Coverdale monthly cycle (1979 BCP
// pp. 934–935 option). Each day of the month has a morning + evening portion;
// the whole Psalter (1–150) is prayed once a month, so it reads MORE psalms a
// day than the daily-office lectionary. On a 31-day month the 30th day repeats.
const MONTHLY_PSALTER: Record<number, { morning: string[]; evening: string[] }> = {
  1:  { morning: ["1", "2", "3", "4", "5"],            evening: ["6", "7", "8"] },
  2:  { morning: ["9", "10", "11"],                    evening: ["12", "13", "14"] },
  3:  { morning: ["15", "16", "17"],                   evening: ["18"] },
  4:  { morning: ["19", "20", "21"],                   evening: ["22", "23"] },
  5:  { morning: ["24", "25", "26"],                   evening: ["27", "28", "29"] },
  6:  { morning: ["30", "31"],                         evening: ["32", "33", "34"] },
  7:  { morning: ["35", "36"],                         evening: ["37"] },
  8:  { morning: ["38", "39", "40"],                   evening: ["41", "42", "43"] },
  9:  { morning: ["44", "45", "46"],                   evening: ["47", "48", "49"] },
  10: { morning: ["50", "51", "52"],                   evening: ["53", "54", "55"] },
  11: { morning: ["56", "57", "58"],                   evening: ["59", "60", "61"] },
  12: { morning: ["62", "63", "64"],                   evening: ["65", "66", "67"] },
  13: { morning: ["68"],                               evening: ["69", "70"] },
  14: { morning: ["71", "72"],                         evening: ["73", "74"] },
  15: { morning: ["75", "76", "77"],                   evening: ["78"] },
  16: { morning: ["79", "80", "81"],                   evening: ["82", "83", "84", "85"] },
  17: { morning: ["86", "87", "88"],                   evening: ["89"] },
  18: { morning: ["90", "91", "92"],                   evening: ["93", "94"] },
  19: { morning: ["95", "96", "97"],                   evening: ["98", "99", "100", "101"] },
  20: { morning: ["102", "103"],                       evening: ["104"] },
  21: { morning: ["105"],                              evening: ["106"] },
  22: { morning: ["107"],                              evening: ["108", "109"] },
  23: { morning: ["110", "111", "112", "113"],         evening: ["114", "115"] },
  24: { morning: ["116", "117", "118"],                evening: ["119:1-32"] },
  25: { morning: ["119:33-72"],                        evening: ["119:73-104"] },
  26: { morning: ["119:105-144"],                      evening: ["119:145-176"] },
  27: { morning: ["120", "121", "122", "123", "124", "125"], evening: ["126", "127", "128", "129", "130", "131"] },
  28: { morning: ["132", "133", "134", "135"],         evening: ["136", "137", "138"] },
  29: { morning: ["139", "140"],                       evening: ["141", "142", "143"] },
  30: { morning: ["144", "145", "146"],                evening: ["147", "148", "149", "150"] },
};

// GET /psalms/today?cycle=office|monthly&office=morning|evening&date=YYYY-MM-DD
// Today's appointed psalms with their full BCP text. cycle=office reuses the
// daily-office lectionary appointment (the same psalms the office prays);
// cycle=monthly uses the 30-day Coverdale table above. Pass the viewer's LOCAL
// date so the monthly day-of-month is right across time zones.
router.get("/psalms/today", (req, res) => {
  const dateStr = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : null;
  let date: Date;
  try {
    date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
    if (isNaN(date.getTime())) throw new Error("bad date");
  } catch { date = new Date(); }
  const office: "morning" | "evening" = req.query.office === "evening" ? "evening" : "morning";
  const cycle: "office" | "monthly" = req.query.cycle === "monthly" ? "monthly" : "office";

  let refs: string[];
  if (cycle === "monthly") {
    // Day of month from the local date string when given (tz-safe), else server day.
    const domRaw = dateStr ? Number(dateStr.slice(8, 10)) : date.getDate();
    const dom = Math.min(Math.max(domRaw, 1), 30); // 31 → repeat day 30
    refs = MONTHLY_PSALTER[dom][office];
  } else {
    refs = getLectionaryReadings(getOfficeDay(date), office).psalms;
  }

  const psalms = refs
    .map((r) => parsePsalmRef(r))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((ref) => {
      const entry = PSALTER[ref.number];
      if (!entry) return null;
      const content = slicePsalmToRef(entry.content, ref);
      return {
        number: ref.number,
        title: entry.title,
        bcpRef: entry.bcpRef,
        content,
        range: ref.range,
        raw: ref.raw,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return res.json({
    date: dateStr ?? date.toISOString().slice(0, 10),
    office,
    cycle,
    psalms,
  });
});

export default router;
