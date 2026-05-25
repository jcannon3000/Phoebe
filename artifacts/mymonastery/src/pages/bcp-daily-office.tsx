import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import type { Slide } from "@/components/MorningPrayer/types";
import { openExternal } from "@/lib/openExternal";
import { bibleUrlSegments } from "@/lib/bibleGatewayUrl";
import { fixQuoteDirection } from "@/lib/smartQuotes";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { playOfficeChime } from "@/lib/amenFeedback";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { RequestWordField } from "@/components/RequestWordField";
import { ExternalLinkPill } from "@/components/ExternalLinkPill";
import { usePrayerSession, type PrayerSurface } from "@/hooks/usePrayerSession";

// ── Daily Office viewer ─────────────────────────────────────────────────────
// Visual chrome mirrors Lectio: dark forest background, top-bar with
// Back / Menu / eyebrow+reference, body centered, bottom pill with
// Back · section-label · Next. The slide content itself is rendered
// inline below — no SlideView dependency, since SlideView's chrome
// fights with this layout.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Mode covers the four liturgies this viewer can render. The Daily
// Office's full Morning / Evening Prayer come from /api/office/* and
// the abbreviated Daily Devotions (BCP pp. 137 / 139) come from
// /api/devotion/* — both use the same Slide schema, so the renderer
// is identical apart from the title and endpoint.
export type LiturgyMode =
  | "morning"
  | "evening"
  | "morning-devotion"
  | "early-evening-devotion";

// ── Per-day localStorage progress ───────────────────────────────────────────
// Mirrors prayer-mode's resume-where-you-left-off pattern. The home-screen
// PrayerOfficeCard reads these keys to flip its CTA between:
//   • Pray the Morning Devotion → (fresh)
//   • Continue the Morning Devotion → (slideIdx > 0, not done)
//   • Pray again (done today)
// Keys are scoped per mode + local-date so a stale yesterday entry can't
// resume into today's office. The dashboard reader below uses the same
// keys / today-bucketing logic.

function officeTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function officeProgressKey(mode: LiturgyMode, todayKey: string = officeTodayKey()): string {
  return `phoebe:office-progress:${mode}:${todayKey}`;
}
export function officeCompletedKey(mode: LiturgyMode, todayKey: string = officeTodayKey()): string {
  return `phoebe:office-completed:${mode}:${todayKey}`;
}

/** Read today's progress for a single office mode. Safe in SSR-ish contexts
 *  (returns the default shape if localStorage isn't available). */
export type OfficeProgressState =
  | { kind: "fresh" }
  | { kind: "in-progress"; slideIdx: number; total: number }
  | { kind: "done" };

export function readOfficeProgress(mode: LiturgyMode): OfficeProgressState {
  if (typeof window === "undefined") return { kind: "fresh" };
  const today = officeTodayKey();
  try {
    if (localStorage.getItem(officeCompletedKey(mode, today))) return { kind: "done" };
    const raw = localStorage.getItem(officeProgressKey(mode, today));
    if (!raw) return { kind: "fresh" };
    const parsed = JSON.parse(raw) as { slideIdx?: number; total?: number };
    if (typeof parsed.slideIdx === "number" && parsed.slideIdx > 0 && typeof parsed.total === "number") {
      // If they're parked on the last slide but haven't tapped Amen the
      // closing collect, treat as in-progress — the "done" flag is set
      // only by the explicit completion handler below.
      return { kind: "in-progress", slideIdx: parsed.slideIdx, total: parsed.total };
    }
    return { kind: "fresh" };
  } catch {
    return { kind: "fresh" };
  }
}

interface OfficeViewerProps {
  // Backward-compat: callers that already passed `office` keep working.
  // New callers (Daily Devotions) pass `mode`.
  office?: "morning" | "evening";
  mode?: LiturgyMode;
  onBack: () => void;
  // When set, the office's completion exit calls this instead of
  // redirecting to /prayer-mode. The public /pray page passes it so the
  // close lands on its own sign-up invite rather than the auth-only
  // prayer-mode recap. Its presence also marks "public mode" — the
  // devotion's alternate-route shortcuts (which go to auth-only pages)
  // are hidden.
  onComplete?: () => void;
}

interface OfficeDayInfo {
  weekdayLabel?: string;
  sundayLabel?: string;
  feastName?: string | null;
}

// Friendly section label for the bottom pill, derived from the slide
// type. Keeps the chrome readable when the eyebrow is verbose
// (e.g. "VENITE · PSALM 95").
const SECTION_LABEL: Record<string, string> = {
  office_intro: "Welcome",
  opening: "Opening",
  opening_sentence: "Opening Sentence",
  confession: "Confession",
  absolution: "Absolution",
  invitatory: "Invitatory",
  invitatory_psalm: "Invitatory Psalm",
  psalm: "Psalm",
  psalm_title: "Psalm",
  psalm_gloria: "Doxology",
  lesson_title: "Lesson",
  lesson_verses: "Lesson",
  lesson: "Lesson",
  canticle: "Canticle",
  creed: "Creed",
  lords_prayer: "Lord's Prayer",
  suffrages: "Suffrages",
  collect: "Collect",
  prayer_for_mission: "Prayer for Mission",
  intercessions: "Intercessions",
  general_thanksgiving: "General Thanksgiving",
  closing: "Closing",
};

// Parse a 1979 BCP Psalter content blob into a structured list for the
// renderer. The data file (api-server/src/seeds/bcpPsalter.ts) stores
// each psalm with:
//   • Each verse begins with `<number><space>` at the start of a line.
//   • The first hemistich ends with " *" before a newline.
//   • The second hemistich follows on the next line, indented by two
//     spaces.
//   • A trailing Gloria Patri block is appended by the assembler,
//     prefixed by a leading newline and beginning with "Glory to the
//     Father" — has no verse number and shouldn't get one rendered.
//
// We split into "verse" entries (numbered, two lines, hemistichs) and
// a "doxology" entry for the Gloria. The renderer visualises each.
type PsalmLine = { text: string; indented: boolean };
type PsalmEntry =
  | { kind: "verse"; number: string; lines: PsalmLine[] }
  | { kind: "doxology"; text: string };

function parsePsalmContent(content: string): PsalmEntry[] {
  const result: PsalmEntry[] = [];
  // Split off the Gloria Patri (always preceded by a blank line +
  // begins with "Glory to the Father"). It's the only non-numbered
  // block we expect to see.
  const gloriaMatch = content.match(/\n\s*\n?\s*(Glory to the Father[\s\S]+)$/);
  const psalmBody = gloriaMatch
    ? content.slice(0, content.length - gloriaMatch[1].length).trimEnd()
    : content;
  const gloria = gloriaMatch ? gloriaMatch[1].trim() : null;

  // Walk the psalm body line by line. A line that starts with digits
  // followed by a space opens a new verse; the rest of its line is
  // the first hemistich. Subsequent indented lines (leading spaces)
  // belong to the same verse as additional hemistichs.
  const rawLines = psalmBody.split("\n");
  let current: { number: string; lines: PsalmLine[] } | null = null;
  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    const verseMatch = line.match(/^(\d+)\s+(.*)$/);
    if (verseMatch) {
      if (current) result.push({ kind: "verse", ...current });
      current = { number: verseMatch[1], lines: [{ text: verseMatch[2], indented: false }] };
    } else if (current) {
      // Any continuation line — indentation in the source signals
      // that this is the second (or third) hemistich of the verse.
      const indented = /^\s/.test(raw);
      current.lines.push({ text: line.trim(), indented });
    }
  }
  if (current) result.push({ kind: "verse", ...current });
  if (gloria) result.push({ kind: "doxology", text: gloria });
  return result;
}

// A psalm / canticle hemistich that may end in the BCP pointing
// asterisk "*". Two things keep that caesura mark from being orphaned
// onto a line by itself when the first hemistich nearly fills the
// column:
//
//   1) The trailing " *" is bound to the preceding word with a
//      non-breaking space, so the asterisk can never wrap alone — at
//      worst it travels to the next line *with* its word.
//   2) If that would push the word+asterisk onto a new line when the
//      rest of the line fit, we instead shave a little letter-spacing
//      (measured after layout) so the whole hemistich stays on one
//      line. Only the *minimal* condense that removes the extra line
//      is applied, and only when a small squeeze (≤ 1.2px) is enough —
//      genuinely long hemistichs that wrap regardless are left alone.
function PointedLine({ text, style }: { text: string; style: CSSProperties }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const pointed = / \*$/.test(text);
  const bound = pointed ? text.replace(/ \*$/, " *") : text;

  // letterSpacing is owned entirely by this effect (none of the callers
  // set it), so it's tuned imperatively without fighting React.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.letterSpacing = ""; // measure at the natural spacing
    if (!pointed) return;
    const lh = parseFloat(window.getComputedStyle(el).lineHeight);
    if (!lh) return;
    const naturalLines = Math.round(el.offsetHeight / lh);
    if (naturalLines <= 1) return;
    // Shave the least letter-spacing that drops a wrapped line, so the
    // word+asterisk stays put instead of falling to the next line.
    for (let ls = 0.2; ls <= 1.2 + 1e-9; ls += 0.2) {
      el.style.letterSpacing = `-${ls.toFixed(1)}px`;
      if (Math.round(el.offsetHeight / lh) < naturalLines) return;
    }
    // Beyond the squeeze budget — leave it natural; the non-breaking
    // space still keeps the asterisk attached to its word.
    el.style.letterSpacing = "";
  }, [bound, pointed]);

  return (
    <p ref={ref} style={style}>
      {bound}
    </p>
  );
}

// Centered intercession head — eyebrow + (optionally) avatar + name
// stacked, matching prayer-mode.tsx's per-kind layout exactly:
//
//   • request / prayer-for → avatar + name + eyebrow ("Prayer Request"
//     / "I am holding"). The slide is anchored to a specific person.
//   • intercession (community / today's feed) → eyebrow only ("Today
//     on Phoebe Climate", etc.) — no avatar, since the slide is about
//     a topic, not a person.
//   • circle-intention → eyebrow only ("Circle Intention"). Group
//     name flows in as attribution after the body.
//
// The earlier shape printed an avatar + name on every intercession
// slide regardless of source, which made community / feed prayers
// read as if they came from a person.
function IntercessionHead({
  eyebrow,
  authorName,
  authorAvatarUrl,
  showFace,
}: {
  eyebrow: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  showFace: boolean;
}) {
  const initials = (authorName ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {showFace && (authorName || authorAvatarUrl) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {authorAvatarUrl ? (
            <img
              src={authorAvatarUrl}
              alt={authorName ?? "Prayer author"}
              className="prayer-avatar-pulse"
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              className="prayer-avatar-pulse"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#1A4A2E",
                color: "#A8C5A0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 600,
                fontFamily: SPACE_GROTESK,
              }}
            >
              {initials}
            </div>
          )}
          {authorName && (
            <p
              style={{
                fontSize: 14,
                color: "#C8D4C0",
                fontFamily: SPACE_GROTESK,
                margin: 0,
              }}
            >
              {authorName}
            </p>
          )}
        </div>
      )}
      <p
        style={{
          fontSize: 10,
          color: "rgba(143,175,150,0.45)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          margin: 0,
        }}
      >
        {eyebrow}
      </p>
    </div>
  );
}

// Resolve mode → endpoint + title. We accept `office` as a legacy
// shortcut and translate it into the equivalent mode here so old call
// sites compile unchanged.
const MODE_CONFIG: Record<LiturgyMode, { endpoint: string; title: string }> = {
  morning: { endpoint: "/api/office/morning", title: "Morning Prayer" },
  evening: { endpoint: "/api/office/evening", title: "Evening Prayer" },
  "morning-devotion": { endpoint: "/api/devotion/morning", title: "Morning Devotion" },
  "early-evening-devotion": { endpoint: "/api/devotion/early-evening", title: "Early Evening Devotion" },
};

export function OfficeViewer({ office, mode, onBack, onComplete }: OfficeViewerProps) {
  const resolvedMode: LiturgyMode = mode ?? office ?? "morning";
  const { endpoint, title: officeTitle } = MODE_CONFIG[resolvedMode];
  // Which half of the day this office belongs to. Threaded onto the
  // closing redirect (?side=) so the prayer-rhythm habit slide can
  // show an evening-only "Pray the Examen" pill.
  const officeSide: "morning" | "evening" =
    resolvedMode === "evening" || resolvedMode === "early-evening-devotion"
      ? "evening"
      : "morning";

  // Phoebe Parish — when the user is in the parish-only tier we
  // route them to the parish celebration screen on Amen instead of
  // the standard onBack() exit. The handler below reads parishOnly
  // off this; otherwise the historical exit path is unchanged for
  // beta + community users.
  const { user: viewerUser } = useAuth();
  const parishOnly = viewerUser?.accessTier === "parish-only";
  // Offices-only accounts (public /pray sign-ups) have no parish
  // celebration and no /prayer-mode access — they finish back on
  // their home, the parish dashboard.
  const officesOnlyViewer = viewerUser?.accessTier === "offices-only";

  // Track time-spent + max-slide-reached for the metrics dashboard.
  // The slidesCompletedRef is the high-water mark of slideIdx; the
  // metrics CTE uses it to filter "actually prayed an office" (≥3
  // slides) from "tap-and-bail" (<3). The ref is updated each time
  // slideIdx advances (effect below).
  const slidesReachedRef = useRef(0);
  // Map LiturgyMode → PrayerSurface: "morning"→"morning-prayer",
  // "evening"→"evening-prayer". The devotion modes already match.
  const officeSurface: PrayerSurface =
    resolvedMode === "morning" ? "morning-prayer"
    : resolvedMode === "evening" ? "evening-prayer"
    : (resolvedMode as PrayerSurface);
  usePrayerSession(officeSurface, slidesReachedRef);
  // The Daily Devotions are explicitly the personal short forms
  // (BCP pp. 137 / 139). The full Daily Office's missal-page layout
  // (top-aligned, left-aligned, role-labelled) reads as overkill
  // here — devotion mode swaps short call-and-response slides to a
  // centered, label-less layout that feels like personal prayer
  // rather than a corporate liturgy.
  const isDevotion =
    resolvedMode === "morning-devotion" ||
    resolvedMode === "early-evening-devotion";

  const [slides, setSlides] = useState<Slide[]>([]);
  const [officeDay, setOfficeDay] = useState<OfficeDayInfo | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const swipeTouchStartXRef = useRef<number | null>(null);
  const swipeTouchStartYRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const [, setViewerLocation] = useLocation();
  // Once-per-mount guard so a user who navigates BACK to the
  // intercessions portal doesn't get instantly bounced into prayer
  // mode again — once we've handed off, we treat the portal as a
  // transparent slide for the rest of the session.
  const portalHandedOffRef = useRef(false);
  // Did the seamless intercessions handoff already run for this
  // session? If yes, when the user finishes the closing collect we
  // route them to the prayer-mode celebration summary instead of
  // dropping them straight back to the dashboard — the celebration
  // belongs at the end of the FULL liturgy, not mid-flow. Stamped
  // either by the in-session portal redirect or by the URL param
  // we set when prayer-mode bounces us back.
  const seamlessReturnRef = useRef(false);

  // Reset scroll to the top each time the slide changes — otherwise a
  // long-content slide that the reader scrolled through carries its
  // scroll position into the next slide, which is shorter and starts
  // mid-way down (or below the eyebrow). Run after the new slide
  // mounts so the scrollHeight is correct.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = 0;
    // High-water mark — the prayer-session POST reads this off the
    // ref on unmount and submits it as slides_completed. We track
    // the max (not the current) so a back-button doesn't undo a
    // session's qualification.
    if (slideIdx + 1 > slidesReachedRef.current) {
      slidesReachedRef.current = slideIdx + 1;
    }
  }, [slideIdx]);

  // Persist progress per-mode/per-day so the dashboard PrayerOfficeCard
  // can render "Continue Morning Devotion →" when the user bails partway.
  // Skips slideIdx 0 (a fresh open shouldn't write a no-op entry that
  // makes the card flicker into "Continue" with nothing to continue) and
  // skips while slides haven't loaded yet (total would be 0). The
  // "completed" flag is set in handleEnd below — once set, this effect
  // still writes the progress key (slideIdx may advance further on a
  // second pass), but the completed flag wins for the dashboard's
  // "Pray again" copy until midnight.
  useEffect(() => {
    if (slides.length === 0) return;
    if (slideIdx <= 0) return;
    try {
      localStorage.setItem(
        officeProgressKey(resolvedMode),
        JSON.stringify({ slideIdx, total: slides.length }),
      );
    } catch { /* non-fatal */ }
  }, [slideIdx, slides.length, resolvedMode]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const fetched: Slide[] = data.slides ?? [];
        if (fetched.length === 0) throw new Error("No slides returned");
        setSlides(fetched);
        setOfficeDay(data.officeDay ?? null);
        // Allow returning into the office mid-flow — when the
        // /prayer-mode redirect comes back here it appends ?slide=N
        // to the URL so we land at the slide right after the
        // intercessions portal instead of restarting at 0. Clear
        // the params after consuming them so a later X-out plus
        // re-entry into the same office doesn't accidentally re-
        // resume at the saved slide index.
        const search = new URLSearchParams(window.location.search);
        const slideParam = parseInt(search.get("slide") ?? "", 10);
        const resetFlow = search.get("reset") === "1";
        // Resolve initial slide index. Priority:
        //   1. ?slide=N — seamless return from intercessions portal
        //   2. ?reset=1 — dashboard "Pray again" CTA; wipes today's
        //      in-progress key so subsequent advances start clean.
        //      We DON'T wipe the completed flag — they've already
        //      prayed a full pass today, so the dashboard card should
        //      stay in "Pray again" copy even after this second pass.
        //   3. localStorage in-progress entry — pick up where they left
        //      off. Only honored when not done (completed flag absent)
        //      and the saved index is within bounds of the fresh slide
        //      list (defensive against a server-side liturgy change).
        //   4. 0 — fresh start.
        let initialIdx = 0;
        if (Number.isFinite(slideParam) && slideParam >= 0 && slideParam < fetched.length) {
          initialIdx = slideParam;
        } else if (resetFlow) {
          try { localStorage.removeItem(officeProgressKey(resolvedMode)); } catch { /* non-fatal */ }
          initialIdx = 0;
        } else {
          const state = readOfficeProgress(resolvedMode);
          if (state.kind === "in-progress" && state.slideIdx < fetched.length) {
            initialIdx = state.slideIdx;
          }
        }
        setSlideIdx(initialIdx);
        // If we're resuming PAST the intercessions portal (a
        // localStorage in-progress index, or a ?slide= deep link that
        // lands beyond it), the user has already crossed the handoff —
        // stamp portalHandedOffRef so the auto-fire effect and the
        // next()/prev() skip-logic treat the portal as visited.
        // Without this, tapping Back to the portal slide re-fires the
        // /prayer-mode handoff a second time.
        const portalIdx = fetched.findIndex(
          (s) => s.type === "intercessions_portal",
        );
        if (portalIdx >= 0 && initialIdx > portalIdx) {
          portalHandedOffRef.current = true;
        }
        // ?seamlessReturn=1 is appended by the prayer-mode handoff
        // when it bounces us back. Stamp both refs: seamlessReturn so
        // the closing collect's "Amen" routes to the celebration
        // summary, and portalHandedOff so the auto-fire effect and
        // next()/prev() skip-logic treat the portal as already-visited.
        // Without the second stamp the component remount (navigate away
        // → navigate back) resets portalHandedOffRef to false, and
        // swiping back to the portal slide fires the intercessions
        // handoff a second time.
        if (search.get("seamlessReturn") === "1") {
          seamlessReturnRef.current = true;
          portalHandedOffRef.current = true;
        }
        if (search.has("slide") || search.has("mode") || search.has("returnTo") || search.has("seamlessReturn") || search.has("reset")) {
          try {
            window.history.replaceState(null, "", window.location.pathname);
          } catch { /* non-fatal */ }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to load ${resolvedMode}:`, err);
          setError(`${officeTitle} couldn't load (${msg}).`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [endpoint, officeTitle, resolvedMode]);

  // Hand the user off into /prayer-mode for the community
  // intercession slideshow, with a return URL that lands them right
  // back at the next office slide when they finish. Idempotent —
  // if the ref is already set, this is a no-op.
  //
  // Both the auto-fire effect (4s after landing on the portal) and
  // the user-tap handler call this. Previously only the effect ran
  // it, which meant tapping "Next" before the timeout fired
  // cancelled the cleanup-bound timeout and silently skipped the
  // slideshow — landing the user on the Lord's Prayer instead.
  function handIntoPrayerMode() {
    if (portalHandedOffRef.current) return;
    portalHandedOffRef.current = true;
    const nextOfficeIdx = Math.min(slideIdx + 1, slides.length - 1);
    // Devotions live at /bcp/daily-devotions; the full Office at
    // /bcp/daily-office. Each picker page has a useEffect that
    // reads ?mode=… on mount so the viewer auto-resumes instead
    // of dropping back onto the picker.
    const basePath = isDevotion ? "/bcp/daily-devotions" : "/bcp/daily-office";
    const returnTo = `${basePath}?mode=${encodeURIComponent(resolvedMode)}&slide=${nextOfficeIdx}&seamlessReturn=1`;
    const url = `/prayer-mode?returnTo=${encodeURIComponent(returnTo)}&seamless=1`;
    // Mark this session as having gone through the seamless flow so
    // the closing collect's Amen lands on the celebration summary
    // even though we'll re-enter the office below.
    seamlessReturnRef.current = true;
    setViewerLocation(url);
  }

  // Auto-fire the handoff when the user lands on the intercessions
  // portal — but with a ~4s grace window so the glowing
  // "Intercessions" headline can settle. Lives above the loading /
  // error early returns so the hook count stays stable across
  // renders (otherwise React #310). The tap handler in next() also
  // calls handIntoPrayerMode synchronously, so an impatient tap
  // doesn't skip the slideshow.
  useEffect(() => {
    if (slides.length === 0) return;
    const slide = slides[slideIdx];
    if (!slide) return;
    if (slide.type !== "intercessions_portal") return;
    if (portalHandedOffRef.current) return;
    const t = window.setTimeout(() => handIntoPrayerMode(), 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, slideIdx, resolvedMode, isDevotion]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ color: MUTED_GREEN, fontSize: 14, letterSpacing: "0.06em" }}>Preparing today's office…</p>
      </div>
    );
  }

  if (error || slides.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ fontSize: 18, color: WARM_TEXT }}>{error ?? `${officeTitle} is not available right now.`}</p>
        <button onClick={onBack} style={{ fontSize: 14, color: MUTED_GREEN, background: "none", border: "none", cursor: "pointer" }}>
          ← Back to Daily Offices
        </button>
      </div>
    );
  }

  const currentSlide = slides[slideIdx];
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;
  const sectionLabel = SECTION_LABEL[currentSlide.type] ?? currentSlide.type.toUpperCase();
  const refLabel = officeDay?.feastName ?? officeDay?.weekdayLabel ?? officeDay?.sundayLabel ?? "";

  // Title/poster slides (office threshold, psalm/canticle/lesson titles,
  // intercessions portal) are vertically centered rather than top-
  // aligned, so they need much less top padding than body slides — the
  // big top padding on body slides only exists to clear the fixed
  // header, which centered cards already sit well below.
  const isTitleCard =
    currentSlide.type === "office_intro"
    || currentSlide.type === "intercessions_portal"
    || currentSlide.type === "psalm_title"
    || currentSlide.type === "canticle_title"
    || currentSlide.type === "lesson_title";

  function next() {
    if (atEnd) return;
    // Tapping "Next" on the intercessions portal should mean "take me
    // into the slideshow now" — not "skip past it". Without this
    // branch the slideIdx change cancels the 4s auto-fire timeout
    // (cleanup → clearTimeout) and the user lands on the slide AFTER
    // the portal (e.g. Lord's Prayer) without ever seeing prayer-mode.
    if (currentSlide.type === "intercessions_portal" && !portalHandedOffRef.current) {
      handIntoPrayerMode();
      return;
    }
    // Skip portal slides — the viewer auto-jumps to prayer-mode on
    // first arrival, but on a subsequent visit (back-navigation
    // within this session) we want the slide to behave as a no-op
    // step rather than pulling the user back into prayer-mode.
    let nextIdx = slideIdx + 1;
    while (
      nextIdx < slides.length - 1 &&
      slides[nextIdx]?.type === "intercessions_portal" &&
      portalHandedOffRef.current
    ) {
      nextIdx += 1;
    }
    // Chord climbs 0 → 1 → 2 → 0 → 1 → 2 across the slide list,
    // matching the prayer-mode swell's pattern — keyed off the
    // landing slide so a slide jump (e.g. portal-skip) lands on
    // the right octave step rather than a stale one.
    playOfficeChime(nextIdx % 3);
    setSlideIdx(nextIdx);
  }
  function prev() {
    if (atStart) return;
    let prevIdx = slideIdx - 1;
    while (
      prevIdx > 0 &&
      slides[prevIdx]?.type === "intercessions_portal" &&
      portalHandedOffRef.current
    ) {
      prevIdx -= 1;
    }
    playOfficeChime(prevIdx % 3);
    setSlideIdx(prevIdx);
  }

  // Swipe left → next, swipe right → prev. We check that horizontal
  // movement dominates vertical so we don't hijack scroll gestures on
  // long-body slides (psalms, lessons, canticles). Threshold of 50px
  // filters out small palm tremors.
  function handleSwipeTouchStart(e: React.TouchEvent) {
    swipeTouchStartXRef.current = e.touches[0].clientX;
    swipeTouchStartYRef.current = e.touches[0].clientY;
  }
  function handleSwipeTouchEnd(e: React.TouchEvent) {
    if (swipeTouchStartXRef.current === null || swipeTouchStartYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartXRef.current;
    const dy = e.changedTouches[0].clientY - swipeTouchStartYRef.current;
    swipeTouchStartXRef.current = null;
    swipeTouchStartYRef.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return; // primarily vertical — let scroll handle it
    if (Math.abs(dx) < 50) return;            // too small — ignore
    if (dx < 0) next();
    else prev();
  }

  // Tap-to-navigate — tap the left half of the slide to go back, the
  // right half to advance (Kindle-style). Taps that land on an
  // interactive control (the Amen button, the Read on Bible.com
  // link, the Back/Next nav, inline word fields) are left alone so
  // the control's own handler runs instead of paging.
  function handleTapNavigate(e: React.MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea")) return;
    if (e.clientX < window.innerWidth / 2) prev();
    else next();
  }

  // Amen flow on intercession slides — fires the right endpoint for
  // the slide's source so the amen counts toward the recipient's
  // metrics + the bell scheduler's "prayed today" gate. Best-effort:
  // we never block the slide advance on the network call, and we
  // never block the user from advancing if the call fails.
  const isIntercessionSlide = currentSlide.type === "intercessions";
  function fireAmenSideEffect(slide: Slide) {
    const meta = slide.metadata as
      | {
          source?: unknown;
          requestId?: unknown;
          momentToken?: unknown;
        }
      | undefined;
    const source = typeof meta?.source === "string" ? meta.source : null;
    if (source === "request" && typeof meta?.requestId === "number") {
      const rid = meta.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`)
        .then(() => {
          // Two invalidations:
          //   • /api/prayer-requests — the prayer-list feed; updates the
          //     dashboard's "prayed today" state + per-card amen counts.
          //   • /api/prayer-requests/by-id/:id — the detail page's query
          //     for THIS request specifically. Without this the detail
          //     page's "Prayed N times" line went stale until the user
          //     manually navigated away and back.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
          queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${rid}`] });
        })
        .catch(() => { /* best-effort */ });
      return;
    }
    if (source === "feed" && typeof meta?.momentToken === "string") {
      // A feed intercession is a shared_moment — log the Amen as a
      // check-in, the same path prayer-mode uses. (Feeds dropped the
      // day-scheduled /entries/:date/pray endpoint in the reimagining.)
      const token = meta.momentToken;
      apiRequest("POST", `/api/moment/${token}/amen`)
        .then(() => {
          // /subscribed drives the dashboard + prayer-list feed cards;
          // /moments drives the slideshow deck's prayed-today sort.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
          queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
        })
        .catch(() => { /* best-effort */ });
      return;
    }
    // prayer-for + circle-intention: no amen endpoint exists for
    // these surfaces yet. The Amen button still advances; we just
    // don't log a metric until those endpoints land.
  }
  function amen() {
    if (currentSlide) fireAmenSideEffect(currentSlide);
    // Clear the morning bell / evening nudge from the iOS lock screen
    // the moment the user prays. The native shell listens for
    // `phoebe:clear-notifications` and removes any delivered push
    // whose APN thread-id matches "bell". Mirrors what prayer-mode
    // does on Amen — without this dispatch the Office/Devotion amen
    // counted toward metrics but the lock-screen reminder kept
    // sitting there for the rest of the day, which the user
    // explicitly flagged as broken.
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:clear-notifications", { detail: { threadId: "bell" } })
      );
    } catch {
      /* non-fatal; web build has no listener and the OS will drop the push later */
    }
    if (!atEnd) {
      setSlideIdx(slideIdx + 1);
      return;
    }
    // End of office: stamp the "completed today" flag so the dashboard
    // PrayerOfficeCard's big CTA flips to "Pray again" for the rest of
    // the day. We also clear the in-progress key — the office isn't
    // resumable anymore (they just finished it), but a fresh open will
    // still see the completed flag and decide what copy to show.
    try {
      localStorage.setItem(officeCompletedKey(resolvedMode), "1");
      localStorage.removeItem(officeProgressKey(resolvedMode));
    } catch { /* non-fatal */ }
    // The public /pray page handles its own close (a sign-up invite)
    // rather than the auth-only /prayer-mode recap.
    if (onComplete) { onComplete(); return; }
    if (officesOnlyViewer) { setViewerLocation("/parish"); return; }
    // Every office finish lands on /prayer-mode?closingOnly=1 — the
    // "you prayed for N people this week" summary followed by the
    // prayer-rhythm habit slide. Parish-only users get their own
    // celebration page; that branch is handled by handleEnd below
    // (Amen path doesn't currently distinguish parish-only — kept
    // consistent with the prior behaviour for the Amen path).
    setViewerLocation(`/prayer-mode?closingOnly=1&side=${officeSide}`);
  }

  return (
    <div
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
      onClick={handleTapNavigate}
      style={{
        height: "100dvh",
        overflow: "hidden",
        overscrollBehavior: "none",
        background: BG,
        color: WARM_TEXT,
        display: "flex",
        flexDirection: "column",
        fontFamily: SPACE_GROTESK,
        position: "relative",
        isolation: "isolate",
      }}
    >
      <AnimatedBackground base={BG} />
      {/* Top bar — Back / Menu / eyebrow+ref. Mirrors Lectio's header. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
            paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.5rem))",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(19,44,29,0.85)",
              border: `1px solid ${BORDER}`,
              color: WARM_TEXT,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "6px 16px",
            }}
          >
            {officeTitle}
          </span>
          {/* Right column kept as a grid spacer so the centered
              officeTitle pill stays centered. The day-label that
              used to sit here ("Wednesday in the 5th Week of
              Easter") was visually crowded against the pill on
              narrow screens. */}
          <div />

        </div>
      </header>

      {/* Body. Body slides get a generous top padding so liturgical
          text clears the fixed header on web (where safe-area-inset-top
          is 0) and doesn't ride up under the header strip. Title/poster
          cards are vertically centered, so they don't need that
          clearance — they take a much smaller top padding so the copy
          sits higher and isn't floated down by the header gap. */}
      <main
        ref={mainRef}
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: isTitleCard
            ? "max(24px, env(safe-area-inset-top))"
            : "max(72px, calc(env(safe-area-inset-top) + 60px))",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 112px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="max-w-2xl w-full mx-auto"
          style={{
            display: "flex",
            flexDirection: "column",
            // flex-grow fills the scroll container so justifyContent:center
            // vertically centers title cards in the full viewport.
            // flex-shrink:0 lets content slides overflow and scroll normally.
            flexGrow: 1,
            flexShrink: 0,
            justifyContent: isTitleCard ? "center" : "flex-start",
            textAlign: isTitleCard ? "center" : "left",
            alignItems: isTitleCard ? "center" : undefined,
            gap: 20,
          }}
        >
          {/* Intercession-mode head: avatar (when we have one) + name
              + eyebrow, mirroring prayer-mode.tsx's "request" slide.
              The default left-aligned eyebrow + bold-title pair
              renders in the else branch below. */}
          {currentSlide.type === "office_intro" ? (
            // Threshold slide — names the office/devotion and the
            // tradition it belongs to. Centered, with the same glow
            // the psalm/intercessions titles use, so opening the
            // liturgy feels like crossing into something.
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                textAlign: "center",
                gap: 18,
                maxWidth: 540,
              }}
            >
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {currentSlide.eyebrow || "Before you begin"}
              </p>
              <h1
                className="title-glow-breathe"
                style={{
                  fontFamily: SPACE_GROTESK,
                  fontSize: "clamp(40px, 8vw, 72px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: WARM_TEXT,
                  margin: 0,
                  lineHeight: 1.05,
                }}
              >
                {currentSlide.title ?? ""}
              </h1>
              {currentSlide.content && (
                <p
                  style={{
                    fontSize: 17,
                    lineHeight: 1.7,
                    fontFamily: SPACE_GROTESK,
                    color: "rgba(200,212,192,0.85)",
                    margin: 0,
                  }}
                >
                  {currentSlide.content}
                </p>
              )}
            </div>
          ) : currentSlide.type === "intercessions_portal" ? (
            // Intro chord for the prayer-mode handoff. The title
            // breathes for ~2.5 seconds (see the delayed auto-jump
            // effect above) before the office redirects into
            // /prayer-mode. CSS animation .title-glow-breathe pairs
            // a soft sage halo with the fade-up so the slide reads
            // as "you are crossing into something" rather than a
            // navigation glitch. Drops the previous minHeight: 240
            // — the parent flex layout already vertically centers
            // the slide body, so an inner minHeight just stacked
            // 120px of empty space above the headline.
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                textAlign: "center",
                gap: 16,
              }}
            >
              <h1
                className="title-glow-breathe"
                style={{
                  fontFamily: SPACE_GROTESK,
                  fontSize: "clamp(48px, 9vw, 88px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: WARM_TEXT,
                  margin: 0,
                  lineHeight: 1.0,
                }}
              >
                Intercessions
              </h1>
            </div>
          ) : currentSlide.type === "psalm_title" ? (
            // Big psalm headline on its own slide before the verses
            // begin. Mirrors the intercessions_portal layout so the
            // reader gets a deliberate breath into the psalm.
            // Two flavors:
            //  • Appointed psalm — eyebrow comes in as "PSALM 72" and
            //    we transform to "Psalm 72". Subtitle reads "The
            //    Psalm Appointed For This Morning/Evening".
            //  • Invitatory psalm — server stamps metadata.invitatory
            //    + metadata.psalmHeadline ("Venite" / "Jubilate" /
            //    "Pascha Nostrum"). Subtitle reads "The Invitatory
            //    Psalm" so the reader knows they're at the call-to-
            //    worship, not the appointed psalm.
            (() => {
              const meta = currentSlide.metadata as
                | { invitatory?: unknown; psalmHeadline?: unknown }
                | undefined;
              const isInvitatory = meta?.invitatory === true;
              const customHeadline =
                typeof meta?.psalmHeadline === "string" && meta.psalmHeadline.length > 0
                  ? meta.psalmHeadline
                  : null;
              // Normalize to proper case — server data is sometimes
              // all-caps ("PSALMS 87 & 90"); the slide should read
              // "Psalms 87 & 90", not shout.
              const rawHeadline = customHeadline ?? (currentSlide.eyebrow || "Psalm");
              const headline = rawHeadline
                .toLowerCase()
                .replace(/\b[a-z]/g, (c) => c.toUpperCase());
              const isEvening =
                resolvedMode === "evening" || resolvedMode === "early-evening-devotion";
              const subtitle = isInvitatory
                ? "The Invitatory Psalm"
                : isEvening
                  ? "The Psalm Appointed For This Evening"
                  : "The Psalm Appointed For This Morning";
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    textAlign: "center",
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      color: FAINT_GREEN,
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    {subtitle}
                  </p>
                  <h1
                    className="title-glow-breathe"
                    style={{
                      fontFamily: SPACE_GROTESK,
                      fontSize: "clamp(48px, 9vw, 88px)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: WARM_TEXT,
                      margin: 0,
                      lineHeight: 1.0,
                    }}
                  >
                    {headline}
                  </h1>
                  {!isInvitatory && (
                    <p
                      style={{
                        fontSize: 19,
                        fontFamily: SPACE_GROTESK,
                        color: "rgba(200,212,192,0.75)",
                        margin: 0,
                      }}
                    >
                      From the Daily Office Lectionary
                    </p>
                  )}
                </div>
              );
            })()
          ) : currentSlide.type === "canticle_title" ? (
            // Big "Canticle 8" headline, mirrors the psalm_title
            // pattern. Subtitle ("The Canticle Appointed For This
            // Morning") sits above; the canticle's full title (e.g.
            // "The Song of Moses") sits below in italic so the reader
            // knows what they're about to say.
            (() => {
              const meta = currentSlide.metadata as { canticleHeadline?: unknown } | undefined;
              const headline =
                typeof meta?.canticleHeadline === "string"
                  ? meta.canticleHeadline
                  : "Canticle";
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    textAlign: "center",
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      color: FAINT_GREEN,
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    {resolvedMode === "evening" || resolvedMode === "early-evening-devotion"
                      ? "The Canticle Appointed For This Evening"
                      : "The Canticle Appointed For This Morning"}
                  </p>
                  <h1
                    className="title-glow-breathe"
                    style={{
                      fontFamily: SPACE_GROTESK,
                      fontSize: "clamp(48px, 9vw, 88px)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: WARM_TEXT,
                      margin: 0,
                      lineHeight: 1.0,
                    }}
                  >
                    {headline}
                  </h1>
                  {currentSlide.title && (
                    <p
                      style={{
                        fontSize: 19,
                        fontFamily: SPACE_GROTESK,
                        color: "rgba(200,212,192,0.75)",
                        margin: 0,
                      }}
                    >
                      {currentSlide.title.replace(/^Canticle\s+\d+\s*[—-]\s*/i, "")}
                    </p>
                  )}
                </div>
              );
            })()
          ) : currentSlide.type === "lesson_title" ? (
            // Big lesson reference headline ("Romans 14:1-12") + a
            // subtitle that names which lesson slot this is ("The
            // First Lesson Appointed For This Morning"). Mirrors
            // psalm_title; the verses follow on lesson_verses chunks.
            (() => {
              const meta = currentSlide.metadata as
                | { lessonSubtitle?: unknown }
                | undefined;
              const subtitle =
                typeof meta?.lessonSubtitle === "string" && meta.lessonSubtitle.length > 0
                  ? meta.lessonSubtitle
                  : "A Lesson";
              const reference = currentSlide.title ?? "";
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    textAlign: "center",
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      color: FAINT_GREEN,
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    {subtitle}
                  </p>
                  <h1
                    className="title-glow-breathe"
                    style={{
                      fontFamily: SPACE_GROTESK,
                      fontSize: "clamp(36px, 7vw, 64px)",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      color: WARM_TEXT,
                      margin: 0,
                      lineHeight: 1.05,
                    }}
                  >
                    {reference}
                  </h1>
                </div>
              );
            })()
          ) : currentSlide.type === "lesson" ? (
            // Plain lesson slide — same centered template as the
            // psalm title page: a contextual eyebrow, the big
            // reference headline, and a "From the Daily Office
            // Lectionary" attribution. The "Read on Bible.com" pill
            // renders below (the lesson || lesson_title block further
            // down). The "Open your Bible…" body line is suppressed
            // for this type so the slide reads as a clean title card.
            (() => {
              const isEvening =
                resolvedMode === "evening" || resolvedMode === "early-evening-devotion";
              const tod = isEvening ? "Evening" : "Morning";
              const e = (currentSlide.eyebrow ?? "").toUpperCase();
              const eyebrowText = e.includes("FIRST")
                ? `The First Lesson Appointed For This ${tod}`
                : e.includes("SECOND")
                  ? `The Second Lesson Appointed For This ${tod}`
                  : e.includes("GOSPEL")
                    ? `The Gospel Appointed For This ${tod}`
                    : `The Lesson Appointed For This ${tod}`;
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    textAlign: "center",
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      color: FAINT_GREEN,
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    {eyebrowText}
                  </p>
                  <h1
                    className="title-glow-breathe"
                    style={{
                      fontFamily: SPACE_GROTESK,
                      fontSize: "clamp(36px, 7vw, 64px)",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      color: WARM_TEXT,
                      margin: 0,
                      lineHeight: 1.05,
                    }}
                  >
                    {/* Lectionary data writes cross-chapter ranges
                        with a double hyphen ("Matt. 7:28--8:4") —
                        normalize to a single en dash so the headline
                        reads "Matt. 7:28–8:4" instead of shouting a
                        stray "--". */}
                    {(currentSlide.title ?? "").replace(/\s*-{2,}\s*/g, "–")}
                  </h1>
                  <p
                    style={{
                      fontSize: 16,
                      fontFamily: SPACE_GROTESK,
                      color: "rgba(200,212,192,0.75)",
                      margin: 0,
                    }}
                  >
                    From the Daily Office Lectionary
                  </p>
                  {/* "Open your Bible, or read this passage online."
                      — the server's lesson prompt, kept above the
                      Read on Bible.com pill that renders below. */}
                  {currentSlide.content && (
                    <p
                      style={{
                        fontSize: 15,
                        fontFamily: SPACE_GROTESK,
                        color: "rgba(143,175,150,0.9)",
                        margin: "6px 0 0 0",
                      }}
                    >
                      {currentSlide.content}
                    </p>
                  )}
                </div>
              );
            })()
          ) : currentSlide.type === "intercessions" ? (
            (() => {
              const meta = currentSlide.metadata as
                | { source?: unknown; authorName?: unknown; authorAvatarUrl?: unknown }
                | undefined;
              const source = typeof meta?.source === "string" ? meta.source : null;
              // The face-pair (avatar + name) only renders when the
              // slide is anchored to a specific person — request
              // (the requester) or prayer-for (the recipient the
              // viewer is holding). Community feed entries and
              // circle intentions skip it; the body carries the
              // prayer on its own.
              const showFace = source === "request" || source === "prayer-for";
              return (
                <IntercessionHead
                  eyebrow={currentSlide.eyebrow || sectionLabel}
                  authorName={
                    (meta?.authorName as string | undefined)
                    ?? currentSlide.title
                    ?? null
                  }
                  authorAvatarUrl={
                    (meta?.authorAvatarUrl as string | null | undefined)
                    ?? null
                  }
                  showFace={showFace}
                />
              );
            })()
          ) : currentSlide.type === "psalm" ? (
            // Verse-chunk slide. The dedicated psalm_title slide has
            // already shown the big "Psalm 72" + appointed-for
            // headline, so here we just keep a slim eyebrow ("Psalm 72")
            // above the verses so the reader knows where they are
            // mid-rotation.
            <p
              style={{
                color: FAINT_GREEN,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {(currentSlide.eyebrow || "PSALM").replace(/^PSALM\b/, "Psalm")}
            </p>
          ) : currentSlide.type === "invitatory_psalm" ? (
            // Chunked invitatory verse slide. Slim eyebrow with the
            // invitatory's proper name (Venite / Jubilate / Pascha
            // Nostrum) so the reader keeps their place mid-rotation,
            // mirroring the appointed-psalm chunk eyebrow.
            (() => {
              const meta = currentSlide.metadata as { psalmHeadline?: unknown } | undefined;
              const headline =
                typeof meta?.psalmHeadline === "string" && meta.psalmHeadline.length > 0
                  ? meta.psalmHeadline
                  : "Invitatory";
              return (
                <p
                  style={{
                    color: FAINT_GREEN,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    margin: 0,
                    fontWeight: 600,
                  }}
                >
                  {headline}
                </p>
              );
            })()
          ) : currentSlide.type === "psalm_gloria" ? (
            // Doxology slide — sealing the psalm. Slim "Doxology"
            // eyebrow keeps the breadcrumb consistent with the verse
            // slides above. Body renders as italic Space Grotesk via
            // the default <p> below the branch list.
            <p
              style={{
                color: FAINT_GREEN,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: 0,
                fontWeight: 600,
              }}
            >
              Doxology
            </p>
          ) : currentSlide.type === "lesson_verses" ? (
            // Chunked lesson verse slide. The dedicated lesson_title
            // already showed the big reference headline; here we keep
            // a slim eyebrow with the reference so the reader doesn't
            // lose place mid-rotation. Verses render below in the
            // numbered-row layout.
            <p
              style={{
                color: FAINT_GREEN,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {currentSlide.title ?? "Lesson"}
            </p>
          ) : currentSlide.type === "canticle" && (currentSlide.metadata as { canticleChunkIndex?: unknown } | undefined)?.canticleChunkIndex !== undefined ? (
            // Chunked canticle slide — title slide already showed the
            // big headline. Slim eyebrow uses the canticle's own
            // name ("The Song of Mary") instead of "Canticle 15" so
            // the reader sees what they're saying, not just an index.
            // The seeded title is shaped like "Canticle 15 — The Song
            // of Mary"; we strip the "Canticle N — " prefix.
            (() => {
              const fullTitle = currentSlide.title ?? "";
              const stripped = fullTitle.replace(/^Canticle\s+\w+\s*[—-]\s*/i, "");
              const eyebrowLabel = stripped.length > 0 ? stripped : (fullTitle || "Canticle");
              return (
                <p
                  style={{
                    color: FAINT_GREEN,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    margin: 0,
                    fontWeight: 600,
                  }}
                >
                  {eyebrowLabel}
                </p>
              );
            })()
          ) : (
            <>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {(() => {
                  // Lesson slides get a contextual eyebrow that
                  // mirrors the psalm slide's "The Psalm Appointed
                  // For This Morning" treatment. We tailor it to the
                  // existing eyebrow value so an MP First Lesson and
                  // an EP Gospel each read true to themselves while
                  // staying in the same voice.
                  if (currentSlide.type === "lesson") {
                    const isEvening =
                      resolvedMode === "evening" ||
                      resolvedMode === "early-evening-devotion";
                    const tod = isEvening ? "Evening" : "Morning";
                    const e = (currentSlide.eyebrow ?? "").toUpperCase();
                    if (e.includes("FIRST")) return `The First Lesson Appointed For This ${tod}`;
                    if (e.includes("SECOND")) return `The Second Lesson Appointed For This ${tod}`;
                    if (e.includes("GOSPEL")) return `The Gospel Appointed For This ${tod}`;
                    return `The Lesson Appointed For This ${tod}`;
                  }
                  return currentSlide.eyebrow || sectionLabel;
                })()}
              </p>
              {/* Title slot. Intercession + psalm slides took
                  earlier branches (above), so we know currentSlide
                  isn't either of those here. The collect drops its
                  Sunday-name title ("The Fifth Sunday of Easter")
                  so the prayer text itself is the centered focus —
                  the proper-name lives in the chrome's date label
                  already, no need to repeat it on the slide. */}
              {currentSlide.title && currentSlide.type !== "collect" && (
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    fontFamily: SPACE_GROTESK,
                    color: WARM_TEXT,
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  {currentSlide.title}
                </h2>
              )}
            </>
          )}
          {/* Psalms render as a structured list of verses — verse number
              on the left, asterisk visible at the half-verse caesura,
              second hemistich indented, and a clear gap between
              verses. Mirrors the 1979 BCP Psalter page format. The
              Gloria Patri (which the assembler appends to every
              psalm) renders as an unnumbered italic doxology at the
              bottom. The fallback continues to use whiteSpace pre-
              wrap for any non-psalm long-text slide.
              The data is already in the right shape — verses begin
              with `<digit><space>`, hemistichs are split by " *\n  "
              — so the parser just walks line by line. */}
          {currentSlide.type === "lesson_verses" ? (
            // Numbered-verse layout for a lesson chunk — verse number
            // on the left (faint sage), prose text on the right
            // (Space Grotesk italic). Mirrors the psalm verse layout but the
            // verses come from metadata.verses (chapter+verse+text)
            // instead of being parsed from a string blob. When a
            // chunk crosses a chapter boundary we mark the first verse
            // of the new chapter with "chapter:verse" notation so the
            // reader doesn't see verse numbers silently restart.
            (() => {
              const meta = currentSlide.metadata as
                | { verses?: unknown }
                | undefined;
              const versesRaw = Array.isArray(meta?.verses) ? meta.verses : null;
              const verses = (versesRaw ?? [])
                .filter((v: unknown): v is { chapter: number; verse: number; text: string } => {
                  if (!v || typeof v !== "object") return false;
                  const o = v as Record<string, unknown>;
                  return (
                    typeof o.chapter === "number"
                    && typeof o.verse === "number"
                    && typeof o.text === "string"
                  );
                });
              if (verses.length === 0) {
                // Defensive — server should always populate verses for
                // this slide type, but if it didn't, render the body
                // string as italic Space Grotesk so we don't blank out.
                return (
                  <p
                    style={{
                      fontSize: 20,
                      lineHeight: 1.7,
                      color: WARM_TEXT,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontFamily: SPACE_GROTESK,
                      maxWidth: 600,
                    }}
                  >
                    {currentSlide.content}
                  </p>
                );
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
                  {verses.map((v, i) => {
                    const prev = i > 0 ? verses[i - 1] : null;
                    const showChapter = !prev || prev.chapter !== v.chapter;
                    const label = showChapter ? `${v.chapter}:${v.verse}` : String(v.verse);
                    return (
                      <div key={i} style={{ display: "flex", gap: 10 }}>
                        <span
                          style={{
                            flex: "0 0 auto",
                            minWidth: showChapter ? 36 : 22,
                            color: FAINT_GREEN,
                            fontSize: 13,
                            fontFamily: SPACE_GROTESK,
                            lineHeight: 1.6,
                            paddingTop: 2,
                          }}
                        >
                          {label}
                        </span>
                        <p
                          style={{
                            flex: 1,
                            fontSize: 19,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            margin: 0,
                            fontFamily: SPACE_GROTESK,
                          }}
                        >
                          {v.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : currentSlide.type === "psalm" && currentSlide.content ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
              {parsePsalmContent(fixQuoteDirection(currentSlide.content)).map((v, i) => (
                v.kind === "verse" ? (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        minWidth: 22,
                        color: FAINT_GREEN,
                        fontSize: 13,
                        fontFamily: SPACE_GROTESK,
                        lineHeight: 1.6,
                        paddingTop: 2,
                      }}
                    >
                      {v.number}
                    </span>
                    <div style={{ flex: 1 }}>
                      {v.lines.map((ln, li) => (
                        <PointedLine
                          key={li}
                          text={ln.text}
                          style={{
                            fontSize: 19,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            margin: 0,
                            paddingLeft: ln.indented ? 24 : 0,
                            fontFamily: SPACE_GROTESK,
                            whiteSpace: "pre-wrap",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  // Gloria Patri — no verse number. Renders left-
                  // aligned at the same size + color as the psalm
                  // verses (per user direction — it used to drop to
                  // a small dimmed flush-right "seal", which read as
                  // an afterthought rather than part of the psalm).
                  (() => {
                    const meta = currentSlide.metadata as { gloryBottomRight?: boolean } | undefined;
                    if (meta?.gloryBottomRight) {
                      return (
                        <p
                          key={i}
                          style={{
                            fontSize: 19,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            fontFamily: SPACE_GROTESK,
                            margin: "24px 0 0 0",
                          }}
                        >
                          {v.text}
                        </p>
                      );
                    }
                    return (
                      <div
                        key={i}
                        style={{
                          borderTop: "1px solid rgba(143,175,150,0.18)",
                          paddingTop: 12,
                          marginTop: 4,
                        }}
                      >
                        <p
                          style={{
                            fontSize: 15,
                            lineHeight: 1.7,
                            color: WARM_TEXT,
                            fontFamily: SPACE_GROTESK,
                            margin: 0,
                          }}
                        >
                          {v.text}
                        </p>
                      </div>
                    );
                  })()
                )
              ))}
            </div>
          ) : currentSlide.isCallAndResponse && currentSlide.callAndResponseLines ? (
            // Officiant / People / All speaker labels are dropped on
            // both the Daily Office AND the Daily Devotions — Phoebe
            // is used overwhelmingly as a personal-prayer surface, not
            // a corporate one, so the role labels just added visual
            // noise above each line. The lines now read as one
            // continuous prayer.
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
              {currentSlide.callAndResponseLines.map((line, i) => (
                <p
                  key={i}
                  style={{ fontSize: 20, lineHeight: 1.6, color: WARM_TEXT, margin: 0, fontFamily: SPACE_GROTESK }}
                >
                  {fixQuoteDirection(line.text)}
                </p>
              ))}
            </div>
          ) : currentSlide.type === "invitatory_psalm" && currentSlide.content ? (
            // Invitatory psalm body — canticle-shaped lines (no
            // numeric verse markers). When metadata carries
            // antiphonOpen / antiphonClose (set on the first / last
            // chunks per BCP rubric p. 80), render an "ANTIPHON"
            // labeled block above/below the verses so the antiphon
            // doesn't read as if it were the psalm's first/last line.
            (() => {
              const meta = currentSlide.metadata as
                | { antiphonOpen?: string; antiphonClose?: string }
                | undefined;
              const antiphonOpen = meta?.antiphonOpen;
              const antiphonClose = meta?.antiphonClose;
              const renderAntiphon = (text: string, key: string) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 600 }}>
                  <p
                    style={{
                      color: FAINT_GREEN,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    Antiphon
                  </p>
                  <p
                    style={{
                      fontSize: 19,
                      lineHeight: 1.6,
                      color: WARM_TEXT,
                      margin: 0,
                      fontFamily: SPACE_GROTESK,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {fixQuoteDirection(text)}
                  </p>
                </div>
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
                  {antiphonOpen && renderAntiphon(antiphonOpen, "open")}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {fixQuoteDirection(currentSlide.content).split("\n").map((raw, i) => {
                      if (raw.trim().length === 0) {
                        return <div key={i} style={{ height: 8 }} />;
                      }
                      const indented = /^\s/.test(raw);
                      return (
                        <PointedLine
                          key={i}
                          text={raw.trim()}
                          style={{
                            fontSize: 20,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            margin: 0,
                            paddingLeft: indented ? 32 : 0,
                            fontFamily: SPACE_GROTESK,
                          }}
                        />
                      );
                    })}
                  </div>
                  {antiphonClose && renderAntiphon(antiphonClose, "close")}
                </div>
              );
            })()
          ) : currentSlide.type === "canticle" && currentSlide.content ? (
            // Canticles render line-by-line: indented continuation
            // lines (the second hemistich after the BCP `*` caesura)
            // get a real paddingLeft, and each source line goes
            // through <PointedLine>, which keeps the `*` caesura mark
            // from being orphaned onto its own line (binding it to the
            // preceding word, and condensing the line's kerning when
            // that would otherwise push the word+asterisk down).
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 600 }}>
              {fixQuoteDirection(currentSlide.content).split("\n").map((raw, i) => {
                if (raw.trim().length === 0) {
                  return <div key={i} style={{ height: 8 }} />;
                }
                const indented = /^\s/.test(raw);
                return (
                  <PointedLine
                    key={i}
                    text={raw.trim()}
                    style={{
                      fontSize: 20,
                      lineHeight: 1.6,
                      color: WARM_TEXT,
                      margin: 0,
                      paddingLeft: indented ? 32 : 0,
                      fontFamily: SPACE_GROTESK,
                    }}
                  />
                );
              })}
            </div>
          ) : currentSlide.content && currentSlide.type !== "lesson" && currentSlide.type !== "office_intro" ? (
            (() => {
              // Prose prayers (general thanksgiving, confession,
              // absolution, collect, prayer for mission, opening
              // sentence, blessing) read as flowing paragraphs, not
              // a chopped-up phrase-per-line column. The seeded
              // content uses \n at clause boundaries for readability
              // in source — strip them down to spaces here so the
              // body wraps naturally on the device.
              //
              // Lord's Prayer + Creed keep their structural line
              // breaks (each line is a beat the reader speaks
              // separately), so they stay on pre-wrap.
              const proseTypes = new Set<string>([
                "general_thanksgiving",
                "confession",
                "absolution",
                "collect",
                "prayer_for_mission",
                "opening_sentence",
                "closing",
              ]);
              const isProse = proseTypes.has(currentSlide.type);
              // For prose: split on blank lines (paragraph breaks)
              // and within each paragraph collapse single \n into
              // spaces. For everything else: render as one block
              // with pre-wrap so structural line breaks survive.
              if (isProse) {
                const paragraphs = fixQuoteDirection(currentSlide.content)
                  .split(/\n\s*\n/)
                  .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
                  .filter((p) => p.length > 0);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
                    {paragraphs.map((p, i) => (
                      <p
                        key={i}
                        style={{
                          fontSize: 20,
                          lineHeight: 1.7,
                          color: WARM_TEXT,
                          margin: 0,
                          fontFamily: SPACE_GROTESK,
                        }}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                );
              }
              return (
                <p
                  style={{
                    // Intercession slides bump the body to 22px italic
                    // to match the prayer-mode slideshow's
                    // "carrying one prayer" weight; everything else stays
                    // at the missal-page reading size.
                    fontSize: currentSlide.type === "intercessions" ? 22 : 20,
                    lineHeight: currentSlide.type === "intercessions" ? 1.5 : 1.7,
                    fontWeight: currentSlide.type === "intercessions" ? 500 : 400,
                    color: currentSlide.type === "intercessions" ? "#E8E4D8" : WARM_TEXT,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: SPACE_GROTESK,
                    maxWidth: 600,
                  }}
                >
                  {fixQuoteDirection(currentSlide.content)}
                </p>
              );
            })()
          ) : null}
          {/* Word-of-comfort field — only for prayer-request slides
              (other intercession sources don't have a /word endpoint).
              Renders the same RequestWordField the prayer-mode
              slideshow uses, so the comment composer is identical
              between the two surfaces. */}
          {currentSlide.type === "intercessions" && (() => {
            const meta = currentSlide.metadata as
              | { source?: unknown; requestId?: unknown }
              | undefined;
            if (meta?.source !== "request" || typeof meta?.requestId !== "number") {
              return null;
            }
            return (
              <RequestWordField
                requestId={meta.requestId}
                initialWord={null}
              />
            );
          })()}
          {/* On lesson slides we link out to YouVersion (bible.com)
              for the appointed passage in NRSVUE. The URL is
              computed client-side from the slide title (the
              reference) so it works even when the server-cached
              slide pre-dates the metadata.readUrl field. We render
              an actual <a> with href so iOS won't swallow the
              click — onClick still goes through openExternal so the
              iOS shell shows SFSafariViewController instead of
              bouncing the user out to mobile Safari. */}
          {(currentSlide.type === "lesson" || currentSlide.type === "lesson_title") && (() => {
            // Bible.com pills on the lesson title card. A reference
            // with more than one contiguous range — multi-range
            // ("Num. 11:16-17, 24-29") or cross-chapter
            // ("John 7:14-8:2") — gets one pill PER range, because
            // Bible.com only resolves a single contiguous range per
            // URL (the old single-link build silently dropped every
            // range after the first). A plain single-range reference
            // keeps the simple "Read on Bible.com →" pill.
            const segments = currentSlide.title
              ? bibleUrlSegments(currentSlide.title)
              : [];
            if (segments.length === 0) return null;
            const multi = segments.length > 1;
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                {segments.map((seg, i) => (
                  <a
                    key={`${seg.url}-${i}`}
                    href={seg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      // Always intercept on native + web. openExternal
                      // routes through SFSafariViewController on iOS
                      // and window.open on the web. preventDefault
                      // stops the iOS WebView from also navigating.
                      e.preventDefault();
                      openExternal(seg.url);
                    }}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: "rgba(46,107,64,0.18)",
                      border: "1px solid rgba(46,107,64,0.45)",
                      color: WARM_TEXT,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    {/* Single range → the plain label. Multiple →
                        each pill names the range it opens so the
                        reader knows which part they're reading. */}
                    {multi ? `Read ${seg.label} →` : "Read on Bible.com →"}
                  </a>
                ))}
              </div>
            );
          })()}
          {/* "Learn more" pill on feed-scoped intercession slides
              when the admin set a learn_more_url on the entry. Shares
              ExternalLinkPill with the prayer-mode slideshow so the
              two surfaces look the same; the pill glows until the
              user has tapped it once. */}
          {currentSlide.type === "intercessions" && (() => {
            const meta = currentSlide.metadata as { learnMoreUrl?: unknown; source?: unknown } | undefined;
            const url = typeof meta?.learnMoreUrl === "string" && meta.learnMoreUrl.length > 0
              ? meta.learnMoreUrl
              : null;
            if (!url) return null;
            return (
              <div style={{ alignSelf: "center", marginTop: 4 }}>
                <ExternalLinkPill url={url} label="Learn more →" size="medium" />
              </div>
            );
          })()}
          {/* Parish solidarity chip — shown on the intercession slides
              that come from the viewer's parish (assembleIntercessions
              metadata.source === "parish"). Prefers the today count
              when non-zero (more immediate), falls back to the
              this-week count, hides entirely when both are zero.
              Same numbers the parish dashboard + post-Office
              celebration screen show — surfaced here so the
              parishioner sees them in the moment they're praying. */}
          {currentSlide.type === "intercessions" && (() => {
            const meta = currentSlide.metadata as
              | { source?: unknown; parishionersPrayingToday?: unknown; parishionersPrayingThisWeek?: unknown }
              | undefined;
            if (meta?.source !== "parish") return null;
            const today =
              typeof meta.parishionersPrayingToday === "number" ? meta.parishionersPrayingToday : 0;
            const week =
              typeof meta.parishionersPrayingThisWeek === "number" ? meta.parishionersPrayingThisWeek : 0;
            if (today === 0 && week === 0) return null;
            const label = today > 0
              ? today === 1
                ? "1 from your parish is praying with you today."
                : `${today} from your parish are praying with you today.`
              : week === 1
                ? "1 from your parish has prayed with you this week."
                : `${week} from your parish have prayed with you this week.`;
            return (
              <p
                style={{
                  alignSelf: "center",
                  margin: "8px 0 0",
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(46,107,64,0.12)",
                  border: "1px solid rgba(46,107,64,0.28)",
                  color: "#A8C5A0",
                  fontFamily: SPACE_GROTESK,
                  fontSize: 12,
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                ⛪ {label}
              </p>
            );
          })()}
          {currentSlide.bcpReference && (
            <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0, marginTop: 8 }}>
              {currentSlide.bcpReference}
            </p>
          )}
          {/* Devotion-only side-doors. The dashboard's "Pray" tap
              now lands here directly (the standalone /prayer-start
              chooser was a pre-step the user wanted gone), so the
              two heavier paths it used to surface — community
              prayer list and the full Office — live on this first
              slide instead, sitting quietly above the bottom nav
              so they're discoverable but don't compete with the
              opening acclamation. Only on the first slide; once the
              reader is moving through the devotion they shouldn't
              keep seeing alternate routes. */}
          {isDevotion && slideIdx === 0 && !onComplete && !officesOnlyViewer && (
            // Offices-only users get this row hidden entirely:
            // /prayer-mode (no queue) would loading-screen for them
            // because the default queue depends on /api/moments +
            // /api/prayer-requests, both 403 for that tier. They have
            // no parallel "skip to your prayer feed" affordance here
            // yet (no subscribed-feeds query in scope); the chooser
            // page surfaces a Prayer Feed option for the same flow
            // one step up, so dropping the link here is the safest
            // outcome until/unless a feed-aware variant is added.
            <div
              style={{
                marginTop: 28,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                paddingTop: 16,
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <button
                type="button"
                onClick={() => setViewerLocation("/prayer-mode")}
                style={{
                  background: "none",
                  border: "none",
                  color: MUTED_GREEN,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 6,
                  textDecoration: "underline",
                  textDecorationColor: "rgba(143,175,150,0.35)",
                  textUnderlineOffset: 4,
                }}
              >
                Skip to community prayer list →
              </button>
              <button
                type="button"
                onClick={() => {
                  // Morning devotion → Morning Prayer; early-evening
                  // devotion → Evening Prayer. Same time-of-day rule
                  // the picker uses.
                  const target =
                    resolvedMode === "early-evening-devotion"
                      ? "/bcp/daily-office?mode=evening"
                      : "/bcp/daily-office?mode=morning";
                  setViewerLocation(target);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: MUTED_GREEN,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 6,
                  textDecoration: "underline",
                  textDecorationColor: "rgba(143,175,150,0.35)",
                  textUnderlineOffset: 4,
                }}
              >
                Pray the full {resolvedMode === "early-evening-devotion" ? "Evening Prayer" : "Morning Prayer"} →
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Bottom nav pill — Back · section · Next/Done. Mirrors Lectio. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "rgba(19,44,29,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "8px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              color: WARM_TEXT,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              padding: "6px 14px",
              fontSize: 12,
              fontFamily: SPACE_GROTESK,
              fontWeight: 600,
              cursor: atStart ? "default" : "pointer",
            }}
          >
            Back
          </button>
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: 0,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {slideIdx + 1} · {sectionLabel}
          </p>
          {(() => {
            // Slide types that finish on "Amen" rather than "Next":
            // intercessions (already amen-bound), the Lord's Prayer,
            // and any Collect / Prayer for Mission. The user reads
            // through the prayer, taps "Amen" to seal it, and only
            // then advances. Same button visual, just truer copy.
            const isAmenSlide =
              isIntercessionSlide
              || currentSlide.type === "lords_prayer"
              || currentSlide.type === "collect"
              || currentSlide.type === "prayer_for_mission";
            // "Amen" wins over "Done" on prayer-shaped slides — the
            // closing collect IS the seal of the office, so the pill
            // should say Amen even when it's the very last slide. The
            // tap still exits the office (handler logic below).
            const label = isAmenSlide ? "Amen" : (atEnd ? "Done" : "Next");
            // When the user has completed the seamless intercessions
            // handoff and is now finishing the closing collect, route
            // them to /prayer-mode?closingOnly=1 so they get the
            // streak / co-prayers celebration that we deferred from
            // mid-flow. Parish-only users get the parish celebration
            // instead — "N from your parish prayed today / this
            // week". Otherwise the final-slide tap just exits.
            const handleEnd = () => {
              // Mark today's pass complete so the dashboard PrayerOfficeCard
              // flips to "Pray again" copy for the rest of the day. Same
              // stamp the Amen-path uses in amen() above — kept in both
              // places because either button can be the final tap (Amen
              // for prayer-shaped closings, Done for non-prayer ones).
              try {
                localStorage.setItem(officeCompletedKey(resolvedMode), "1");
                localStorage.removeItem(officeProgressKey(resolvedMode));
              } catch { /* non-fatal */ }
              // Public /pray page: hand off to its own sign-up close.
              if (onComplete) { onComplete(); return; }
              if (parishOnly) {
                setViewerLocation(`/parish/celebration?surface=${encodeURIComponent(resolvedMode)}`);
              } else if (officesOnlyViewer) {
                setViewerLocation("/parish");
              } else {
                // Always route to the closing summary + habit slide.
                // Used to gate on seamlessReturnRef so a direct-entry
                // office finish exited without the recap; user
                // explicitly wanted the habit-rhythm screen for every
                // office completion.
                setViewerLocation(`/prayer-mode?closingOnly=1&side=${officeSide}`);
              }
            };
            const handler = isIntercessionSlide
              ? amen
              : atEnd ? handleEnd : next;
            return (
              <button
                type="button"
                onClick={handler}
                className="rounded-full transition-opacity"
                style={{
                  background: BUTTON_BG,
                  color: WARM_TEXT,
                  border: "none",
                  padding: "6px 16px",
                  fontSize: 12,
                  fontFamily: SPACE_GROTESK,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })()}
        </div>
      </nav>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  // All four liturgies live behind this one picker now (the Daily
  // Devotions menu entry was folded in). null = show the chooser.
  const [showMode, setShowMode] = useState<LiturgyMode | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Auto-resume the viewer when /prayer-mode hands the user back here
  // with ?mode=… — keeps the intercessions handoff seamless instead of
  // dumping them on the picker mid-liturgy. Accepts all four modes.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    if (mode === "morning" || mode === "evening" || mode === "morning-devotion" || mode === "early-evening-devotion") {
      setShowMode(mode);
    }
  }, []);

  if (isLoading || !user) return null;

  if (showMode) {
    return <OfficeViewer mode={showMode} onBack={() => setShowMode(null)} />;
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isEvening = hour >= 14;

  type OfficeOption = {
    mode: LiturgyMode;
    emoji: string;
    label: string;
    sub: string;
    now: boolean;
  };
  const fullOffice: OfficeOption[] = [
    { mode: "morning", emoji: "🌅", label: "Morning Prayer", sub: "Rite II · the full Daily Office", now: isMorning },
    { mode: "evening", emoji: "🌙", label: "Evening Prayer", sub: "Rite II · the full Daily Office", now: isEvening },
  ];
  const devotions: OfficeOption[] = [
    { mode: "morning-devotion", emoji: "🌿", label: "Morning Devotion", sub: "A short devotion · BCP p. 137", now: isMorning },
    { mode: "early-evening-devotion", emoji: "🌆", label: "Early Evening Devotion", sub: "A short devotion · BCP p. 139", now: isEvening },
  ];

  const OptionButton = ({ opt }: { opt: OfficeOption }) => (
    <button
      onClick={() => setShowMode(opt.mode)}
      className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
      style={{
        background: opt.now ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
        border: `1px solid ${opt.now ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
      }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{opt.emoji}</span>
        <div className="flex-1">
          <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {opt.label}
          </p>
          <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{opt.sub}</p>
          {opt.now && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
        </div>
        <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
      </div>
    </button>
  );

  const SectionLabel = ({ children }: { children: string }) => (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.16em] mt-6 mb-2"
      style={{ color: "rgba(143,175,150,0.5)", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {children}
    </p>
  );

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-2">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Daily Offices 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            The full Morning &amp; Evening Prayer, or the short Daily Devotions
          </p>
        </div>

        <SectionLabel>The full office</SectionLabel>
        <div className="space-y-3">
          {fullOffice.map((opt) => <OptionButton key={opt.mode} opt={opt} />)}
        </div>

        <SectionLabel>Short devotions</SectionLabel>
        <div className="space-y-3">
          {devotions.map((opt) => <OptionButton key={opt.mode} opt={opt} />)}
        </div>
      </div>
    </Layout>
  );
}
