/**
 * Weekly-plan payload validation — shared by the weekly-plan PUT (groups.ts)
 * and the content routes (weekly-plan-content.ts). Word caps KEEP IN SYNC
 * with the client SlideDeckEditor.
 */
import { eq, and } from "drizzle-orm";
import {
  db,
  groupWeeklyPdfsTable,
  type WeeklyDeckSlide,
  type WeeklyEpisodeSnapshot,
  type WeeklyItemPayload,
} from "@workspace/db";

// ── Slide caps (KEEP IN SYNC with the client SlideDeckEditor) ────────────────
// Word caps chosen so one slide stays one screen at the office deck's serif
// size even at the 1.3× text-size pref (~75-word ceiling): see the design
// spec. Question is CHAR-capped — its form is a single held question.
export const DECK_MAX_SLIDES = 7;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function sanitizeSlide(raw: unknown): WeeklyDeckSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  switch (r.type) {
    case "teaching": {
      const body = str(r.body, 2000);
      if (!body || words(body) > 90) return null;
      const heading = str(r.heading, 48);
      return heading ? { type: "teaching", heading, body } : { type: "teaching", body };
    }
    case "scripture": {
      const passage = str(r.passage, 2000);
      const citation = str(r.citation, 40);
      if (!passage || !citation || words(passage) > 80) return null;
      return { type: "scripture", passage, citation };
    }
    case "question": {
      const question = str(r.question, 140);
      if (!question) return null;
      return { type: "question", question };
    }
    case "prompt": {
      const action = str(r.action, 1200);
      if (!action || words(action) > 50) return null;
      const hint = str(r.hint, 60);
      return hint ? { type: "prompt", action, hint } : { type: "prompt", action };
    }
    case "song": {
      const title = str(r.title, 80);
      if (!title) return null;
      const artist = str(r.artist, 60) ?? undefined;
      const note = str(r.note, 400);
      if (note && words(note) > 30) return null;
      let link: string | undefined;
      const rawLink = str(r.link, 500);
      if (rawLink) {
        try {
          const u = new URL(rawLink);
          if (u.protocol === "http:" || u.protocol === "https:") link = u.toString();
        } catch { /* dropped */ }
      }
      return { type: "song", title, ...(artist ? { artist } : {}), ...(link ? { link } : {}), ...(note ? { note } : {}) };
    }
    case "reflection": {
      const body = str(r.body, 1500);
      if (!body || words(body) > 60) return null;
      return { type: "reflection", body };
    }
    default:
      return null;
  }
}

/** Validate an item's kind-specific payload. Returns the cleaned payload, or
 *  null when the payload is missing/invalid for a content kind (the PUT drops
 *  the item and reports it). Non-content kinds always return undefined. */
export async function sanitizeWeeklyPayload(
  kind: string,
  raw: unknown,
  groupId: number,
): Promise<WeeklyItemPayload | null | undefined> {
  if (kind === "deck") {
    const slides = (raw as { slides?: unknown } | null)?.slides;
    if (!Array.isArray(slides)) return null;
    const clean = slides.map(sanitizeSlide).filter((s): s is WeeklyDeckSlide => s !== null).slice(0, DECK_MAX_SLIDES);
    if (clean.length === 0) return null;
    return { slides: clean };
  }
  if (kind === "episode") {
    const ep = (raw as { episode?: unknown } | null)?.episode as Record<string, unknown> | undefined;
    if (!ep || typeof ep !== "object") return null;
    const httpUrl = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
    };
    const audioUrl = httpUrl(ep.audioUrl);
    const sourceUrl = httpUrl(ep.sourceUrl) ?? audioUrl;
    const title = typeof ep.title === "string" && ep.title.trim() ? ep.title.trim().slice(0, 300) : null;
    if (!audioUrl || !sourceUrl || !title) return null;
    const snapshot: WeeklyEpisodeSnapshot = {
      title,
      showTitle: typeof ep.showTitle === "string" && ep.showTitle.trim() ? ep.showTitle.trim().slice(0, 200) : null,
      audioUrl,
      sourceUrl,
      imageUrl: httpUrl(ep.imageUrl),
      durationSeconds: typeof ep.durationSeconds === "number" && Number.isFinite(ep.durationSeconds)
        ? Math.max(0, Math.round(ep.durationSeconds)) : null,
      publishedAt: typeof ep.publishedAt === "string" ? ep.publishedAt.slice(0, 40) : null,
    };
    return { episode: snapshot };
  }
  if (kind === "pdf") {
    const p = raw as { pdfId?: unknown } | null;
    const pdfId = typeof p?.pdfId === "number" && Number.isFinite(p.pdfId) ? p.pdfId : null;
    if (pdfId == null) return null;
    // The referenced upload must exist and belong to THIS group — a leader of
    // one community can't point an item at another community's file.
    const [row] = await db.select({
      id: groupWeeklyPdfsTable.id,
      filename: groupWeeklyPdfsTable.filename,
      byteSize: groupWeeklyPdfsTable.byteSize,
      pageCount: groupWeeklyPdfsTable.pageCount,
    }).from(groupWeeklyPdfsTable)
      .where(and(eq(groupWeeklyPdfsTable.id, pdfId), eq(groupWeeklyPdfsTable.groupId, groupId)))
      .limit(1);
    if (!row) return null;
    return { pdfId: row.id, filename: row.filename, pageCount: row.pageCount, byteSize: row.byteSize };
  }
  return undefined; // simple kinds carry no payload
}

