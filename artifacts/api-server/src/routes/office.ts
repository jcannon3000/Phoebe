/**
 * Daily Office Routes
 *
 * GET  /office/morning          — returns assembled Morning Prayer slides (mounted at /api)
 * POST /office/morning/prefetch — warms cache for a future date (internal, mounted at /api)
 */

import { Router } from "express";
import { assembleMorningPrayer } from "../lib/assembleMorningPrayer";
import { assembleEveningPrayer } from "../lib/assembleEveningPrayer";
import { assembleDevotion, type DevotionKind } from "../lib/assembleDevotion";
import { assembleCompline } from "../lib/assembleCompline";
import { getOfficeDay } from "../lib/liturgicalCalendar";
import { getLectionaryReadings } from "../lib/lectionary";
import { parsePsalmRef, sliceVersesByRange } from "../lib/psalmRange";
import { isUserBeta } from "../lib/parishGate";
import { resolveLocale } from "../lib/officeI18n";
import { seedBcpTexts } from "../seeds/bcpTexts";
import { PSALTER } from "../seeds/bcpPsalter";

const router = Router();

// GET /office/morning — public, no auth required (liturgical content is same for all users)
router.get("/office/morning", async (req, res) => {
  let date: Date;
  try {
    date = req.query.date
      ? new Date(req.query.date as string)
      : new Date();
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

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
    date = req.query.date ? new Date(req.query.date as string) : new Date();
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

  try {
    const userId = (req.user as { id: number } | undefined)?.id ?? 0;
    const locale = resolveLocale(req.query.locale);
    const confessionOverride = req.query.confession === undefined ? undefined : req.query.confession === "1";
    const { slides, officeDay, fromCache } = await assembleEveningPrayer(date, userId, locale, confessionOverride);

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
    date = req.query.date ? new Date(req.query.date as string) : new Date();
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

// GET /devotion/:kind — Daily Devotions for Individuals and Families
// (1979 BCP pp. 137 / 139). Phoebe surfaces two of the four — In the
// Morning and In the Early Evening — per user direction. The psalm is
// the appointed lectionary psalm for the day; everything else is the
// short BCP devotion text. No cache: the assembly is cheap (one psalm
// lookup + the per-user intercessions queries).
router.get("/devotion/:kind", async (req, res) => {
  const kindParam = String(req.params.kind ?? "");
  const kind: DevotionKind | null =
    kindParam === "morning" ? "morning"
      : kindParam === "early-evening" ? "early-evening"
      : null;
  if (!kind) {
    return res.status(400).json({ error: "Unknown devotion. Use 'morning' or 'early-evening'." });
  }

  let date: Date;
  try {
    date = req.query.date ? new Date(req.query.date as string) : new Date();
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
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
      const content = ref.range ? sliceVersesByRange(entry.content, ref.range) : entry.content;
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
