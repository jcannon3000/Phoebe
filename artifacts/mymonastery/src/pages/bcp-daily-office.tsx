import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { swellHaptic } from "@/lib/swellHaptic";
import { playBreathTone } from "@/lib/amenFeedback";
import { clearOfficeReminderNotifications } from "@/lib/officeReminders";
import { AnimatePresence, motion } from "framer-motion";
import { X, Settings } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePilotMode } from "@/hooks/usePilotMode";
import { useGuestMode } from "@/hooks/useGuestMode";
import { usePrayerRequestsEnabled } from "@/hooks/usePrayerRequests";
import { Layout } from "@/components/layout";
import type { Slide } from "@/components/MorningPrayer/types";
import { openExternal, openExternalThenMarkRead, openOfficeReading, preloadExternal, hasNativeBrowser } from "@/lib/openExternal";
import { FDD_TODAY_URL, markFddRead } from "@/lib/cacReadState";
import { bibleUrl } from "@/lib/bibleGatewayUrl";
import { fixQuoteDirection } from "@/lib/smartQuotes";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LEAF_PHOTOS, PLANET_PHOTOS, WATER_PHOTOS, SPLASH_PHOTO } from "@/lib/earthPhotos";
import { markRecentCompletion } from "@/lib/recentCompletion";
import { OfficeDisplaySheet, useOfficeDisplay, fontScaleWrapStyle } from "@/components/OfficeDisplaySheet";
import { officeThemeStyle, themeColorForBackdrop } from "@/lib/officeDisplay";
import { FROST_BLUR } from "@/lib/frost";
import splashForestPath from "@/assets/splash/forest-path.jpg";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequestWordField } from "@/components/RequestWordField";
import { PrayerPromptsSlide } from "@/components/PrayerPromptsSlide";
import { ExternalLinkPill } from "@/components/ExternalLinkPill";
import { usePrayerSession, type PrayerSurface } from "@/hooks/usePrayerSession";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { getSideEntry, setSideEntry, getSideConfession, getSideLevel, setSideLevel, getSideExtra, extraOfficeMode, type OfficeSide, type DefaultOfficeEntry } from "@/lib/officePrefs";
import { getOfficeCacheEntry, putOfficeCacheEntry } from "@/lib/officeOfflineCache";
import { CobreatheOverlay } from "@/components/CobreatheOverlay";
import { ContemplationTimer } from "@/components/ContemplationTimer";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { markOfficeBookComplete } from "@/lib/officeManualLog";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { canPrayOnVenite, veniteOfficeUrl } from "@/lib/venite";
import { PointedLine } from "@/components/PointedLine";

// ── Daily Office viewer ─────────────────────────────────────────────────────
// Visual chrome mirrors Lectio: dark forest background, top-bar with
// Back / Menu / eyebrow+reference, body centered, bottom pill with
// Back · section-label · Next. The slide content itself is rendered
// inline below — no SlideView dependency, since SlideView's chrome
// fights with this layout.

const BG = "var(--oh-bg2, #091A10)";
const WARM_TEXT = "var(--oh-ink, #F0EDE6)";
const MUTED_GREEN = "var(--oh-sage, #8FAF96)";
const FAINT_GREEN = "rgba(var(--ot-sage, 143,175,150),0.55)";
const BORDER = "rgba(var(--ot-mist, 200,212,192),0.15)";
const BUTTON_BG = "var(--oh-cta, #2D5E3F)";
const SPACE_GROTESK = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";

// Office deck title scale. These centered glow headlines were tuned on a phone,
// where the vw term always loses to the floor — so the max was never really
// exercised and drifted up to 72–88px, far past anything else in the app (the
// next largest title anywhere is 56px). On a desktop browser the vw term wins
// instead, and "Evening Prayer" rendered ~70px wide enough to overflow its own
// 540px container (owner: "adjust the scaling here").
//
// Only the MAX moves. Every phone width still lands on the floor, so iOS renders
// byte-for-byte as before; tablets and desktop (>~600px) settle at a size that
// sits with the rest of the app. Reuse these instead of writing a fresh clamp,
// so the deck can't drift apart one slide at a time again.
const TITLE_XL = "clamp(48px, 9vw, 56px)"; // psalm / canticle section headlines
const TITLE_LG = "clamp(40px, 8vw, 48px)"; // threshold ("Evening Prayer") title
const TITLE_MD = "clamp(36px, 7vw, 44px)"; // secondary headlines

// Mode covers the five liturgies this viewer can render. The Daily
// Office's Morning / Evening / Compline come from /api/office/* and
// the abbreviated Daily Devotions (BCP pp. 137 / 139) come from
// /api/devotion/* — all use the same Slide schema, so the renderer
// is identical apart from the title and endpoint.
export type LiturgyMode =
  | "morning"
  | "evening"
  | "compline"
  | "morning-devotion"
  | "early-evening-devotion"
  | "creation-morning"
  | "creation-evening";

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
  // True when the viewer was reached by explicitly choosing this
  // devotion from a list of options (the Daily Devotions picker cards,
  // or the prayer chooser). In that case the first slide hides its
  // alternate-route pills (Community Intercessions / Full Office) —
  // the user already made their choice, so re-presenting other paths
  // is noise. The Start CTA still shows. Direct landings (e.g. the
  // dashboard's "Pray" tap, which skips any chooser) leave the
  // alternate routes visible — that's why they live on this slide.
  cameFromPicker?: boolean;
  // Open straight into the physical-book page-number guide (the Daily
  // Office chooser's "In your book" rows set this). The guide is also
  // reachable via ?book=1 and the per-side "way to pray" pref — this
  // prop covers in-page navigation where no URL change happens.
  initialBook?: boolean;
  // Fresh-start slide index. The Daily Prayer picker IS the office's "before you
  // begin" slide, so it launches at 1 to skip the redundant welcome. A saved
  // in-progress resume / ?slide= deep link still take priority.
  initialSlide?: number;
}

interface OfficeDayInfo {
  weekdayLabel?: string;
  sundayLabel?: string;
  feastName?: string | null;
}

// Office-reminder push clearing now lives in @/lib/officeReminders
// (clearOfficeReminderNotifications) so the thread-id list has a single source
// of truth — a stale duplicate here once let the slideshow clear only "bell".

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
  antiphon: "Antiphon",
  lesson_title: "Lesson",
  lesson_verses: "Lesson",
  lesson: "Lesson",
  canticle: "Canticle",
  creed: "Creed",
  lords_prayer: "Lord's Prayer",
  suffrages: "Suffrages",
  salutation: "The Prayers",
  collect: "Collect",
  prayer_for_mission: "Prayer for Mission",
  intercessions: "Intercessions",
  general_thanksgiving: "General Thanksgiving",
  closing: "Closing",
};

// ── Praying TOGETHER (Settings → Praying the office) ─────────────────────────
// Communal mode restores the corporate form of the office: Officiant / People
// rubrics over each dialogue line, "said by" rubrics on the common texts, and
// the salutation before the Lord's Prayer — the exchange the BCP appoints for
// group use that Phoebe omits when praying alone. Device-local pref; the
// individual (default) office is unchanged.
const SPEAKER_LABEL: Record<"officiant" | "people" | "both", { en: string; es: string }> = {
  officiant: { en: "Officiant", es: "Oficiante" },
  people: { en: "People", es: "Pueblo" },
  both: { en: "All", es: "Todos" },
};
const SAID_BY: Partial<Record<string, { en: string; es: string }>> = {
  confession: { en: "Officiant and People together", es: "Oficiante y Pueblo juntos" },
  absolution: { en: "The Officiant", es: "El Oficiante" },
  opening_sentence: { en: "The Officiant", es: "El Oficiante" },
  collect: { en: "The Officiant", es: "El Oficiante" },
  prayer_for_mission: { en: "The Officiant", es: "El Oficiante" },
  creed: { en: "Said by all", es: "Dicho por todos" },
  lords_prayer: { en: "Said by all", es: "Dicho por todos" },
  general_thanksgiving: { en: "Said by all", es: "Dicho por todos" },
  canticle: { en: "Said by all", es: "Dicho por todos" },
  invitatory_psalm: { en: "Said together", es: "Dicho juntos" },
  psalm: { en: "Said together", es: "Dicho juntos" },
  psalm_gloria: { en: "Said together", es: "Dicho juntos" },
};
const pickLoc = (v: { en: string; es: string }): string => v.en;

// Communal absolution — the BCP's priest form. Praying alone, the Absolution
// reads in the lay "us/our" form (a deacon or lay person substitutes them);
// when a priest presides at a gathering it's said over the People in the
// "you/your" form (BCP p. 80 / p. 117). Communal mode swaps the specific
// pronoun phrases (leaving "our Lord Jesus Christ" untouched). Phrase-scoped so
// it no-ops on the Spanish text and never mangles an unexpected string.
function communalAbsolutionText(content: string): string {
  return content
    .replace(/mercy on us\b/g, "mercy on you")
    .replace(/forgive us all our sins/g, "forgive you all your sins")
    .replace(/strengthen us in all goodness/g, "strengthen you in all goodness")
    .replace(/keep us in eternal life/g, "keep you in eternal life");
}

// The salutation slide (BCP p. 97 MP / p. 121 EP) spliced before the Lord's
// Prayer in communal mode — "The Lord be with you" is a dialogue that only
// exists with a People to answer it.
function buildSalutationSlide(mode: "morning" | "evening"): Slide {
  return {
    id: "salutation",
    type: "salutation",
    emoji: "🕊️",
    eyebrow: "The Prayers",
    title: null,
    content: "",
    isCallAndResponse: true,
    callAndResponseLines: [
      { speaker: "officiant", text: "The Lord be with you." },
      { speaker: "people", text: "And also with you." },
      { speaker: "officiant", text: "Let us pray." },
    ],
    bcpReference: mode === "morning" ? "BCP p. 97" : "BCP p. 121",
    isScrollable: false,
    scrollHint: null,
    metadata: {},
  };
}

// The Officiant's invitation to the Confession (BCP p. 79 MP / p. 116 EP),
// spliced before the Confession in communal mode — the bid the BCP appoints for
// the Officiant, which Phoebe omits when praying alone (you go straight to the
// confession). One Officiant line, no People response.
function buildConfessionInvitationSlide(mode: "morning" | "evening"): Slide {
  return {
    id: "confession-invitation",
    type: "confession_invitation",
    emoji: "🕊️",
    eyebrow: "The Confession",
    title: null,
    content: "",
    isCallAndResponse: true,
    callAndResponseLines: [
      {
        speaker: "officiant",
        text: "Let us confess our sins against God and our neighbor.",
      },
    ],
    bcpReference: mode === "morning" ? "BCP p. 79" : "BCP p. 116",
    isScrollable: false,
    scrollHint: null,
    metadata: {},
  };
}

// A quiet listing of the reader's own private prayer list, spliced in right
// before the contemplative pause (see the splice effect below). Not an
// editor — the dedicated /intentions page stays the only place to add/edit;
// this just names them as things to hold in prayer during the office.
function buildPrayerIntentionsSlide(
  mode: "morning" | "evening" | string,
  items: Array<{ headline: string; subline: string }>,
): Slide {
  return {
    id: "prayer-intentions",
    type: "prayer_intentions",
    emoji: "🕊️",
    eyebrow: "Your Prayer List",
    title: null,
    content: "",
    isCallAndResponse: false,
    callAndResponseLines: [],
    bcpReference: null,
    isScrollable: true,
    scrollHint: null,
    metadata: { side: mode, intentions: items },
  };
}

// The "before you go" prompt composer — spliced in right AFTER the
// contemplative pause (see the splice effect below), for signed-up accounts
// only. Unlike the listing slide above, this one is unconditional on having
// existing intentions — its whole purpose is inviting a NEW one.
function buildPrayerPromptsSlide(): Slide {
  return {
    id: "prayer-prompts",
    type: "prayer_prompts",
    emoji: "🕊️",
    eyebrow: "",
    title: null,
    content: "",
    isCallAndResponse: false,
    callAndResponseLines: [],
    bcpReference: null,
    isScrollable: true,
    scrollHint: null,
    metadata: {},
  };
}

// A contemplative pause offered in the Prayers, where the community
// intercessions would otherwise hand off, for accounts without the
// prayer-request feature. The slide itself is a chooser (breathe / silence);
// the render branch below wires the two paths.
function buildContemplativePauseSlide(mode: "morning" | "evening" | string): Slide {
  return {
    id: "contemplative-pause",
    type: "contemplative_pause",
    emoji: "🕯️",
    eyebrow: "A moment to pause",
    title: null,
    content: "",
    isCallAndResponse: false,
    callAndResponseLines: [],
    bcpReference: null,
    isScrollable: false,
    scrollHint: null,
    metadata: { side: mode },
  };
}

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
                color: "var(--oh-fern, #A8C5A0)",
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
                color: "var(--oh-mist, #C8D4C0)",
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
          color: "rgba(var(--ot-sage, 143,175,150),0.45)",
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
  compline: { endpoint: "/api/office/compline", title: "Compline" },
  "morning-devotion": { endpoint: "/api/devotion/morning", title: "Morning Devotion" },
  "early-evening-devotion": { endpoint: "/api/devotion/early-evening", title: "Early Evening Devotion" },
  "creation-morning": { endpoint: "/api/devotion/creation-morning", title: "Creation Prayer · Morning" },
  "creation-evening": { endpoint: "/api/devotion/creation-evening", title: "Creation Prayer · Evening" },
};

export function OfficeViewer({ office, mode, onBack, onComplete, cameFromPicker, initialBook, initialSlide }: OfficeViewerProps) {
  const resolvedMode: LiturgyMode = mode ?? office ?? "morning";
  const { endpoint, title: officeTitle } = MODE_CONFIG[resolvedMode];
  const player = usePodcastPlayer();

  // Which half of the day this office belongs to. Threaded onto the
  // closing redirect (?side=) so the prayer-rhythm habit slide can
  // show an evening-only "Pray the Examen" pill. Compline counts as
  // evening — it's the close-of-day office.
  const officeSide: "morning" | "evening" =
    resolvedMode === "evening" ||
    resolvedMode === "compline" ||
    resolvedMode === "early-evening-devotion" ||
    resolvedMode === "creation-evening"
      ? "evening"
      : "morning";
  // The National Cathedral broadcasts Morning Prayer Mon–Fri only, so the
  // in-office "Watch" shortcut hides on weekends (nothing to watch live).
  const isWeekday = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5; })();

  // ── Physical-book mode ──────────────────────────────────────────────
  // The page-number guide for praying this office from a paper Book of
  // Common Prayer. Three ways in:
  //   • ?book=1 deep link — also how the intercessions handoff returns
  //     here without dropping the user back into the slide deck
  //   • the per-side "way to pray" pref set to "book" (full offices)
  //   • the 📕 pill on the office_intro slide (setBookOpen below)
  // Mid-liturgy returns (?slide= / ?seamlessReturn=) stay in the slide
  // deck unless the return URL explicitly asks for the book view.
  const [bookOpen, setBookOpen] = useState<boolean>(() => {
    try {
      const search = new URLSearchParams(window.location.search);
      if (search.get("book") === "1") return true;
      if (search.has("slide") || search.has("seamlessReturn")) return false;
    } catch { /* non-browser */ }
    if (initialBook) return true;
    // Do NOT auto-open the book just because the saved method is "book". The
    // office must show the intro/welcome chooser first (with the saved method
    // pre-selected) so the reader can confirm or change how they pray before
    // tapping Begin. Only an explicit ?book=1 / initialBook jumps straight in.
    return false;
  });
  // Wall-clock stamp of when the book guide first opened this mount.
  // The "I prayed this office" log uses it as the session start, so
  // time spent praying with the phone set down — which the foreground-
  // only usePrayerSession clock can't see — still gets credited.
  const bookOpenedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (bookOpen && bookOpenedAtRef.current === null) {
      bookOpenedAtRef.current = Date.now();
    }
  }, [bookOpen]);
  // Flipped true once the book guide has logged its own deliberate
  // session row, so usePrayerSession's automatic unmount commit doesn't
  // double-count the same office.
  const suppressSessionPostRef = useRef(false);
  // Flipped true only when the office/devotion slideshow is actually finished
  // (closing Amen/Done, or the book "I prayed this" attestation). The unmount
  // session commit stamps `completed` from this, so the server office-history
  // counts a finished office but not a partial sit. See usePrayerSession.
  const completedRef = useRef(false);

  // Phoebe Parish — when the user is in the parish-only tier we
  // route them to the parish celebration screen on Amen instead of
  // the standard onBack() exit. The handler below reads parishOnly
  // off this; otherwise the historical exit path is unchanged for
  // beta + community users.
  const { user: viewerUser } = useAuth();
  // A real signed-up account (not a guest / anonymous device session) — gates
  // the private prayer-list slide below. Mirrors menu.tsx's signedUp check.
  const signedUp = !!viewerUser && !viewerUser.isAnonymous;
  const { isPilot } = usePilotMode();
  // PUBLIC no-login version — HARD REQUIREMENT: the office must NEVER enter
  // the community intercession slideshow in guest mode. Guests get the same
  // no-community-handoff treatment as pilot (portal slide dropped from the
  // deck + the auto-fire and tap handoffs dead), folded into one flag below.
  const { isGuest } = useGuestMode();
  // Prayer requests / community intercessions are pilot-group-only (2026-07-22).
  // Everyone else gets the same no-community-handoff treatment as pilot/guest —
  // the intercessions_portal slide is dropped and the handoff is dead — and the
  // office offers a contemplative pause in its place (see the pause slide below).
  const prayerRequestsEnabled = usePrayerRequestsEnabled();
  const noCommunityHandoff = isPilot || isGuest || !prayerRequestsEnabled;
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
  // "evening"→"evening-prayer". The devotion modes and "compline"
  // already match the PrayerSurface union directly.
  const officeSurface: PrayerSurface =
    resolvedMode === "morning" ? "morning-prayer"
    : resolvedMode === "evening" ? "evening-prayer"
    // The creation devotion counts as that half-day's office.
    : resolvedMode === "creation-morning" ? "morning-prayer"
    : resolvedMode === "creation-evening" ? "evening-prayer"
    : (resolvedMode as PrayerSurface);
  usePrayerSession(officeSurface, slidesReachedRef, suppressSessionPostRef, completedRef);
  // The Daily Devotions are explicitly the personal short forms
  // (BCP pp. 137 / 139). The full Daily Office's missal-page layout
  // (top-aligned, left-aligned, role-labelled) reads as overkill
  // here — devotion mode swaps short call-and-response slides to a
  // centered, label-less layout that feels like personal prayer
  // rather than a corporate liturgy.
  /**
   * Is the office currently open THIS SIDE'S SECOND practice rather than its
   * anchor? The devotion mode is shared, so it's the extra exactly when the
   * side's own level is the full office. Used to keep a second practice from
   * clearing the anchor's lock-screen reminder — same test the server's
   * bellSender makes before deciding the side has been prayed.
   */
  const isSecondPracticeRun = (
    resolvedMode === (officeSide === "morning" ? "morning-devotion" : "early-evening-devotion")
    && getSideLevel(officeSide) === "office"
  );
  const isDevotion =
    resolvedMode === "morning-devotion" ||
    resolvedMode === "early-evening-devotion" ||
    resolvedMode === "creation-morning" ||
    resolvedMode === "creation-evening";

  /**
   * Which home CARD this office completes.
   *
   * Normally the side's anchor ("morning"/"evening"). But when the side carries
   * a SECOND practice and THIS is the office that practice runs as, the card
   * that was prayed is the extra's, not the anchor's — see DailyProgressBody's
   * extraCard, whose key this must match exactly.
   */
  const completedCardKey = (() => {
    const extra = getSideExtra(officeSide);
    if (!extra) return officeSide;
    return extraOfficeMode(officeSide, extra) === resolvedMode ? `extra-${officeSide}` : officeSide;
  })();

  /**
   * Did we arrive here purely to hand off to venite.app?
   *
   * Read ONCE at mount, before the query is scrubbed below. Owner: "I don't
   * want the Venite flow to first go to the opening slide — I want it to go
   * right to Venite from the home screen." The hand-off used to wait for the
   * office fetch, so the held-breath opening and then the chooser slide both
   * painted before the browser appeared. Nothing about the Venite URL depends
   * on the fetch (it's built from the route's side and today's date), so the
   * wait bought nothing and cost the whole point of a direct card.
   */
  const veniteDirect = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("venite") === "1"; } catch { return false; }
  }, []);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [officeDay, setOfficeDay] = useState<OfficeDayInfo | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  // Display prefs (text size + backdrop) — device-local, changed live from the
  // ⚙ sheet; re-read on its event so the deck updates without a remount.
  const display = useOfficeDisplay();
  const [displayOpen, setDisplayOpen] = useState(false);
  /**
   * Suffrages A/B — a real toggle instead of only ever showing Phoebe's own
   * pick.
   *
   * Owner: "we could have a toggle between A and B at the top, like the
   * toggle between Forward [Movement] and Church of England on the podcast."
   * BCP p. 97 prints both sets side by side and leaves the choice to whoever
   * is praying — pickSuffragesKey's alternation (server-side) is a sensible
   * default, not a rubric, so both texts ride along in the slide's metadata
   * (see assembleMorningPrayer.ts/assembleEveningPrayer.ts) and this just
   * picks which one is ON SCREEN. null = "use the server's own pick".
   *
   * Declared here, not down by currentSlide (its natural reset target) —
   * currentSlide is derived from `slides`/`slideIdx`, both declared far below
   * this point, and a reset effect keyed on it has to sit AFTER that
   * declaration or it's a TDZ crash. See the effect itself, next to
   * currentSlide's own declaration.
   */
  const [suffragesChoice, setSuffragesChoice] = useState<"A" | "B" | null>(null);
  // Skip Ahead sheet — same section list the physical-book guide builds
  // (buildBookSections), but tapping a row jumps the DIGITAL slideshow to
  // that slide instead of just showing a page number. Owner: "another bar
  // under that that says skip ahead... it would go to that slide."
  const [skipAheadOpen, setSkipAheadOpen] = useState(false);
  /**
   * Swapping the canticle (or the invitatory) mid-office.
   *
   * Owner: "on the canticle title page, there could be a pill that says
   * choose different canticle … they click one, come back to that title slide
   * with the title changed, and the next slide is the different canticle."
   *
   * The deck needed no rebuilding for this: every canticle slide already
   * carries metadata.canticleKey and every invitatory slide carries
   * metadata.invitatory, both runs are contiguous, so a swap is a splice —
   * the same move this file already makes for the prayer-list slide, the
   * prompts slide, the salutation and the confession invitation.
   *
   * Session-only by design. It changes what you pray TODAY, from this slide,
   * and doesn't rewrite the rule or the cached office — the same scope Venite
   * gives the equivalent control.
   */
  const [swapOpen, setSwapOpen] = useState<null | "canticle" | "invitatory">(null);
  const [swapping, setSwapping] = useState(false);
  // Which canticle the reader is swapping AWAY from, captured when the sheet
  // opens. Read during the splice, by which point currentSlide could already
  // be pointing at something else.
  const swapFromKeyRef = useRef<string>("");
  // The held-breath veil's photo fades in once it has actually decoded. Without
  // this the veil paints its flat background first and the photo POPS in a frame
  // or two later — the flash on opening the office (worst on Water, whose photos
  // are larger than the cached forest splash). Declared here, above the deck's
  // early returns, so the hook order stays stable.
  // Owner report: opening the office visibly re-faded the SAME leaf photo the
  // app-open splash had just shown a beat earlier — `veilPhoto` defaults to
  // that identical fixed SPLASH_PHOTO, but this flag always started false, so
  // an already-fully-visible image dipped to 0 and re-faded in. Probe
  // SPLASH_PHOTO specifically and start ready if the browser already has it
  // decoded — but ONLY when the backdrop actually renders that shared photo
  // (the default/Leaves case). A Water/Planet backdrop's veil picks its own
  // fresh random photo (see the `veilPhoto` useMemo below), which is almost
  // never the already-cached SPLASH_PHOTO — probing SPLASH_PHOTO there was
  // reporting "ready" for a *different* image that hadn't loaded yet, so it
  // popped in instead of fading. Water/Planet always start unready and fade
  // in normally, which is what the "correctly still fades in normally" note
  // above originally intended.
  const [veilPhotoReady, setVeilPhotoReady] = useState(() => {
    if (display.backdrop === "water" || display.backdrop === "planet") return false;
    if (typeof Image === "undefined" || !SPLASH_PHOTO) return false;
    const probe = new Image();
    probe.src = SPLASH_PHOTO;
    return probe.complete;
  });
  // Match the browser toolbar / status bar to the backdrop while the office is
  // open (green default, blue for Water, cream for Paper) — otherwise the top
  // bar keeps the app's default green and clashes with a Water/Paper deck.
  // Restored to the app default on exit.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute("content") ?? "#102816";
    meta?.setAttribute("content", themeColorForBackdrop(display.backdrop));
    return () => { meta?.setAttribute("content", prev); };
  }, [display.backdrop]);
  // Desktop: page the office with the left/right arrow keys, mirroring the
  // tap/swipe navigation (Up/Down keep scrolling long slides). The listener is
  // bound ONCE here (before the deck's early returns, so hook order is stable)
  // and calls through keyNavRef, which the render updates below with the current
  // next()/prev() + whether a sheet is open.
  const keyNavRef = useRef<{ next: () => void; prev: () => void; nextPastLessonReading: () => void; blocked: boolean }>({
    next: () => {}, prev: () => {}, nextPastLessonReading: () => {}, blocked: false,
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (keyNavRef.current.blocked) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && el.matches("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); keyNavRef.current.next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); keyNavRef.current.prev(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Praying TOGETHER (the ⚙ Display sheet's "Praying" row). Only the corporate
  // offices carry the rubrics — the Daily Devotions are explicitly the
  // personal short forms, so they stay label-less either way. isFullOffice
  // also decides whether the ⚙ sheet even offers the toggle.
  const isFullOffice =
    resolvedMode === "morning" || resolvedMode === "evening" || resolvedMode === "compline";
  const communal = display.prayingMode === "communal" && isFullOffice;
  // The reader's own private prayer list (see prayer_intentions / /intentions)
  // — only fetched for a real signed-up account, and only feeds the splice
  // effect below (never blocks or re-fetches the office deck itself).
  const { data: intentionsData } = useQuery<{ intentions: Array<{ id: number; kind: "text" | "person"; personName: string; body: string; answered: boolean }> }>({
    queryKey: ["/api/prayer-intentions"],
    queryFn: () => apiRequest("GET", "/api/prayer-intentions"),
    enabled: signedUp,
    staleTime: 60_000,
  });
  const activeIntentions = useMemo(
    () => (intentionsData?.intentions ?? [])
      .filter((it) => !it.answered)
      .map((it) => ({
        headline: it.kind === "person" ? (it.personName || "Someone") : (it.body || ""),
        subline: it.kind === "person" ? it.body : "",
      }))
      .filter((it) => it.headline),
    [intentionsData],
  );
  // Splice the private prayer-list slide in once the reader's intentions have
  // loaded — the same seat the contemplative pause holds (right before it, so
  // it sits with the rest of the Prayers), and remove it again if the list
  // empties out (last item answered/deleted mid-office). Reactive rather than
  // built into the initial fetch because /api/prayer-intentions resolves
  // after the office deck itself.
  useEffect(() => {
    setSlides((prev) => {
      const piIdx = prev.findIndex((s) => s.type === "prayer_intentions");
      const anchorIdx = prev.findIndex((s) => s.type === "contemplative_pause" || s.type === "general_thanksgiving");
      if (activeIntentions.length > 0 && piIdx < 0 && anchorIdx > 0) {
        setSlideIdx((cur) => (cur >= anchorIdx ? cur + 1 : cur));
        return [...prev.slice(0, anchorIdx), buildPrayerIntentionsSlide(resolvedMode, activeIntentions), ...prev.slice(anchorIdx)];
      }
      if (activeIntentions.length === 0 && piIdx >= 0) {
        setSlideIdx((cur) => (cur > piIdx ? cur - 1 : cur));
        return prev.filter((s) => s.type !== "prayer_intentions");
      }
      return prev;
    });
  }, [activeIntentions, resolvedMode]);
  // Splice the "before you go" prompt composer in right after the
  // contemplative pause (or, if that's absent, right before the General
  // Thanksgiving) — signed-up accounts only, unconditional on already having
  // intentions, since its point is inviting a NEW one. Also removes it if
  // the flag/signed-up state flips off mid-office — this is currently a
  // static, app-wide flag, but the flag's own doc comment anticipates it
  // becoming per-account, so the effect needs to react both ways, not just
  // insert-once.
  useEffect(() => {
    setSlides((prev) => {
      const ppIdx = prev.findIndex((s) => s.type === "prayer_prompts");
      if (!signedUp) {
        if (ppIdx < 0) return prev;
        setSlideIdx((cur) => (cur > ppIdx ? cur - 1 : cur));
        return prev.filter((s) => s.type !== "prayer_prompts");
      }
      if (ppIdx >= 0) return prev;
      const pauseIdx = prev.findIndex((s) => s.type === "contemplative_pause");
      const gtIdx = prev.findIndex((s) => s.type === "general_thanksgiving");
      const anchorIdx = pauseIdx >= 0 ? pauseIdx + 1 : gtIdx;
      if (anchorIdx <= 0) return prev;
      setSlideIdx((cur) => (cur >= anchorIdx ? cur + 1 : cur));
      return [...prev.slice(0, anchorIdx), buildPrayerPromptsSlide(), ...prev.slice(anchorIdx)];
    });
  }, [signedUp]);
  // The salutation ("The Lord be with you") is an MP/EP exchange — Compline
  // has no such dialogue, so it gets the rubric labels but no extra slide.
  const canSalute = resolvedMode === "morning" || resolvedMode === "evening";
  // Keep the salutation slide in sync with the live "Praying" toggle: insert
  // it before the Lord's Prayer when communal, remove it when on-my-own — and
  // nudge slideIdx so the reader stays on the SAME content across the shift.
  useEffect(() => {
    if (!canSalute) return;
    setSlides((prev) => {
      const salIdx = prev.findIndex((s) => s.type === "salutation");
      const lp = prev.findIndex((s) => s.type === "lords_prayer");
      if (communal && salIdx < 0 && lp >= 0) {
        setSlideIdx((cur) => {
          // Programmatic re-index to keep the reader on the SAME content when
          // the salutation splices in from a ⚙ Praying-mode toggle — NOT a
          // slide turn. (The chime keys on the SECTION, which a salutation
          // splice never changes, so there's nothing to suppress here.)
          return cur >= lp ? cur + 1 : cur;
        });
        return [...prev.slice(0, lp), buildSalutationSlide(resolvedMode as "morning" | "evening"), ...prev.slice(lp)];
      }
      if (!communal && salIdx >= 0) {
        setSlideIdx((cur) => {
          // Same: removing the salutation on a Praying-mode toggle re-indexes
          // to keep the reader in place. (Section-keyed chime, so nothing to
          // suppress.)
          return cur > salIdx ? cur - 1 : cur;
        });
        return prev.filter((s) => s.type !== "salutation");
      }
      return prev;
    });
  }, [communal, canSalute, resolvedMode]);
  // Mirror the salutation splice for the Confession's Officiant invitation
  // ("Let us confess our sins against God and our neighbor") — the bid the BCP
  // appoints for the Officiant, present in communal MP/EP and removed on-my-own.
  // Only splices when a Confession is actually in this office (it can be turned
  // off per side), and drops an orphaned invitation if the confession leaves.
  const canInviteConfession = resolvedMode === "morning" || resolvedMode === "evening";
  useEffect(() => {
    if (!canInviteConfession) return;
    setSlides((prev) => {
      const invIdx = prev.findIndex((s) => s.type === "confession_invitation");
      const cf = prev.findIndex((s) => s.type === "confession");
      if (communal && cf >= 0 && invIdx < 0) {
        setSlideIdx((cur) => (cur >= cf ? cur + 1 : cur));
        return [...prev.slice(0, cf), buildConfessionInvitationSlide(resolvedMode as "morning" | "evening"), ...prev.slice(cf)];
      }
      if ((!communal || cf < 0) && invIdx >= 0) {
        setSlideIdx((cur) => (cur > invIdx ? cur - 1 : cur));
        return prev.filter((s) => s.type !== "confession_invitation");
      }
      return prev;
    });
  }, [communal, canInviteConfession, resolvedMode]);
  // The chosen photo library: Leaves (default), Planet (the landscape set
  // without the animal photos), or none for Plain (solid dark green below).
  const bgPhotoSet = (display.backdrop === "plain" || display.backdrop === "paper") ? [] : display.backdrop === "water" ? WATER_PHOTOS : display.backdrop === "planet" ? PLANET_PHOTOS : LEAF_PHOTOS;
  // Photos behind the whole office / devotion slideshow — holding steady within a
  // section and cross-fading at each section boundary. A per-mount random
  // offset varies which photos a given day draws; reshuffled per backdrop.
  const leafOffset = useMemo(
    () => (bgPhotoSet.length > 0 ? Math.floor(Math.random() * bgPhotoSet.length) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.backdrop],
  );
  const sectionIndex = useMemo(() => {
    let n = 0;
    for (let i = 1; i <= slideIdx && i < slides.length; i++) {
      const ty = slides[i]?.type;
      if (
        ty === "intercessions_portal" || ty === "intercessions" ||
        ty === "psalm_title" || ty === "canticle_title" || ty === "lesson_title"
      ) n++;
    }
    return n;
  }, [slideIdx, slides]);
  const officeBgPhoto = bgPhotoSet.length > 0
    ? bgPhotoSet[(leafOffset + sectionIndex) % bgPhotoSet.length]!
    : null;
  // Subtle landscape, held quiet under a heavy dark wash — matches the Laurel
  // Kearns Co-Breathe intro / the prayer slideshow (photo at 0.22), so the office
  // text stays fully legible over the scenery.
  const officeBgOpacity = 0.3; // a little brighter (owner)
  const mainRef = useRef<HTMLElement | null>(null);
  const swipeTouchStartXRef = useRef<number | null>(null);
  const swipeTouchStartYRef = useRef<number | null>(null);
  // Dedupe guard for the section-change chime effect below — keeps a
  // background refetch (which can re-run the effect with an unchanged
  // sectionIndex) from re-striking the swell.
  const chimedSectionRef = useRef<number>(-1);
  const queryClient = useQueryClient();
  const [, setViewerLocation] = useLocation();

  /**
   * Venite hand-off state.
   *
   * DECLARED HERE, WITH THE OTHER HOOKS, AND NOT NEXT TO goToVenite BELOW.
   * This component returns early while the office is loading, on an error, and
   * for the physical-book view. Hooks placed after those returns don't run on
   * the first render and do on the second, which is "Rendered more hooks than
   * during the previous render" — it crashed every office open to the error
   * boundary the moment loading finished, not just the Venite path. Anything
   * added here must stay above line ~1390.
   */
  const veniteVisitsKey = `phoebe:venite-visits:${officeSide}:${new Date().toLocaleDateString("en-CA")}`;
  const veniteLeftAtRef = useRef<number | null>(null);
  /**
   * This deck is a way-station, not a screen.
   *
   * Reported: "when it comes out you see the office first page — it shouldn't
   * be there." Arriving with ?venite=1 mounts the deck only so the credit-on-
   * return and Options wiring have somewhere to live; the person is meant to
   * see the browser, then the home. But the deck still RENDERS underneath, so
   * the welcome slide ("Before you begin — Morning Devotion") was on screen for
   * the frames between the browser dismissing and the navigation home.
   *
   * While this is true the deck paints a plain field in its own backdrop
   * colour instead — the same thing /begin-prayer shows while it decides where
   * to send you, so the whole hand-off is one continuous surface.
   */
  // Seeded from veniteDirect so even the FIRST frame is the plain field — the
  // hand-off starts in an effect, which runs after that frame has painted.
  // …and the same on the FIRST frame of a direct hand-off: on web there is no
  // browser sliding up over this, so seeding the veil just means the reader's
  // own tab sits blank behind the new one.
  const [veniteHandingOff, setVeniteHandingOff] = useState(veniteDirect && hasNativeBrowser());
  const [veniteForm, setVeniteForm] = useState<"office" | "devotion">("office");


  const goToVenite = (form: "office" | "devotion") => {
    // Stamp the side for the browser's Options menu. Without this the menu read
    // a stale value (or defaulted to morning), so "Listen to the office" from
    // an EVENING hand-off opened the morning podcast.
    try { sessionStorage.setItem("phoebe:venite-side", officeSide); } catch { /* private mode */ }
    setVeniteForm(form);
    /**
     * The hand-off veil is an iOS thing only.
     *
     * Owner: "there should be no splash on web when an external tab opens,
     * that's only for iOS." On native the in-app browser slides up OVER this
     * screen, so blanking the deck to the plain field is what makes the two
     * read as one continuous surface. On the web a new TAB opens and this page
     * stays exactly where it is, in its own tab — so the veil isn't a
     * transition, it's just the office replaced by a blank green screen that
     * the reader comes back to and has to get out of.
     */
    const nativeHandoff = hasNativeBrowser();
    if (nativeHandoff) setVeniteHandingOff(true);
    veniteLeftAtRef.current = Date.now();
    const opened = openExternal(veniteOfficeUrl(officeSide, new Date(), form));
    /**
     * Reported: "there is an issue with a pop-up blocker on web and then it
     * just goes to a green screen." On web, a blocked window.open() returns
     * null — openExternal now surfaces that. Without this check the deck
     * committed to "we've handed off" (the blank backdrop above) regardless,
     * and had no way to recover: nothing ever stole focus, so the
     * visibilitychange listener that would normally notice "they're back"
     * never fires either. Reveal the deck again instead of leaving it stuck.
     */
    if (!opened) {
      veniteLeftAtRef.current = null;
      setVeniteHandingOff(false);
    }
  };

  // Coming back from Venite. Native fires phoebe:browserfinished when the
  // in-app browser closes; on the web there's no such event, so a tab regaining
  // visibility stands in for it. Whichever arrives first wins — they're
  // idempotent because the ref is cleared on the first one handled.
  useEffect(() => {
    const onBack = () => {
      const leftAt = veniteLeftAtRef.current;
      if (leftAt == null) return;
      veniteLeftAtRef.current = null;

      /**
       * Credited on RETURN, full stop — no dwell test.
       *
       * There used to be a one-minute floor: come back sooner and the office
       * wasn't counted, with a "that was a quick visit" line and a Continue
       * button to send you back. Owner: "get rid of the thing where it doesn't
       * mark complete until you do thirty seconds."
       *
       * It was guessing at sincerity from a stopwatch, and guessing badly in
       * both directions — someone who prays the office in a tab they already
       * had open, or reads fast, or steps away and comes back, was told their
       * prayer didn't count. Every other hand-off in Phoebe (the physical book,
       * the Cathedral stream) takes the person at their word; this one is the
       * same act and now behaves the same way.
       */
      try { localStorage.removeItem(veniteVisitsKey); } catch { /* non-fatal */ }
      {
        // Credited the same way the physical-book attestation is, so the
        // anchor flips, the reminder push clears, and Daily progress counts it.
        // Credit the MODE that was actually prayed, and play the moment on the
        // CARD that was prayed. The devotion and the full office are different
        // practices on the same side, and a side can now carry both — passing
        // only the side ticked whichever one the anchor happens to be, and
        // animated the anchor's card either way.
        markOfficeBookComplete(officeSide, resolvedMode, completedCardKey);
        // Home, not Daily progress. Owner: "Venite goes back to the daily
        // progress page instead of the home screen" — and earlier, of this same
        // return: "it should go back to the home screen, where the office is
        // now completed." Matches the physical-book attestation below, which is
        // the other credit-and-leave path.
        setViewerLocation("/dashboard");
        return;
      }
    };
    window.addEventListener("phoebe:browserfinished", onBack);
    // visibilitychange is the WEB fallback only. On native it also fires when
    // the APP is backgrounded — so a notification pulling you away 20 seconds
    // into the office consumed this one-shot return, and the twenty minutes you
    // then prayed were never credited. The in-app browser emits
    // phoebe:browserfinished on close, which is the actual signal.
    const onVisible = () => { if (document.visibilityState === "visible") onBack(); };
    if (!isNativeShell()) document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("phoebe:browserfinished", onBack);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeSide, veniteVisitsKey]);

  // Once-per-mount guard so a user who navigates BACK to the
  // intercessions portal doesn't get instantly bounced into prayer
  // mode again — once we've handed off, we treat the portal as a
  // transparent slide for the rest of the session.
  const portalHandedOffRef = useRef(false);
  // Creation Prayer: the intercession slide (metadata.cobreathe) opens the
  // Co-Breathe breath inline — the shared climate breath IS the intercession.
  // Breathed once per office session; closing the breath advances the office.
  const breathedRef = useRef(false);
  const [showCreationBreath, setShowCreationBreath] = useState(false);
  // Silence path of the contemplative pause: "Begin contemplation" opens the
  // real countdown overlay (ContemplationTimer) at the picked length, same
  // component /prayer-mode's pause slide uses. This used to just flip a
  // `silencePauseActive` flag to a static "rest whenever, tap Continue"
  // screen with no running timer — which read as the sit never actually
  // starting (it just showed a permanently "paused" card). See
  // contemplationOpen below.
  const [contemplationOpen, setContemplationOpen] = useState(false);
  // Selected sit length on the contemplative-pause picker (5/10/20 min),
  // passed straight into ContemplationTimer's startMinutes.
  const [pauseMinutes, setPauseMinutes] = useState(10);
  // Warmed promise for the community-intercession data, so /prayer-mode can open
  // straight onto the first intercession instead of its "Gathering…" loader.
  const intercessionPrefetchRef = useRef<Promise<unknown> | null>(null);
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

  // Chapel swell on each NEW SECTION — the same rising open-fifth pad the
  // Co-Breathe breath plays (playBreathTone). Owner direction: only sound the
  // office when the section (and its background photo) changes, not on every
  // slide turn. `sectionIndex` increments exactly at each section boundary
  // (psalm/canticle/lesson title + the intercessions), which is also when the
  // backdrop cross-fades — so keying the chime off it fires once as the reader
  // crosses into a new section (and once on the opening paint), silent while
  // they read within a section. The chord climbs 0 → 1 → 2 → 0 … across the
  // sections. The dedupe ref keeps a background refetch (unchanged sectionIndex)
  // from re-striking; the slides.length gate keeps it quiet until the deck
  // exists; opening/closing the ⚙ sheet leaves sectionIndex untouched.
  useEffect(() => {
    if (slides.length === 0) return;
    if (chimedSectionRef.current === sectionIndex) return;
    chimedSectionRef.current = sectionIndex;
    playBreathTone(sectionIndex % 3);
  }, [sectionIndex, slides.length]);

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

  /**
   * Two entry points that have to work once this deck is mounted.
   *
   * ?venite=1 — the Daily Offices picker now routes here instead of opening
   * venite.app itself, so the dwell test, the Continue state, the credit-on-
   * return and the Options menu all apply to that path too.
   *
   * phoebe:office-change-format — "Change format" in the browser's Options
   * menu. A same-path query navigation does NOT re-run this page's ?mode=
   * effect, so routing alone left the screen unchanged and the menu item did
   * visibly nothing. Handled here, where the chooser actually lives.
   */
  // The hand-off itself: mount-only, so it does not wait on the fetch.
  useEffect(() => {
    if (!veniteDirect) return;
    try {
      // Scrub the flag so a later back-navigation to this deck doesn't bounce
      // them straight out to the browser again.
      const q = new URLSearchParams(window.location.search);
      q.delete("venite");
      const rest = q.toString();
      window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    } catch { /* ignore */ }
    goToVenite(isDevotion ? "devotion" : "office");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veniteDirect]);

  useEffect(() => {
    const onChangeFormat = () => {
      // Back to this office's own opening chooser — the slide that offers the
      // ways to pray — rather than a navigation the page would ignore.
      veniteLeftAtRef.current = null;
      // They asked to pray it another way — the deck is a real screen again.
      setVeniteHandingOff(false);
      setBookOpen(false);
      setSlideIdx(0);
    };
    window.addEventListener("phoebe:office-change-format", onChangeFormat);

    /**
     * The office-reading browser's own Back/Next/Display-gear, reported once
     * it has dismissed (see BibleWebViewController's officeChrome + the
     * BibleBrowserPlugin events of the same names). Read through keyNavRef —
     * see its own comment — rather than closing over next()/prev() directly,
     * since this effect is mount-only and the office may have moved on by the
     * time any of these actually fire.
     */
    const onOfficePrevSlide = () => keyNavRef.current.prev();
    const onOfficeNextSlide = () => keyNavRef.current.nextPastLessonReading();
    const onOfficeDisplaySettings = () => setDisplayOpen(true);
    window.addEventListener("phoebe:office-prev-slide", onOfficePrevSlide);
    window.addEventListener("phoebe:office-next-slide", onOfficeNextSlide);
    window.addEventListener("phoebe:office-display-settings", onOfficeDisplaySettings);

    return () => {
      window.removeEventListener("phoebe:office-change-format", onChangeFormat);
      window.removeEventListener("phoebe:office-prev-slide", onOfficePrevSlide);
      window.removeEventListener("phoebe:office-next-slide", onOfficeNextSlide);
      window.removeEventListener("phoebe:office-display-settings", onOfficeDisplaySettings);
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  // A held "breath into the office" opening screen: the office's opening
  // versicle on a gradient, shown for at least ~2.8s (even when slides load
  // instantly) so the office begins with a calm, deliberate beat instead of a
  // flashy spinner. The loading gate below waits on BOTH this and the fetch.
  const [minLoadDone, setMinLoadDone] = useState(false);
  // …but only the FIRST time the office is opened today. Coming back to it
  // (e.g. returning from the community intercessions) shouldn't replay the held
  // psalm versicle — a re-entry gets a plain spinner if the fetch is still in
  // flight, and otherwise drops straight into the office. Keyed per side+day in
  // sessionStorage so it naturally resets tomorrow.
  const openedKey = `phoebe:office-opened:${resolvedMode}:${new Date().toLocaleDateString("en-CA")}`;
  const alreadyOpenedToday = useMemo(() => {
    try { return sessionStorage.getItem(openedKey) === "1"; } catch { return false; }
  }, [openedKey]);
  useEffect(() => {
    // Skip the 2.8s held breath when we're handing straight off — it would be
    // a calm beat on a screen nobody is looking at, and it's still on screen
    // underneath when they come back.
    if (alreadyOpenedToday || veniteDirect) { setMinLoadDone(true); return; }
    const t = setTimeout(() => setMinLoadDone(true), 2800);
    return () => clearTimeout(t);
  }, [alreadyOpenedToday, veniteDirect]);
  // Remember the opening has been shown, so a later re-entry skips the psalm.
  useEffect(() => { try { sessionStorage.setItem(openedKey, "1"); } catch { /* non-fatal */ } }, [openedKey]);

  // The "way to pray" chooser on the welcome slide — a dropdown (replacing the
  // old alternate-route pills) that lets the reader switch between the short
  // Devotion, the Community Intercessions feed, and the full Office. It opens on
  // the office the reader ACTUALLY opened — a devotion route → "devotion", a
  // full-office route (Morning/Evening Prayer) → "office". They either tapped a
  // specific card or the /begin-prayer routing brain already applied their
  // default before landing here, so the ROUTE is the intent. (Seeding from the
  // saved per-side default instead mislabeled an intentional "Morning Prayer" as
  // the default "Morning Devotion" — they could switch, but it opened wrong.)
  type WayToPray = "devotion" | "intercessions" | "office" | "psalms";
  // Seed from the saved per-side level ONLY for Psalms (so a side set to Praying
  // the Psalms in the customizer opens as "Pray psalms" here, and holds). For
  // devotion/office the ROUTE stays the intent (see note above).
  const [wayToPray, setWayToPray] = useState<WayToPray>(() =>
    getSideLevel(officeSide) === "psalms" ? "psalms" : (isDevotion ? "devotion" : "office"),
  );
  // How they want to pray it — the second row of the welcome chooser. Depends
  // on the way above: Community Intercessions is on-screen only. "watch" is a
  // morning-weekday-only option (the National Cathedral broadcast).
  type PrayMethod = "screen" | "listen" | "book" | "watch" | "venite";
  const [prayMethod, setPrayMethod] = useState<PrayMethod>(() => {
    // Pre-select the reader's saved way for this side so the intro chooser opens
    // on their default (Physical BCP / Listen / Watch / On screen), not always
    // "On screen". The full office and the short devotion both carry a per-side
    // method; the devotion just has fewer of them to offer.
    if (resolvedMode === "morning" || resolvedMode === "evening") {
      const e = getSideEntry(officeSide);
      if (e === "book") return "book";
      if (e === "listen") return "listen";
      if (e === "watch") return "watch";
      if (e === "venite") return "venite";
    }
    if (resolvedMode === "morning-devotion" || resolvedMode === "early-evening-devotion") {
      const e = getSideEntry(officeSide);
      // Listen and Watch are the full office only — a devotion has no podcast
      // episode and no broadcast, so those fall back to reading on screen.
      if (e === "book") return "book";
      if (e === "venite") return "venite";
    }
    return "screen";
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        // Pass the viewer's *local* date so the server resolves the
        // liturgical day from their wall clock rather than UTC. This
        // matters most for Compline (whose psalm + lesson rotate by
        // day-of-week, and whose framing is "the day that's ending")
        // — without this an LA user praying at 11pm Sunday would get
        // Monday's office because the server sees UTC's Monday 07:00.
        // The endpoint already accepts ?date= as YYYY-MM-DD.
        //
        // Also pass the viewer's current i18n locale so the assembler
        // can serve Spanish slide text (versicles, Confession,
        // Lord's Prayer, antiphons, blessings — all framing text
        // that lives in code rather than the bcp_texts seed). Psalm
        // bodies stay in their bcp_texts language (English-only for
        // now; a future Spanish Psalter seed will fix that).
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        // Pull from i18next at fetch time so a mid-session locale
        // toggle (Settings → Language) reflects on the next office
        // open without a full page reload. Anything other than "es"
        // resolves to "en" server-side.
        const locale = "en";
        const sep = endpoint.includes("?") ? "&" : "?";
        // Per-side confession override (Morning/Evening split) — only full
        // offices have a confession; pass it when this side set one. Also
        // baked into the offline cache key (below) so a live fetch and a
        // background-prefetched entry agree on what they're both asking for.
        const confessionKey: "" | "0" | "1" = (resolvedMode === "morning" || resolvedMode === "evening")
          ? (() => { const c = getSideConfession(officeSide); return c === null ? "" : (c ? "1" : "0"); })()
          : "";
        const confParam = confessionKey ? `&confession=${confessionKey}` : "";
        // Creation Prayer: if the user prays it only ONCE a day (not both
        // morning AND evening set to "creation"), ask the server for the
        // four-week combined Psalter so a once-a-day pray-er still covers every
        // psalm. Both-sides pray-ers keep the two-week side-split.
        const creationSingleParam =
          (resolvedMode === "creation-morning" || resolvedMode === "creation-evening")
            && !(getSideLevel("morning") === "creation" && getSideLevel("evening") === "creation")
            ? "&single=1"
            : "";
        // Offline support: bcp-daily-office.tsx's own reads/writes into
        // lib/officeOfflineCache.ts, the store lib/officePrefetch.ts warms
        // for the next 30 days in the background (Wi-Fi only). A live fetch
        // always wins when it succeeds (and refreshes the cache entry for
        // next time); the cache is only consulted when the network fails —
        // this is offline SUPPORT, not a performance cache-first path.
        const cacheKey = { mode: resolvedMode, date: localDate, confession: confessionKey };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try {
          const res = await fetch(`${endpoint}${sep}date=${localDate}&locale=${locale}${confParam}${creationSingleParam}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
          void putOfficeCacheEntry(cacheKey, data);
        } catch (fetchErr) {
          const cached = await getOfficeCacheEntry(cacheKey);
          if (!cached) throw fetchErr;
          data = cached;
        }
        if (cancelled) return;
        let fetched: Slide[] = reorderIntercessionsBeforeThanksgiving(data?.slides ?? []);
        // Pilot + GUEST have no community intercessions — the server may still
        // inject an "intercessions_portal" slide (guest office endpoints are
        // public; an account with pre-existing community data can hit this
        // too). The handoff is already gated below, but the slide would then
        // sit as an orphan transition card, so drop it from the deck entirely.
        if (noCommunityHandoff) fetched = fetched.filter((s) => s.type !== "intercessions_portal");
        // Accounts without the prayer-request feature (pilot-group-only) get a
        // contemplative pause in the Prayers where the intercessions would have
        // been — a moment to breathe or sit in silence rather than a community
        // hand-off. Anchor it right before the General Thanksgiving, the same
        // seat the intercessions held; if there's no Thanksgiving (short
        // devotions), skip it rather than tack it awkwardly onto the end.
        if (!prayerRequestsEnabled && isFullOffice) {
          const gtIdx = fetched.findIndex((s) => s.type === "general_thanksgiving");
          if (gtIdx > 0) {
            fetched = [
              ...fetched.slice(0, gtIdx),
              buildContemplativePauseSlide(resolvedMode),
              ...fetched.slice(gtIdx),
            ];
          }
        }
        if (fetched.length === 0) throw new Error("No slides returned");
        // The daily reflection (FDD / SSJE / CAC) is no longer
        // appended as an in-office slide. It's surfaced instead as a
        // pill on the post-office last screen (prayer-mode's
        // HabitSlide, where the gratitude pill lives) — the office
        // finishes by redirecting to /prayer-mode?closingOnly=1, and
        // that screen is where the user expects the "read a
        // reflection" affordance to sit, next to Give thanks.
        // (Praying TOGETHER's salutation slide is spliced in reactively — see
        // the effect keyed on `communal` — so toggling the ⚙ "Praying" row
        // mid-office inserts/removes it live, not only on a fresh open.)
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
        // Fresh-start index: the picker passes initialSlide=1 to skip the office's
        // own "before you begin" welcome (the picker already served that role),
        // clamped to a real slide. A ?slide= deep link or saved resume overrides.
        const freshStart = (initialSlide != null && initialSlide > 0 && initialSlide < fetched.length) ? initialSlide : 0;
        let initialIdx = freshStart;
        if (Number.isFinite(slideParam) && slideParam >= 0 && slideParam < fetched.length) {
          initialIdx = slideParam;
        } else if (resetFlow) {
          try { localStorage.removeItem(officeProgressKey(resolvedMode)); } catch { /* non-fatal */ }
          initialIdx = freshStart;
        } else {
          const state = readOfficeProgress(resolvedMode);
          if (state.kind === "in-progress" && state.slideIdx < fetched.length) {
            initialIdx = state.slideIdx;
          }
        }
        // Coming back from the intercessions handoff (?seamlessReturn=1), land
        // on the FIRST General Thanksgiving — the slide that always sits right
        // after the intercessions in the office. The numeric ?slide=N is stamped
        // against the deck at handoff time; if the returning deck differs (e.g.
        // the portal is no longer emitted), that index slips forward and skips
        // GT part 1 onto part 2. Anchoring by TYPE keeps the prayer whole.
        if (search.get("seamlessReturn") === "1") {
          const firstThanks = fetched.findIndex((s) => s.type === "general_thanksgiving");
          if (firstThanks >= 0) initialIdx = firstThanks;
        }
        setSlideIdx(initialIdx);
        // The opening swell + every slide-turn swell are handled by the
        // slideIdx effect below (it fires once the deck first paints and
        // on every subsequent turn), so nothing to strike here.
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
        if (search.has("slide") || search.has("mode") || search.has("returnTo") || search.has("seamlessReturn") || search.has("reset") || search.has("book")) {
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
    // prayerRequestsEnabled decides whether the deck carries the contemplative
    // pause; re-fetch if it resolves after the office opened.
  }, [endpoint, officeTitle, resolvedMode, prayerRequestsEnabled]);

  // Prefetch the SAME queries the intercession slideshow reads, so handing off
  // hits a warm React Query cache (no loader). Returns a single promise (built
  // once) the handoff can await.
  function prefetchIntercessions(): Promise<unknown> {
    if (intercessionPrefetchRef.current) return intercessionPrefetchRef.current;
    const warm = (key: string) => queryClient.prefetchQuery({ queryKey: [key], queryFn: () => apiRequest("GET", key), staleTime: 60_000 });
    intercessionPrefetchRef.current = Promise.all([
      warm("/api/moments"),
      warm("/api/prayer-requests"),
      warm("/api/groups/me/circle-intentions"),
    ]).catch(() => undefined);
    return intercessionPrefetchRef.current;
  }
  // Start warming as soon as this office is known to contain intercessions, so
  // the data is loading in the background while the reader prays through the
  // psalms / lessons and reaches the portal. ALSO warm once the reader is
  // within the last three slides regardless of a portal — every office
  // finish (Amen/Done, in handleEnd/amen() below) lands on
  // /prayer-mode?closingOnly=1, and that page can't render ANYTHING until
  // these same three queries resolve (frozenSlides is phase-independent).
  // Without this, an office with no mid-deck portal warmed nothing, so the
  // closing summary always opened cold — the "Gathering the prayers of your
  // community…" loader flashing right after the closing collect's Amen.
  useEffect(() => {
    if (slides.length === 0) return;
    if (slides.some((sl) => sl.type === "intercessions_portal") || slideIdx >= slides.length - 3) {
      void prefetchIntercessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, slideIdx]);

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
  async function handIntoPrayerMode() {
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
    // Don't transition until the intercessions are loaded — so prayer-mode opens
    // on the first slide, not its loader. Usually already warm from the effect
    // above; if not, the portal headline holds a beat longer.
    try { await prefetchIntercessions(); } catch { /* navigate anyway */ }
    setViewerLocation(url);
  }

  // Close the contemplation overlay if the reader leaves the pause slide
  // (e.g. paging back via the footer) while a sit is open, so returning to
  // it later shows the chooser again rather than a stale open timer.
  useEffect(() => {
    if (slides[slideIdx]?.type !== "contemplative_pause" && contemplationOpen) {
      setContemplationOpen(false);
    }
  }, [slideIdx, slides, contemplationOpen]);

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
    // Pilot + guest are personal-only — never hand the office off into the
    // community intercessions slideshow (guest = HARD requirement; the portal
    // slide is also filtered from their deck above, this is the second lock).
    if (noCommunityHandoff) return;
    const t = window.setTimeout(() => handIntoPrayerMode(), 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, slideIdx, resolvedMode, isDevotion]);

  // Creation Prayer intercession → open the Co-Breathe breath inline (once).
  useEffect(() => {
    const s = slides[slideIdx];
    if (!s || breathedRef.current) return;
    if (!(s.metadata && (s.metadata as Record<string, unknown>).cobreathe)) return;
    breathedRef.current = true;
    setShowCreationBreath(true);
  }, [slides, slideIdx]);

  // Held-breath opening — the office's classic opening versicle (Morning: Ps
  // 51:15; Evening: Ps 141:2; Compline: a quiet-night blessing) over the same
  // bundled forest photo the app-open splash uses. Shown as the full-page load
  // state while the deck fetches, and then kept as a FADING OVERLAY on top of the
  // office (see the office return below) so the office fades up UNDER it and is
  // revealed by the veil's slow fade-out — a true crossfade, never a blink to
  // black. Both uses share `veilInner`, and it carries no office-enter animation,
  // so the early-return → overlay handoff (when the deck finishes loading) is
  // seamless rather than a re-fade.
  const veilOpening =
    (resolvedMode === "evening" || resolvedMode === "early-evening-devotion" || resolvedMode === "creation-evening")
      ? { text: "Let my prayer rise before you as incense, the lifting up of my hands as the evening sacrifice.", cite: "Psalm 141:2" }
      : resolvedMode === "compline"
        ? { text: "The Lord grant us a quiet night and a peaceful end.", cite: "Compline" }
        : { text: "O Lord, open my lips, and my mouth shall proclaim your praise.", cite: "Psalm 51:15" };
  // The held-breath veil. Default is the fixed splash leaf (owner) so opening
  // an office reads as a continuation of the launch screen. But a user who
  // DELIBERATELY chose the Water or Planet office backdrop keeps it here too —
  // pinning the leaf for them put a leaf photo under blue/planet wash tokens.
  // Picked once per mount so the veil can't shuffle while it's showing.
  const veilPhoto = useMemo(() => {
    const pick = (set: string[]) => (set.length > 0 ? set[Math.floor(Math.random() * set.length)]! : null);
    if (display.backdrop === "water") return pick(WATER_PHOTOS) ?? SPLASH_PHOTO ?? splashForestPath;
    if (display.backdrop === "planet") return pick(PLANET_PHOTOS) ?? SPLASH_PHOTO ?? splashForestPath;
    return SPLASH_PHOTO || splashForestPath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.backdrop]);
  const veilStyle: CSSProperties = {
    ...officeThemeStyle(display.backdrop, display.font),
    position: "fixed", inset: 0, background: BG, isolation: "isolate",
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "0 40px", overflow: "hidden",
  };
  const veilInner = (
    <>
      {/* A calm photo under a darkened wash so the versicle reads clearly — a
          held breath into the office. Follows the backdrop (water for Water). */}
      <img
        src={veilPhoto}
        alt=""
        aria-hidden
        decoding="async"
        onLoad={() => setVeilPhotoReady(true)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1, opacity: veilPhotoReady ? 1 : 0, transition: "opacity 700ms ease-out" }}
      />
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash2, 8,18,12),0.62) 0%, rgba(var(--ot-wash2, 8,18,12),0.5) 45%, rgba(var(--ot-wash2, 8,18,12),0.78) 100%)" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "radial-gradient(120% 95% at 50% 34%, rgba(var(--ot-green, 46,107,64),0.20) 0%, rgba(var(--ot-green, 46,107,64),0.12) 28%, rgba(var(--ot-green, 46,107,64),0.05) 54%, rgba(var(--ot-green, 46,107,64),0) 82%)" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 24, lineHeight: 1.55, color: "var(--oh-ink2, #E8E4D8)", textAlign: "center", maxWidth: 460, margin: 0 }}>
          {veilOpening.text}
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED_GREEN, margin: 0 }}>
          {veilOpening.cite}
        </p>
      </div>
      <div aria-hidden className="animate-spin" style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)", width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(var(--ot-sage, 143,175,150),0.25)", borderTopColor: "rgba(var(--ot-sage, 143,175,150),0.75)" }} />
    </>
  );

  /**
   * Warm every outbound passage this office will offer, the moment the deck
   * loads — not when the reader reaches the slide.
   *
   * Owner: "the web page with the bible reading should be loaded in the
   * background so that when the slide advances there is no need to do a
   * loading circle." preloadExternal already existed for exactly this (a
   * newsletter-card comment describes it) but had no caller anywhere in the
   * app — this is the first one. Native-only and best-effort: preload()
   * starts a background WKWebView load keyed by URL, and BibleBrowser.present
   * (via takeWarm) adopts it instead of building a cold one, so the veil's
   * floor (not a real load wait) is the only delay left by the time Next is
   * actually tapped.
   *
   * Placed HERE, above the loading/veniteHandingOff early returns — not down
   * by currentSlide, its more natural neighbour. This component returns early
   * in three places (loading, a hand-off in flight, an error); a hook placed
   * after any of those runs on some renders and not others — different hook
   * COUNTS between renders — which is a hard React crash ("Rendered more
   * hooks than during the previous render"), not a subtle bug. Reads
   * slides[slideIdx] directly since currentSlide itself is declared below
   * this point.
   */
  useEffect(() => {
    if (slides.length === 0) return;
    const urls = new Set<string>();
    for (const s of slides) {
      if (s.type !== "lesson" && s.type !== "lesson_title") continue;
      const meta = s.metadata as { readUrl?: unknown; gospelReadUrl?: unknown; inlineWeb?: unknown } | undefined;
      if (meta?.inlineWeb === true) continue; // nothing to jump out to
      if (typeof meta?.readUrl === "string" && meta.readUrl) urls.add(meta.readUrl);
      if (typeof meta?.gospelReadUrl === "string" && meta.gospelReadUrl) urls.add(meta.gospelReadUrl);
    }
    urls.forEach((u) => preloadExternal(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);
  // Reset the suffrages A/B pick on every slide change (see its own
  // declaration) — same "must stay above the early returns" reasoning as the
  // preload effect just above. Reads slides[slideIdx] directly for the same
  // reason.
  useEffect(() => { setSuffragesChoice(null); }, [slides[slideIdx]?.id]);

  // Slides not ready yet → the load screen fills the page. Re-entry (already
  // opened today — e.g. back from the intercessions) gets a quiet spinner, never
  // the versicle again; a fresh open gets the held-breath versicle. Once the deck
  // is ready the office renders and the versicle becomes the fading overlay.
  // A hand-off in flight paints nothing but the backdrop — see veniteHandingOff.
  // Placed above the loading branch so it wins in both states: the deck must not
  // show its face on the way OUT to the browser or on the way back.
  if (veniteHandingOff) {
    return (
      <div style={{ ...officeThemeStyle(display.backdrop, display.font), minHeight: "100dvh", background: BG }} />
    );
  }

  if (loading) {
    if (alreadyOpenedToday) {
      return (
        <div style={{ ...officeThemeStyle(display.backdrop, display.font), minHeight: "100dvh", background: BG, position: "relative", isolation: "isolate", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src={veilPhoto}
            alt=""
            aria-hidden
            decoding="async"
            onLoad={() => setVeilPhotoReady(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1, opacity: veilPhotoReady ? 1 : 0, transition: "opacity 700ms ease-out" }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash2, 8,18,12),0.62) 0%, rgba(var(--ot-wash2, 8,18,12),0.5) 45%, rgba(var(--ot-wash2, 8,18,12),0.78) 100%)" }} />
          <div aria-hidden className="animate-spin" style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(var(--ot-sage, 143,175,150),0.25)", borderTopColor: "rgba(var(--ot-sage, 143,175,150),0.8)" }} />
        </div>
      );
    }
    return <div style={veilStyle}>{veilInner}</div>;
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

  // ── Physical-book mode handlers + view ──────────────────────────────
  // "I prayed this office" — the book guide's completion path. The user
  // attests they prayed the office from their physical book, so we log
  // a deliberate prayer-session row (the foreground-only auto clock
  // misses prayer time spent with the phone face-down) and then run the
  // same completion side-effects the slideshow's closing Amen runs, so
  // the rhythm grid, daily progress, and reminder-clearing all behave
  // identically however the office was prayed.
  function markPrayedFromBook() {
    const openedAt = bookOpenedAtRef.current ?? Date.now();
    const endedAt = new Date();
    const wallSeconds = Math.round((endedAt.getTime() - openedAt) / 1000);
    // Wall-clock since the guide opened, with a one-minute floor (a
    // user logging after the fact still gets a real row — the same
    // attestation model as the National Cathedral tap) and the server's
    // one-hour cap applied client-side too.
    const durationSeconds = Math.min(Math.max(wallSeconds, 60), 3600);
    // Office finished → the swell haptic (once, before the completed flag is set).
    if (!completedRef.current) swellHaptic();
    suppressSessionPostRef.current = true;
    completedRef.current = true;
    creditPrayerListIfIncluded();
    apiRequest("POST", "/api/prayer-sessions", {
      surface: officeSurface,
      durationSeconds,
      slidesCompleted: slides.length,
      completed: true,
      startedAt: new Date(openedAt).toISOString(),
      endedAt: endedAt.toISOString(),
    })
      .then(() => {
        // The prayer-rhythm habit grid + daily-practice "prayed today"
        // checks read this — refetch so they flip without an app restart.
        queryClient.invalidateQueries({ queryKey: ["/api/me/office-history-week"] });
      })
      .catch(() => { /* best-effort — the localStorage flag below still flips the local UI */ });
    try {
      if (viewerUser) { localStorage.setItem(officeCompletedKey(resolvedMode), "1"); // Stamp the home card this office completes, so returning home plays its
                  // completion moment (the side anchor card is keyed "morning"/"evening").
                  markRecentCompletion(resolvedMode.startsWith("evening") || resolvedMode === "compline" || resolvedMode === "early-evening-devotion" || resolvedMode === "creation-evening" ? "evening" : "morning"); }
      localStorage.removeItem(officeProgressKey(resolvedMode));
    } catch { /* non-fatal */ }
    if (!isSecondPracticeRun) clearOfficeReminderNotifications();
    if (onComplete) { onComplete(); return; }
    if (officesOnlyViewer) { setViewerLocation("/parish"); return; }
    // Same warm-cache handoff as amen()/handleEnd — closingOnly=1 can't
    // render until these queries resolve, so warm them first.
    // skipListCredit=1 — unlike the digital slide deck (which splices the
    // reader's own intercessions in as part of the office before ever
    // reaching this screen), the book guide's "I prayed this office" tap is
    // just an attestation; the reader hasn't necessarily walked their
    // prayer list, so this shouldn't credit that streak. Owner: "make sure
    // physical/audio completions don't count the prayer list."
    void prefetchIntercessions().finally(() => {
      setViewerLocation(`/prayer-mode?closingOnly=1&side=${officeSide}&skipListCredit=1`);
    });
  }

  // Hand into the prayer-mode intercessions slideshow from the book
  // guide, returning HERE (the book view, via &book=1 — which wins over
  // the seamless-return flag in the bookOpen initializer) rather than
  // into the slide deck, so a physical-book pray-er can hold their
  // people mid-office and come back to the page map.
  function prayBookIntercessions() {
    const basePath = isDevotion ? "/bcp/daily-devotions" : "/bcp/daily-office";
    const returnTo = `${basePath}?mode=${encodeURIComponent(resolvedMode)}&book=1`;
    setViewerLocation(`/prayer-mode?returnTo=${encodeURIComponent(returnTo)}&seamless=1`);
  }

  if (bookOpen) {
    return (
      <PhysicalBookGuide
        slides={slides}
        officeTitle={officeTitle}
        mode={resolvedMode}
        dayLabel={officeDay?.feastName ?? officeDay?.weekdayLabel ?? officeDay?.sundayLabel ?? ""}
        intercessionCount={slides.filter((s) => s.type === "intercessions").length}
        playerDocked={!!player.current}
        // onComplete marks "public mode" (the unauthenticated /pray page)
        // — /prayer-mode is auth-only, so hide the intercessions card.
        showIntercessions={!onComplete}
        alreadyDoneToday={readOfficeProgress(resolvedMode).kind === "done"}
        /**
         * "Enter Digital Slideshow" is a FORMAT CHANGE, not a peek.
         *
         * It used to only reveal the deck underneath, leaving the side's stored
         * How on "Physical BCP" — so the before-you-begin screen still said
         * Physical BCP, and Begin took you back to the page guide next time.
         * Owner: "if I go to enter digital slideshow, the format should be
         * digital when I start." Persist the choice the tap actually made.
         */
        onClose={() => { setSideEntry(officeSide, "read"); setBookOpen(false); }}
        onPrayIntercessions={prayBookIntercessions}
        onMarkPrayed={markPrayedFromBook}
      />
    );
  }

  const currentSlide = slides[slideIdx];
  // Communal mode reads the Absolution in the priest "you/your" form; alone it
  // stays the lay "us/our" text the server ships.
  const slideBody =
    communal && currentSlide.type === "absolution" && currentSlide.content
      ? communalAbsolutionText(currentSlide.content)
      : currentSlide.content;
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;
  const sectionLabel = SECTION_LABEL[currentSlide.type] ?? currentSlide.type.toUpperCase();

  /** The "choose a different …" pill under a canticle / invitatory title. */
  const swapPill = (kind: "canticle" | "invitatory", fromKey: unknown, label: string) => {
    // Pascha Nostrum isn't offered (it's Eastertide's appointed substitution,
    // not a choice) — and with nothing to switch to, the pill would be a
    // control that does nothing.
    if (kind === "invitatory" && fromKey !== "venite" && fromKey !== "jubilate") return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          swapFromKeyRef.current = typeof fromKey === "string" ? fromKey : "";
          setSwapOpen(kind);
        }}
        style={{
          marginTop: 4, padding: "9px 18px", borderRadius: 999,
          background: "rgba(var(--ot-green, 46,107,64),0.18)",
          border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)",
          color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };
  const refLabel = officeDay?.feastName ?? officeDay?.weekdayLabel ?? officeDay?.sundayLabel ?? "";

  // Title/poster slides (office threshold, psalm/canticle/lesson titles,
  // intercessions portal) are vertically centered rather than top-
  // aligned, so they need much less top padding than body slides — the
  // big top padding on body slides only exists to clear the fixed
  // header, which centered cards already sit well below.
  const isTitleCard =
    currentSlide.type === "office_intro"
    || currentSlide.type === "intercessions_portal"
    || currentSlide.type === "intercessions"
    || currentSlide.type === "psalm_title"
    || currentSlide.type === "canticle_title"
    || currentSlide.type === "lesson_title";

  // Hoisted so next() and the welcome slide's own Begin button read the SAME
  // values — they were computed inside the render block, which is why the
  // pager couldn't see them and silently ignored the chosen way.
  const canChooseWay = !officesOnlyViewer && !cameFromPicker && !onComplete;
  // Community Intercessions and Psalms are on-screen only, so their "How" row
  // collapses to a single option and the method picker is moot.
  const wayIsScreenOnly = wayToPray === "intercessions" || wayToPray === "psalms";

  /**
   * The passage this LESSON reads externally — null when there's nothing to
   * jump out to (a compline body, or a reading bundled inline as WEB text).
   *
   * Hoisted for the same reason canChooseWay is: next() needs it too, and it
   * used to be computed only inside the pill's own render closure.
   *
   * Owner: "let's take out the Read Online button, and just have it the way
   * the canticles or psalms work — show the title, then go to next, which
   * would fade into the page." A canticle/psalm title slide's "next" already
   * IS its content; a lesson with nothing bundled has no content slide to be
   * — the reading itself, on the page, is that beat. So next() (below) treats
   * this exactly like the office_intro/intercessions_portal special-cases
   * right above it: leaving THIS slide forward doesn't step the deck, it
   * fades into the passage instead.
   */
  const lessonReadUrl = (() => {
    if (currentSlide.type !== "lesson" && currentSlide.type !== "lesson_title") return null;
    if (currentSlide.type === "lesson" && currentSlide.metadata?.compline) return null;
    const inlineWeb = currentSlide.type === "lesson_title" && currentSlide.metadata?.inlineWeb === true;
    if (inlineWeb) return null; // the WEB text is already on screen — nothing to jump out to
    const meta = currentSlide.metadata as { readUrl?: unknown } | undefined;
    if (typeof meta?.readUrl === "string" && meta.readUrl) return meta.readUrl;
    return currentSlide.title ? bibleUrl(currentSlide.title) : null;
  })();

  /**
   * Finish the office: stamp completion, clear the reminder, and route to
   * the closing summary.
   *
   * Hoisted out of the bottom-bar button's render closure — where it used to
   * live — so tap-to-advance and swipe can reach it too. Reported: "the last
   * slide of the office only advances if you hit Next; it should be able to
   * do tap forward too." The bottom bar's own button already branched to this
   * on the last slide (`atEnd ? handleEnd : next`); handleTapNavigate and the
   * swipe handler called next() unconditionally, and next() is a no-op once
   * atEnd — so the right-half tap and the swipe-left gesture both went dead
   * on the final slide while the visible "Done"/"Amen" pill kept working.
   */
  /**
   * Owner: "if I went through the office with the prayers included, the prayer
   * list card should be marked done."
   *
   * The office splices a prayer_intentions slide in whenever the reader has
   * active intentions, so praying the office IS praying the list — but the two
   * kept separate books, and the Prayer List card sat in Next afterwards asking
   * for the same prayers a second time. Finishing the deck is the gate (the
   * office's own completion invariant), and the slide has to actually be IN
   * this deck: an office prayed on a day with no intentions credits nothing.
   */
  function creditPrayerListIfIncluded() {
    if (!viewerUser) return;
    if (!slides.some((s) => s.type === "prayer_intentions")) return;
    try { markPracticeDoneToday("prayer-list"); } catch { /* non-fatal */ }
  }

  function handleEnd() {
    creditPrayerListIfIncluded();
    // Mark today's pass complete so the dashboard PrayerOfficeCard
    // flips to "Pray again" copy for the rest of the day. Same
    // stamp the Amen-path uses in amen() above — kept in both
    // places because either button can be the final tap (Amen
    // for prayer-shaped closings, Done for non-prayer ones).
    completedRef.current = true;
    try {
      if (viewerUser) { localStorage.setItem(officeCompletedKey(resolvedMode), "1"); // Stamp the home card this office completes, so returning home plays its
        // completion moment (the side anchor card is keyed "morning"/"evening").
        markRecentCompletion(resolvedMode.startsWith("evening") || resolvedMode === "compline" || resolvedMode === "early-evening-devotion" || resolvedMode === "creation-evening" ? "evening" : "morning"); }
      localStorage.removeItem(officeProgressKey(resolvedMode));
    } catch { /* non-fatal */ }
    // Clear the daily reminder pushes — the "Done" path is the
    // other way an office can finish (a non-prayer closing
    // slide). The Amen path clears these too; covering both
    // means completing the office always sweeps the reminder
    // off the lock screen.
    if (!isSecondPracticeRun) clearOfficeReminderNotifications();
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
      // Same warm-cache handoff as amen() above — the last-
      // three-slides effect already started this fetch, so
      // it should resolve near-instantly here rather than
      // opening prayer-mode cold into its "Gathering the
      // prayers of your community…" loader.
      void prefetchIntercessions().finally(() => {
        setViewerLocation(`/prayer-mode?closingOnly=1&side=${officeSide}`);
      });
    }
  }

  /** The right dispatch for "advance from here", used by the bottom-bar
   *  button, tap-to-navigate, and swipe alike — see handleEnd's comment. */
  function advance() {
    if (isIntercessionSlide) { void amen(); return; }
    if (atEnd) { handleEnd(); return; }
    next();
  }

  function next() {
    if (atEnd) return;
    // The welcome slide has TWO ways forward — its own "Begin" button and the
    // deck's bottom "Next" pager — and only Begin used to honour the chosen
    // way to pray. Owner: "even though I had venite set, it went to the digital
    // slideshow when I hit next." Next now does exactly what Begin does, so the
    // How row on that slide means the same thing whichever control you reach
    // for. launchWay falls through to next() for on-screen anyway, so this is
    // only a redirect for the ways that leave the deck (Venite, Listen, Watch,
    // the physical book).
    if (currentSlide.type === "office_intro" && canChooseWay) {
      launchWay(wayToPray, wayIsScreenOnly ? "screen" : prayMethod);
      return;
    }
    // A lesson with nothing bundled to show — its "next" fades into the
    // passage rather than stepping the deck. See lessonReadUrl's own comment.
    // The deck's slideIdx does NOT move here — nothing about this office
    // changes underneath while the browser is up. Landing on the real next
    // section is the RETURN action's job (phoebe:office-next-slide below), at
    // the moment the reader actually asks for it, exactly mirroring what
    // tapping Next on this slide would otherwise have done.
    if (lessonReadUrl) {
      const opened = openOfficeReading(lessonReadUrl, {
        officeTitle,
        slideLabel: `${slideIdx + 1} of ${slides.length}`,
        sectionLabel,
      });
      /**
       * Only NATIVE holds the deck still. There the browser's own bottom bar
       * steps the office on the way out (phoebe:office-next-slide), so
       * returning here would be stepping it twice.
       *
       * On web that bar cannot exist — no listener ever fires — so returning
       * left the office parked on the lesson slide with no way forward but
       * tapping Next a second time. Reported as scripture readings "not
       * marking it as done": an office that can't pass its lesson slide can
       * never reach the end, and completion is the end of the deck. Fall
       * through to the ordinary advance instead. Same if the hand-off didn't
       * happen at all — a deck that goes nowhere is the worse failure.
       */
      if (hasNativeBrowser() && opened) return;
    }
    // Tapping "Next" on the intercessions portal should mean "take me
    // into the slideshow now" — not "skip past it". Without this
    // branch the slideIdx change cancels the 4s auto-fire timeout
    // (cleanup → clearTimeout) and the user lands on the slide AFTER
    // the portal (e.g. Lord's Prayer) without ever seeing prayer-mode.
    if (currentSlide.type === "intercessions_portal" && !portalHandedOffRef.current && !noCommunityHandoff) {
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
    setSlideIdx(prevIdx);
  }

  /**
   * Land on the real next section after a lesson-reading hand-off returns.
   *
   * The reader has been looking at the passage in the browser, not at this
   * deck — the lesson_title/bare-lesson slide(s) they left FROM are now
   * exactly what they just read, so walking straight past them (rather than
   * landing back on one) is what makes the browser's own Next actually feel
   * like "next" instead of "back to where I already was."
   */
  function nextPastLessonReading() {
    let target = slideIdx + 1;
    while (target < slides.length && (slides[target]?.type === "lesson" || slides[target]?.type === "lesson_verses")) {
      target += 1;
    }
    setSlideIdx(Math.min(target, slides.length - 1));
  }

  // Keep the arrow-key handler (bound once above) pointing at the current
  // next()/prev() and gated while the ⚙ sheet is open. Plain assignment (not a
  // hook) so it's safe to sit after the deck's early returns. Also read by the
  // phoebe:office-{prev,next}-slide listeners below, for the same reason:
  // those are bound once too, and a captured next()/prev() from the FIRST
  // render would replay against a slideIdx that's since moved on.
  /**
   * Any sheet over the deck blocks paging — not just the ⚙ Display sheet.
   *
   * The guards below all tested `displayOpen` alone, and OfficeDisplaySheet's
   * Skip Ahead row explicitly closes itself before opening Skip Ahead, so every
   * guard was OFF while that sheet was up. Clicks were contained (both sheets
   * stopPropagation), but TOUCH events were not: a horizontal flick across the
   * Skip Ahead list on the office's last slide reached the swipe handler,
   * advanced past the end, and STAMPED THE OFFICE COMPLETE — navigating away
   * out from under the open sheet.
   */
  const sheetOpen = displayOpen || skipAheadOpen || swapOpen !== null;
  keyNavRef.current = { next, prev, nextPastLessonReading, blocked: sheetOpen };

  // Swipe left → next, swipe right → prev. We check that horizontal
  // movement dominates vertical so we don't hijack scroll gestures on
  // long-body slides (psalms, lessons, canticles). Threshold of 50px
  // filters out small palm tremors.
  function handleSwipeTouchStart(e: React.TouchEvent) {
    if (sheetOpen) return; // an overlay sheet is open — don't page the office
    swipeTouchStartXRef.current = e.touches[0].clientX;
    swipeTouchStartYRef.current = e.touches[0].clientY;
  }
  function handleSwipeTouchEnd(e: React.TouchEvent) {
    if (sheetOpen) { swipeTouchStartXRef.current = null; swipeTouchStartYRef.current = null; return; }
    if (swipeTouchStartXRef.current === null || swipeTouchStartYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartXRef.current;
    const dy = e.changedTouches[0].clientY - swipeTouchStartYRef.current;
    swipeTouchStartXRef.current = null;
    swipeTouchStartYRef.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return; // primarily vertical — let scroll handle it
    if (Math.abs(dx) < 50) return;            // too small — ignore
    // Same reasoning as handleTapNavigate: the welcome slide is a chooser, and
    // a swipe there would now leave the app entirely for a non-screen way.
    if (currentSlide.type === "office_intro") return;
    if (dx < 0) advance();
    else prev();
  }

  // Tap-to-navigate — tap the left half of the slide to go back, the
  // right half to advance (Kindle-style). Taps that land on an
  // interactive control (the Amen button, the Read on Bible.com
  // link, the Back/Next nav, inline word fields) are left alone so
  // the control's own handler runs instead of paging.
  function handleTapNavigate(e: React.MouseEvent) {
    if (sheetOpen) return; // an overlay sheet is open — a tap dismisses it, not paging
    // The contemplative pause is a chooser — a stray background tap shouldn't
    // page past it (forward) or out of it (back); the person picks breathe or
    // silence, or uses the footer Back/Next deliberately.
    //
    // The welcome slide is a chooser too, and became a MUCH worse place for a
    // stray tap once next() started honouring the chosen way to pray: a
    // mis-tap on the right half no longer advances a slide, it opens
    // venite.app / the podcast / the Cathedral stream and leaves the app.
    // Deliberate controls (Begin, the footer Next) still do that on purpose.
    if (currentSlide.type === "contemplative_pause" || currentSlide.type === "office_intro") return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, label")) return;
    if (e.clientX < window.innerWidth / 2) prev();
    else advance();
  }

  // Amen flow on intercession slides — fires the right endpoint for
  // the slide's source so the amen counts toward the recipient's
  // metrics + the bell scheduler's "prayed today" gate. Best-effort:
  // we never block the slide advance on the network call, and we
  // never block the user from advancing if the call fails.
  const isIntercessionSlide = currentSlide.type === "intercessions";
  // Returns the amen POST's promise (already reconciled on failure via its
  // own .catch, so it never rejects) so amen() can await it before
  // advancing — undefined when the slide has no amen endpoint to call.
  function fireAmenSideEffect(slide: Slide): Promise<unknown> | undefined {
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
      // Clear the "X is asking for your prayers" push for this specific
      // request — the amen IS the user's response, so leaving the
      // notification on the lock screen would be a stale ask. Mirrors
      // prayer-mode's per-request clear (the office's own clear above
      // only targets thread "bell", not the per-request threads of
      // intercessions interleaved into the office). Same dispatch path
      // as the rest of the app; native shell removes the matching
      // delivered notification, no-op on web.
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:clear-notifications", { detail: { threadId: `prayer-request-${rid}` } })
        );
      } catch { /* non-fatal */ }
      return apiRequest("POST", `/api/prayer-requests/${rid}/amen`)
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
    }
    if (source === "feed" && typeof meta?.momentToken === "string") {
      // A feed intercession is a shared_moment — log the Amen as a
      // check-in, the same path prayer-mode uses. (Feeds dropped the
      // day-scheduled /entries/:date/pray endpoint in the reimagining.)
      const token = meta.momentToken;
      return apiRequest("POST", `/api/moment/${token}/amen`)
        .then(() => {
          // /subscribed drives the dashboard + prayer-list feed cards;
          // /moments drives the slideshow deck's prayed-today sort.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
          queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
        })
        .catch(() => { /* best-effort */ });
    }
    // prayer-for + circle-intention: no amen endpoint exists for
    // these surfaces yet. The Amen button still advances; we just
    // don't log a metric until those endpoints land.
    return undefined;
  }
  async function amen() {
    // Await the amen POST before advancing — without this, tapping Amen on
    // the LAST intercession slide could hand off to /prayer-mode?closingOnly=1
    // (which shows the "day is complete" recap) before the POST had actually
    // landed, and a fast follow-on refetch could show the request/moment as
    // not-yet-prayed. Mirrors prayer-mode.tsx's own advance() fix for the
    // exact same race. The promise never rejects (fireAmenSideEffect's own
    // .catch reconciles failures), so no try/catch needed here.
    const amenPromise = currentSlide ? fireAmenSideEffect(currentSlide) : undefined;
    // Clear every office-reminder push from the lock screen the moment
    // the user prays — "bell" plus the parish-office-{morning,evening}
    // thread-ids the reminder cron actually sends under. Earlier this
    // only cleared "bell", so a parish-office reminder kept sitting on
    // the lock screen for the rest of the day even after the user had
    // prayed the office — exactly the bug just reported.
    if (!isSecondPracticeRun) clearOfficeReminderNotifications();
    if (amenPromise) await amenPromise;
    if (!atEnd) {
      // Same chapel chime Next/tap/swipe play — the Amen button is just
      // another advance, so it shouldn't be the one silent path.
      setSlideIdx(slideIdx + 1);
      return;
    }
    // End of office: stamp the "completed today" flag so the dashboard
    // PrayerOfficeCard's big CTA flips to "Pray again" for the rest of
    // the day. We also clear the in-progress key — the office isn't
    // resumable anymore (they just finished it), but a fresh open will
    // still see the completed flag and decide what copy to show.
    completedRef.current = true;
    try {
      if (viewerUser) { localStorage.setItem(officeCompletedKey(resolvedMode), "1"); // Stamp the home card this office completes, so returning home plays its
                  // completion moment (the side anchor card is keyed "morning"/"evening").
                  markRecentCompletion(resolvedMode.startsWith("evening") || resolvedMode === "compline" || resolvedMode === "early-evening-devotion" || resolvedMode === "creation-evening" ? "evening" : "morning"); }
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
    // closingOnly=1 still can't render anything until the same three
    // queries prefetchIntercessions() warms resolve (frozenSlides is
    // phase-independent) — the last-three-slides effect above already
    // started this, so by now it should resolve near-instantly.
    void prefetchIntercessions().finally(() => {
      setViewerLocation(`/prayer-mode?closingOnly=1&side=${officeSide}`);
    });
  }

  // Start whatever the reader chose in the way-to-pray dropdown. Staying on the
  // form you're already viewing just advances into it (next()); switching
  // routes to the other surface — the same destinations the old pills used.
  const eveningSide = officeSide === "evening";
  // Launch the reader's chosen way + method. Intercessions is always on-screen
  // (digital). For a devotion/office: "listen" → the spoken-office podcast,
  // "watch" → the Cathedral broadcast, "book" → the physical-book guide,
  // "screen" → the slideshow. Staying on the surface you're already viewing
  // just advances (next()); switching routes to the other surface.
  // Watch the Cathedral broadcast. On the app, skip the /ncmp/watch landing and
  // go STRAIGHT to the broadcast in the web view — but still credit the watch as
  // a national-cathedral prayer-session (what that page does on the way out).
  const goToWatch = () => {
    if (isNativeShell()) {
      /**
       * Credit on the way BACK, at the real duration — not on the way out at 60s.
       *
       * Every server read of this surface gates on duration, not `completed`:
       * `surface = 'national-cathedral' AND duration_seconds >= 180`, in office
       * history, the weekly grid, yesterday's order and the office streak. So a
       * 60-second row was stored and then filtered out of all of them — the
       * office could never count, on any device, however long it was prayed.
       * It also fired the instant Watch was tapped, before a word was heard.
       *
       * The web branch below already does this properly (/ncmp/watch measures
       * 180 real seconds). This mirrors it: time the in-app browser, and on
       * close credit the office the same way every other finish does — flag,
       * completion moment, reminder swept.
       */
      const openedAt = Date.now();
      const onWatchDone = () => {
        window.removeEventListener("phoebe:browserfinished", onWatchDone);
        const durationSeconds = Math.round((Date.now() - openedAt) / 1000);
        if (durationSeconds < 180) return; // the server's own bar for this surface
        const endedAt = new Date();
        try {
          if (viewerUser) {
            localStorage.setItem(officeCompletedKey(resolvedMode), "1");
            markRecentCompletion(completedCardKey);
          }
        } catch { /* private mode — non-fatal */ }
        if (!isSecondPracticeRun) clearOfficeReminderNotifications();
        void apiRequest("POST", "/api/prayer-sessions", {
          surface: "national-cathedral", durationSeconds, completed: true,
          startedAt: new Date(openedAt).toISOString(), endedAt: endedAt.toISOString(),
        }).catch(() => { /* best-effort — the local flag already credited it */ });
      };
      window.addEventListener("phoebe:browserfinished", onWatchDone);
      openExternal("https://www.youtube.com/@WashingtonNationalCathedral/live");
    } else {
      setViewerLocation("/ncmp/watch");
    }
  };
  /**
   * Pray this office on venite.app.
   *
   * Credited on RETURN, not on tap. Owner: "when you go to the opening slide of
   * the office with the options and then go [to Venite], it just comes back to
   * the opening office slide. It should go back to the home screen with the
   * office completed. But make sure they spend at least a minute on that page.
   * If they spend less than a minute, have it say continue — or if they go back
   * for a second time, then complete."
   *
   * Two bugs in one: the handoff credited the office the instant you tapped
   * (so a mis-tap counted a whole office), and it never navigated (so coming
   * back from the browser dropped you on the chooser you'd already answered,
   * with no sign anything had happened).
   *
   * Now: leaving starts a clock. Coming back either completes the office and
   * goes home, or — if you were gone under a minute on your first trip — leaves
   * the office uncounted and offers Continue. A second return completes it
   * regardless, because someone who has gone out to Venite twice has told us
   * what they were doing more clearly than any timer can.
   *
   * The visit count is persisted per side per day: iOS can evict the app while
   * an external browser is in front, and losing the count on that would silently
   * reset someone's progress back to "first trip".
   *
   * The devotion is a different Venite VERSION, not a different office (see
   * lib/venite.ts) — so the CHOSEN way decides, not the mode that happens to be
   * loaded. The chooser can send someone to the devotion from the office
   * surface, and reading it off `resolvedMode` would hand them the full office.
   */
  const launchWay = (way: WayToPray, method: PrayMethod) => {
    // Psalms: the reader already chose their way + format here, so skip the
    // psalms "before you begin" intro (begin=1) — book → the page-number guide.
    if (way === "psalms") { setViewerLocation(`/psalms?office=${officeSide}${method === "book" ? "&book=1" : ""}&begin=1`); return; }
    if (way === "intercessions") { setViewerLocation("/prayer-mode"); return; }
    if (method === "listen") { setViewerLocation(`/podcast/${officeSide}-office`); return; }
    if (method === "watch") { goToWatch(); return; }
    if (method === "venite") { goToVenite(way === "devotion" ? "devotion" : "office"); return; }
    const onThisSurface = (way === "devotion" && isDevotion) || (way === "office" && !isDevotion);
    if (onThisSurface) {
      if (method === "book") { setBookOpen(true); return; }
      // Advance the deck DIRECTLY, never through next().
      //
      // next() routes the intro slide back through launchWay (so a tap or a
      // swipe honours the chosen way, not just the Begin button) — and
      // launchWay's on-screen case used to answer by calling next(). The two
      // called each other and the deck never moved: picking "On screen" and
      // tapping Begin did nothing at all. Reported exactly that way.
      //
      // From the intro slide the next slide is always index 1; there are no
      // portal slides to skip this early, which is the only thing next()'s
      // loop adds.
      setSlideIdx((i) => (i === 0 ? 1 : i + 1));
      return;
    }
    // A different surface than the one loaded — route there. The reader has
    // ALREADY chosen their way + method and tapped Begin, so we must NOT drop
    // them on the destination's welcome chooser to tap Begin a second time.
    // "book" opens the physical-book guide directly (?book=1); "screen" opens
    // ON the first content slide (?slide=1 skips the office_intro welcome). Both
    // params are consumed and cleared from the URL on load.
    const base =
      way === "devotion"
        ? `/bcp/daily-devotions?mode=${eveningSide ? "early-evening-devotion" : "morning-devotion"}`
        : `/bcp/daily-office?mode=${eveningSide ? "evening" : "morning"}`;
    setViewerLocation(`${base}${method === "book" ? "&book=1" : "&slide=1"}`);
  };

  // The welcome-slide chooser — three same-width rows:
  //   1. the WAY (Community Intercessions / this-side Devotion / this-side
  //      Prayer), defaulting to the user's saved preference;
  //   2. the METHOD, dependent on the way — Intercessions is on-screen only;
  //      a Devotion/Office offers On screen / Listen / In your book (+ Watch on
  //      the morning weekday side);
  //   3. Begin, which launches the selected way + method.
  // The way + method dropdowns are hidden for offices-only / public / from-the-
  // picker viewers, who just get Begin.
  const renderWayChooser = () => {
    const canChoose = canChooseWay;
    const sideWord = eveningSide ? "Evening" : "Morning";
    // Intercessions AND Psalms are on-screen only (no Listen / Physical book /
    // Watch), so the "How" row collapses to a single On-screen option for both.
    const screenOnly = wayIsScreenOnly;
    const showWatch = officeSide === "morning" && isWeekday;
    // Venite covers Morning and Evening Prayer AND the short Daily Devotion —
    // owner: "make sure that we are integrating Venite for the devotions too."
    // Still not Compline: no deep link that renders (see lib/venite.ts).
    const showVenite = canPrayOnVenite(officeSide)
      && (resolvedMode === "morning" || resolvedMode === "evening"
        || resolvedMode === "morning-devotion" || resolvedMode === "early-evening-devotion");
    // A shared, full-width styled <select> with the chevron, matching the pill
    // look. A plain render helper (NOT a component) so it inlines and the native
    // select never remounts mid-selection. Stops propagation so a tap can't
    // bubble to the slide tap-nav.
    const wayLabel = wayToPray === "intercessions" ? "Community Intercessions" : wayToPray === "psalms" ? "Today's Psalms" : wayToPray === "devotion" ? `${sideWord} Devotion` : `${sideWord} Prayer`;
    const methodValue = screenOnly ? "screen" : prayMethod;
    const methodLabel = methodValue === "screen" ? "On screen" : methodValue === "listen" ? "Listen" : methodValue === "watch" ? "Watch" : methodValue === "venite" ? "Venite Digital" : "Physical BCP";

    // A screen-wide settings pill: CATEGORY on the left, the chosen value +
    // chevron on the right (the singing-bowl / Insight-Timer pattern). The
    // native <select> sits transparent over the whole pill so a tap opens the
    // iOS picker, while our own content is what shows. Plain helper (not a
    // component) so the native select never remounts mid-selection.
    const dropdown = (
      id: string,
      value: string,
      valueLabel: string,
      categoryLabel: string,
      onChange: (v: string) => void,
      options: React.ReactNode,
    ) => (
      <div style={{ position: "relative", width: "100%" }}>
        <div style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(var(--ot-green, 46,107,64),0.32)",
          borderRadius: 999,
          padding: "14px 20px",
          pointerEvents: "none",
        }}>
          <span style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14.5, fontWeight: 600, flexShrink: 0 }}>{categoryLabel}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ color: "rgba(var(--ot-fern, 168,197,160),0.95)", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valueLabel}</span>
            <span aria-hidden style={{ color: "rgba(var(--ot-fern, 168,197,160),0.7)", fontSize: 16, lineHeight: 1, flexShrink: 0 }}>›</span>
          </span>
        </div>
        <select
          id={id}
          value={value}
          aria-label={categoryLabel}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            appearance: "none",
            WebkitAppearance: "none",
            border: "none",
            background: "transparent",
            color: "transparent",
            cursor: "pointer",
          }}
        >
          {options}
        </select>
      </div>
    );
    return (
      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          paddingTop: 16,
          borderTop: `1px solid ${BORDER}`,
          width: "100%",
          maxWidth: 480,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {canChoose && (
          <>
            {/* Row 1 — the way to pray. */}
            {dropdown("way-to-pray", wayToPray, wayLabel, "Practice", (v) => {
              const w = v as WayToPray;
              setWayToPray(w);
              // Intercessions + Psalms are on-screen only — snap the method back.
              if (w === "intercessions" || w === "psalms") setPrayMethod("screen");
              // Persist an explicit office-method choice so it holds next time —
              // Psalms especially, which round-trips through getSideLevel and
              // shows up across the home cards + splash. Intercessions isn't a
              // per-side level, so it isn't persisted.
              if (w === "psalms" || w === "office" || w === "devotion") setSideLevel(officeSide, w);
            }, (
              <>
                <option value="psalms">Today's Psalms</option>
                {/* Community Intercessions is hidden in the public/guest (and
                    pilot) shape — those sessions can't hand off to the community
                    slideshow (noCommunityHandoff), so offering it as a way to
                    pray would dead-end. Signed-in community members still see it. */}
                {!noCommunityHandoff && <option value="intercessions">Community Intercessions</option>}
                <option value="devotion">{sideWord} Devotion</option>
                <option value="office">{sideWord} Prayer</option>
              </>
            ))}
            {/* Row 2 — the method, based on the way. Intercessions + Psalms = digital only. */}
            {dropdown("pray-method", methodValue, methodLabel, "How", (v) => setPrayMethod(v as PrayMethod), (
              screenOnly ? (
                <option value="screen">On screen</option>
              ) : (
                <>
                  <option value="book">Physical BCP</option>
                  <option value="screen">On screen</option>
                  {/* Owner: "make it the third option in the dropdowns after
                      digital slideshow, call it Venite Digital." Hands the
                      office off to venite.app in the browser. Morning/Evening
                      only — Compline has no working Venite deep link. */}
                  {showVenite && <option value="venite">Venite Digital</option>}
                  <option value="listen">Listen</option>
                  {showWatch && <option value="watch">Watch</option>}
                </>
              )
            ))}
          </>
        )}
        {/* Owner: "a pill under these to press if you prayed with the
            physical BCP" — same one-tap "already prayed it" as the outer
            landing page's pill (markOfficeBookComplete), surfaced here too
            since this welcome slide is a separate screen some flows land on
            directly (cameFromPicker / onComplete skip the outer picker). */}
        {canChoose && (
          <button
            type="button"
            // resolvedMode, not just the side — this slide belongs to whichever
            // office is open, and a side can carry two.
            onClick={(e) => { e.stopPropagation(); markOfficeBookComplete(officeSide, resolvedMode, completedCardKey); setViewerLocation("/dashboard"); }}
            style={{
              width: "100%",
              background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: "1px solid rgba(var(--ot-mist, 200,212,192),0.22)",
              borderRadius: 999,
              color: "rgba(var(--ot-fern, 168,197,160),0.95)",
              fontFamily: SPACE_GROTESK,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              padding: "13px 24px",
            }}
          >
            ✓ Mark as already prayed
          </button>
        )}
        {/* Row 3 — Begin. (There used to be a "that was a quick visit — not
            counted yet" line and a Continue button here, for a return inside
            the old one-minute floor. The floor is gone; see the credit-on-
            return handler.) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            canChoose ? launchWay(wayToPray, screenOnly ? "screen" : prayMethod) : next();
          }}
          style={{
            width: "100%",
            marginTop: 6,
            background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
            border: "1px solid rgba(var(--ot-fern, 168,197,160),0.45)",
            borderRadius: 999,
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: "pointer",
            padding: "14px 24px",
          }}
        >
          {"Begin"}
        </button>
      </div>
    );
  };

  return (
    <div
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
      onClick={handleTapNavigate}
      style={{
        // Typeface + (for Paper) the light letter-paper theme — CSS custom
        // properties every swept color var() in this deck resolves against.
        ...officeThemeStyle(display.backdrop, display.font),
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
        // Gentle fade-up entrance (see @keyframes office-enter) so opening the
        // office / devotion from the home card fades in instead of flashing.
        animation: "office-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards",
      }}
    >
      {/* Creation Prayer: the intercession's Co-Breathe breath (fixed overlay,
          on top). Closing it advances the office to the collect. */}
      {showCreationBreath && (
        <CobreatheOverlay open immediateClose onClose={() => { setShowCreationBreath(false); next(); }} />
      )}
      {/* Contemplative pause's silence path: the real countdown overlay,
          opened at the picked length. A completed sit advances the office to
          the next slide (matching Creation Prayer's breath above); backing
          out just closes the overlay and leaves the chooser in place. */}
      <ContemplationTimer
        open={contemplationOpen}
        startMinutes={pauseMinutes}
        onClose={(result) => {
          setContemplationOpen(false);
          if (result?.completed) next();
        }}
      />
      {/* Held-breath load veil — the versicle screen stays on TOP of the office
          and fades out once the deck is ready and the minimum hold (~2.8s) has
          elapsed, so the office (already mounted + settled underneath) is
          revealed by the veil's fade rather than the versicle blinking to black
          and the office fading up from dark. On re-entry minLoadDone is already
          true, so this never shows — matching the old plain-spinner behaviour. */}
      <AnimatePresence>
        {!minLoadDone && (
          <motion.div
            key="office-load-veil"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            style={{ ...veilStyle, zIndex: 60 }}
          >
            {veilInner}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Landscape behind the slideshow that CHANGES per section, cross-fading
          down then up as each new title slide arrives, under a multi-stop dark
          wash for legibility. */}
      {officeBgPhoto ? (
        <>
          {/* No mode="wait": the exiting and entering photos animate at the same
              time, so it's a true crossfade rather than a fade through black. */}
          <AnimatePresence>
            <motion.img
              key={officeBgPhoto}
              src={officeBgPhoto}
              alt=""
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: officeBgOpacity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
            />
          </AnimatePresence>
          {/* Dark wash matching the Laurel Kearns intro / prayer slideshow. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash, 8,22,15),0.62) 0%, rgba(var(--ot-wash, 8,22,15),0.80) 52%, rgba(var(--ot-wash, 8,22,15),0.90) 100%)" }} />
        </>
      ) : (display.backdrop === "plain" || display.backdrop === "paper") ? (
        // Plain / Paper — one still solid ground (the swept background var
        // renders dark green for Plain, letter-paper beige for Paper).
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "var(--oh-bg, #0C1F12)" }} />
      ) : (
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
      )}
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
            paddingTop: "max(1.5rem, var(--safe-top))",
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
              background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
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
          {/* Right column: an X circle to close the slideshow (consistent with
              the other slideshows). Right-aligned so the centered title pill
              stays centered. */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {/* Display settings — text size + backdrop, in a sheet that drops
                down from the top. */}
            <button
              type="button"
              onClick={() => setDisplayOpen(true)}
              aria-label="Display settings"
              style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}
            >
              <Settings size={18} />
            </button>
            <button
              type="button"
              onClick={onBack}
              aria-label="Close"
              style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}
            >
              <X size={19} />
            </button>
          </div>

        </div>
      </header>
      <OfficeDisplaySheet
        open={displayOpen}
        onClose={() => setDisplayOpen(false)}
        showPrayingMode={isFullOffice}
        onListenToOffice={
          resolvedMode === "morning" || resolvedMode === "evening"
            ? () => setViewerLocation(`/podcast/${officeSide}-office`)
            : undefined
        }
        onSkipAhead={slides.length > 0 ? () => setSkipAheadOpen(true) : undefined}
      />
      <SwapSheet
        open={swapOpen}
        busy={swapping}
        onClose={() => setSwapOpen(null)}
        currentKey={
          swapOpen === "canticle"
            ? String((currentSlide?.metadata as { canticleKey?: unknown } | undefined)?.canticleKey ?? "")
            : String((currentSlide?.metadata as { invitPsalmKey?: unknown } | undefined)?.invitPsalmKey ?? "")
        }
        onPick={async (key) => {
          const kind = swapOpen;
          if (!kind) return;
          setSwapping(true);
          try {
            const res = await apiRequest("GET", `/api/office/swap?kind=${kind}&key=${encodeURIComponent(key)}`) as { slides?: Slide[] } | null;
            const fresh = res?.slides;
            if (!fresh || fresh.length === 0) return;
            setSlides((prev) => {
              /**
               * A CANTICLE is one contiguous run — pushCanticle emits its
               * title and body back to back, and every slide carries the same
               * canticleKey, so replacing [first…last] with that key swaps
               * exactly this canticle and leaves the office's OTHER canticle
               * alone.
               */
              if (kind === "canticle") {
                const from = swapFromKeyRef.current;
                const mine = (sl: Slide) => (sl.metadata as { canticleKey?: unknown } | undefined)?.canticleKey === from;
                const start = prev.findIndex(mine);
                if (start < 0) return prev;
                let end = start;
                while (end + 1 < prev.length && mine(prev[end + 1]!)) end += 1;
                setSlideIdx(start);
                return [...prev.slice(0, start), ...fresh, ...prev.slice(end + 1)];
              }
              /**
               * The INVITATORY is NOT one run. Its slides come out as
               *   psalm_title → antiphon → invitatory_psalm ×N → psalm_gloria → antiphon
               * so the title and the verses are separated by the antiphon.
               * Splicing "the contiguous run" would stop at that antiphon and
               * replace the title only, leaving yesterday's verses under a new
               * name — the worst possible outcome.
               *
               * Two targeted splices instead, which is also exactly the scope
               * asked for: the title card and the verse chunks change, the
               * antiphon and Gloria are left untouched (owner; and BCP p. 80
               * gives Venite and Jubilate the same antiphon and Gloria, so
               * there is nothing to change about them).
               */
              const [freshTitle, ...freshChunks] = fresh;
              if (!freshTitle) return prev;
              const isInvit = (sl: Slide) => (sl.metadata as { invitatory?: unknown } | undefined)?.invitatory === true;
              const titleIdx = prev.findIndex((sl) => isInvit(sl) && sl.type === "psalm_title");
              const firstChunk = prev.findIndex((sl) => isInvit(sl) && sl.type === "invitatory_psalm");
              if (titleIdx < 0 || firstChunk < 0) return prev;
              let lastChunk = firstChunk;
              while (
                lastChunk + 1 < prev.length &&
                isInvit(prev[lastChunk + 1]!) && prev[lastChunk + 1]!.type === "invitatory_psalm"
              ) lastChunk += 1;
              // Verses first, then the title — replacing the LATER range first
              // keeps the earlier index valid. (Doing it the other way round
              // shifts firstChunk/lastChunk by the length delta.)
              const withChunks = [...prev.slice(0, firstChunk), ...freshChunks, ...prev.slice(lastChunk + 1)];
              const next = [...withChunks.slice(0, titleIdx), freshTitle, ...withChunks.slice(titleIdx + 1)];
              setSlideIdx(titleIdx);
              return next;
            });
            setSwapOpen(null);
          } catch { /* leave the sheet open; nothing was changed */ }
          finally { setSwapping(false); }
        }}
      />
      <SkipAheadSheet
        open={skipAheadOpen}
        onClose={() => setSkipAheadOpen(false)}
        slides={slides}
        onJump={(key) => {
          const idx = slides.findIndex((s) => s.id === key);
          if (idx >= 0) setSlideIdx(idx);
          setSkipAheadOpen(false);
        }}
      />

      <main
        ref={mainRef}
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: isTitleCard
            ? "max(24px, var(--safe-top))"
            : "max(110px, calc(var(--safe-top) + 80px))",
          // Bottom clearance is delivered by the spacer child at the end of
          // this <main>, NOT by padding-bottom here. iOS WKWebView drops a
          // flex-column scroll container's padding-bottom when a child
          // overflows, which tucked the end of long communal slides (the
          // Suffrages call-and-response especially) behind the fixed nav
          // pill. A real element is counted in scrollHeight on every engine.
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          // Slight drop shadow on all slide text (inherited) so it stays legible
          // over the leaf backdrop.
          textShadow: "0 1px 6px rgba(var(--ot-shadow, 8,30,18),0.5)",
        }}
      >
        <div
          className="mx-auto"
          style={{
            display: "flex",
            flexDirection: "column",
            // TEXT SIZE (⚙ sheet): platform-branched in fontScaleWrapStyle —
            // -webkit-text-size-adjust on iOS (zoom's text scaling is broken
            // there: boxes moved, glyphs didn't), CSS zoom + width
            // compensation elsewhere. Column stays the old max-w-2xl (672px).
            ...fontScaleWrapStyle(display.fontScale, 672),
            // Title cards: flex-grow fills the scroll container so
            // justifyContent:center vertically centers them in the viewport.
            // Content slides: flex-grow:0 keeps the div at its natural height
            // so scrollHeight < clientHeight on short slides — iOS can't
            // rubber-band a non-scrollable element. flex-shrink:0 lets long
            // slides (psalms, canticles) overflow and scroll normally.
            flexGrow: isTitleCard ? 1 : 0,
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
                  // A shade smaller than TITLE_LG on this slide only: it is the
                  // one title card that also carries a blurb AND the setting
                  // rows AND Begin, so it has the least room to spend.
                  fontSize: "clamp(34px, 7vw, 44px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: WARM_TEXT,
                  margin: 0,
                  lineHeight: 1.05,
                }}
              >
                {currentSlide.title ?? ""}
              </h1>
              {/* Morning/Evening Prayer (and now Compline, a peer BCP form
                  reachable from the same evening step) keep just the title on
                  the threshold slide — the long description is dropped
                  (owner). Other intros (devotion, etc.) still show their
                  line. */}
              {currentSlide.content && !(resolvedMode === "morning" || resolvedMode === "evening" || resolvedMode === "compline") && (
                <p
                  style={{
                    // Owner: "make sure this is fitting, maybe make the
                    // description smaller." On the Devotion intro the blurb is
                    // four full lines, and at 17px/1.7 it pushed Begin down
                    // behind the fixed bottom nav pill — the primary action on
                    // the slide, unreachable. Smaller type and a tighter leading
                    // buy back roughly two lines' worth of height.
                    fontSize: 15,
                    lineHeight: 1.55,
                    fontFamily: SPACE_GROTESK,
                    color: "rgba(var(--ot-mist, 200,212,192),0.85)",
                    margin: 0,
                  }}
                >
                  {currentSlide.content}
                </p>
              )}

              {/* Other ways to pray this office. "Listen" → the Forward
                  Movement spoken office (read-aloud podcast); "Watch" →
                  the Washington National Cathedral broadcast, which is
                  Morning Prayer specifically, so it only shows on the
                  morning side. Both navigate away from the slideshow
                  into the dedicated player / watch surfaces. "Book" →
                  the in-page physical-BCP guide: today's page numbers,
                  psalms, and readings for praying from a paper book. Hidden on
                  the welcome slides that show the way/method chooser (devotion +
                  morning/evening office) — there the method lives in the
                  chooser's second dropdown instead. */}
              {/* Compline joins Morning/Evening in dropping this old button
                  row too — it never had a real "Listen" option anyway (this
                  pill pointed at Evening Prayer's audio, not Compline's own
                  liturgy, which has none), so it was offering a mismatched
                  alternate rather than a real one. Physical-BCP page numbers
                  are already printed inline on each slide (bcpReference). */}
              {!(isDevotion || resolvedMode === "morning" || resolvedMode === "evening" || resolvedMode === "compline") && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 8,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewerLocation(`/podcast/${officeSide}-office`)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                    color: WARM_TEXT,
                    border: "1px solid rgba(var(--ot-green, 46,107,64),0.50)",
                    borderRadius: 999,
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                  }}
                >
                  🎧 Listen
                </button>
                {officeSide === "morning" && isWeekday && (
                  <button
                    type="button"
                    onClick={goToWatch}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      // Muted purple — the Washington National Cathedral's
                      // identity color, distinct from the green office chrome.
                      background: "rgba(var(--ot-violet, 124,92,176),0.20)",
                      color: WARM_TEXT,
                      border: "1px solid rgba(var(--ot-violet, 124,92,176),0.50)",
                      borderRadius: 999,
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: SPACE_GROTESK,
                      cursor: "pointer",
                    }}
                  >
                    📺 Watch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBookOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    // Warm leather brown — the physical book, distinct
                    // from the green chrome and the Cathedral purple.
                    background: "rgba(var(--ot-brown, 166,124,82),0.18)",
                    color: WARM_TEXT,
                    border: "1px solid rgba(var(--ot-brown, 166,124,82),0.50)",
                    borderRadius: 999,
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                  }}
                >
                  📕 {bcpGuideText("Physical BCP")}
                </button>
              </div>
              )}
            </div>
          ) : currentSlide.type === "prayer_intentions" ? (
            // A quiet listing of the reader's own private prayer list, spliced
            // in right where the community intercessions would otherwise hand
            // off — the same seat, just for the things this one reader is
            // holding. Not an editor; /intentions stays the only place to
            // add/edit/answer.
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", textAlign: "center", gap: 18, padding: "0 8px" }}>
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0 }}>
                {currentSlide.eyebrow}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 420, maxHeight: "44dvh", overflowY: "auto" }}>
                {((currentSlide.metadata as { intentions?: Array<{ headline: string; subline: string }> } | undefined)?.intentions ?? []).map((it, i) => (
                  <div
                    key={i}
                    style={{ padding: "14px 18px", borderRadius: 16, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.22)", background: "rgba(var(--ot-green, 46,107,64),0.08)", textAlign: "left" }}
                  >
                    <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 17, lineHeight: 1.4, color: "var(--oh-ink2, #E8E4D8)", margin: 0 }}>
                      {it.headline}
                    </p>
                    {it.subline && (
                      <p style={{ fontFamily: SPACE_GROTESK, fontSize: 13, color: FAINT_GREEN, margin: "4px 0 0" }}>
                        {it.subline}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={next}
                style={{ padding: "13px 30px", borderRadius: 999, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.5)", background: "rgba(var(--ot-green, 46,107,64),0.3)", color: "var(--oh-ink, #F0EDE6)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                Continue →
              </button>
              <button
                type="button"
                onClick={() => setViewerLocation("/intentions")}
                style={{ background: "none", border: "none", color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 13, cursor: "pointer", padding: 0 }}
              >
                Add to your list
              </button>
            </div>
          ) : currentSlide.type === "prayer_prompts" ? (
            // "Before you go" prompt composer — write a new prayer for the
            // private list (or share it), then continue. Sits right after
            // the contemplative pause.
            <PrayerPromptsSlide onContinue={next} />
          ) : currentSlide.type === "contemplative_pause" ? (
            // Contemplative pause — the moment in the Prayers that replaces the
            // community intercessions for accounts without the prayer-request
            // feature. A chooser: breathe (Co-Breathe) or sit in silence — the
            // silence path opens the real ContemplationTimer overlay (see
            // contemplationOpen) at the picked length, so it actually counts
            // down instead of showing a static "resting" card with no timer.
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", textAlign: "center", gap: 22, padding: "0 8px" }}>
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0 }}>
                {currentSlide.eyebrow}
              </p>
              {/* Restored per owner: the same invitation the community
                  intercessions used to close on ("bring anything else on
                  your heart to prayer"), before the hand-off into
                  /prayer-mode was cut — the intercession FEATURE stays
                  off, just this framing on the still-live chooser below.
                  "Else"/"haven't named" only reads right when a named
                  prayer_intentions slide actually preceded this one —
                  otherwise (prayer list off, or empty) there's nothing
                  prior to be "else" than, so the copy drops that frame. */}
              <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 23, lineHeight: 1.5, color: "var(--oh-ink2, #E8E4D8)", maxWidth: 460, margin: 0 }}>
                {slides.some((s) => s.type === "prayer_intentions")
                  ? "Take a breath. Bring anything else on your heart to prayer."
                  : "Take a breath. Bring what's on your heart to prayer."}
              </p>
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 15, lineHeight: 1.6, color: FAINT_GREEN, maxWidth: 400, margin: 0 }}>
                {slides.some((s) => s.type === "prayer_intentions")
                  ? "Someone you haven't named, a worry that surfaced this morning, the world that needs holding."
                  : "Someone you carry, a worry that surfaced this morning, the world that needs holding."}
              </p>
              <button
                type="button"
                onClick={next}
                style={{ padding: "13px 30px", borderRadius: 999, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.5)", background: "rgba(var(--ot-green, 46,107,64),0.3)", color: "var(--oh-ink, #F0EDE6)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                Continue →
              </button>
              <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 14, color: FAINT_GREEN, margin: "6px 0 0" }}>
                or pause for a time of contemplative prayer
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340, padding: 14, borderRadius: 20, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.25)", background: "rgba(var(--ot-green, 46,107,64),0.08)" }}
              >
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  {[5, 10, 20].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPauseMinutes(m)}
                      style={{
                        flex: 1,
                        padding: "12px 0",
                        borderRadius: 14,
                        border: pauseMinutes === m ? "1px solid rgba(var(--ot-sage, 143,175,150),0.6)" : "1px solid rgba(var(--ot-sage, 143,175,150),0.25)",
                        background: pauseMinutes === m ? "rgba(var(--ot-green, 46,107,64),0.35)" : "rgba(var(--ot-green, 46,107,64),0.12)",
                        color: "var(--oh-ink, #F0EDE6)",
                        fontFamily: SPACE_GROTESK,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{m}</div>
                      <div style={{ fontSize: 11, color: FAINT_GREEN }}>min</div>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setContemplationOpen(true)}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: "rgba(var(--ot-green, 46,107,64),0.9)", color: "var(--oh-ink, #F0EDE6)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                >
                  🕯️ Begin contemplation
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreationBreath(true)}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.3)", background: "transparent", color: "var(--oh-ink, #F0EDE6)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                >
                  🌍 Creation Prayer — breathe together
                </button>
                {/* Owner: "add another bar or panel that says read scripture
                    reflection and have it open for day by day" — a fourth
                    option alongside silence/Creation Prayer, opening Forward
                    Day by Day the same way its home card does (external
                    reader, marked read once the browser actually closes —
                    see DailyProgressBody's reflections.map for why mark()
                    can't fire at tap time). */}
                <button
                  type="button"
                  onClick={() => openExternalThenMarkRead(FDD_TODAY_URL, () => { markFddRead(); swellHaptic(); }, { reader: true })}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "1px solid rgba(var(--ot-sage, 143,175,150),0.3)", background: "transparent", color: "var(--oh-ink, #F0EDE6)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                >
                  📖 Read Scripture Reflection — Forward Day by Day
                </button>
              </div>
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
                  fontSize: TITLE_XL,
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
                      fontSize: TITLE_XL,
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
                        color: "rgba(var(--ot-mist, 200,212,192),0.75)",
                        margin: 0,
                      }}
                    >
                      From the Daily Office Lectionary
                    </p>
                  )}
                  {/* Owner: "we want it possible for the invitatory too."
                      Only on the INVITATORY title (BCP p. 80 offers "Venite
                      or Jubilate" as a real choice) — never on an appointed
                      psalm, which the lectionary fixes for the day. */}
                  {isInvitatory && swapPill("invitatory", (currentSlide.metadata as { invitPsalmKey?: unknown } | undefined)?.invitPsalmKey, "Choose a different invitatory")}
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
                      fontSize: TITLE_XL,
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
                        color: "rgba(var(--ot-mist, 200,212,192),0.75)",
                        margin: 0,
                      }}
                    >
                      {currentSlide.title.replace(/^Canticle\s+\d+\s*[—-]\s*/i, "")}
                    </p>
                  )}
                  {/* Owner: "a pill that says choose different canticle."
                      BCP's own canticle table offers alternatives on most
                      days ("4 or 16", "1 or 12"), and the fuller list is a
                      standing permission — so this isn't overriding the
                      lectionary, it's surfacing a choice the book already
                      grants. */}
                  {swapPill("canticle", (currentSlide.metadata as { canticleKey?: unknown } | undefined)?.canticleKey, "Choose a different canticle")}
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
                | { lessonSubtitle?: unknown; readUrl?: unknown; inlineWeb?: unknown }
                | undefined;
              const subtitle =
                typeof meta?.lessonSubtitle === "string" && meta.lessonSubtitle.length > 0
                  ? meta.lessonSubtitle
                  : "A Lesson";
              const reference = currentSlide.title ?? "";
              // The reading shows the WEB inline (the default, "present"); NRSV
              // opens the passage in the external Bible page. Only offer the
              // toggle when WEB is ACTUALLY shown inline — not the reference-only
              // fallback (deuterocanon), where the read-online pill handles it.
              const readUrl = typeof meta?.readUrl === "string" ? meta.readUrl : null;
              const inlineWeb = meta?.inlineWeb === true;
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
                      fontSize: TITLE_MD,
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      color: WARM_TEXT,
                      margin: 0,
                      lineHeight: 1.05,
                    }}
                  >
                    {reference}
                  </h1>
                  {/* Translation toggle — WEB (shown inline, current) on the
                      left; NRSV on the right opens the passage in the external
                      Bible page (NRSV can't be bundled). */}
                  {inlineWeb && readUrl && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <p style={{ color: FAINT_GREEN, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>
                        Translation
                      </p>
                      <div style={{ display: "inline-flex", borderRadius: 999, overflow: "hidden", border: "1px solid rgba(140,195,160,0.3)" }}>
                        <span style={{ padding: "7px 20px", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, color: WARM_TEXT, background: "rgba(var(--ot-green, 46,107,64),0.85)" }}>
                          WEB
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            openExternal(readUrl);
                            // Reader chose to read this lesson in NRSV (external),
                            // so SKIP the WEB verse slides that follow this title —
                            // jump straight to the next section.
                            let j = slideIdx + 1;
                            while (j < slides.length && slides[j].type === "lesson_verses") j++;
                            setSlideIdx(Math.min(j, slides.length - 1));
                          }}
                          style={{ padding: "7px 20px", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, color: "rgba(var(--ot-pale, 182,210,188),0.85)", background: "transparent", border: "none", cursor: "pointer" }}
                        >
                          NRSV
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : currentSlide.type === "lesson" && currentSlide.metadata?.compline ? (
            // Compline short lesson — full scripture text rendered
            // inline. The four BCP-appointed Compline lessons are
            // 1–3 verses each (Jer 14:9, Matt 11:28-30, Heb 13:20-21,
            // 1 Pet 5:8-9), short enough to read on the slide rather
            // than tap out to Bible.com. The default lesson template
            // above this branch ships the body as a small grey
            // subtitle assuming the reader will tap a Bible.com pill;
            // that's wrong for Compline's read-here passages.
            (() => {
              const ref = String(currentSlide.title ?? currentSlide.metadata?.lessonRef ?? "").trim();
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    maxWidth: 560,
                    margin: "0 auto",
                    textAlign: "center",
                    gap: 18,
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
                    The Lesson
                  </p>
                  {ref && (
                    <p
                      style={{
                        fontFamily: SPACE_GROTESK,
                        fontSize: 13,
                        letterSpacing: "0.02em",
                        // MUTED_GREEN is the file's own sage-green token —
                        // there's no top-level SAGE const here, and the
                        // earlier reference to one was a typo that crashed
                        // every Compline lesson render with ReferenceError.
                        color: MUTED_GREEN,
                        margin: 0,
                        fontWeight: 600,
                      }}
                    >
                      {ref}
                    </p>
                  )}
                  <p
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontStyle: "italic",
                      fontSize: "clamp(18px, 3.4vw, 22px)",
                      lineHeight: 1.55,
                      color: WARM_TEXT,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {currentSlide.content}
                  </p>
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
                      fontSize: TITLE_MD,
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
                      color: "rgba(var(--ot-mist, 200,212,192),0.75)",
                      margin: 0,
                    }}
                  >
                    From the Daily Office Lectionary
                  </p>
                  {/* No separate invitation line any more — see the removed
                      Read-online pill's note further down: a lesson_title with
                      nothing bundled is now a plain title card, like a
                      canticle/psalm title, and Next is what takes the reader
                      to the passage. */}
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
                    {eyebrowLabel}
                  </p>
                  {communal && SAID_BY.canticle && (
                    <p style={{ color: "rgba(var(--ot-sage, 143,175,150),0.55)", fontSize: 11.5, fontStyle: "italic", margin: "-2px 0 0", fontFamily: SPACE_GROTESK }}>
                      {pickLoc(SAID_BY.canticle)}
                    </p>
                  )}
                </>
              );
            })()
          ) : (
            <>
              {/* Owner: "left align the suffrages toggle, and we don't need
                  the eyebrow above." The A/B pill already names what this
                  slide is — a second label above it just repeated that. */}
              {currentSlide.type !== "suffrages" && (
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
                  {/* Lesson slides take their own branches above (the
                      inline-Compline one at 1239 and the centered title
                      at 1306), so by the time we reach this fallback
                      eyebrow the slide is never a lesson — TypeScript's
                      type narrowing already proved it dead. We render
                      the slide's literal eyebrow / fallback label
                      instead. */}
                  {currentSlide.eyebrow || sectionLabel}
                </p>
              )}
              {/* Communal mode: the BCP's "said by" rubric under the
                  eyebrow — Officiant / Officiant and People / all. */}
              {communal && SAID_BY[currentSlide.type] && (
                <p style={{ color: "rgba(var(--ot-sage, 143,175,150),0.55)", fontSize: 11.5, fontStyle: "italic", margin: "-2px 0 0", fontFamily: SPACE_GROTESK }}>
                  {pickLoc(SAID_BY[currentSlide.type]!)}
                </p>
              )}
              {/* Title slot. Intercession + psalm slides took
                  earlier branches (above), so we know currentSlide
                  isn't either of those here. The collect drops its
                  Sunday-name title ("The Fifth Sunday of Easter")
                  so the prayer text itself is the centered focus —
                  the proper-name lives in the chrome's date label
                  already, no need to repeat it on the slide. */}
              {/* Canticles keep only the slim eyebrow (the canticle's name
                  is already there) — a non-chunked canticle would otherwise
                  repeat its name as a big headline right above the verses. */}
              {currentSlide.title && currentSlide.type !== "collect" && currentSlide.type !== "canticle" && (
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
              // PARAGRAPH form — the reading flows as continuous prose (NOT
              // broken into per-verse rows like the psalms), with small inline
              // superscript verse numbers so references are still findable.
              return (
                <p style={{ fontSize: 19, lineHeight: 1.75, color: WARM_TEXT, margin: 0, fontFamily: SPACE_GROTESK, maxWidth: 600 }}>
                  {verses.map((v, i) => {
                    const prev = i > 0 ? verses[i - 1] : null;
                    const showChapter = !prev || prev.chapter !== v.chapter;
                    const label = showChapter ? `${v.chapter}:${v.verse}` : String(v.verse);
                    return (
                      <span key={i}>
                        <sup style={{ color: FAINT_GREEN, fontSize: "0.6em", fontWeight: 600, marginRight: 3 }}>{label}</sup>
                        {v.text}{i < verses.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
                </p>
              );
            })()
          ) : currentSlide.type === "psalm" && currentSlide.content ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
              {parsePsalmContent(fixQuoteDirection(currentSlide.content)).map((v, i) => (
                v.kind === "verse" ? (
                  <div key={i} style={{ display: "flex", gap: 7 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        minWidth: 16,
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
                            paddingLeft: ln.indented ? 16 : 0,
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
                          borderTop: "1px solid rgba(var(--ot-sage, 143,175,150),0.18)",
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
            // Officiant / People / All speaker labels show only in communal
            // mode (Settings → Praying the office → Together) — praying
            // alone, the role labels read as visual noise and the lines run
            // as one continuous prayer. Together, the labels are the point:
            // they mark who says which line. A label renders when the
            // speaker CHANGES so a wrapped suffrage line isn't re-labelled.
            (() => {
              // Suffrages A/B — only when the slide actually carries both
              // (see assembleMorningPrayer.ts/assembleEveningPrayer.ts). Every
              // other call-and-response slide (the Creed, the versicles, the
              // other suffrages beat — "Let us bless the Lord") falls straight
              // through to the plain render below, unchanged.
              const suffMeta = currentSlide.type === "suffrages"
                ? (currentSlide.metadata as {
                    suffragesSelected?: "A" | "B";
                    suffragesOptions?: Record<"A" | "B", { text: string; lines: { speaker: "officiant" | "people" | "both"; text: string }[] }>;
                  } | undefined)
                : undefined;
              const suffOptions = suffMeta?.suffragesOptions;
              const hasToggle = !!(suffOptions?.A && suffOptions?.B);
              const active = suffragesChoice ?? suffMeta?.suffragesSelected ?? "A";
              const lines = hasToggle ? suffOptions![active].lines : currentSlide.callAndResponseLines;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: communal ? 16 : 10, maxWidth: 560, width: "100%", alignItems: "stretch" }}>
                  {hasToggle && (
                    // Same two-pill "tablist" shape as the podcast player's
                    // Forward Movement / Church of England toggle (owner's own
                    // reference), redrawn in the office's own token colours.
                    <div
                      role="tablist"
                      aria-label="Suffrages"
                      // alignSelf, because inline-flex is not enough here: the
                      // parent is a COLUMN flex container, whose default
                      // align-items:stretch overrides an item's own intrinsic
                      // width and pulled the pill the full width of the slide.
                      // Owner: "the toggle bar was full width but too long, it
                      // should be around the two options."
                      style={{ alignSelf: "flex-start", display: "inline-flex", gap: 4, background: "rgba(var(--ot-deep, 9,26,16), 0.4)", border: `1px solid ${BORDER}`, borderRadius: 999, padding: 4, marginBottom: 4 }}
                    >
                      {(["A", "B"] as const).map((opt) => {
                        const on = active === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setSuffragesChoice(opt)}
                            style={{
                              borderRadius: 999, padding: "6px 20px", fontSize: 12, fontWeight: 700, fontFamily: SPACE_GROTESK,
                              cursor: "pointer", border: `1px solid ${on ? "rgba(var(--ot-sage, 143,175,150),0.5)" : "transparent"}`,
                              background: on ? "rgba(var(--ot-green, 46,107,64),0.55)" : "transparent",
                              color: on ? WARM_TEXT : FAINT_GREEN,
                              transition: "background 0.15s, color 0.15s",
                            }}
                          >
                            {`Suffrages ${opt}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {lines?.map((line, i) => {
                    const prev = lines[i - 1];
                    const showLabel = communal && (!prev || prev.speaker !== line.speaker);
                    return (
                      <div key={i} style={{ width: "100%" }}>
                        {showLabel && (
                          <p style={{ color: FAINT_GREEN, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 3px", fontWeight: 600 }}>
                            {pickLoc(SPEAKER_LABEL[line.speaker] ?? SPEAKER_LABEL.both)}
                          </p>
                        )}
                        <p style={{ fontSize: 20, lineHeight: 1.6, color: WARM_TEXT, margin: 0, fontFamily: SPACE_GROTESK }}>
                          {fixQuoteDirection(line.text)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()
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
                            paddingLeft: indented ? 18 : 0,
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
              // Parish BCP intercession — the priest chose this prayer
              // from the Book of Common Prayer, so its full text shows
              // in a frosted "closing prayer" card captioned "From the
              // Book of Common Prayer", the way Co-Breathe closes on its
              // prayer, rather than as a plain intercession paragraph.
              const im = currentSlide.metadata as { isBcp?: boolean } | undefined;
              if (currentSlide.type === "intercessions" && im?.isBcp) {
                return (
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 600,
                      borderRadius: 16,
                      padding: "20px 24px",
                      background: "rgba(var(--ot-deep, 9,26,16), 0.297)",
                      backdropFilter: "blur(11.34px)",
                      WebkitBackdropFilter: "blur(11.34px)",
                      border: "1px solid rgba(var(--ot-green, 46,107,64),0.15)",
                    }}
                  >
                    <p
                      style={{
                        fontStyle: "italic",
                        color: "var(--oh-mist, #C8D4C0)",
                        fontFamily: SPACE_GROTESK,
                        fontSize: 19,
                        lineHeight: 1.6,
                        margin: 0,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {fixQuoteDirection(slideBody)}
                    </p>
                    <p
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        color: "rgba(var(--ot-sage, 143,175,150),0.3)",
                        margin: "12px 0 0",
                        fontFamily: SPACE_GROTESK,
                      }}
                    >
                      From the Book of Common Prayer
                    </p>
                  </div>
                );
              }
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
                const paragraphs = fixQuoteDirection(slideBody)
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
                    color: currentSlide.type === "intercessions" ? "var(--oh-ink2, #E8E4D8)" : WARM_TEXT,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: SPACE_GROTESK,
                    maxWidth: 600,
                  }}
                >
                  {fixQuoteDirection(slideBody)}
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
          {/* No more Read-online pill on lesson/lesson_title slides. Owner:
              "take out the Read Online button, and just have it the way the
              canticles or psalms work — show the title, then go to next,
              which would fade into the page." next() now special-cases these
              slides directly (see lessonReadUrl + its use in next()), so the
              title alone is the whole slide, same as a canticle/psalm title —
              the "content" it advances into is the passage itself. */}
          {/* "Read Gospel" — the Epistle slide only. Owner: "on the Epistle
              title slide in Morning Prayer, have a button under it that says
              Read Gospel, which would then have the gospel reading for the
              day on the next slide" — then, confirming the source: "the
              Gospel is what the evening prayer shows." The Daily Office
              Lectionary appoints OT+Epistle at MP and the Gospel at EP;
              lesson2's slide carries the SAME day's Gospel reference as an
              optional extra (see buildLessonSlides' extraMetadata in
              assembleLesson.ts/assembleMorningPrayer.ts) precisely so this
              button can point at it without a second lectionary lookup.
              Deliberately a BUTTON, not next()'s own hijack the way a bare
              lesson_title is — the Epistle's own Next still has to reach the
              canticle that actually follows it; this is an optional side
              reading, not the slide's only path forward. */}
          {currentSlide.type === "lesson_title" && (() => {
            const meta = currentSlide.metadata as { gospelReadUrl?: unknown } | undefined;
            const gospelUrl = typeof meta?.gospelReadUrl === "string" ? meta.gospelReadUrl : null;
            if (!gospelUrl) return null;
            return (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => openOfficeReading(gospelUrl, {
                    officeTitle,
                    slideLabel: `${slideIdx + 1} of ${slides.length}`,
                    sectionLabel,
                  })}
                  style={{
                    padding: "10px 18px", borderRadius: 999,
                    background: "rgba(var(--ot-green, 46,107,64),0.18)", border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)",
                    color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {"Read Gospel →"}
                </button>
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
                  background: "rgba(var(--ot-green, 46,107,64),0.12)",
                  border: "1px solid rgba(var(--ot-green, 46,107,64),0.28)",
                  color: "var(--oh-fern, #A8C5A0)",
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
              keep seeing alternate routes. Rendered as a pair of
              side-by-side pills (per user direction) rather than
              underlined text links — reads as proper alternate
              actions instead of footnote-style links. */}
          {/* First-slide "Start" CTA + devotion side-doors. The Start
              pill is the primary action — a full-width filled pill that
              advances into the liturgy, sitting above the two lighter
              alternate-route pills (so it's as wide as both of them put
              together). Start shows for every tier, including offices-
              only viewers who don't get the secondary routes. The
              Community Intercessions / Full Office pair stays gated to
              non-public, non-offices-only viewers as before:
              /prayer-mode (no queue) would loading-screen for offices-
              only users because the default queue depends on
              /api/moments + /api/prayer-requests (both 403 for that
              tier). First slide only — once the reader is moving
              through the devotion they shouldn't keep seeing these. */}
          {/* Devotion welcome slide — the way-to-pray chooser (Start + the
              dropdown that replaced the old Intercessions / Full Office pills).
              First slide only. */}
          {isDevotion && slideIdx === 0 && !onComplete && renderWayChooser()}
          {/* Office welcome slide — same chooser, defaulting to the full Office
              (the reader can drop to a Devotion or the Intercessions feed). */}
          {(resolvedMode === "morning" || resolvedMode === "evening") && slideIdx === 0 && !onComplete && renderWayChooser()}
          {/* Compline's welcome slide used to carry an "Evening Prayer" pill
              (a door back to the Evening Devotion) under a divider. Removed
              per owner: Compline is its own office, chosen deliberately, and
              offering a step back into an earlier one on the threshold slide
              muddied that. Backing out to the chooser still reaches Evening
              Prayer for anyone who opened Compline by mistake. */}
        </div>
        {/* Bottom clearance spacer — see the paddingBottom note above. Being a
            real box (not container padding), it survives iOS WKWebView's
            flex-overflow padding-drop, so the last line of a long slide always
            scrolls clear of the fixed nav pill. On title cards the flex-grow
            content column simply shrinks by this height, preserving the same
            vertical centering the old padding produced. */}
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            height: player.current
              ? "calc(env(safe-area-inset-bottom) + 176px)"
              : "calc(env(safe-area-inset-bottom) + 112px)",
          }}
        />
      </main>

      {/* Bottom nav pill — Back · section · Next/Done. Mirrors Lectio. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: player.current
            ? "calc(env(safe-area-inset-bottom) + 80px)"
            : "calc(env(safe-area-inset-bottom) + 16px)",
          transition: "bottom 0.2s ease",
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "rgba(var(--ot-deep, 9,26,16), 0.297)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
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
            {slideIdx + 1} of {slides.length} · {sectionLabel}
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
            // tap still exits the office (handleEnd, hoisted above next()/
            // prev() — see its own comment).
            const label = isAmenSlide ? "Amen" : (atEnd ? "Done" : "Next");
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

// ── Physical-book guide ─────────────────────────────────────────────────────
// "Pray from your book" — a one-screen map of today's office for someone
// holding a paper 1979 Book of Common Prayer: where the office begins,
// today's invitatory, the appointed psalms and canticles with their page
// numbers, the lessons to read from their own Bible, and the collect of
// the day. Derived entirely from the already-fetched slide deck (the
// assemblers stamp bcpReference on every text-bearing slide), so it
// tracks the liturgical day — feast canticles, seasonal invitatories,
// multi-psalm days — with zero extra fetches.

// Where each liturgy begins in the 1979 BCP — the headline page badge.
const MODE_START_PAGE: Record<LiturgyMode, string> = {
  morning: "p. 75",
  evening: "p. 115",
  compline: "p. 127",
  "morning-devotion": "p. 137",
  "early-evening-devotion": "p. 139",
  "creation-morning": "Creation Prayer",
  "creation-evening": "Creation Prayer",
};

type BookSection = {
  key: string;
  label: string;          // the section of the office ("The Canticle")
  detail: string | null;  // what today appoints ("Canticle 21 · You Are God")
  page: string | null;    // "p. 585" — BCP page badge
  readUrl: string | null; // lessons only: the read-online fallback
};

// Title-case an all-caps eyebrow ("THE COLLECT OF THE DAY" → "The
// Collect of the Day") with the little words kept lowercase.
function bookTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|For|And|To|In|A|An)\b/g, (m, _p, off: number) =>
      off === 0 ? m : m.toLowerCase());
}

// First usable page ref in a run of slides, stripped of the "BCP "
// prefix the seed data carries ("BCP p. 585" → "p. 585").
function bookPageRef(...refs: Array<string | null | undefined>): string | null {
  for (const r of refs) {
    if (r) return r.replace(/^BCP\s*/i, "");
  }
  return null;
}

// Walk the slide deck and collapse it into the office's sections, one
// card each. Slide types that are sub-parts of a section (verse chunks,
// the Gloria, the absolution, title cards' bodies) fold into their
// parent; purely on-screen types (intro, portal) are skipped.
// The prayers of the people (the intercessions portal + any inline intercession
// slides) belong just BEFORE the General Thanksgiving in the office (BCP). The
// server feed has placed them earlier; move the whole intercessions block to sit
// immediately before the first General Thanksgiving slide. No-op when there's no
// Thanksgiving (e.g. the Devotions) or no intercessions.
function reorderIntercessionsBeforeThanksgiving(slides: Slide[]): Slide[] {
  const thanksIdx = slides.findIndex((s) => s.type === "general_thanksgiving");
  if (thanksIdx < 0) return slides;
  const isInter = (s: Slide) => s.type === "intercessions_portal" || (s.type as string) === "intercessions";
  const interIdxs = slides.map((s, i) => (isInter(s) ? i : -1)).filter((i) => i >= 0);
  if (interIdxs.length === 0) return slides;
  // Already contiguous immediately before Thanksgiving → leave as-is.
  const lastInter = interIdxs[interIdxs.length - 1];
  if (lastInter === thanksIdx - 1 && interIdxs[0] === thanksIdx - interIdxs.length) return slides;
  const interSet = new Set(interIdxs);
  const interBlock = interIdxs.map((i) => slides[i]);
  const rest = slides.filter((_, i) => !interSet.has(i));
  const newThanksIdx = rest.findIndex((s) => s.type === "general_thanksgiving");
  return [...rest.slice(0, newThanksIdx), ...interBlock, ...rest.slice(newThanksIdx)];
}

function buildBookSections(slides: Slide[]): BookSection[] {
  const sections: BookSection[] = [];

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    switch (s.type) {
      case "opening":
      case "opening_sentence": {
        sections.push({ key: s.id, label: "The Opening Sentence", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "confession": {
        sections.push({ key: s.id, label: "The Confession", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "psalm_title": {
        // A psalm block: the title slide plus its verse chunks (and the
        // sealing Gloria). Two flavors — the invitatory (Venite /
        // Jubilate / Pascha Nostrum / Phos hilaron) and the appointed
        // psalms of the day.
        const meta = s.metadata as { invitatory?: unknown; psalmHeadline?: unknown } | undefined;
        const isInvitatory = meta?.invitatory === true;
        const headline =
          typeof meta?.psalmHeadline === "string" && meta.psalmHeadline.length > 0
            ? meta.psalmHeadline
            : bookTitleCase(s.eyebrow || "Psalm");
        let ref: string | null = s.bcpReference;
        let latin: string | null = s.title;
        // Capture the antiphon (its own line below the psalm) instead of letting
        // it fold silently into the psalm block.
        let antiphonRef: string | null = null;
        let antiphonText: string | null = null;
        let sawAntiphon = false;
        let j = i + 1;
        while (
          j < slides.length &&
          (slides[j].type === "psalm" || slides[j].type === "invitatory_psalm" || slides[j].type === "psalm_gloria" || (slides[j].type as string) === "antiphon")
        ) {
          if ((slides[j].type as string) === "antiphon") {
            sawAntiphon = true;
            if (!antiphonRef && slides[j].bcpReference) antiphonRef = slides[j].bcpReference;
            // Antiphon text ships in `content` (the slide() body arg), not
            // `title` — read either so the card isn't a bare header.
            if (!antiphonText && (slides[j].title || slides[j].content)) antiphonText = slides[j].title || slides[j].content;
          } else {
            if (!ref && slides[j].bcpReference) ref = slides[j].bcpReference;
            if (!latin && slides[j].title) latin = slides[j].title;
          }
          j++;
        }
        i = j - 1;
        // Morning Prayer's Venite has the Jubilate (Ps 100) as its appointed
        // alternative — note it so a reader can choose either at the book.
        const invitatoryDetail = headline.includes("Venite") ? `${headline} · or the Jubilate` : headline;
        // The antiphon is said BEFORE the psalm (and repeated after it), so it
        // LEADS the psalm block in the guide — not trails it. Tell the reader the
        // antiphon itself when we have the text; either way the page badge + the
        // section label point them to it in the book.
        if (sawAntiphon) {
          sections.push({
            key: `${s.id}-antiphon`,
            label: isInvitatory ? "The Invitatory Antiphon" : "The Antiphon",
            detail: antiphonText
              ? `“${antiphonText.replace(/^[“"]|[”"]$/g, "")}” — said before the psalm, then repeated after.`
              : "Said before the psalm, then repeated after it.",
            // The antiphon is printed with the psalm — fall back to the psalm's
            // page when the antiphon slide carries no page of its own, so the
            // reader always knows where to look.
            page: bookPageRef(antiphonRef, ref),
            readUrl: null,
          });
        }
        sections.push({
          key: s.id,
          label: isInvitatory ? "The Invitatory" : "The Psalms Appointed",
          // On multi-psalm days the server stamps both eyebrow and title to the
          // same string ("PSALMS 75 & 76" / "Psalms 75 & 76"), which used to
          // render "Psalms 75 & 76 · Psalms 75 & 76" — the psalms listed twice.
          // Only append the Latin incipit when it actually adds information.
          detail: isInvitatory
            ? invitatoryDetail
            : latin && bookTitleCase(latin) !== headline
              ? `${headline} · ${latin}`
              : headline,
          page: bookPageRef(ref),
          readUrl: null,
        });
        break;
      }
      case "lesson_title":
      case "lesson": {
        // Lessons are read from the user's own Bible — the card carries
        // the citation plus the read-online fallback the slide ships. Lessons
        // now ship as a single `lesson_title` slide (no separate body), so the
        // book guide reads the citation off that too — otherwise the lectionary
        // reading was silently dropped from the physical-book guide.
        const lmeta = s.metadata as { readUrl?: unknown } | undefined;
        sections.push({
          key: s.id,
          label: bookTitleCase(s.eyebrow || "Lesson"),
          detail: s.title,
          page: null,
          readUrl: typeof lmeta?.readUrl === "string" ? lmeta.readUrl : null,
        });
        break;
      }
      case "canticle_title":
      case "canticle": {
        // MP emits a title card + verse slides; EP pushes canticle
        // slides directly (Phos hilaron, the Magnificat). Either way,
        // collapse the run into one card.
        const cmeta = s.metadata as { canticleHeadline?: unknown } | undefined;
        const headline = typeof cmeta?.canticleHeadline === "string" ? cmeta.canticleHeadline : null;
        let ref: string | null = s.bcpReference;
        let name: string | null = s.title;
        let j = i + 1;
        while (j < slides.length && slides[j].type === "canticle") {
          if (!ref && slides[j].bcpReference) ref = slides[j].bcpReference;
          if (!name && slides[j].title) name = slides[j].title;
          j++;
        }
        i = j - 1;
        // Some canticle titles already lead with their number
        // ("Canticle 11 — The Third Song of Isaiah") — don't prefix
        // the headline a second time.
        const detail =
          headline && name
            ? name.startsWith(headline) ? name : `${headline} · ${name}`
            : headline ?? name;
        sections.push({
          key: s.id,
          label: "The Canticle",
          detail,
          page: bookPageRef(ref),
          readUrl: null,
        });
        break;
      }
      case "creed": {
        let j = i + 1;
        while (j < slides.length && slides[j].type === "creed") j++;
        i = j - 1;
        sections.push({ key: s.id, label: "The Apostles' Creed", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "lords_prayer": {
        sections.push({ key: s.id, label: "The Lord's Prayer", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "suffrages": {
        let j = i + 1;
        while (j < slides.length && slides[j].type === "suffrages") j++;
        i = j - 1;
        // A suffrages-typed slide after the General Thanksgiving is the
        // closing versicle ("Let us bless the Lord"), not the Suffrages
        // proper — label it for what the reader will find on that page.
        const afterThanksgiving = sections.some((sec) => sec.label === "The General Thanksgiving");
        sections.push({
          key: s.id,
          label: afterThanksgiving ? "The Closing Versicle" : "The Suffrages",
          detail: null,
          page: bookPageRef(s.bcpReference),
          readUrl: null,
        });
        break;
      }
      case "collect": {
        sections.push({
          key: s.id,
          label: bookTitleCase(s.eyebrow || "The Collect"),
          detail: s.title,
          page: bookPageRef(s.bcpReference),
          readUrl: null,
        });
        break;
      }
      case "prayer_for_mission": {
        sections.push({ key: s.id, label: "A Prayer for Mission", detail: s.title, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "general_thanksgiving": {
        let j = i + 1;
        while (j < slides.length && slides[j].type === "general_thanksgiving") j++;
        i = j - 1;
        sections.push({ key: s.id, label: "The General Thanksgiving", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "closing": {
        let j = i + 1;
        while (j < slides.length && slides[j].type === "closing") j++;
        i = j - 1;
        sections.push({ key: s.id, label: "The Closing", detail: null, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      case "invitatory_psalm": {
        // A LONE invitatory psalm with no preceding `psalm_title` — this is
        // Evening Prayer / Evening Devotion's Phos hilaron ("O Gracious
        // Light"), which the assembler emits as a bare invitatory_psalm. (In
        // Morning Prayer the invitatory always has a psalm_title, so its
        // verses are consumed by that run and never reach here.) Without this
        // case, the Hymn of Light was silently dropped from the book guide.
        const pmeta = s.metadata as { psalmHeadline?: unknown } | undefined;
        const phHeadline =
          typeof pmeta?.psalmHeadline === "string" && pmeta.psalmHeadline.length > 0
            ? pmeta.psalmHeadline
            : bookTitleCase(s.eyebrow || "The Invitatory");
        let j = i + 1;
        while (j < slides.length && (slides[j].type === "invitatory_psalm" || slides[j].type === "psalm_gloria")) j++;
        i = j - 1;
        sections.push({ key: s.id, label: "The Invitatory", detail: phHeadline, page: bookPageRef(s.bcpReference), readUrl: null });
        break;
      }
      default:
        // A standalone antiphon not absorbed by a psalm block — Compline's
        // antiphon bracketing the Nunc Dimittis ("Guide us waking…"). The
        // book prints it before and after the canticle; one card is enough
        // (the trailing repeat is collapsed by the dedup pass below).
        // ("antiphon" isn't in the client SlideType union, so it's matched
        // here as a string rather than a switch case.)
        if ((s.type as string) === "antiphon") {
          const aText = s.title || s.content || null;
          sections.push({ key: s.id, label: "The Antiphon", detail: aText, page: bookPageRef(s.bcpReference), readUrl: null });
          break;
        }
        // Intercessions — no page number (not a paper-book section), but
        // it IS a real slide in the digital deck, so Skip Ahead (which
        // shares this list) needs a row to jump to it. PhysicalBookGuide,
        // the other consumer of this list, filters this entry back out —
        // it already shows a dedicated, richer intercessions card (with
        // the live count + a "Pray now" handoff) rather than a plain row.
        // Owner: "intercession is not listed... it should be in offices."
        if ((s.type as string) === "intercessions_portal" || (s.type as string) === "intercessions") {
          let j = i + 1;
          while (j < slides.length && ((slides[j].type as string) === "intercessions_portal" || (slides[j].type as string) === "intercessions")) j++;
          i = j - 1;
          sections.push({ key: s.id, label: "The Prayers of the People", detail: "Community intercessions", page: null, readUrl: null });
          break;
        }
        // office_intro, invitatory versicle, absolution, doxology,
        // portals — all either fold into a neighboring section's pages or
        // have no place in a paper book.
        break;
    }
  }

  // Collapse accidental doubles (e.g. an opening sentence emitted as
  // both "opening" and "opening_sentence" types) — same label back to
  // back with no new page information reads as a glitch.
  const deduped: BookSection[] = [];
  for (const sec of sections) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.label === sec.label && (!sec.page || prev.page === sec.page)) continue;
    // The Antiphon is printed before AND after Compline's Nunc Dimittis — same
    // text and page, with the canticle card between. Keep only the first so the
    // guide doesn't repeat it (the reader sees it's repeated at the book).
    if (sec.label === "The Antiphon" && deduped.some((d) => d.label === "The Antiphon" && d.page === sec.page)) continue;
    deduped.push(sec);
  }
  return deduped;
}

// SkipAheadSheet — "another bar under [Listen to Office] that says skip
// ahead... pull up the list of the different parts of the offices like
// it's the physical BCP list. But when you click on it, it would go to
// that slide in the office." Reuses buildBookSections (the exact section
// list the physical-book guide shows) rather than a second parallel
// implementation, but each row jumps the live slideshow to that slide
// (via the section's slide id) instead of just naming a page number.
/**
 * The canticle / invitatory picker — deliberately the same drop-down-from-
 * the-top sheet as Skip Ahead (owner: "a dropdown with all the options in a
 * similar UI to the skip ahead"), so the office has ONE shape for "pick from
 * a list", not two that look almost alike.
 */
type SwapOption = { key: string; label: string; latin: string; ref: string };

/**
 * "Canticle 8" from the key `canticle_8` (or `canticle_8_rite1`).
 *
 * The number is how the prayer book indexes these and how people ask for them,
 * but it lived only inside the key. Returns "" for the invitatories, which are
 * named (Venite, Jubilate) and carry no canticle number.
 */
function canticleNumberLabel(key: string): string {
  const m = /^canticle_(\d+)/.exec(key);
  return m ? `Canticle ${m[1]}` : "";
}

function SwapSheet({
  open, busy, onClose, onPick, currentKey,
}: {
  open: null | "canticle" | "invitatory";
  busy: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
  currentKey: string;
}) {
  const { data } = useQuery<{ canticles: SwapOption[]; invitatories: SwapOption[] }>({
    queryKey: ["/api/office/swap-options"],
    queryFn: () => apiRequest("GET", "/api/office/swap-options"),
    staleTime: 24 * 60 * 60_000,
  });
  const options = open === "canticle" ? (data?.canticles ?? []) : open === "invitatory" ? (data?.invitatories ?? []) : [];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="swap-sheet"
          className="fixed inset-0"
          style={{ zIndex: 80, background: "rgba(4,12,7,0.6)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-b-3xl px-5 pb-6"
            style={{
              background: "#0c1f13",
              borderBottom: "1px solid rgba(46,107,64,0.4)",
              paddingTop: "max(1.25rem, var(--safe-top))",
              maxWidth: 560, margin: "0 auto",
              maxHeight: "85dvh", display: "flex", flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
              <p style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600 }}>
                {open === "canticle" ? "Choose a canticle" : "Choose an invitatory"}
              </p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,107,64,0.25)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, opacity: busy ? 0.5 : 1 }}>
              {options.map((o) => {
                const isCurrent = o.key === currentKey;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={busy}
                    onClick={() => { if (!isCurrent) onPick(o.key); else onClose(); }}
                    style={{
                      textAlign: "left", padding: "12px 14px", borderRadius: 14,
                      background: isCurrent ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.10)",
                      border: `1px solid ${isCurrent ? "rgba(140,195,160,0.5)" : BORDER}`,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {/* Owner: "these should list the canticle number" and "the
                        english name first, not the latin." People look for a
                        canticle by its number and know it by its English name;
                        the Latin incipit is how the book labels it, so it keeps
                        its place — just not the headline. */}
                    <p style={{ margin: 0, color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600 }}>
                      {o.label}{isCurrent ? "  ·  today's" : ""}
                    </p>
                    <p style={{ margin: "2px 0 0", color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 12.5 }}>
                      {[canticleNumberLabel(o.key), o.latin, o.ref].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SkipAheadSheet({
  open, onClose, slides, onJump,
}: { open: boolean; onClose: () => void; slides: Slide[]; onJump: (key: string) => void }) {
  const sections = useMemo(() => buildBookSections(slides), [slides]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="skip-ahead"
          className="fixed inset-0"
          style={{ zIndex: 80, background: "rgba(4,12,7,0.6)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-b-3xl px-5 pb-6"
            style={{
              background: "#0c1f13",
              borderBottom: "1px solid rgba(46,107,64,0.4)",
              paddingTop: "max(1.25rem, var(--safe-top))",
              maxWidth: 560, margin: "0 auto",
              maxHeight: "85dvh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
              <p style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600 }}>Skip Ahead</p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,107,64,0.25)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {sections.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => onJump(sec.key)}
                  className="w-full text-left flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(143,175,150,0.3)", cursor: "pointer" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="block" style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600 }}>{sec.label}</span>
                    {sec.detail && (
                      <span className="block" style={{ color: MUTED_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11.5, marginTop: 2 }}>{sec.detail}</span>
                    )}
                  </div>
                  {sec.page && (
                    <span style={{ flexShrink: 0, background: "rgba(166,124,82,0.18)", border: "1px solid rgba(166,124,82,0.45)", color: "#E8D5BC", borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700, fontFamily: SPACE_GROTESK, whiteSpace: "nowrap" }}>
                      {sec.page}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Return the guide string. {name} tokens in the string are replaced from
// vars. (The app is English-only.)
function bcpGuideText(en: string, vars?: Record<string, string | number>): string {
  let out = en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}

function PhysicalBookGuide(props: {
  slides: Slide[];
  officeTitle: string;
  mode: LiturgyMode;
  dayLabel: string;
  intercessionCount: number;
  playerDocked: boolean;
  showIntercessions: boolean;
  alreadyDoneToday: boolean;
  onClose: () => void;
  onPrayIntercessions: () => void;
  onMarkPrayed: () => void;
}) {
  const display = useOfficeDisplay();
  const { slides, officeTitle, mode, dayLabel, intercessionCount, playerDocked, showIntercessions, alreadyDoneToday, onClose, onPrayIntercessions, onMarkPrayed } = props;
  // Keep the screen awake while reading the page-number guide — you pray
  // from the open book with the phone set down, so it must not sleep.
  useKeepAwake(true);
  // Exclude "The Prayers of the People" here — this guide already shows a
  // dedicated, richer intercessions card below (live count + "Pray now"
  // handoff); SkipAheadSheet, the digital deck's own sibling consumer of
  // buildBookSections, wants that row (it has no equivalent card), so the
  // exclusion happens here rather than in buildBookSections itself.
  const sections = useMemo(() => buildBookSections(slides).filter((s) => s.label !== "The Prayers of the People"), [slides]);
  const startPage = MODE_START_PAGE[mode];
  const isFullOffice = mode === "morning" || mode === "evening";
  // A calm leaf behind the guide (like the office slideshow), picked once.
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Frosted-glass section cards — the leaf blurs through a faint dark tint.
  const cardStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "rgba(var(--ot-deep, 9,26,16), 0.297)",
    backdropFilter: "blur(11.34px)",
    WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(var(--ot-mist, 200,212,192),0.16)",
    borderRadius: 16,
    padding: "14px 16px",
  };
  const labelStyle: CSSProperties = {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: WARM_TEXT,
    fontFamily: SPACE_GROTESK,
  };
  const detailStyle: CSSProperties = {
    margin: "3px 0 0",
    fontSize: 13,
    lineHeight: 1.5,
    color: MUTED_GREEN,
    fontFamily: SPACE_GROTESK,
  };
  const badgeStyle: CSSProperties = {
    flexShrink: 0,
    background: "rgba(var(--ot-brown, 166,124,82),0.18)",
    border: "1px solid rgba(var(--ot-brown, 166,124,82),0.45)",
    color: "var(--oh-cream, #E8D5BC)",
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: SPACE_GROTESK,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        // Typeface + (for Paper) the light letter-paper theme — CSS custom
        // properties every swept color var() in this deck resolves against.
        ...officeThemeStyle(display.backdrop, display.font),
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
      {leafBg ? (
        <>
          <img src={leafBg} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.6, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash, 8,22,15),0.55) 0%, rgba(var(--ot-wash, 8,22,15),0.7) 45%, rgba(var(--ot-wash, 8,22,15),0.84) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
      )}
      {/* Top bar mirrors the slide deck's chrome; Back returns to the
          slides (never exits the office — that lives on the intro slide). */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
            paddingTop: "max(1.5rem, var(--safe-top))",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
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
          {/* Quick log — same action as the big button at the bottom, up here so
              you can mark it the moment you finish without scrolling. */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onMarkPrayed}
              style={{
                background: "rgba(var(--ot-green, 46,107,64),0.55)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                border: "1px solid rgba(var(--ot-fern, 168,197,160),0.5)", color: WARM_TEXT,
                borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700,
                letterSpacing: "0.04em", cursor: "pointer", fontFamily: SPACE_GROTESK,
              }}
            >
              ✓ {bcpGuideText("Log")}
            </button>
          </div>
        </div>
      </header>

      <main
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: "max(76px, calc(var(--safe-top) + 42px))",
          paddingBottom: playerDocked
            ? "calc(env(safe-area-inset-bottom) + 176px)"
            : "calc(env(safe-area-inset-bottom) + 64px)",
        }}
      >
        <div className="max-w-2xl w-full mx-auto" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Owner: when Physical is your preset and Morning/Evening Prayer
              opens straight to this page guide, offer a clearly-labeled way
              back into the app's own slideshow — "← Back" at the top reads
              as exiting, not "switch view." */}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{
              background: "rgba(var(--ot-green, 46,107,64),0.16)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.35)",
              color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, padding: "12px 18px", cursor: "pointer", marginBottom: 4,
            }}
          >
            📖 {bcpGuideText("Enter Digital Slideshow")} <span aria-hidden>→</span>
          </button>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <p style={{ color: FAINT_GREEN, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>
              {bcpGuideText("Physical BCP")}
            </p>
            <h1
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: "clamp(30px, 6vw, 44px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: WARM_TEXT,
                margin: "8px 0 4px",
                lineHeight: 1.05,
              }}
            >
              {bcpGuideText(officeTitle)}
            </h1>
            {dayLabel && (
              <p style={{ margin: "0 0 2px", fontSize: 14, color: MUTED_GREEN }}>{dayLabel}</p>
            )}
            <p style={{ margin: 0, fontSize: 12, color: FAINT_GREEN }}>
              {bcpGuideText(isFullOffice ? "1979 Book of Common Prayer · Rite II" : "1979 Book of Common Prayer")}
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 14,
                background: "rgba(var(--ot-brown, 166,124,82),0.18)",
                border: "1px solid rgba(var(--ot-brown, 166,124,82),0.45)",
                borderRadius: 999,
                padding: "8px 18px",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--oh-cream, #E8D5BC)",
              }}
            >
              📕 {bcpGuideText("Begin at {page}", { page: startPage })}
            </div>
          </div>

          {(() => {
            // Weave the Intercessions card into liturgical order — the prayers
            // of the people fall just BEFORE the General Thanksgiving in the
            // office (BCP). Falls back to the end if there's no Thanksgiving
            // section (e.g. the Devotions).
            const thanksIdx = sections.findIndex((s) => s.label === "The General Thanksgiving");
            const sectionCard = (sec: BookSection) => (
              <div key={sec.key} style={cardStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={labelStyle}>{bcpGuideText(sec.label)}</p>
                  {sec.detail && <p style={detailStyle}>{sec.detail}</p>}
                  {sec.readUrl && (
                    <button
                      type="button"
                      onClick={() => openExternal(sec.readUrl as string)}
                      style={{
                        marginTop: 6,
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--oh-fern, #A8C5A0)",
                        cursor: "pointer",
                        fontFamily: SPACE_GROTESK,
                      }}
                    >
                      {bcpGuideText("Read it here instead ↗")}
                    </button>
                  )}
                </div>
                {sec.page ? (
                  <span style={badgeStyle}>{sec.page}</span>
                ) : sec.readUrl ? (
                  <span style={{ ...badgeStyle, background: "rgba(var(--ot-green, 46,107,64),0.18)", border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)", color: "var(--oh-pale, #CFE3C8)" }}>
                    {bcpGuideText("your Bible")}
                  </span>
                ) : null}
              </div>
            );
            // Opens the prayer-mode slideshow and returns to the book.
            const intercessionsCard = (
              <button
                key="__intercessions__"
                type="button"
                onClick={onPrayIntercessions}
                style={{ ...cardStyle, width: "100%", textAlign: "left", cursor: "pointer", background: "rgba(var(--ot-green, 46,107,64),0.20)", border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={labelStyle}>{bcpGuideText("The Intercessions")}</p>
                  <p style={detailStyle}>
                    {intercessionCount > 0
                      ? bcpGuideText("{count} waiting for your prayers — pray them here, then return to your book", { count: intercessionCount })
                      : bcpGuideText("Pray for your people — one at a time, then return to your book")}
                  </p>
                </div>
                <span style={{ flexShrink: 0, fontSize: 18 }}>🕊️ →</span>
              </button>
            );
            const out: React.ReactNode[] = [];
            let placed = false;
            sections.forEach((sec, i) => {
              // Intercessions come right before the General Thanksgiving.
              if (showIntercessions && !placed && i === thanksIdx) { out.push(intercessionsCard); placed = true; }
              out.push(sectionCard(sec));
            });
            // No Thanksgiving section (e.g. the Devotions) — append at the end.
            if (showIntercessions && !placed) out.push(intercessionsCard);
            return out;
          })()}

          <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.6, color: FAINT_GREEN, textAlign: "center" }}>
            {bcpGuideText("The Psalter begins at p. 585. Lessons are read from your own Bible.")}
          </p>

          {/* Completion — the physical pray-er's Amen. Logs the office to
              today's practice exactly like finishing the slideshow. */}
          <button
            type="button"
            onClick={onMarkPrayed}
            style={{
              marginTop: 10,
              width: "100%",
              background: BUTTON_BG,
              color: WARM_TEXT,
              border: "none",
              borderRadius: 16,
              padding: "16px 20px",
              fontSize: 17,
              fontWeight: 700,
              fontFamily: SPACE_GROTESK,
              cursor: "pointer",
            }}
          >
            {bcpGuideText("🙏 I prayed this office")}
          </button>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: FAINT_GREEN, textAlign: "center" }}>
            {alreadyDoneToday
              ? bcpGuideText("✓ Already logged today — praying it again still counts toward your rhythm.")
              : bcpGuideText("Counts toward today's practice — your rhythm, your streak, and the day's reminders.")}
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Full-office card with a "way to pray" dropdown ──────────────────────────
// One card per side (Morning Prayer / Evening Prayer) that folds the four
// ways to pray — read along, from your physical book, listen, watch — into
// a single card with a method picker at the bottom, preset to the user's
// saved per-side preference. Tapping the card begins the office the chosen
// way; changing the dropdown also saves it as the default (so the chooser
// and the office customizer stay in sync). Mirrors the office chrome's
// green palette so it reads as part of the same picker.
const OFFICE_METHOD_META: Record<DefaultOfficeEntry, { emoji: string; label: string; sub: (side: OfficeSide) => string }> = {
  read: { emoji: "📖", label: "Digital Slideshow", sub: () => "The full text, at your own pace" },
  venite: { emoji: "🕊️", label: "Venite Digital", sub: () => "Today's office on venite.app, in your browser" },
  book: { emoji: "📕", label: "Physical BCP", sub: () => "Today's page numbers for your physical Prayer Book" },
  listen: { emoji: "🎧", label: "Listen", sub: (s) => `${s === "morning" ? "Morning" : "Evening"} Prayer read aloud · Forward Movement` },
  watch: { emoji: "📺", label: "Watch", sub: () => "National Cathedral · live 7 AM ET weekdays" },
};

function OfficeMethodCard(props: {
  side: OfficeSide;
  title: string;
  weekday: boolean;
  now: boolean;
  isDefault: boolean;
  onLaunch: (method: DefaultOfficeEntry) => void;
}) {
  const { side, title, weekday, now, isDefault, onLaunch } = props;
  // Watch is Morning-only (the Cathedral streams morning prayer) and
  // weekday-only (no weekend broadcast). Everything else applies to both.
  const methods: DefaultOfficeEntry[] = [
    "book",
    "read",
    // Third, right after the digital slideshow (owner).
    ...(canPrayOnVenite(side) ? (["venite"] as const) : []),
    "listen",
    ...(side === "morning" && weekday ? (["watch"] as const) : []),
  ];
  // Initialize from the saved preference, clamped to a method that's
  // actually offered here (e.g. a "watch" default on a weekend, or on the
  // evening side, falls back to "read").
  const [method, setMethod] = useState<DefaultOfficeEntry>(() => {
    const saved = getSideEntry(side);
    return methods.includes(saved) ? saved : "read";
  });
  const meta = OFFICE_METHOD_META[method];

  return (
    <div
      className="w-full rounded-2xl overflow-hidden flex"
      style={{
        // Match the home cards: a colored left accent bar, a very slight
        // vertical gradient, and a slightly stronger border.
        background: now
          ? "linear-gradient(180deg, rgba(var(--ot-green, 46,107,64),0.14) 0%, rgba(var(--ot-green, 46,107,64),0.24) 100%)"
          : "linear-gradient(180deg, rgba(var(--ot-green, 46,107,64),0.08) 0%, rgba(var(--ot-green, 46,107,64),0.17) 100%)",
        border: isDefault ? "2px solid var(--oh-fern, #A8C5A0)" : `1px solid ${now ? "rgba(var(--ot-green, 46,107,64),0.45)" : "rgba(var(--ot-green, 46,107,64),0.30)"}`,
      }}
    >
      <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(var(--ot-green, 46,107,64),0.9)" }} />
      <div className="flex-1 min-w-0">
      <button
        type="button"
        onClick={() => onLaunch(method)}
        className="w-full text-left p-5 transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <span className="text-3xl">{meta.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base" style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
              {title}
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--oh-sage, #8FAF96)" }}>
              Rite II · {meta.sub(side)}
            </p>
            {isDefault
              ? <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--oh-fern, #A8C5A0)" }}>Your default</p>
              : now && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--oh-green, #6FAF85)" }}>Available now</p>}
          </div>
          <span className="text-sm" style={{ color: "var(--oh-sage, #8FAF96)" }}>→</span>
        </div>
      </button>
      {/* Method picker — a native select so iOS shows its wheel. Kept
          OUTSIDE the launch button (nested interactive elements are
          invalid) as a footer row. Changing it saves the per-side
          preference too. */}
      <label
        className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer"
        style={{ borderTop: "1px solid rgba(var(--ot-green, 46,107,64),0.22)", background: "rgba(var(--ot-deep, 9,26,16), 0.275)" }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(var(--ot-sage, 143,175,150),0.7)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
          How to pray
        </span>
        <select
          value={method}
          onChange={(e) => {
            const v = e.target.value as DefaultOfficeEntry;
            setMethod(v);
            setSideEntry(side, v); // persist as the new default for this side
          }}
          className="text-sm font-semibold rounded-lg px-3 py-1.5"
          style={{
            color: "var(--oh-ink, #F0EDE6)",
            fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)",
            background: "rgba(var(--ot-green, 46,107,64),0.22)",
            border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)",
            // Let the native control own its disclosure chrome.
            appearance: "auto",
          }}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {OFFICE_METHOD_META[m].emoji}  {OFFICE_METHOD_META[m].label}
            </option>
          ))}
        </select>
      </label>
      </div>
    </div>
  );
}

// ── Devotion method card ─────────────────────────────────────────────────────
// The short Daily Devotion sibling of OfficeMethodCard. Same chrome (home-style
// left bar + "How to pray" dropdown), but the devotion's own methods: the
// Digital Slideshow, the Physical BCP page, and (Morning only, weekdays) the
// St. John's "Morning Devotion" video. No saved-default persistence — the
// office method storage is per-side and belongs to the full office.
const DEVOTION_METHOD_META: Record<"read" | "book" | "watch", { emoji: string; label: string; sub: string }> = {
  read: { emoji: "📖", label: "Digital Slideshow", sub: "The short devotion, at your own pace" },
  book: { emoji: "📕", label: "Physical BCP", sub: "Today's page in your physical Prayer Book" },
  watch: { emoji: "📺", label: "Watch", sub: "St. John's · Morning Devotion with Dean Kate" },
};

function DevotionMethodCard(props: {
  mode: "morning-devotion" | "early-evening-devotion";
  emoji: string;
  title: string;
  page: string;          // "BCP p. 137"
  weekday: boolean;
  now: boolean;
  isDefault: boolean;
  onLaunch: (method: "read" | "book" | "watch") => void;
}) {
  const { mode, emoji, title, page, weekday, now, isDefault, onLaunch } = props;
  const methods: Array<"read" | "book" | "watch"> = [
    "read",
    "book",
    // Watch is the morning devotion only (St. John's posts weekdays).
    ...(mode === "morning-devotion" && weekday ? (["watch"] as const) : []),
  ];
  const [method, setMethod] = useState<"read" | "book" | "watch">("read");
  const meta = DEVOTION_METHOD_META[method];
  const sub = method === "read" ? `A short devotion · ${page}` : meta.sub;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden flex"
      style={{
        background: now
          ? "linear-gradient(180deg, rgba(var(--ot-green, 46,107,64),0.14) 0%, rgba(var(--ot-green, 46,107,64),0.24) 100%)"
          : "linear-gradient(180deg, rgba(var(--ot-green, 46,107,64),0.08) 0%, rgba(var(--ot-green, 46,107,64),0.17) 100%)",
        border: isDefault ? "2px solid var(--oh-fern, #A8C5A0)" : `1px solid ${now ? "rgba(var(--ot-green, 46,107,64),0.45)" : "rgba(var(--ot-green, 46,107,64),0.30)"}`,
      }}
    >
      <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(var(--ot-green, 46,107,64),0.9)" }} />
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onLaunch(method)}
          className="w-full text-left p-5 transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">{method === "read" ? emoji : meta.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base" style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>{title}</p>
              <p className="text-sm mt-0.5" style={{ color: "var(--oh-sage, #8FAF96)" }}>{sub}</p>
              {isDefault
                ? <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--oh-fern, #A8C5A0)" }}>Your default</p>
                : now && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--oh-green, #6FAF85)" }}>Available now</p>}
            </div>
            <span className="text-sm" style={{ color: "var(--oh-sage, #8FAF96)" }}>→</span>
          </div>
        </button>
        <label
          className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer"
          style={{ borderTop: "1px solid rgba(var(--ot-green, 46,107,64),0.22)", background: "rgba(var(--ot-deep, 9,26,16), 0.275)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(var(--ot-sage, 143,175,150),0.7)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
            How to pray
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as "read" | "book" | "watch")}
            className="text-sm font-semibold rounded-lg px-3 py-1.5"
            style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", background: "rgba(var(--ot-green, 46,107,64),0.22)", border: "1px solid rgba(var(--ot-green, 46,107,64),0.45)", appearance: "auto" }}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {DEVOTION_METHOD_META[m].emoji}  {DEVOTION_METHOD_META[m].label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  // All five liturgies live behind this one picker now (the Daily
  // Devotions menu entry was folded in). null = show the chooser.
  const [showMode, setShowMode] = useState<LiturgyMode | null>(null);
  // True when the user picked an "In your book" row — the viewer opens
  // on the physical-book page guide instead of the slide deck.
  const [showBook, setShowBook] = useState(false);
  // True when arriving from the way-to-pray chooser (?picked=1) — the viewer
  // then drops its own "way to pray" dropdowns instead of asking again (the
  // user already chose). Mirrors the daily-devotions page.
  const [cameFromPicker, setCameFromPicker] = useState(false);
  // When the picker's Begin launches a slide-deck office, skip the office's own
  // welcome slide (the picker already served that role) by starting at slide 1.
  const [startSlide, setStartSlide] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Auto-resume the viewer when /prayer-mode hands the user back here
  // with ?mode=… — keeps the intercessions handoff seamless instead of
  // dumping them on the picker mid-liturgy. Accepts all five modes.
  // Compline is beta-gated; a non-beta user hitting ?mode=compline
  // (shared link, bookmark) gets bounced to the picker rather than
  // mounted on an endpoint that would 403 them mid-load.
  useEffect(() => {
    if (betaLoading) return;
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    // Came from the chooser → the viewer won't re-ask "how do you want to pray".
    setCameFromPicker(search.get("picked") === "1");
    if (mode === "compline") {
      if (rawIsBeta) {
        setShowMode("compline");
      } else {
        // Drop the stale ?mode=compline so a non-beta user landing
        // on this URL (shared link / bookmark from a beta friend)
        // doesn't see "?mode=compline" lingering in the URL bar
        // while the chooser is rendered, and so a later effect
        // re-read can't accidentally remount the viewer if deps
        // change.
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }
    if (
      mode === "morning" ||
      mode === "evening" ||
      mode === "morning-devotion" ||
      mode === "early-evening-devotion"
    ) {
      // Apply the user's default "way to pray" preference for full offices.
      // Devotions and Compline always open as text; only full Morning/Evening
      // Prayer respect the listen/watch default. Seamless returns (mid-office
      // handoff from prayer-mode) always resume in read mode regardless of
      // the default — the user is already mid-slideshow.
      const seamlessReturn = search.has("seamlessReturn") || search.has("slide");
      if (!seamlessReturn && (mode === "morning" || mode === "evening")) {
        // Per-side "way to pray" (Morning/Evening split) — falls back to the
        // shared default when this side has no override.
        const pref = getSideEntry(mode);
        if (pref === "listen") {
          setLocation(`/podcast/${mode}-office`);
          return;
        }
        // Venite deliberately does NOT auto-launch here. Owner: "make sure
        // it goes to the office intro slide before it goes to that venite
        // page." It used to hand straight off to venite.app, which meant
        // tapping your office threw you out of the app with no threshold — no
        // chance to see what today is, switch the way you're praying, or just
        // arrive. Falling through to setShowMode(mode) lands on the "before you
        // begin" slide with "Venite Digital" already selected as the How (the
        // prayMethod initializer reads the same pref), so Begin is the tap that
        // leaves. One extra tap, and the office keeps its front door.
        // The Cathedral only broadcasts Mon–Fri, so a "watch" default on a
        // weekend falls through to the text office (nothing to watch live).
        const isWeekday = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5; })();
        if (pref === "watch" && mode === "morning" && isWeekday) {
          setLocation("/ncmp/watch");
          return;
        }
        // "watch" + "evening" falls through to the text office (no evening
        // broadcast equivalent — the Cathedral only streams morning prayer).
        // "book" (physical BCP) also falls through — OfficeViewer reads the
        // same per-side pref and opens its page-number guide instead of the
        // slide deck.
      }
      setShowMode(mode);
    }
  }, [betaLoading, rawIsBeta]);

  // ── "Before you begin" builder state (the Daily Office landing now reads as
  // an office's opening slide: Time of day · Practice · How → Begin). ──
  const __h = new Date().getHours();
  const [todPick, setTodPick] = useState<OfficeSide>(__h >= 14 && __h < 20 ? "evening" : "morning");
  // The Practice the landing opens on, seeded from this side's saved level —
  // "psalms" (Praying the Psalms) and "full" (the office) round-trip through
  // getSideLevel; everything else reads as the short devotion.
  type Practice = "devotion" | "full" | "psalms";
  const practiceForLevel = (lvl: string | null): Practice =>
    lvl === "psalms" ? "psalms" : lvl === "office" ? "full" : "devotion";
  const [practicePick, setPracticePick] = useState<Practice>(
    () => practiceForLevel(getSideLevel(__h >= 14 ? "evening" : "morning")),
  );
  const [methodPick, setMethodPick] = useState<DefaultOfficeEntry>("read");
  // A leaf behind the landing, matching the office slideshow's leaf field.
  const landingLeaf = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  // Time-of-day flags driving which card highlights "Available now".
  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isNight = hour >= 20;
  // Weekday flag for the National Cathedral Morning Prayer broadcast
  // (Mon–Fri 7 AM ET). Gates the "Watch" option in the Morning Prayer
  // method dropdown — there's no weekend broadcast to watch.
  const weekday = (() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5;
  })();

  if (isLoading || betaLoading || !user) return null;

  if (showMode) {
    return (
      <OfficeViewer
        mode={showMode}
        initialBook={showBook}
        initialSlide={startSlide}
        cameFromPicker={cameFromPicker}
        onBack={() => { setShowMode(null); setShowBook(false); setCameFromPicker(false); setStartSlide(0); setLocation("/dashboard"); }}
      />
    );
  }

  // Evening = the afternoon window 14:00–20:00; Compline owns the
  // 20:00+ block so the two don't both highlight "Available now" at
  // the same time.
  const isEvening = hour >= 14 && !isNight;

  type OfficeOption = {
    mode?: LiturgyMode;     // in-page office (setShowMode)
    navigateTo?: string;    // OR a route to navigate to
    emoji: string;
    label: string;
    sub: string;
    now: boolean;
  };
  // The chooser is grouped by TIME OF DAY (Morning / Evening). Each block
  // is the short Devotion, then ONE full-office card whose "way to pray"
  // (read / book / listen / watch) is chosen from a dropdown at the
  // bottom — preset to the user's saved preference — so the four ways
  // collapse into a single card instead of four. Compline closes the
  // evening as its own (beta) card.
  const morningDevotion: OfficeOption = { mode: "morning-devotion", emoji: "🌿", label: "Morning Devotion", sub: "A short devotion · BCP p. 137", now: isMorning };
  const eveningDevotion: OfficeOption = { mode: "early-evening-devotion", emoji: "🌆", label: "Early Evening Devotion", sub: "A short devotion · BCP p. 139", now: isEvening };
  // Compline — beta-only. Stays in the list anytime so an early-bedder
  // can pray it before 8 PM; "Available now" highlights only after 20:00.
  const compline: OfficeOption = {
    mode: "compline",
    emoji: "🌌",
    label: "Compline",
    sub: "The night office · BCP p. 127",
    now: isNight,
  };

  // Per-side default highlight — only the Devotion cards are badged via
  // this set (the full-office card carries its own "Your default" when
  // the side's level is "office", computed inline below). Per-side
  // OVERRIDES only — an unset side (ask / global fallback) isn't badged.
  const defaultKeys = (() => {
    const keys = new Set<string>();
    for (const s of ["morning", "evening"] as const) {
      if (getSideLevel(s) === "devotion") {
        keys.add(s === "morning" ? "morning-devotion" : "early-evening-devotion");
      }
    }
    return keys;
  })();
  const optIsDefault = (opt: OfficeOption): boolean => {
    const k = opt.mode ?? opt.navigateTo ?? null;
    return !!k && defaultKeys.has(k);
  };

  // Launch the full office for a side via the chosen method. "listen" /
  // "watch" navigate away to the player/broadcast; "read" / "book" open
  // the in-page viewer (book = the physical-BCP page guide).
  const launchOffice = (side: OfficeSide, method: DefaultOfficeEntry) => {
    if (method === "listen") { setLocation(`/podcast/${side}-office`); return; }
    if (method === "watch" && side === "morning") { setLocation("/ncmp/watch"); return; }
    // Venite — hand off through the OFFICE DECK rather than opening it here.
    //
    // This path used to open venite.app and credit the office on the spot, then
    // navigate away: a mis-tap counted a whole office, the one-minute dwell
    // rule never applied, and because it unmounted immediately there was no
    // return handler left to correct anything. That is exactly the bug the
    // deck's own hand-off was rewritten to fix; this second entry point kept
    // the old behaviour. Routing through the deck reuses the dwell test, the
    // "Continue" state, the credit-on-return and the Options menu — and lets a
    // devotion side serve the devotion, which the hard-coded call here never
    // could.
    if (method === "venite" && canPrayOnVenite(side)) {
      setLocation(`/bcp/daily-office?mode=${side}&venite=1`);
      return;
    }
    setShowBook(method === "book");
    setStartSlide(1); // skip the office's welcome — the picker already was it
    setShowMode(side === "morning" ? "morning" : "evening");
  };

  // Launch a short devotion the chosen way: the slideshow, the physical-BCP
  // page guide, or (Morning only) St. John's daily devotion video.
  const launchDevotion = (
    mode: "morning-devotion" | "early-evening-devotion",
    method: "read" | "book" | "watch" | "venite",
  ) => {
    if (method === "watch" && mode === "morning-devotion") { setLocation("/devotion/watch"); return; }
    // Venite serves the Daily Devotions too. Reported: choosing Venite Digital
    // and tapping Begin opened the digital slideshow instead — the caller was
    // narrowing anything that wasn't book/watch to "read", so the choice was
    // discarded one line before it could be honoured.
    if (method === "venite") { setLocation(`/bcp/daily-devotions?mode=${mode}&venite=1`); return; }
    setShowBook(method === "book");
    setStartSlide(1); // skip the devotion's welcome — the picker already was it
    setShowMode(mode);
  };

  const OptionButton = ({ opt }: { opt: OfficeOption }) => {
    const isDefault = optIsDefault(opt);
    return (
      <button
        onClick={() => {
          if (opt.navigateTo) { setLocation(opt.navigateTo); return; }
          // Devotions + Compline always open as the slide deck (the
          // full offices' book guide is reached via OfficeMethodCard).
          if (opt.mode) { setShowBook(false); setStartSlide(1); setShowMode(opt.mode); }
        }}
        className="w-full text-left rounded-2xl overflow-hidden flex transition-all hover:shadow-md active:scale-[0.99]"
        style={{
          background: opt.now ? "rgba(var(--ot-green, 46,107,64),0.30)" : "rgba(var(--ot-deep, 9,26,16), 0.308)",
          ...FROST_BLUR,
          border: isDefault
            ? "2px solid var(--oh-fern, #A8C5A0)"
            : `1px solid ${opt.now ? "rgba(var(--ot-fern, 168,197,160),0.40)" : "rgba(var(--ot-mint, 200,225,210),0.16)"}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(var(--ot-green, 46,107,64),0.9)" }} />
        <div className="flex-1 min-w-0 p-5">
          <div className="flex items-center gap-4">
            <span className="text-3xl">{opt.emoji}</span>
            <div className="flex-1">
              <p className="font-semibold text-base" style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
                {opt.label}
              </p>
              <p className="text-sm mt-0.5" style={{ color: "var(--oh-sage, #8FAF96)" }}>{opt.sub}</p>
              {isDefault
                ? <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--oh-fern, #A8C5A0)" }}>Your default</p>
                : opt.now && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--oh-green, #6FAF85)" }}>Available now</p>}
            </div>
            <span className="text-sm" style={{ color: "var(--oh-sage, #8FAF96)" }}>→</span>
          </div>
        </div>
      </button>
    );
  };

  const SectionLabel = ({ children }: { children: string }) => (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.16em] mt-6 mb-2"
      style={{ color: "rgba(var(--ot-sage, 143,175,150),0.5)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}
    >
      {children}
    </p>
  );

  // The "How" options valid for the chosen time + practice. read/book always;
  // Listen only for the full office; Watch only in the morning (Cathedral /
  // St John's stream). methodPick is clamped to a valid one for Begin.
  // Physical BCP leads the list, then On screen · Listen · Watch (morning
  // weekdays only, when the Cathedral streams).
  const howOptions: DefaultOfficeEntry[] = practicePick === "psalms"
    // Praying the Psalms: only on-screen (the slideshow) or Physical BCP (a
    // page-number guide) — no Listen / Watch.
    ? ["book", "read"]
    : [
        "book",
        "read",
        // Third, right after the digital slideshow (owner). Full office only —
        // this branch already excludes psalms above.
        ...(canPrayOnVenite(todPick) ? (["venite"] as const) : []),
        "listen",
        ...(todPick === "morning" && weekday ? (["watch"] as const) : []),
      ];
  // Match the first-slide labels ("On screen", not "Digital Slideshow").
  const HOW_LABEL: Record<DefaultOfficeEntry, string> = {
    read: "On screen",
    venite: "Venite Digital",
    listen: "Listen",
    watch: "Watch",
    book: "Physical BCP",
  };
  const effMethod: DefaultOfficeEntry = howOptions.includes(methodPick) ? methodPick : "read";
  const beginOffice = () => {
    if (practicePick === "psalms") {
      // On screen → the slideshow; Physical BCP → the page-number guide.
      // begin=1: the lectionary + format were just chosen here, so skip the
      // psalms "before you begin" intro and drop straight in.
      setLocation(`/psalms?office=${todPick}${effMethod === "book" ? "&book=1" : ""}&begin=1`);
      return;
    }
    if (practicePick === "devotion") {
      const mode = todPick === "morning" ? "morning-devotion" : "early-evening-devotion";
      const m = (effMethod === "book" || effMethod === "watch" || effMethod === "venite") ? effMethod : "read";
      launchDevotion(mode, m);
    } else {
      launchOffice(todPick, effMethod);
    }
  };
  // Frosted-glass rows — the leaf backdrop blurs through a faint dark tint, with a
  // soft light edge so each row reads as a pane of liquid glass.
  // Liquid-glass rows — a lighter translucent fill + a strong backdrop blur so
  // the leaf reads clearly through them, with a soft light edge + top sheen.
  const officeRow: CSSProperties = { position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 14, padding: "14px 16px", marginBottom: 8, background: "rgba(var(--ot-card2, 24,46,34),0.20)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(var(--ot-mint, 200,225,210),0.24)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" };
  const officeRowLabel: CSSProperties = { color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 16, fontWeight: 600 };
  const officeRowValue: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--oh-fern, #A8C5A0)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 15, fontWeight: 500 };
  // A transparent <select> covering the WHOLE row, so a tap anywhere opens it.
  const officeRowSelect: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", border: "none", outline: "none", cursor: "pointer", background: "transparent" };

  return (
    <Layout bgPhoto={landingLeaf}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "var(--oh-sage, #8FAF96)" }}>
          ← Book of Common Prayer
        </Link>

        {/* The landing reads as an office's opening slide: a centered title and
            three settings rows (Time of day · Practice · How) → Begin. */}
        <div className="flex flex-col items-center text-center pt-1">
          <p className="uppercase font-semibold" style={{ color: "rgba(var(--ot-sage, 143,175,150),0.6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 11, letterSpacing: "0.22em", marginBottom: 12 }}>
            Before you begin
          </p>
          <h1 style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontWeight: 700, fontSize: "clamp(40px, 11vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Daily Prayer
          </h1>
          <p style={{ color: "rgba(var(--ot-ink3, 240,237,230),0.85)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 16, lineHeight: 1.55, maxWidth: 440, marginBottom: 24 }}>
            Morning and Evening Prayer, kept at the hinges of the day — the full office or the short devotion.
          </p>

          <div className="w-full" style={{ maxWidth: 460 }}>
            <div style={{ height: 1, background: "rgba(var(--ot-mist, 200,212,192),0.14)", marginBottom: 14 }} />
            <div style={officeRow}>
              <span style={officeRowLabel}>Time of day</span>
              <span style={officeRowValue}>{todPick === "morning" ? "Morning" : "Evening"} <span aria-hidden style={{ opacity: 0.7 }}>▾</span></span>
              <select value={todPick} onChange={(e) => { const s = e.target.value as OfficeSide; setTodPick(s); setPracticePick(practiceForLevel(getSideLevel(s))); }} style={officeRowSelect} aria-label="Time of day">
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </select>
            </div>
            <div style={officeRow}>
              <span style={officeRowLabel}>Practice</span>
              <span style={officeRowValue}>{practicePick === "psalms" ? "Today's Psalms" : practicePick === "devotion" ? "Devotion (short)" : "Full Office"} <span aria-hidden style={{ opacity: 0.7 }}>▾</span></span>
              <select
                value={practicePick}
                onChange={(e) => {
                  const p = e.target.value as Practice;
                  setPracticePick(p);
                  // Persist the choice for this side so it holds (Praying the
                  // Psalms round-trips through getSideLevel + the home cards).
                  setSideLevel(todPick, p === "psalms" ? "psalms" : p === "full" ? "office" : "devotion");
                }}
                style={officeRowSelect}
                aria-label="Practice"
              >
                <option value="psalms">Today's Psalms</option>
                <option value="devotion">Devotion (short)</option>
                <option value="full">Full Office</option>
              </select>
            </div>
            {/* "How" — Physical BCP / On screen (+ Listen / Watch for the full
                office). Praying the Psalms offers Physical BCP (a page guide) or
                On screen (the slideshow). */}
            <div style={officeRow}>
              <span style={officeRowLabel}>How</span>
              <span style={officeRowValue}>{HOW_LABEL[effMethod]} <span aria-hidden style={{ opacity: 0.7 }}>▾</span></span>
              <select value={effMethod} onChange={(e) => setMethodPick(e.target.value as DefaultOfficeEntry)} style={officeRowSelect} aria-label="How">
                {howOptions.map((m) => (
                  <option key={m} value={m}>{HOW_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div style={{ height: 1, background: "rgba(var(--ot-mist, 200,212,192),0.14)", marginTop: 14, marginBottom: 20 }} />

            {/* Owner: "have their manual log pill button under the different
                dropdowns" — a one-tap "I already prayed it" for whoever's
                praying straight from their own book, without walking through
                the in-app deck or guide at all. Mirrors markOfficeBookComplete's
                existing use (BookOfficeLogSheet), just surfaced directly here. */}
            <button
              onClick={() => { markOfficeBookComplete(todPick); setLocation("/dashboard"); }}
              className="w-full rounded-2xl py-3 text-center transition-opacity hover:opacity-90 active:scale-[0.99] mb-3"
              style={{ background: "rgba(var(--ot-deep, 9,26,16), 0.297)", ...FROST_BLUR, color: "var(--oh-fern, #A8C5A0)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 14, fontWeight: 600, border: "1px solid rgba(var(--ot-mint, 200,225,210),0.22)", cursor: "pointer" }}
            >
              ✓ Mark as already prayed
            </button>

            <button
              onClick={beginOffice}
              className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "rgba(var(--ot-green, 46,107,64),0.55)", ...FROST_BLUR, color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 17, fontWeight: 700, border: "1px solid rgba(var(--ot-fern, 168,197,160),0.5)", cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
            >
              Begin <span aria-hidden>→</span>
            </button>
            <div className="flex justify-center mt-4">
              <Link
                href="/rule-of-life"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
                style={{ background: "rgba(var(--ot-deep, 9,26,16), 0.297)", ...FROST_BLUR, border: "1px solid rgba(var(--ot-mint, 200,225,210),0.18)", color: "var(--oh-fern, #A8C5A0)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", fontSize: 13, fontWeight: 600 }}
              >
                Shape your rhythm
              </Link>
            </div>
            {/* Compline (beta) — the night office, kept as a quiet link below. */}
            {rawIsBeta && (
              <div className="flex justify-center mt-3">
                <OptionButton opt={compline} />
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}
