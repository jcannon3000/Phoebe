import { bibleUrl } from "@/lib/bibleGatewayUrl";
import type { SundayTrack } from "@/lib/sundayLectionary";

/**
 * LECTIO DIVINA ON THIS SUNDAY'S READINGS (owner, 2026-09-16: "if they go to
 * this sunday, and there is a lectio divina option, and they could do lectio
 * divina for any of the readings this coming sunday … same ui as the daily
 * lectio divina").
 *
 * pages/lectio.tsx is the deck; this only says what its picker offers on a
 * Sunday: the four readings of one RCL track, in the Sunday deck's order —
 * first reading, psalm, epistle, gospel.
 *
 * THE LINKS ARE THE SUNDAY DECK'S LINKS. Each lesson opens the same oremus
 * address the Sunday readings deck's title card opens (the server builds those
 * with the identical bibleUrl, from the identical track), so the pages the
 * offline walk saves for that deck are the pages Lectio opens. The psalm is the
 * one reading the deck prays as office slides rather than linking, so its
 * address is made here and the walk (lib/officePrefetch) saves it through this
 * same function.
 */

export type LectioKind = "oldTestament" | "psalm" | "newTestament" | "gospel";
export type LectioOption = { kind: LectioKind; reference: string; readUrl: string };

/**
 * A psalm reference as the RCL page ("Psalm 139:1-5, 12-17") or the saved
 * deck ("139:1-5, 12-17") writes it → the bare first psalm ("139:1-5, 12-17").
 * Null for a canticle or anything else that isn't a psalm: oremus has no page
 * for "Canticle 15". A combined "42 & 43" keeps its first, as parsePsalmRef
 * does, so the live and saved paths land on ONE address.
 */
function barePsalm(ref: string | null | undefined): string | null {
  const raw = (ref ?? "").trim().replace(/^\[+/, "").replace(/\]+$/, "").trim();
  if (!/^psalms?\s+\d/i.test(raw) && !/^\d/.test(raw)) return null;
  const bare = raw.replace(/^psalms?\s+/i, "").split(/[&;]/)[0]!.trim().replace(/[*]+$/, "");
  return bare || null;
}

/** The psalm's oremus page — the one address both Lectio and the offline walk use. */
export function sundayPsalmReadUrl(ref: string | null | undefined): string | null {
  const bare = barePsalm(ref);
  return bare ? bibleUrl(`Psalm ${bare}`) : null;
}

function psalmOption(ref: string | null | undefined): LectioOption | null {
  const bare = barePsalm(ref);
  const readUrl = bare ? bibleUrl(`Psalm ${bare}`) : null;
  return bare && readUrl ? { kind: "psalm", reference: `Psalm ${bare}`, readUrl } : null;
}

function lesson(kind: LectioKind, ref: string | null | undefined): LectioOption | null {
  const reference = (ref ?? "").trim();
  if (!reference || /^-+$/.test(reference)) return null;
  const readUrl = bibleUrl(reference);
  return readUrl ? { kind, reference, readUrl } : null;
}

/** One track of the live lectionary (/api/lectionary/sunday) → the picker. */
export function sundayLectioOptions(track: SundayTrack | null | undefined): LectioOption[] {
  if (!track) return [];
  return [
    lesson("oldTestament", track.ot),
    psalmOption(track.psalm),
    lesson("newTestament", track.nt),
    lesson("gospel", track.gospel),
  ].filter((o): o is LectioOption => o !== null);
}

type SavedSlide = { type?: string; metadata?: { reference?: unknown; readUrl?: unknown; lessonKind?: unknown; psalmRef?: unknown } };

/**
 * A SAVED Sunday deck (lib/officeOfflineCache, mode "sunday") → the picker, for
 * when the lectionary can't be asked. The deck already holds everything: its
 * lesson title cards carry their reference and link, its psalm title card the
 * psalm, all in the order the picker wants.
 */
export function sundayLectioOptionsFromDeck(deck: { slides?: SavedSlide[] } | null | undefined): LectioOption[] {
  const out: LectioOption[] = [];
  for (const s of deck?.slides ?? []) {
    const m = s?.metadata;
    if (!m) continue;
    if (s.type === "psalm_title" && typeof m.psalmRef === "string") {
      const o = psalmOption(m.psalmRef);
      if (o) out.push(o);
      continue;
    }
    if (s.type !== "lesson_title" || typeof m.readUrl !== "string" || typeof m.reference !== "string") continue;
    const kind: LectioKind | null =
      m.lessonKind === "ot_sunday" ? "oldTestament"
        : m.lessonKind === "epistle_sunday" ? "newTestament"
          : m.lessonKind === "gospel_sunday" ? "gospel" : null;
    if (kind) out.push({ kind, reference: m.reference, readUrl: m.readUrl });
  }
  return out;
}
