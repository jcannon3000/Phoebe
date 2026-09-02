// ─── Lectio Divina ───────────────────────────────────────────────────────
//
// Owner: three pills — today's Old Testament, New Testament (Epistle) and
// Gospel lesson, shown by their actual reference rather than a generic
// label — pick one, then a three-round read-and-reflect sequence on that
// same passage, closing with a slide to lift anything up in prayer.
//
// Reuses the SAME lectionary source the "Daily Scripture Reading" deck
// (assembleScriptureReading.ts) already puts these three lessons in front
// of: lesson1/lesson2/lesson3 from the Daily Office Lectionary's morning
// entry (which carries all three regardless of which office actually
// reads each — see that file's own note on the layout-vs-content
// distinction). A PURE lectionary lookup, no slide assembly, no DB write —
// same shape as /office/readings, cheap enough for every app open.
//
// The passage gets its own dedicated slide — owner: "as the next slide, like
// the daily scripture slideshow" — styled like that deck's lesson_title card
// (big reference, eyebrow, a Read pill), not tucked into a corner of the
// prompt slide. Text itself stays external (owner explicitly declined the
// bundled WEB translation): oremus.org (NRSV) via bibleGatewayUrl, same
// source the office's own NRSV toggle already opens.
import { Router } from "express";
import { getOfficeDay } from "../lib/liturgicalCalendar";
import { getLectionaryReadings } from "../lib/lectionary";
import { displayLessonRef } from "../lib/psalmRange";
import { bibleGatewayUrl } from "../lib/bibleGatewayUrl";

const router = Router();

function parseLectioDate(raw: unknown): Date {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = typeof raw === "string" && raw ? new Date(raw) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

type LessonOption = { kind: "oldTestament" | "newTestament" | "gospel"; reference: string; readUrl: string };

function lessonOption(kind: LessonOption["kind"], raw: string | undefined): LessonOption | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || /^-+$/.test(trimmed)) return null;
  const readUrl = bibleGatewayUrl(trimmed);
  // No resolvable read link means nothing for the pill to open — same as an
  // absent lesson.
  if (!readUrl) return null;
  const reference = displayLessonRef(trimmed);
  return { kind, reference, readUrl };
}

// GET /api/lectio/today?date=YYYY-MM-DD — today's three lesson choices.
router.get("/lectio/today", (req, res) => {
  try {
    const date = parseLectioDate(req.query.date);
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    res.setHeader("Cache-Control", "public, max-age=3600");

    const { lesson1, lesson2, lesson3 } = getLectionaryReadings(getOfficeDay(date), "morning");
    const options = [
      lessonOption("oldTestament", lesson1),
      lessonOption("newTestament", lesson2),
      lessonOption("gospel", lesson3),
    ].filter((o): o is LessonOption => o !== null);

    res.json({ date: stamp, options });
  } catch (err) {
    console.error("lectio today lookup failed:", err);
    // Never 500 — the picker just shows nothing to choose, same as the
    // office readings card omitting its line on a bad day.
    res.json({ date: null, options: [] });
  }
});

export default router;
