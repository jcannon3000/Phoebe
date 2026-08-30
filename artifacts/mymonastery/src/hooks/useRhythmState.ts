import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday, hasReadVtsToday, isVtsPublishingDay,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT, VTS_READ_EVENT,
  hasPrayedPsalmsToday, PSALMS_READ_EVENT,
  hasPrayedGuidedPrayerToday, GUIDED_PRAYER_READ_EVENT,
  hasPrayedFddToday, FDD_PRAYED_EVENT,
  hasPrayedReflectionToday, CAC_PRAYED_EVENT, SSJE_PRAYED_EVENT, VTS_PRAYED_EVENT,
  hasPrayedReadingsToday, READINGS_PRAYED_EVENT,
  hasPrayedCustomToday, CUSTOM_PRAYER_READ_EVENT,
  hasReadNouwenToday,
  hasReadSojoToday,
  hasReadGristToday,
  type TrackedReflection,
} from "@/lib/cacReadState";
import { hasPracticeDoneToday, hasPracticeSkippedToday, PRACTICE_DONE_EVENT } from "@/lib/practiceCompletion";
import { waitingMeditation, waitingItem, TAIZE_READ_EVENT, type InboxItem } from "@/lib/taizeInbox";
import { practiceOnDay } from "@/lib/practiceDays";
import { getCustomAnchors, isCustomDoneToday, isCustomSkippedToday, anchorOnDay, hasAnchorOfficeIntentToday, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot, type ReadingConfig, type CustomAnchor } from "@/lib/customAnchors";
import { OFFICE_DONE_EVENT, isOfficeUndoneToday, isOfficeModeUndoneToday, isOfficeLoggedToday } from "@/lib/officeManualLog";
import { anchorPracticeFor } from "@/lib/anchorPractices";
import { anchorModesFor, getSideLevel, getExplicitSideLevel, getSideContemplation, getSideContemplationExplicit, getSideCustomName, getSideReflectionExplicit, useEffectiveReflectionSource, getContemplationLogMethod, getSideExtra, extraOfficeMode, type OfficeLevel, OFFICE_PREFS_EVENT, getSideContemplationKind, getContemplationStyleGlobal, type ContemplationKind as SideContemplationKind } from "@/lib/officePrefs";
import { hasContemplationSideDoneToday, CONTEMPLATION_SIDE_DONE_EVENT, type ContemplationKind } from "@/lib/contemplationSideDone";
import { INTENTION_PRAYED_EVENT } from "@/lib/intentionsPrayed";

/**
 * The contemplative practice THIS SIDE is set to — the Creation Prayer breath
 * or the silent sit.
 *
 * PER SIDE. This read the one global style key, which meant a rule keeping
 * silence in the morning and the breath in the evening asked the wrong
 * question of one of them: the global holds the LAST-written side's kind, so a
 * finished morning silent sit (stamped `date|silent`) was checked against
 * "cobreathe" and read as not kept — all day, on the card, the dot, the weekly
 * grid and the widget. That is the completion-signal invariant broken at its
 * source. Read straight from officePrefs so it can run inside the state
 * initializers and listeners that sit above the derived values below.
 */
function sideContemplationKind(side: "morning" | "evening"): ContemplationKind {
  return getSideContemplationKind(side) === "creation" ? "cobreathe" : "silent";
}
import { ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { isFirstOpen } from "@/lib/firstOpen";
import { getGuestSilenceGoalMin } from "@/lib/guestSeed";
import { getGuestSilenceMinutesToday, GUEST_SILENCE_EVENT } from "@/lib/guestSilenceLog";
import { readCachedHomeLayout } from "@/lib/homeLayoutCache";
import { NOVENAS_ENABLED } from "@/lib/novenaFlag";

// How the user has chosen to pray the daily office — drives whether the
// Morning/Evening anchor reads "Prayer", "Devotion", or "Pray together".
export type PrayerKind = "office" | "devotion" | "community";

// ── useRhythmState ───────────────────────────────────────────────────────────
//
// The shared source of truth for "today's rhythm": the four daily anchors
// (Morning · Reflect · Silence · Evening) and the streak / garden counts.
// Extracted from the TodaysRhythm card so three surfaces can agree without
// duplicating the logic:
//   • TodaysRhythm (the full card — home was, now the closing slide + page)
//   • the header "Daily progress" pill (renders four dots from the done flags)
//   • the /daily-progress page
// Every queryKey matches what the dashboard / contemplation page already
// fetch, so React Query dedupes — calling this hook in several places adds no
// network. Reflection state is localStorage-only and live-updates off the
// read events the reflection cards fire.

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Did the user finish an office on a given side today, per the localStorage
// flags the office viewer writes synchronously (before the server query lands)?
/**
 * Which office-completion flags satisfy a SIDE'S ANCHOR.
 *
 * Owner: "the main thing they chose is the anchor, which goes in their weekly
 * practice, and the devotion would show up as an additional practice that is
 * not their anchor."
 *
 * This used to accept the office flag OR the devotion flag for a side, which
 * was fine while a side could only hold one of them. Now that a devotion can
 * ride alongside the office as an extra practice, that OR would let praying
 * the two-minute devotion tick Morning Prayer as kept — filling the anchor's
 * weekly dot for a practice they hadn't done.
 *
 * So the anchor accepts only ITS OWN flag: the devotion counts when the
 * devotion IS the anchor, and not otherwise. The additional practice keeps its
 * own card and its own completion.
 */

/**
 * The completion flags a side's SECOND practice writes.
 *
 * Deliberately narrow — exactly the one mode that practice runs as, never the
 * anchor's. anchorModesFor casts a wide net because a side's anchor can be any
 * of half a dozen levels that all complete as the devotion; an extra is one
 * known level, so it can ask for exactly its own flag.
 *
 * Empty when the extra shares a mode with the anchor. Nothing can tell those
 * two apart — one flag, two practices — so the customizer never stores such a
 * pair (it falls back to a plain logged practice instead), and this returns
 * nothing rather than reporting the anchor's prayer as the extra's.
 */
function extraModesFor(side: "morning" | "evening"): string[] {
  const level = getSideExtra(side);
  if (!level) return [];
  const mode = extraOfficeMode(side, level);
  if (!mode) return [];
  if (anchorModesFor(side).includes(mode)) return [];
  return [mode];
}

/**
 * The PrayerSurface a client-side office MODE writes server-side.
 *
 * Mirrors api-server's officeManualLog surfaceForMode — the server posts this
 * exact mapping (see lib/officeManualLog.ts's own note on why it has to), and
 * this is what lets anchorSurfaceHit/extraSurfaceHit ask the SAME "which
 * practice wrote this" question of the server's data that anchorModesFor /
 * extraModesFor already ask of the local flags.
 */
function officeModeToSurface(mode: string): string | null {
  if (mode === "morning") return "morning-prayer";
  if (mode === "evening") return "evening-prayer";
  if (mode === "compline") return "compline";
  if (mode === "morning-devotion") return "morning-devotion";
  if (mode === "early-evening-devotion") return "early-evening-devotion";
  return null;
}

/** Which reflection source is THIS side's anchor, when its level says a
 *  reflection is. Defaults to fdd — the historical behaviour, and the level
 *  sentinel's own name — when no explicit per-side pick has synced yet. */
function anchorReflectionSource(side: "morning" | "evening"): TrackedReflection {
  const explicit = getSideReflectionExplicit(side);
  return explicit && explicit !== "none" && explicit !== "fdd" ? explicit : "fdd";
}

function officeLocalDone(sides: string[]): boolean {
  const day = localDay();
  try {
    return sides.some((s) => localStorage.getItem(`phoebe:office-completed:${s}:${day}`) !== null);
  } catch {
    return false;
  }
}

export type RhythmState = {
  /** Have the done-state queries settled? Consumers fade in their first paint
   *  on this so the Next/Done split doesn't visibly reshuffle as data lands. */
  ready: boolean;
  /** A SECOND practice on the side, alongside its anchor — the level it is,
   *  or null for none. Null also when the stored extra can't be distinguished
   *  from the anchor (see extraModesFor). */
  morningExtraLevel: OfficeLevel | null;
  eveningExtraLevel: OfficeLevel | null;
  morningExtraDone: boolean;
  eveningExtraDone: boolean;
  morningDone: boolean;
  reflectDone: boolean;
  silenceDone: boolean;
  eveningDone: boolean;
  /** Whether the evening office is part of the rhythm (evening pref != "none").
   *  Off by default, so an un-set-up user's rhythm is 3 anchors, not 4. */
  eveningActive: boolean;
  /** Whether each core anchor is part of the rhythm: morning prayer (morning
   *  pref != "none"), contemplation (a goal is set), reflection (a source is
   *  chosen). A user who turns one off drops its card + dot + weekly row. */
  morningActive: boolean;
  silenceActive: boolean;
  /** The single aggregate silence GOAL card (a goal is set but neither per-side
   *  contemplation card is on) — its own dot in the pill, distinct from the two
   *  per-side contemplation dots. */
  soloSilenceActive: boolean;
  /** The silence GOAL card as the home actually RENDERS it: the solo card, OR
   *  the goal-progress card that rides ALONGSIDE per-side Creation Prayer
   *  cards (whose blurbs never show minutes). Dot/count consumers must use
   *  THIS (with silenceGoalCardDone), not soloSilenceActive, or the
   *  creation-style goal card has no dot. */
  silenceGoalCardActive: boolean;
  silenceGoalCardDone: boolean;
  /** The STANDALONE Co-Breathe card — false when per-side Creation Prayer
   *  cards replace it (DailyProgressBody suppresses the standalone card then,
   *  so a dot on bare cobreatheActive would have no card). */
  cobreatheStandaloneActive: boolean;
  /** Per-side Contemplative Prayer — the Morning / Evening Contemplation cards.
   *  Each is its own card, kept independently (a sit from one side's card clears
   *  that side; evening stays visible after the morning sit meets the goal). */
  morningContemplationActive: boolean;
  eveningContemplationActive: boolean;
  morningContemplationDone: boolean;
  eveningContemplationDone: boolean;
  reflectActive: boolean;
  /** Each reflection newsletter the user follows (cac/fdd/ssje/vts) — one per
   *  chosen source, each its OWN card + dot + done-state. Empty when none chosen. */
  reflections: Array<{ source: TrackedReflection; done: boolean }>;
  /** Optional practices the user added from the Customize flow (visible on the
   *  home layout) — each adds a checkmark to Daily progress. */
  examenActive: boolean;
  listeningActive: boolean;
  readingActive: boolean;
  podcastsActive: boolean;
  walkActive: boolean;
  /** Visio Divina — praying with an artwork. */
  visioActive: boolean;
  /**
   * THE INBOX. Taizé's meditations don't arrive daily, so this pair does not
   * behave like the others: `taizeDone` is true when nothing is WAITING —
   * either because the newest was read (whenever that was) or because none has
   * been posted — and it is never reset by the day turning over.
   */
  taizeActive: boolean;
  chittisterActive: boolean;
  chittisterDone: boolean;
  chittisterWaiting: InboxItem | null;
  /** The newest item REGARDLESS of whether it has been read — the undo needs
   *  it, and `waiting` is null in exactly the case undo applies to. */
  chittisterLatest: InboxItem | null;
  taizeDone: boolean;
  /** The meditation waiting to be read, or null when the inbox is empty. */
  taizeWaiting: { id: string; title: string; url: string; published: string | null } | null;
  /**
   * A group admin's weekly reflection, waiting to be read.
   *
   * NO `active` FLAG, deliberately — unlike every other optional practice this
   * one is not chosen in the customizer. The owner's words were "it would go
   * into the inbox of all the people in the group": the group puts it there,
   * the person doesn't opt in. So it appears when there is one and is absent
   * when there isn't, and there is no card to turn on or off.
   */
  groupReflection: {
    id: string; reflectionId: number; title: string; body: string;
    authorName: string | null; groupName: string | null; published: string | null;
    /** Set when a leader posted a LINK rather than writing — opens their page. */
    url: string | null;
    /** Leave the app entirely — see OpenOpts.system and the schema's note. */
    openExternally: boolean;
    /** What the button says: "Learn more", "RSVP". Null → "Read". */
    ctaLabel: string | null;
  } | null;
  /** Compline (the night office) as an opt-in add-on card — only ever true
   *  from 7pm local on, since it's the office for the end of the day. */
  complineActive: boolean;
  cobreatheActive: boolean;
  prayerListActive: boolean;
  examenDone: boolean;
  listeningDone: boolean;
  readingDone: boolean;
  podcastsDone: boolean;
  walkDone: boolean;
  visioDone: boolean;
  iconsActive: boolean;
  iconsDone: boolean;
  complineDone: boolean;
  cobreatheDone: boolean;
  prayerListDone: boolean;
  /** The personal prayer list ("intentions") — real per-item counts for the
   *  Prayer List routine card. Distinct from prayerListActive/prayerListDone
   *  above (the older manual all-or-nothing check-off, still used for the
   *  weekly grid / widget). Card is active whenever intentionsTotalCount > 0
   *  and done once intentionsPrayedCount reaches it. */
  intentionsTotalCount: number;
  intentionsPrayedCount: number;
  /** User-defined custom practices (title + emoji + a per-day check) — each an
   *  extra anchor: shows as a Daily-progress card and counts as a dot. */
  // Reuses CustomAnchor rather than re-listing its fields: this hand-kept copy
  // had already drifted (it was missing `days`, so a weekday-scoped anchor lost
  // its scoping the moment it passed through here).
  customAnchors: Array<CustomAnchor & { done: boolean; skipped: boolean }>;
  /** How many anchors exist for this user — the four core ones plus any
   *  active optional practices (gratitude / examen). The denominator of the
   *  "N of X kept" header. */
  totalAnchors: number;
  /** How many anchors are kept today (out of totalAnchors). */
  doneCount: number;
  streak: number;
  last7: number;
  keptToday: boolean;
  gardenCount: number;
  cobreatheCount: number;
  /** Office / Devotion / community — so the Morning & Evening labels match
   *  what the user actually prays (their Customize-home / Rule of Life pick). */
  prayerKind: PrayerKind;
  /** Today's contemplation minutes and the daily goal (0 = no goal) — for the
   *  Contemplation card's goal progress. */
  contemplationMin: number;
  contemplationGoalMin: number;
  /** The style a side's contemplation takes: a silent sit, or the Creation
   *  Prayer breath. Global (a side is office OR contemplation, so one flag
   *  covers whichever sides are contemplative). Drives per-side card naming +
   *  routing in DailyProgressBody. */
  contemplationStyle: "silent" | "cobreathe";
  /** Which contemplative practice EACH side keeps — never infer this from
   *  `contemplationStyle`, which is only the aggregate. All five kinds: the
   *  silent sit, the breath, a walk, sacred listening, Visio Divina. */
  morningContemplationKind: SideContemplationKind;
  eveningContemplationKind: SideContemplationKind;
  contemplationLogMethod: "timer" | "manual";
  /** "Grow my silence" ladder state when enabled (else null) — the current rung
   *  drives contemplationGoalMin; daysToNext/nextLevel feed the card. */
  silenceLadder: { level: number; levelDays: number; daysToNext: number; nextLevel: number; atMax: boolean } | null;
  /** The user's active novena (server-tracked, at most one at a time) — a
   *  card + dot ONLY while one is active; it drops out of the routine once
   *  the ninth (or however many) day is completed. currentDay/dayCount are
   *  1-indexed; done is "already prayed today's day". */
  novenaActive: boolean;
  novenaDone: boolean;
  /** Set only in "replace" mode — the novena stands in for that side's
   *  anchor card/dot instead of riding alongside as its own. */
  novenaReplacesMorning: boolean;
  novenaReplacesEvening: boolean;
  novena: { novenaId: number; title: string; saint: string | null; currentDay: number; displayDayNumber: number; dayCount: number; replacesSlot: "morning" | "evening" | null; day: { title: string | null; body: string } | null } | null;
};

// Is an optional-practice card surfaced on the user's home layout? A card
// counts as active when the layout is the current version AND the key is in
// the saved order and NOT hidden — the same rule the dashboard applies. Cards
// absent from the order are opt-in-hidden, so a user who never added
// gratitude/examen has no extra anchor.
function homeCardActive(
  homeLayout: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  // Honor the saved layout REGARDLESS of version — a version mismatch must never
  // silently drop a card the user added (the recurring "I lost my practice on a
  // code change" bug). The home reconciles new/removed modules by merging.
  if (!homeLayout) return false;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  if (!order.includes(key) || hidden.has(key)) return false;
  /**
   * Days of the week (owner: "all routine cards can be specified as to what
   * days of the week"). Folded in HERE, at the one helper every optional
   * practice's *Active flag reads, so the card and its dot can never disagree
   * — that is this repo's completion-signal invariant, and the reason a
   * separate filter over the card list would have been the wrong fix.
   *
   * It matters concretely: a practice with a dot but no card holds
   * `allHabitsDone` false all day, so the day can never read as complete. The
   * comment on the customAnchors filter further down says the same thing about
   * anchorOnDay; this is that rule for every other practice.
   *
   * Unscoped practices are kept every day, so this is inert for anyone who
   * hasn't scheduled anything.
   */
  return practiceOnDay(key);
}

export function useRhythmState(): RhythmState {
  const day = localDay();
  const tzName = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { user, isLoading: authLoading } = useAuth();
  // Feed-gated reflections (VTS) — see the selectedReflections filter below.
  const entitlements = useEntitlements();
  // PUBLIC no-login version: a guest (flag on, auth settled, signed out OR the
  // anonymous device user) runs the WHOLE rhythm on device-local state — every
  // server query below is off, `ready` doesn't wait on them, the home layout
  // comes from the local cache the guest customizer writes, and the silence
  // goal/minutes come from the guest keys. The anonymous user exists only for
  // push — treating it as signed-in put fresh devices on empty server prefs
  // (no Silence card, the legacy no-layout Co-Breathe default). Flag off, or
  // any REAL signed-in account, and nothing changes.
  // On a genuine FIRST launch there can be no prior session, so don't wait out
  // the /api/auth/me round-trip before treating this as the device-local guest
  // — the seeded rhythm paints instantly from local state instead of blanking
  // until auth settles. Once auth resolves it's the anonymous device user, so
  // `guest` stays true; a real signed-in account is impossible on a first open.
  const guest = (!authLoading || isFirstOpen()) && isDeviceLocalGuest(user);
  // The layout that decides which optional cards are active: the signed-in
  // user's server layout, or — for a guest — the device-local cache.
  const hl = guest ? readCachedHomeLayout() : user?.homeLayout;

  // Reflection read-state. localStorage is per-device and flips instantly, but
  // doesn't sync across devices (read CAC on mobile → web wouldn't know). CAC
  // reads are also logged server-side, so we OR in a server check below; the
  // local flags keep the anchor responsive on the device that did the reading.
  const [reflectLocal, setReflectLocal] = useState(
    () => hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday(),
  );
  // FDD / Psalms / Simple Guided Prayer used AS a side's morning/evening PRAYER
  // (not just a reflection) must light that side's done-state. Tracked
  // reactively with the same robust return-to-app signals as the reflection
  // read-state.
  // `fdd` is the GLOBAL reflection flag (the reflection card reads it). The
  // per-side `fddMorning`/`fddEvening` flags are what an office side keys on —
  // the global one lit BOTH sides plus the reflection card off a single read.
  const [prayerRead, setPrayerRead] = useState(() => ({
    fdd: hasReadFddToday(),
    // A side whose anchor is a REFLECTION stores level "fdd" whichever source
    // it actually is (the level is a sentinel meaning "a reflection is this
    // side's prayer"; getSideReflectionExplicit names the source). Ask the
    // tracker for THAT source, or CAC/SSJE/VTS-as-anchor could never light
    // their side — only Forward Day by Day ever did.
    fddMorning: hasPrayedReflectionToday(anchorReflectionSource("morning"), "morning"),
    fddEvening: hasPrayedReflectionToday(anchorReflectionSource("evening"), "evening"),
    readingsMorning: hasPrayedReadingsToday("morning"), readingsEvening: hasPrayedReadingsToday("evening"),
    psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening"),
    guidedPrayerMorning: hasPrayedGuidedPrayerToday("morning"), guidedPrayerEvening: hasPrayedGuidedPrayerToday("evening"),
    customMorning: hasPrayedCustomToday("morning"), customEvening: hasPrayedCustomToday("evening"),
  }));
  useEffect(() => {
    const recheck = () => {
      setReflectLocal(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
      setPrayerRead({
        fdd: hasReadFddToday(),
        // A side whose anchor is a REFLECTION stores level "fdd" whichever source
    // it actually is (the level is a sentinel meaning "a reflection is this
    // side's prayer"; getSideReflectionExplicit names the source). Ask the
    // tracker for THAT source, or CAC/SSJE/VTS-as-anchor could never light
    // their side — only Forward Day by Day ever did.
    fddMorning: hasPrayedReflectionToday(anchorReflectionSource("morning"), "morning"),
    fddEvening: hasPrayedReflectionToday(anchorReflectionSource("evening"), "evening"),
        readingsMorning: hasPrayedReadingsToday("morning"), readingsEvening: hasPrayedReadingsToday("evening"),
        psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening"),
        guidedPrayerMorning: hasPrayedGuidedPrayerToday("morning"), guidedPrayerEvening: hasPrayedGuidedPrayerToday("evening"),
        customMorning: hasPrayedCustomToday("morning"), customEvening: hasPrayedCustomToday("evening"),
      });
    };
    // The reflection is read on a separate surface (often the in-app browser),
    // which stamps localStorage + fires a read-event. We re-check on those
    // events, but iOS WebViews don't fire `visibilitychange` reliably when the
    // in-app browser is dismissed — so the anchor "sometimes" didn't flip on
    // return. Listen on the broader set of return-to-app signals (focus,
    // pageshow, the native resume event) plus the storage event so the check
    // is robust however the read landed.
    window.addEventListener(CAC_READ_EVENT, recheck);
    window.addEventListener(FDD_READ_EVENT, recheck);
    window.addEventListener(SSJE_READ_EVENT, recheck);
    window.addEventListener(VTS_READ_EVENT, recheck);
    window.addEventListener(PSALMS_READ_EVENT, recheck);
    window.addEventListener(GUIDED_PRAYER_READ_EVENT, recheck);
    window.addEventListener(CUSTOM_PRAYER_READ_EVENT, recheck);
    window.addEventListener(FDD_PRAYED_EVENT, recheck);
    // The other three reflection sources fire their OWN prayed-events when
    // used as an anchor — without these listeners a CAC/SSJE/VTS anchor
    // wouldn't refresh its side until some unrelated event happened to.
    window.addEventListener(CAC_PRAYED_EVENT, recheck);
    window.addEventListener(SSJE_PRAYED_EVENT, recheck);
    window.addEventListener(VTS_PRAYED_EVENT, recheck);
    window.addEventListener(READINGS_PRAYED_EVENT, recheck);
    window.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    // Native shell signals: the app returning to the foreground, and — the
    // important one for reflections — the in-app browser being dismissed
    // (a reflection opened externally stamps read-state, then fires this).
    window.addEventListener("phoebe:appactive", recheck);
    window.addEventListener("phoebe:browserfinished", recheck);
    // A cross-device routine sync rewrote the local office levels / slots — force
    // a re-read so the cards reflect the synced rhythm (lib/routineSync).
    window.addEventListener(ROUTINE_SYNCED_EVENT, recheck);
    /**
     * An inbox item was marked read (or un-read) IN THIS DOCUMENT.
     *
     * markInboxRead has fired this since it was written and nothing listened.
     * The Taizé and Chittister cards got away with it because they open a
     * browser first, and `phoebe:browserfinished` / `focus` happen to cover
     * the return trip. The Cathedral's LISTEN button doesn't open anything —
     * it starts the podcast player in-app — so its card's move to Done relied
     * on the player context incidentally re-rendering. Now it doesn't.
     */
    window.addEventListener(TAIZE_READ_EVENT, recheck);
    // A goal changed in-document (e.g. a guest sets a silence goal) — the
    // `storage` event only fires cross-tab, so without this the home wouldn't
    // grow the new goal card until a reload. OFFICE_PREFS_EVENT
    // and GUEST_SILENCE_EVENT fire same-document; recheck's fresh setState forces
    // the re-render that re-reads the (device-local) goals.
    window.addEventListener(OFFICE_PREFS_EVENT, recheck);
    window.addEventListener(GUEST_SILENCE_EVENT, recheck);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener(VTS_READ_EVENT, recheck);
      window.removeEventListener(PSALMS_READ_EVENT, recheck);
      window.removeEventListener(GUIDED_PRAYER_READ_EVENT, recheck);
      window.removeEventListener(CUSTOM_PRAYER_READ_EVENT, recheck);
      window.removeEventListener(FDD_PRAYED_EVENT, recheck);
      window.removeEventListener(CAC_PRAYED_EVENT, recheck);
      window.removeEventListener(SSJE_PRAYED_EVENT, recheck);
      window.removeEventListener(VTS_PRAYED_EVENT, recheck);
      window.removeEventListener(READINGS_PRAYED_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener("phoebe:browserfinished", recheck);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, recheck);
      window.removeEventListener(TAIZE_READ_EVENT, recheck);
      window.removeEventListener(OFFICE_PREFS_EVENT, recheck);
      window.removeEventListener(GUEST_SILENCE_EVENT, recheck);
    };
  }, []);

  // Optional-practice completion (gratitude / examen). Instant local flags flip
  // the anchor the moment the user finishes; we re-check on the shared event +
  // return-to-app signals, and OR in the server rows below for cross-device.
  const [practiceLocal, setPracticeLocal] = useState(() => ({
    examen: hasPracticeDoneToday("examen"),
    listening: hasPracticeDoneToday("listening"),
    reading: hasPracticeDoneToday("reading"),
    podcasts: hasPracticeDoneToday("podcasts"),
    walk: hasPracticeDoneToday("walk"),
    walkSkipped: hasPracticeSkippedToday("walk"),
    visio: hasPracticeDoneToday("visio"),
    icons: hasPracticeDoneToday("icons"),
    prayerList: hasPracticeDoneToday("prayer-list"),
  }));
  useEffect(() => {
    const recheck = () => setPracticeLocal({
      examen: hasPracticeDoneToday("examen"),
      listening: hasPracticeDoneToday("listening"),
      reading: hasPracticeDoneToday("reading"),
      podcasts: hasPracticeDoneToday("podcasts"),
      walk: hasPracticeDoneToday("walk"),
      walkSkipped: hasPracticeSkippedToday("walk"),
      visio: hasPracticeDoneToday("visio"),
    icons: hasPracticeDoneToday("icons"),
      prayerList: hasPracticeDoneToday("prayer-list"),
    });
    window.addEventListener(PRACTICE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    // Guest silence log — a finished guest sit writes device-local minutes and
    // fires this; the recheck's fresh state object re-renders the hook so the
    // guest contemplationMin below re-reads the tally.
    window.addEventListener(GUEST_SILENCE_EVENT, recheck);
    return () => {
      window.removeEventListener(PRACTICE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener(GUEST_SILENCE_EVENT, recheck);
    };
  }, []);

  // Custom user-defined practices (title + emoji + a per-day check). Re-read the
  // list AND each check on the custom-anchor events + return-to-app signals so a
  // tick — here or on another surface — flips the dot live.
  const [customAnchors, setCustomAnchors] = useState(() =>
    getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })),
  );
  useEffect(() => {
    const recheck = () =>
      setCustomAnchors(getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })));
    window.addEventListener(CUSTOM_ANCHORS_EVENT, recheck);
    window.addEventListener(CUSTOM_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(CUSTOM_ANCHORS_EVENT, recheck);
      window.removeEventListener(CUSTOM_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Office completion — the instant local flags the office viewer AND the
  // physical-book quick-log write. ORed with the server office-history below;
  // the local flag flips the anchor the moment the office is logged, and the
  // OFFICE_DONE_EVENT lets an in-place quick-log refresh the home without a nav.
  const [officeLocal, setOfficeLocal] = useState(() => ({
    morning: officeLocalDone(anchorModesFor("morning")),
    evening: officeLocalDone(anchorModesFor("evening")),
    // Compline tracked on its own too — as an opt-in add-on card it needs a
    // done-flag independent of the evening anchor (which compline also
    // satisfies, hence its presence in BOTH lists).
    compline: officeLocalDone(["compline"]),
    // A side's SECOND practice completes on its own mode flag — which is a
    // different flag from the anchor's whenever the two run through different
    // office modes (see extraModesFor). That separation is the whole reason a
    // second practice can be a real practice rather than a checkbox.
    morningExtra: officeLocalDone(extraModesFor("morning")),
    eveningExtra: officeLocalDone(extraModesFor("evening")),
  }));
  // "I didn't actually pray this" — set by tapping the ✓ on a done office card
  // (lib/officeManualLog). Masks the SERVER-derived done signals for the rest
  // of the day; the local flag deliberately still wins, so praying again
  // re-completes the card without any writer needing to know about undo.
  const [officeUndone, setOfficeUndone] = useState(() => ({
    morning: isOfficeUndoneToday("morning"),
    evening: isOfficeUndoneToday("evening"),
    compline: isOfficeUndoneToday("compline"),
  }));
  useEffect(() => {
    const recheck = () => {
      setOfficeLocal({
        morning: officeLocalDone(anchorModesFor("morning")),
        evening: officeLocalDone(anchorModesFor("evening")),
        compline: officeLocalDone(["compline"]),
        morningExtra: officeLocalDone(extraModesFor("morning")),
        eveningExtra: officeLocalDone(extraModesFor("evening")),
      });
      setOfficeUndone({
        morning: isOfficeUndoneToday("morning"),
        evening: isOfficeUndoneToday("evening"),
        compline: isOfficeUndoneToday("compline"),
      });
    };
    window.addEventListener(OFFICE_DONE_EVENT, recheck);
    // Also on a PREFS change: anchorModesFor() reads the side's level, so
    // switching between the office and the devotion changes which completion
    // flag counts. Without this the anchor kept answering with the old level
    // until some unrelated event (a focus, an app resume) happened to refresh
    // it — a dependency this effect gained when the anchor stopped accepting
    // both flags.
    window.addEventListener(OFFICE_PREFS_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(OFFICE_DONE_EVENT, recheck);
      window.removeEventListener(OFFICE_PREFS_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Per-side contemplation completion (which side's sit is kept today) — its
  // own day-flag so an undone evening sit stays in Next even after the morning
  // sit met the daily minutes goal. The flag is matched against the user's
  // contemplation STYLE: a side styled as Creation Prayer (the Co-Breathe
  // breath) is only kept by the breath, and a side styled as the silent sit is
  // only kept by a silent sit — they're different practices, so keeping one
  // must not tick the other's card. (Legacy flags carry no kind and satisfy
  // either, so a day already kept before this shipped doesn't flip back.)
  const [contemplationSideDone, setContemplationSideDone] = useState(() => ({
    morning: hasContemplationSideDoneToday("morning", sideContemplationKind("morning")),
    evening: hasContemplationSideDoneToday("evening", sideContemplationKind("evening")),
  }));
  useEffect(() => {
    const recheck = () => setContemplationSideDone({
      morning: hasContemplationSideDoneToday("morning", sideContemplationKind("morning")),
      evening: hasContemplationSideDoneToday("evening", sideContemplationKind("evening")),
    });
    window.addEventListener(CONTEMPLATION_SIDE_DONE_EVENT, recheck);
    // The day-flag match is KEYED BY KIND, and kinds change through
    // setSideContemplationKind, which announces itself on OFFICE_PREFS_EVENT
    // — not on the side-done event. Without this, flipping a side's kind
    // re-rendered the card with the new face while the done-flag still held
    // the old kind's answer until the next focus.
    window.addEventListener(OFFICE_PREFS_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(CONTEMPLATION_SIDE_DONE_EVENT, recheck);
      window.removeEventListener(OFFICE_PREFS_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  const { data: officeHistory } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean; compline: boolean; surfaces?: string[] }> }>({
    // Date-scoped so a day rollover always re-fetches instead of serving the
    // pre-midnight cached week (same reasoning as contemplation-stats' key).
    // Without `day` here, an app backgrounded overnight came back holding
    // YESTERDAY's array — whose last row is yesterday — and Morning/Evening read
    // "Prayed" on a fresh day. `day` is recomputed from the wall clock every
    // render, so the key changes the moment the date rolls over.
    queryKey: ["/api/me/office-history-week", day, tzName],
    // ?tz= is load-bearing here. The route buckets the week by the user's local
    // day, and todayOffice is `lastOfficeDay.ymd === day` — so a stale stored
    // timezone shifts the server's whole week and that guard fails, dropping the
    // cross-device office signal to nothing every evening for anyone west of
    // UTC. Sending it also backfills users.timezone (see resolveUserTz).
    queryFn: () => apiRequest("GET", `/api/me/office-history-week?tz=${encodeURIComponent(tzName)}`),
    staleTime: 30_000,
    enabled: !guest,
  });

  // The user's active novena (if any) — server-tracked, one at a time.
  // currentDay only ever advances via POST /me/novena/complete, never by the
  // calendar; lastCompletedLocalDate vs today (`day`) is what makes the card
  // read "done" for the rest of today and reset fresh tomorrow.
  const { data: novenaData } = useQuery<{
    active: null | {
      novenaId: number; title: string; saint: string | null; dayCount: number;
      currentDay: number; displayDayNumber: number; lastCompletedLocalDate: string | null;
      replacesSlot: "morning" | "evening" | null;
      day: { title: string | null; body: string } | null;
    };
  }>({
    queryKey: ["/api/me/novena", day],
    queryFn: () => apiRequest("GET", `/api/me/novena?localDate=${encodeURIComponent(day)}`),
    staleTime: 30_000,
    // `guest` (isDeviceLocalGuest) tracks isAnonymous — but Practices/the
    // library gate novena REACHABILITY on useGuestMode's isGuest (pilot
    // group / super-admin), a different flag. An anonymous-provisioned
    // account that's also a pilot member or super admin could reach the
    // library, start a novena (the server only checks it has a user id at
    // all), and then never see it anywhere that reads this query — the
    // active-novena card, the switch-ask, all of it silently staying null.
    // Gate on having any account at all, matching what the server accepts.
    enabled: !!user,
  });
  // Novenas hidden for all users per owner request — see lib/novenaFlag.ts.
  // Every consumer (layout.tsx dots, DailyProgressBody's anytime card,
  // widgetSync) reads novenaActive/novena off this hook, so forcing both to
  // their "nothing active" values here hides it everywhere without
  // touching each call site.
  const activeNovena = NOVENAS_ENABLED ? (novenaData?.active ?? null) : null;
  const novenaActive = !!activeNovena;
  const novenaDone = novenaActive && activeNovena!.lastCompletedLocalDate === day;
  // "Replace" mode — the novena stands in for that side's anchor entirely
  // (its own card at the "morning"/"evening" slot, no separate anytime
  // card, and the side's normal office/contemplation content stays
  // suppressed) rather than riding alongside as an extra card. Reverts
  // automatically once the novena is no longer active, since nothing reads
  // these once activeNovena is null.
  const novenaReplacesMorning = novenaActive && activeNovena!.replacesSlot === "morning";
  const novenaReplacesEvening = novenaActive && activeNovena!.replacesSlot === "evening";

  // Server-backed completion rows for the optional practices (cross-device).
  // Only fetched/used for the practices the user has actually added.
  const examenActive = homeCardActive(hl, "examen");
  // Audio Divina (listening as a way of prayer) is live as a logging-first
  // practice — it appears ONLY when the user selects it in the customizer
  // (homeCardActive reads the saved home layout).
  const listeningActive = homeCardActive(hl, "listening");
  // Reading + Podcasts — logging-first practices added from the "Add to your
  // day" step; each its own home card + dot.
  const readingActive = homeCardActive(hl, "reading");
  const podcastsActive = homeCardActive(hl, "podcasts");
  // Contemplative Walk — a slotted contemplative practice, logged like reading.
  // "Not today" (practiceLocal.walkSkipped) drops it out for the rest of the
  // day, same as a skipped custom anchor — every consumer of walkActive
  // treats it as "should this show today", so folding the skip in here
  // (rather than threading a separate flag through each) keeps them in sync.
  const walkActive = homeCardActive(hl, "walk") && !practiceLocal.walkSkipped;
  // Visio Divina — praying with an artwork. Same shape as the other standing
  // practices: on when its home card is, kept by finishing the deck.
  const visioActive = homeCardActive(hl, "visio");
  // Praying with Icons — one icon chosen for the week, sat with daily. The
  // WEEK is the icon's; the sitting is the day's, so completion is
  // day-scoped like every other practice card.
  const iconsActive = homeCardActive(hl, "icons");
  const taizeActive = homeCardActive(hl, "taize");
  const chittisterActive = homeCardActive(hl, "chittister");
  // Compline — the night office, offered as a contemplative add-on card.
  // complineActive means "the user has this in their rhythm" (mirrors every
  // other *Active flag — never time-gated, so the card is reliably present
  // in Next and the customizer reflects the choice immediately after
  // saving). The 7pm-only rule is a "not yet" state on that SAME card
  // (DailyProgressBody sets later: hour < 19), exactly how Evening Prayer
  // stays visible all day but shows "Later" until its own hour — not an
  // on/off toggle that makes the card vanish, which read as "it isn't
  // holding" when it was actually just correctly absent before 7pm.
  const complineActive = homeCardActive(hl, "compline");
  // Co-Breathe as a standalone anchor — added from the customizer's contemplative
  // step at a chosen time of day (separate from picking Co-Breathe as a side's
  // contemplation STYLE). Its done-state comes from /api/breath/today below.
  // On by default for an un-set-up user (no saved home layout) — Co-Breathe is
  // part of the starter rhythm (Prayer List · Contemplation · CAC · Silence ·
  // Co-Breathe). Once the user customizes, the saved layout decides. GUESTS are
  // the exception: their seeded rule (M/E Office · FDD · silence goal) has no
  // Co-Breathe — it appears only if their customizer adds it to the layout.
  const cobreatheActive = homeCardActive(hl, "cobreathe") || (!guest && !user?.homeLayout);
  // Personal prayer list — a logging-first practice (prayed through its
  // slideshow); appears only when selected in the customizer AND only when the
  // prayer-request feature is available to this account (pilot-group-only,
  // 2026-07-29 — "My Prayer List" now reads the private list (prayer_
  // intentions), not the community prayer_requests garden, so it no longer
  // needs to ride on prayerRequestsEnabled (which stays permanently false —
  // community prayer requests are off for everyone, no exceptions). Gating
  // the private list on that flag was stale and blocked the restored
  // feature entirely.
  //
  // homeCardActive() requires the key to already be IN the saved order —
  // fine for practices that existed when a user first customized, but every
  // existing account's saved layout predates this feature (the card never
  // worked, so nobody would have added it) and simply doesn't list
  // "prayer-list" at all. Rather than defaulting a brand-new capability to
  // invisible for every current user, treat it as active unless explicitly
  // hidden — the customizer can still turn it off from here.
  const prayerListActive = !(new Set(hl?.hidden ?? []).has("prayer-list"));
  const anyExtraActive = examenActive || listeningActive || readingActive || podcastsActive || walkActive || visioActive || complineActive || prayerListActive;
  // Server filters rows on weekStart >= since, and today's row carries THIS
  // week's Sunday as weekStart — so we ask from the week start, then match the
  // exact localDate below. (Passing today would drop the row on any non-Sunday.)
  const weekStartDay = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.toLocaleDateString("en-CA");
  }, []);
  const { data: completions } = useQuery<{ completions: Array<{ section: string; localDate: string }> }>({
    queryKey: ["/api/practice-completion", weekStartDay],
    queryFn: () => apiRequest("GET", `/api/practice-completion?since=${weekStartDay}`),
    staleTime: 30_000,
    enabled: anyExtraActive && !guest,
  });
  const serverDone = (section: string) =>
    !!completions?.completions?.some((c) => c.section === section && c.localDate === day);

  // Personal prayer list ("intentions") — the Prayer List routine card
  // reads real counts here (owner: "if someone has at least one prayer in
  // their prayer list, they should have a card... second line should say
  // X out of X prayers have been prayed"), not the old single manual
  // check-off flag. Fetched with ?ymd= so the server can tell us which
  // items were walked past in PrayThrough today.
  const qc = useQueryClient();
  useEffect(() => {
    const onPrayed = () => qc.invalidateQueries({ queryKey: ["/api/prayer-intentions"] });
    window.addEventListener(INTENTION_PRAYED_EVENT, onPrayed);
    return () => window.removeEventListener(INTENTION_PRAYED_EVENT, onPrayed);
  }, [qc]);
  const { data: intentionsData } = useQuery<{ intentions: Array<{ id: number; answered: boolean; prayedToday: boolean }> }>({
    queryKey: ["/api/prayer-intentions", day],
    queryFn: () => apiRequest("GET", `/api/prayer-intentions?ymd=${day}`),
    staleTime: 30_000,
    enabled: !guest,
  });
  const activeIntentions = (intentionsData?.intentions ?? []).filter((it) => !it.answered);

  // Communal prayers — owner: "make sure the practice card is accounting
  // for the communal prayers," so the routine card's "X of X" reflects the
  // WHOLE unified /prayer-list page (community + personal), not just the
  // private list. Reuses the exact query keys prayer-list.tsx / dashboard.tsx
  // already fetch elsewhere on the page, so React Query dedupes — this adds
  // no new network round-trip beyond /api/prayer-feeds/today.
  const { data: communityMomentsData } = useQuery<{ moments: Array<{ templateType: string | null; prayerFeedId: number | null; myPrayedToday?: boolean }> }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    staleTime: 30_000,
    enabled: !guest,
  });
  const { data: communityRequestsData } = useQuery<Array<{ isAnswered: boolean; needsRenewal: boolean; isOwnRequest: boolean; myAmenedToday?: boolean }>>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    staleTime: 30_000,
    enabled: !guest,
  });
  const { data: communityFeedTodayData } = useQuery<{ entries: Array<{ feedSlug: string; prayedToday: boolean }> }>({
    queryKey: ["/api/prayer-feeds/today"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/today"),
    staleTime: 30_000,
    enabled: !guest,
  });
  // Array.isArray, not `?? []` — the nullish guard only covers undefined. When
  // the API answers 500 (or an older server falls through to the SPA shell),
  // apiRequest hands back a non-array body, .filter throws, and because this
  // hook feeds the whole home screen the app lands in the error boundary:
  // "Something interrupted us" instead of a rhythm. Same shape as the other
  // list guards below, which read through an object property and so already
  // land on undefined rather than on a string.
  const othersActiveRequests = (Array.isArray(communityRequestsData) ? communityRequestsData : []).filter(
    (r) => !r.isAnswered && !r.needsRenewal && !r.isOwnRequest,
  );
  // VTS is practices-only — excluded from the prayer list everywhere else
  // (prayer-list.tsx, prayer-feed-detail.tsx, home, communities-browse); the
  // count must match or the card would show items the page never displays.
  const communityFeedEntries = (communityFeedTodayData?.entries ?? []).filter((e) => e.feedSlug !== "vts");
  const communityIntercessions = (communityMomentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession" && m.prayerFeedId == null,
  );
  const communityTotalCount = othersActiveRequests.length + communityFeedEntries.length + communityIntercessions.length;
  const communityPrayedCount =
    othersActiveRequests.filter((r) => r.myAmenedToday).length +
    communityFeedEntries.filter((e) => e.prayedToday).length +
    communityIntercessions.filter((m) => m.myPrayedToday).length;

  const intentionsTotalCount = activeIntentions.length + communityTotalCount;
  const intentionsPrayedCount = activeIntentions.filter((it) => it.prayedToday).length + communityPrayedCount;

  // Local midnight of `day` (which is recomputed from the wall clock on every
  // render), NOT a value frozen at mount. If the app stays alive across midnight
  // — backgrounded overnight on iOS, then reopened — a mount-time `useMemo([])`
  // would keep yesterday's date in BOTH the query key and the server's
  // `todaySince` param, so contemplation-stats would keep serving/counting
  // yesterday's minutes ("residual minutes from yesterday on today's routine").
  // Deriving from `day` re-keys + refetches with today's boundary the moment the
  // date rolls over (a `recheck` re-render on app resume triggers it).
  const todaySince = useMemo(() => {
    const [y, mo, d] = day.split("-").map(Number);
    return new Date(y, mo - 1, d, 0, 0, 0, 0).toISOString();
  }, [day]);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const { data: contStats } = useQuery<{ todaySeconds: number }>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`),
    staleTime: 30_000,
    enabled: !guest,
  });

  const { data: cobreathe } = useQuery<{ done: boolean; count: number }>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  const { data: rhythm } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  // Cross-device per-side contemplation done — the server echo of the
  // localStorage day-flags (a sit posts its resolved side with the session;
  // this reads it back), so a sit done on the iPhone shows done on the web.
  // ORed with the local flags below; signed-in only (guests are one-device).
  // `kind` narrows the echo to the practice this rhythm's contemplative sides
  // are actually set to, so a silent sit never reports a Creation Prayer side
  // kept (and vice versa) — the server-side half of the same rule the local
  // day-flags follow.
  // PER SIDE, so a split rule's echo is right on both. One `kind` for both
  // sides meant the side whose practice differed from the global could never
  // read done from another device — a morning sit finished on the phone stayed
  // open on the web all day. Two narrow queries rather than one wide one: the
  // server filters by kind, and the two sides may want different filters.
  const morningEchoKind = sideContemplationKind("morning");
  const eveningEchoKind = sideContemplationKind("evening");
  const { data: sidesTodayMorning } = useQuery<{ morning: boolean; evening: boolean }>({
    // Date-scoped so a day rollover always re-fetches rather than serving a
    // pre-midnight cached answer (same reasoning as contemplation-stats' key).
    queryKey: ["/api/me/contemplation-sides-today", tz, day, morningEchoKind],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-sides-today?tz=${encodeURIComponent(tz)}&kind=${morningEchoKind}`) as Promise<{ morning: boolean; evening: boolean }>,
    staleTime: 60_000,
    enabled: !guest && !!user,
  });
  const { data: sidesTodayEvening } = useQuery<{ morning: boolean; evening: boolean }>({
    queryKey: ["/api/me/contemplation-sides-today", tz, day, eveningEchoKind],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-sides-today?tz=${encodeURIComponent(tz)}&kind=${eveningEchoKind}`) as Promise<{ morning: boolean; evening: boolean }>,
    staleTime: 60_000,
    enabled: !guest && !!user,
  });
  // Each side reads the echo fetched with ITS OWN kind.
  const sidesToday = {
    morning: !!sidesTodayMorning?.morning,
    evening: !!sidesTodayEvening?.evening,
  };

  const { data: prayerStreak } = useQuery<{ gardenPrayedTodayCount?: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    staleTime: 60_000,
    enabled: !guest,
  });

  // Server-backed reflection reads (CAC + FDD + SSJE + VTS) for today — so the
  // Reflect anchor is correct on a device that didn't do the reading (e.g. web,
  // after reading on mobile). OR'd with the instant local flag below.
  const { data: reflRead } = useQuery<Partial<Record<TrackedReflection, boolean>>>({
    queryKey: ["/api/me/reflections-read", day],
    queryFn: () => apiRequest("GET", `/api/me/reflections-read?ymd=${day}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  /**
   * The newest Taizé meditation, for the inbox card.
   *
   * NOT keyed on the day, unlike almost every query in this hook — the
   * meditations arrive irregularly (measured: 27 Aug, 13 Aug, 6 Aug, 30 Jul),
   * so a per-day key would refetch daily to learn nothing. Half an hour is
   * plenty for something published weekly-ish, and the server caches it again
   * behind that so one fetch serves every device.
   *
   * Fetched only when the card is actually in the rhythm; an empty response
   * (204 when nothing parsed) simply leaves the inbox empty.
   */
  /**
   * The newest reflection from any group this person belongs to.
   *
   * Signed-in only — it is scoped to membership, and a guest belongs to no
   * group. The route answers 204 when there is nothing, which arrives here as
   * an empty body; `?? null` keeps that out of the card.
   */
  const { data: groupReflectionRaw } = useQuery<{
    id: string; reflectionId: number; title: string; body: string;
    authorName: string | null; groupName: string | null; published: string | null;
    url: string | null; openExternally: boolean; ctaLabel: string | null; read: boolean;
  } | null>({
    queryKey: ["/api/me/group-reflection/latest"],
    queryFn: () => apiRequest("GET", "/api/me/group-reflection/latest"),
    staleTime: 10 * 60_000,
    enabled: !guest,
  });

  const { data: taizeLatest } = useQuery<InboxItem | null>({
    queryKey: ["/api/taize/latest"],
    // `?? null` because these routes answer 204 when nothing is published, and
    // apiRequest turns an empty body into undefined — which react-query treats
    // as a programming error ("Query data cannot be undefined") and throws,
    // instead of simply meaning "the inbox is empty". Seen in the console the
    // first time these three cards were exercised.
    queryFn: async () => (await apiRequest("GET", "/api/taize/latest")) ?? null,
    staleTime: 30 * 60_000,
    enabled: taizeActive,
  });
  /**
   * THE OTHER TWO INBOXES, on exactly the same terms — Joan Chittister's
   * weekly and the National Cathedral's sermons (owner: "try to integrate the
   * weekly here", "doing National Cathedral Sermons as a newsletter in the
   * imbox way"). Both publish real RSS, both are resolved server-side, and
   * both are fetched only when their card is actually in the rhythm.
   */
  const { data: chittisterLatest } = useQuery<InboxItem | null>({
    queryKey: ["/api/chittister/latest"],
    queryFn: async () => (await apiRequest("GET", "/api/chittister/latest")) ?? null,
    staleTime: 30 * 60_000,
    enabled: chittisterActive,
  });

  // ANY tracked source counts as "reflected today" — spelled out per source
  // it would quietly stop counting the next one added (this line already had
  // that shape and was missing Nouwen, Sojourners and Grist).
  const reflectDone = reflectLocal || Object.values(reflRead ?? {}).some(Boolean);

  // What the user prays for the office — global default (office-prefs) OR a
  // per-side override. Mirrors the home prayer card's resolution, so the
  // Morning/Evening anchors read "Devotion"/"Prayer"/"Pray together" to match.
  const { data: officePrefs } = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions"; contemplationGoalMinutes?: number; dailyStepGoal?: number; dailyStepReachedDate?: string | null; morning?: string; evening?: string }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
    enabled: !guest,
  });
  // "Grow my silence" ladder — the GET also runs the server-side daily catch-up
  // eval (advancing / easing the rung) and returns the authoritative current
  // rung. Only fetched when the user has the ladder enabled; `day` in the key
  // refetches each local day so the eval runs once a day.
  const ladderEnabled = !!user?.silenceLadder?.enabled;
  const { data: ladderData } = useQuery<{ enabled: boolean; level?: number; levelDays?: number; daysToNext?: number; nextLevel?: number; atMax?: boolean }>({
    queryKey: ["/api/me/silence-ladder", day],
    queryFn: () => apiRequest("GET", "/api/me/silence-ladder"),
    enabled: ladderEnabled,
    staleTime: 60_000,
  });
  const dpl = officePrefs?.defaultPrayerLevel;
  const ml = getSideLevel("morning");
  const el = getSideLevel("evening");
  const prayerKind: PrayerKind =
    (dpl === "office" || ml === "office" || el === "office") ? "office"
    : (dpl === "devotion" || ml === "devotion" || el === "devotion") ? "devotion"
    : (dpl === "intercessions" || ml === "intercessions" || el === "intercessions") ? "community"
    : "devotion";

  // The LAST row of the week is only today's when its ymd IS today. The re-keyed
  // query above refetches at rollover, but React Query still hands back the
  // previous data while that refetch is in flight (and an offline/persisted
  // cache may never refresh) — so guard the read too, or a stale last row keeps
  // the offices marked "Prayed" into the new day. Same check dashboard.tsx makes.
  const lastOfficeDay = officeHistory?.days?.[officeHistory.days.length - 1];
  const todayOffice = lastOfficeDay?.ymd === day ? lastOfficeDay : undefined;
  /**
   * Anchor-vs-extra, read from the SERVER — the counterpart to
   * anchorModesFor/extraModesFor's LOCAL read.
   *
   * Reported: a secondary practice logged correctly on the phone (the local
   * flag), but the OTHER device (web) showed the ANCHOR as done instead.
   * todayOffice.morning/.evening are a blunt "was ANY known surface logged for
   * this side" boolean (fine for the weekly grid, which only wants a per-day
   * dot) — a side's second practice satisfies that boolean exactly as well as
   * its anchor does, so it can't tell them apart. todayOffice.surfaces carries
   * the RAW surfaces instead, so these ask the SAME "which specific practice"
   * question of the server's data that officeLocal already asks of this
   * device's own flags.
   *
   * `surfaces` is undefined for a response cached from before this field
   * existed — falls back to the old blunt boolean for the ANCHOR check only
   * (never worse than today), and to `false` for the extra (which had no
   * server signal at all before this).
   */
  const anchorSurfaceHit = (side: "morning" | "evening"): boolean => {
    const surfaces = todayOffice?.surfaces;
    if (!surfaces) return side === "morning" ? !!todayOffice?.morning : !!todayOffice?.evening;
    return anchorModesFor(side).some((m) => {
      const surf = officeModeToSurface(m);
      return surf != null && surfaces.includes(surf);
    });
  };
  const extraSurfaceHit = (side: "morning" | "evening"): boolean => {
    const surfaces = todayOffice?.surfaces;
    if (!surfaces) return false;
    return extraModesFor(side).some((m) => {
      const surf = officeModeToSurface(m);
      return surf != null && surfaces.includes(surf);
    });
  };
  // A side is kept when the practice that side is SET TO has been done. Every
  // level that can be a side's prayer needs a clause here — a missing one means
  // that side can never be marked kept and its dot stays unlit forever, which
  // is exactly what happened to `examen` and `creation` (reflect-sit): they
  // were selectable as a side's prayer but had no clause, so the card was
  // permanently open. `examen` is tracked by the shared practice flag;
  // `reflect-sit`/creation by the per-side contemplation day-flag (which, since
  // today, also carries WHICH contemplative practice was kept).
  const examenKept = practiceLocal.examen || serverDone("examen");
  // Same expression as morning/eveningContemplationDone below — inlined because
  // those are declared further down (after the per-side active flags) and this
  // block runs first.
  const morningSatKept = contemplationSideDone.morning || sidesToday.morning;
  const eveningSatKept = contemplationSideDone.evening || sidesToday.evening;
  // (The Prayer List no longer satisfies a side — owner, 2026-08-26: "take
  // your prayer list out of the morning and evening side." It's a standalone
  // practice with its own card, dot and weekly row; the office anchors are
  // kept by praying them.)
  /**
   * WHETHER IT WAS KEPT — not whether the module is visible.
   *
   * Reported: "the prayer list is not counting as done, I have gone through it
   * several times… it needs to log", and "this was working yesterday."
   *
   * This used to AND in prayerListActive, which is purely a home-layout
   * visibility flag (`!hidden.has("prayer-list")`). The card, though, renders
   * off intentionsTotalCount > 0 — having prayers waiting, regardless of the
   * layout. So the moment "prayer-list" landed in `hidden`, the card went on
   * showing and prayerListDone was pinned false forever: walking the whole
   * slideshow, marking the practice, syncing the server, none of it could move
   * a value that was ANDed against a hidden flag.
   *
   * And it lands in `hidden` easily — adoptRule sets extras.prayerList = false,
   * so commit() pushes "prayer-list" into offKeys. Adopting ANY preset today
   * silently made this card uncompletable, which is exactly the regression:
   * it worked yesterday, before the routine was re-committed.
   *
   * Doneness and visibility are now separate questions, and each consumer
   * pairs this with its own activity test (see the dot below, which uses the
   * same intentionsTotalCount gate the card does).
   */
  const prayerListDone = practiceLocal.prayerList || serverDone("prayer-list");
  /**
   * A side whose custom anchor names a real practice completes when THAT
   * practice is kept.
   *
   * Owner: "the framework that the Audio Divina could be your morning or
   * evening anchor." Without this the anchor is a checkbox wearing the
   * practice's name — you could listen for twenty minutes and your morning
   * would still read as unprayed, because the two knew nothing about each
   * other.
   *
   * Reads the RAW done signals, not listeningDone / walkDone / cobreatheDone
   * below: those are gated on the practice having its own home card, which is
   * exactly what it doesn't have when it's serving as the anchor.
   */
  const anchorPracticeDone = (side: "morning" | "evening"): boolean => {
    if (getSideLevel(side) !== "custom") return false;
    const practice = anchorPracticeFor(getSideCustomName(side));
    if (!practice) return false;
    if (practice.key === "cobreathe") return cobreathe?.done ?? false;
    return practiceLocal[practice.key] || serverDone(practice.key);
  };

  const morningDone = officeLocal.morning || (!officeUndone.morning && (anchorSurfaceHit("morning")
    || (ml === "fdd" && prayerRead.fddMorning) || (ml === "readings" && prayerRead.readingsMorning)
    || (ml === "psalms" && prayerRead.psalmsMorning)
    || (ml === "guided-prayer" && prayerRead.guidedPrayerMorning)
    || (ml === "custom" && (prayerRead.customMorning || anchorPracticeDone("morning")))
    || (ml === "examen" && examenKept)
    || (ml === "reflect-sit" && morningSatKept)));
  const eveningDone = officeLocal.evening || (!officeUndone.evening && (anchorSurfaceHit("evening")
    || (el === "fdd" && prayerRead.fddEvening) || (el === "readings" && prayerRead.readingsEvening)
    || (el === "psalms" && prayerRead.psalmsEvening)
    || (el === "guided-prayer" && prayerRead.guidedPrayerEvening)
    || (el === "custom" && (prayerRead.customEvening || anchorPracticeDone("evening")))
    || (el === "examen" && examenKept)
    // Compline satisfies the evening anchor ONLY when it IS that anchor.
    // officeLocal.evening deliberately no longer folds the compline flag in
    // (see officeLocalDone's sides list): as a standalone add-on card,
    // praying Compline is its own act and must not tick Evening Prayer.
    || (el === "compline" && (officeLocal.compline || !!todayOffice?.compline))
    || (el === "reflect-sit" && eveningSatKept)));

  // Contemplation (was "Silence"): today's minutes = Phoebe in-app sits only
  // (a Cobreathe breath logs a contemplation sit, so it's already counted
  // here). It only counts as KEPT once the daily goal is met — if no goal is
  // set, any silence counts. GUESTS can't post prayer_sessions — their minutes
  // come from the device-local sit tally.
  const contemplationMin = guest
    ? getGuestSilenceMinutesToday()
    : Math.floor((contStats?.todaySeconds ?? 0) / 60);
  const rawGoalMin = officePrefs?.contemplationGoalMinutes ?? 0;
  // Starter rule: an un-set-up user (no saved home layout) gets a 5-minute
  // silence by default — alongside Morning/Evening Psalms + Forward Day by Day.
  // Once they customize (which writes a home layout) their chosen goal wins,
  // including 0 = "no daily goal". The column's DB default is 0, so the value
  // alone can't tell uncustomized-0 from chosen-0 — the home layout is the
  // "have they designed a rule yet?" signal (same as the reflection fallback).
  // When the ladder is on, the current rung IS the goal (the ladder GET just
  // re-evaluated it). Otherwise a saved goal, or the 5-minute starter default.
  // GUESTS have no server pref or ladder — the goal is the device-local guest
  // key (seeded at 5 min; the guest customizer's silence step rewrites it).
  const ladderLevel = ladderEnabled && typeof ladderData?.level === "number" ? ladderData.level : null;
  const contemplationGoalMin = guest
    ? getGuestSilenceGoalMin()
    : ladderLevel != null ? ladderLevel : ((!hl && rawGoalMin === 0) ? 5 : rawGoalMin);

  const examenDone = examenActive && (practiceLocal.examen || serverDone("examen"));
  const listeningDone = listeningActive && (practiceLocal.listening || serverDone("listening"));
  const readingDone = readingActive && (practiceLocal.reading || serverDone("reading"));
  const podcastsDone = podcastsActive && (practiceLocal.podcasts || serverDone("podcasts"));
  const walkDone = walkActive && (practiceLocal.walk || serverDone("walk"));
  const visioDone = visioActive && (practiceLocal.visio || serverDone("visio"));
  const iconsDone = iconsActive && (practiceLocal.icons || serverDone("icons"));
  /**
   * THE INBOX'S DONE, which is deliberately not any of the machinery above.
   *
   * practiceLocal and serverDone are both keyed on the DAY. Reading either
   * here would put a meditation someone already read back in front of them
   * every morning until Taizé posted again — the exact behaviour an inbox
   * exists to avoid. `waitingMeditation` answers the only question that
   * matters: is anything unread right now.
   *
   * Empty inbox counts as DONE, not as absent. A card that is active but can
   * never be completed holds allHabitsDone false all day, so the day would
   * never read as finished in the week between meditations.
   */
  const taizeWaiting = taizeActive ? waitingMeditation(taizeLatest) : null;
  const taizeDone = taizeActive && taizeWaiting == null;
  /**
   * Waiting only while UNREAD. The server tells us whether this person has
   * read it (per-user, not per-device — see the route), so a reflection read
   * on another device simply never becomes a card here.
   *
   * Deliberately NOT folded into allHabitsDone: a reflection someone else
   * wrote this week is an offer, not a duty, and letting it hold the day open
   * would make another person's writing decide whether your day is complete.
   */
  const groupReflection = groupReflectionRaw && !groupReflectionRaw.read
    ? {
        id: groupReflectionRaw.id,
        reflectionId: groupReflectionRaw.reflectionId,
        title: groupReflectionRaw.title,
        body: groupReflectionRaw.body,
        authorName: groupReflectionRaw.authorName,
        groupName: groupReflectionRaw.groupName,
        published: groupReflectionRaw.published,
        url: groupReflectionRaw.url ?? null,
        openExternally: !!groupReflectionRaw.openExternally,
        ctaLabel: groupReflectionRaw.ctaLabel ?? null,
      }
    : null;
  // Same rule for the other two: an empty inbox is DONE, not absent, or the
  // day could never read as finished in the week between publications.
  const chittisterWaiting = chittisterActive ? waitingItem("chittister", chittisterLatest) : null;
  const chittisterDone = chittisterActive && chittisterWaiting == null;
  // Compline is an OFFICE, so its done-state comes from the office flags (the
  // office viewer's local stamp) — not the practice_completion table the
  // logging-first practices use.
  //
  // ONLY its own flag. This used to also accept `todayOffice.evening`, which
  // meant praying Evening Prayer silently ticked the separate Compline card
  // too — two distinct offices sharing one completion token, the same
  // shared-flag class of bug as the Psalms/office one. When Compline is the
  // EVENING ANCHOR (el === "compline") it isn't a separate card at all — it
  // satisfies eveningDone below and complineActive is false — so there's no
  // case where the two should credit each other.
  const complineDone = complineActive && (officeLocal.compline || (!officeUndone.compline && !!todayOffice?.compline));
  // Co-Breathe is kept once a sit is completed today (server-tracked).
  const cobreatheDone = cobreatheActive && (cobreathe?.done ?? false);

  // The four core anchors plus whichever optional practices the user added.
  // Evening is an OPT-IN anchor — off by default (evening office pref "none"),
  // so an un-set-up user keeps three dots: morning · contemplation · reflection.
  // The customizer (rule-of-life) sets the evening pref to a level when enabled,
  // which flips this on. While prefs load, treat evening as off (no flash).
  // Each core anchor is part of the rhythm only when the user keeps it:
  // morning/evening prayer when the office pref isn't "none", contemplation
  // when a goal is set, reflection when a source is chosen. While prefs load we
  // fall back to each anchor's SERVER default (morning "devotion", goal 5 min,
  // reflection on, evening off) so the default-on anchors don't pop in once the
  // prefs query lands — only the genuinely-off ones stay hidden.
  const reflectionSource = useEffectiveReflectionSource();
  // Whether an office is part of the rhythm must come from its CHOSEN LEVEL
  // (set by the customizer's setSideLevel), NOT the `morning`/`evening` reminder
  // field — `commit` writes that reminder field to "none" whenever the user
  // declines a reminder, which was hiding the office anchor for anyone who
  // picked the office but no reminder. A real level (anything but "ask"/"none")
  // means the office is in the rhythm; otherwise fall back to the server pref
  // (cross-device + the un-set-up morning-on default).
  // A chosen office level (anything but the "ask"/not-chosen sentinel or null)
  // means the office is in the rhythm. null falls back to the server pref.
  const isActiveLevel = (l: typeof ml) => l != null && l !== "ask";
  // For "is this side part of the rhythm?" use the EXPLICIT level (null unless the
  // user actually chose one) — NOT getSideLevel, whose new-user defaults
  // (morning "intercessions", evening "reflect-sit") are active levels and would
  // force a side on even after the user turned it OFF in the customizer.
  const mlExplicit = getExplicitSideLevel("morning");
  const elExplicit = getExplicitSideLevel("evening");
  // Has the user designed a rule yet? A saved home layout is ONE signal (for a
  // guest, the device-local cached layout their customizer writes) — but the
  // basic /customize page sets an explicit per-side level directly WITHOUT
  // ever saving a home layout, so an explicit level on either side counts too.
  // Without this, turning a side OFF ("ask") via the basic customizer had no
  // effect: customized stayed false, the fallback branch below ignored the
  // explicit "ask" and kept the side on anyway (a stale default masquerading
  // as "the office is still your prayer").
  const customized = !!hl || mlExplicit != null || elExplicit != null;
  // A side a CUSTOMIZED user explicitly set on THIS device is authoritative —
  // "ask" means they turned it off, and that wins even over a stale server pref
  // (e.g. an office-prefs PUT that was dropped). With no explicit local level we
  // fall back to the cross-device server pref (off unless it's a real office).
  // Un-set-up users keep the starter rule (Morning + Evening on by default).
  const morningActive = customized
    ? (mlExplicit != null ? isActiveLevel(mlExplicit) : ((officePrefs?.morning ?? null) != null && officePrefs?.morning !== "none"))
    : (isActiveLevel(ml) || (officePrefs?.morning ?? "devotion") !== "none");
  const eveningActive = customized
    ? (elExplicit != null ? isActiveLevel(elExplicit) : ((officePrefs?.evening ?? null) != null && officePrefs?.evening !== "none"))
    : (isActiveLevel(el) || (officePrefs?.evening ?? "devotion") !== "none");
  // Per-side Contemplative Prayer → the home's Morning / Evening Contemplation
  // cards. A per-side card appears ONLY when the user EXPLICITLY chose
  // Contemplative Prayer on that side in the customizer (which writes the
  // per-side flag). A plain minutes goal with NO per-side pick is NOT a per-side
  // card — it renders as the single "solo silence" goal card below (the same
  // shape guests / logged-out users see), so the two views stay consistent.
  //
  // This deliberately does NOT auto-migrate a bare goal into BOTH per-side cards.
  // That old behavior added a phantom "Morning Contemplation" on login: the
  // per-side flags are device-local (not server-synced), so a signed-in user's
  // fresh session has none set, and the office-prefs GET default goal (5) then
  // flipped both sides on — a card the user never asked for. A goal is a goal;
  // per-side contemplation is only what they picked per side.
  /**
   * WHICH contemplative practice each side keeps — PER SIDE.
   *
   * Owner: "let's separate creation prayer and contemplative prayer." One
   * global flag used to answer this for the whole rule, so a person could
   * keep the breath OR silence but never both, and every attempt to hold both
   * produced the same bug in a new place. The kind lives on the side now (see
   * officePrefs.getSideContemplationKind), falling back to the old global for
   * a rule that predates the key.
   *
   * `contemplationStyle` stays as the AGGREGATE for the surfaces that have no
   * side to ask about (the standalone breath card, /cobreathe's own entry).
   * It reads "cobreathe" when either side keeps the breath — so it can no
   * longer be used to decide what a PARTICULAR side is; use the per-side
   * values for that.
   */
  const morningContemplationKind = getSideContemplationKind("morning");
  const eveningContemplationKind = getSideContemplationKind("evening");
  // "timer" (default) opens the countdown timer; "manual" just marks the sit
  // done on tap — owner: "log method... either timer or manual log."
  const contemplationLogMethod = getContemplationLogMethod();
  const perSideContemplationSet = getSideContemplationExplicit("morning") !== null || getSideContemplationExplicit("evening") !== null;
  // A guest who has NOT explicitly chosen per-side contemplation keeps the ONE
  // silence goal card (their default 5-min sit renders as the aggregate solo
  // card below), NOT two per-side cards. But a guest who DID explicitly pick a
  // per-side anchor — e.g. Creation Prayer (the breath) as Morning + Evening in
  // the basic /customize editor, which sets both per-side flags — must get the
  // Morning/Evening Creation Prayer cards like any signed-in user. So the guest
  // restriction applies only to the un-chosen fallback branch, not the explicit
  // per-side pick.
  const morningContemplationActive = customized
    ? (perSideContemplationSet ? getSideContemplation("morning") : false)
    : (!guest && getSideLevel("morning") === "reflect-sit");
  const eveningContemplationActive = customized
    ? (perSideContemplationSet ? getSideContemplation("evening") : false)
    : (!guest && getSideLevel("evening") === "reflect-sit");
  // Local day-flag OR the server's cross-device echo — a sit done on another
  // device (which POSTed its contemplationSide) reads done here too.
  /**
   * A side whose practice is a WALK, SACRED LISTENING or VISIO DIVINA is kept
   * when that practice is kept — those have their own done-flags and their own
   * pages; they were never sit-shaped. (The sit and the breath keep the
   * per-side day-flag + the cross-device echo above.)
   */
  const kindKept = (kind: SideContemplationKind): boolean | null =>
    // The raw keeping, NOT the *Done flags — those are gated on *Active (the
    // standing all-day card), and a side that keeps the practice as its own
    // anchor deliberately has no standing card.
    kind === "walk" ? (practiceLocal.walk || serverDone("walk"))
      : kind === "audio" ? (practiceLocal.listening || serverDone("listening"))
        : kind === "visio" ? (practiceLocal.visio || serverDone("visio"))
          : null;
  const morningContemplationDone = kindKept(morningContemplationKind)
    ?? (contemplationSideDone.morning || sidesToday.morning);
  const eveningContemplationDone = kindKept(eveningContemplationKind)
    ?? (contemplationSideDone.evening || sidesToday.evening);
  // SOLO silence — a daily minutes goal with NO per-side contemplation card on
  // either side. The goal must still be visible somewhere, so it gets its own
  // single "Silence" card with a progress bar (DailyProgressBody) and exactly
  // one dot below. Guests are always in this shape (their per-side flags are
  // forced off above); a signed-in user lands here by setting minutes on the
  // Silence step without checking Contemplative Prayer on a side.
  const soloSilenceActive = contemplationGoalMin > 0 && !morningContemplationActive && !eveningContemplationActive;
  // Aggregate, for the single-silence consumers (splash / widget / prayer-mode /
  // routine-print / TodaysRhythm): active if either side is, or the solo goal
  // is; done when every active side is kept — or, solo, when today's minutes
  // have reached the goal (goal-met semantics — the progress bar stays visible
  // while under goal).
  const silenceActive = morningContemplationActive || eveningContemplationActive || soloSilenceActive;
  const silenceDone = soloSilenceActive
    ? contemplationMin >= contemplationGoalMin
    : (silenceActive
      && (!morningContemplationActive || morningContemplationDone)
      && (!eveningContemplationActive || eveningContemplationDone));
  // Creation Prayer (the breath) as the per-side style: the home suppresses the
  // standalone Co-Breathe card (the per-side cards ARE it) but ALSO renders the
  // minutes-goal card alongside (the breath cards never show goal progress).
  // These two mirror those exact render rules so dots/counts match the cards.
  const morningIsCreation = morningContemplationActive && morningContemplationKind === "creation";
  const eveningIsCreation = eveningContemplationActive && eveningContemplationKind === "creation";
  const creationPerSide = morningIsCreation || eveningIsCreation;
  // The aggregate, for consumers with no side in hand. Derived from the sides
  // that are actually ON rather than from the raw flag, so a stale global left
  // over from a practice nobody keeps any more can't speak for the rule.
  const contemplationStyle: "silent" | "cobreathe" = creationPerSide
    ? "cobreathe"
    : ((morningContemplationActive || eveningContemplationActive)
      ? "silent"
      : (getContemplationStyleGlobal() === "creation" ? "cobreathe" : "silent"));
  /**
   * Suppressed only by a per-side SILENT sit — the same rule the edit list,
   * the review screen and the server's describeSpec now all share. The old
   * gate special-cased CREATION and treated every other kind as silence, so
   * the moment a side became Visio Divina (or a walk, or listening) the
   * 60-minute goal lost its card: still named in the customizer's Silence
   * row, invisible on the home, and the day completed without it. A visio
   * side prays with an image; it doesn't keep the silence.
   */
  const silentPerSide = (morningContemplationActive && morningContemplationKind === "silent")
    || (eveningContemplationActive && eveningContemplationKind === "silent");
  const silenceGoalCardActive = contemplationGoalMin > 0 && !silentPerSide;
  // goal > 0 is load-bearing: with no goal this was `0 >= 0` — true from
  // midnight — and /turn-learn-pray's contemplative slot read "kept" before
  // the person had done anything, every day, for anyone without a minutes
  // goal. A card that isn't active can't be done.
  const silenceGoalCardDone = contemplationGoalMin > 0 && contemplationMin >= contemplationGoalMin;
  const cobreatheStandaloneActive = cobreatheActive && !creationPerSide;
  // Each reflection newsletter the user follows is its OWN anchor (card + dot).
  // The selected set is the reflection home-modules that are on; an un-set-up
  // user with no saved layout falls back to the single effective source.
  // ALL SEVEN. Owner: "make sure all reflections are availble in the
  // customizer and they save when a user implements them" — a source missing
  // from this list can be turned on in a layout and still never appear, since
  // this is what turns a saved module into a card with a dot.
  const REFLECT_SOURCES = ["fdd", "cac", "ssje", "vts", "nouwen", "sojo", "grist"] as const;
  const reflectLocalDone: Record<TrackedReflection, boolean> = {
    fdd: hasReadFddToday(), cac: hasReadCacToday(), ssje: hasReadSsjeToday(),
    vts: hasReadVtsToday(), nouwen: hasReadNouwenToday(), sojo: hasReadSojoToday(),
    grist: hasReadGristToday(),
  };
  const reflectDoneFor = (s: TrackedReflection): boolean =>
    reflectLocalDone[s] || !!reflRead?.[s];
  const fromLayout = REFLECT_SOURCES.filter((s) => homeCardActive(hl, s));
  // New-user default rule includes a reflection (Forward Day by Day). When the
  // user has NO saved home layout (un-set-up), fall back to the single effective
  // reflection source — defaults to FDD, or "none" if they turned reflections
  // off. A user who HAS customized their layout keeps exactly the reflection
  // cards they chose there (no auto-add). (Guests: same rule against the local
  // cached layout — the seeded guest rule reaches FDD via this fallback.)
  const reflectFallback: TrackedReflection[] =
    (!hl && reflectionSource !== "none" && (REFLECT_SOURCES as readonly string[]).includes(reflectionSource))
      ? [reflectionSource as TrackedReflection]
      : [];
  const chosenReflections: TrackedReflection[] =
    fromLayout.length > 0 ? [...fromLayout] : reflectFallback;
  // Drop VTS from the selected set when it shouldn't count today, so it
  // neither shows a card nor sits in the rhythm as a permanently-undone
  // anchor. Two independent reasons:
  //   • not entitled — the Dean's Commentary is VTS-follower-only, and a
  //     layout saved while following must stop counting once they unfollow;
  //   • the weekend — VTS only publishes weekdays (isVtsPublishingDay).
  // The card self-hides for both too, but doing it here is what keeps
  // reflectActive/reflectDone honest when VTS is the ONLY chosen source
  // (otherwise the day could never read as complete).
  const vtsCountsToday = entitlements.vts && isVtsPublishingDay();
  /**
   * …and drop a source a SIDE'S ANCHOR already is.
   *
   * Reported: "I turned on Forward Day by Day for morning, but it then had it
   * twice" — a 🌅 "Forward Day by Day · Prayed today" anchor card AND a 📖
   * "Forward Day by Day · Kept today" newsletter card, for one reading. FDD is
   * the one reflection source that can also be an office level, and the
   * newsletter set is read from the home layout, which knows nothing about the
   * anchors. Same rule the standalone Examen card already follows (suppressed
   * when a side's anchor IS the Examen): the anchor owns the practice, so the
   * add-on card stands down. Filtered HERE, at the same seam as the VTS drop,
   * so the card, the dot, reflectActive and the done-count all agree.
   */
  const anchorReflectionSources = new Set(
    (["morning", "evening"] as const)
      // "fdd" is a SENTINEL for "a newsletter is this side's prayer" — WHICH
      // one comes from the side's own reflection pref, so match on the source,
      // never on the level. Matching the level alone would hide the Forward
      // Day by Day card for someone whose anchor actually reads the CAC.
      .filter((sd) => getSideLevel(sd) === "fdd")
      .map((sd) => getSideReflectionExplicit(sd) ?? "fdd"),
  );
  const selectedReflections = (vtsCountsToday
    ? chosenReflections
    : chosenReflections.filter((s) => s !== "vts")
  ).filter((s) => !anchorReflectionSources.has(s));
  const reflections = selectedReflections.map((s) => ({ source: s, done: reflectDoneFor(s) }));
  const reflectActive = reflections.length > 0;
  // Count contemplation PER SIDE (Morning + Evening Contemplation), matching the
  // two per-side cards the home renders — not the single `silenceActive`
  // aggregate, which under-counted the dots (2 dots for 3 cards). silenceActive/
  // silenceDone stay as aggregates for the splash/widget/what's-next consumers.
  // Declared ABOVE coreFlags because coreFlags now counts them. They used to
  // live ~60 lines below it; reading them from there would be a
  // use-before-declaration evaluated during render — a throw, not a misread.
  const morningExtraLevel = extraModesFor("morning").length > 0 ? getSideExtra("morning") : null;
  const eveningExtraLevel = extraModesFor("evening").length > 0 ? getSideExtra("evening") : null;
  /**
   * …and honour an undo of THIS practice specifically.
   *
   * The extra's ✓ passes onlyMode, which deliberately sets no SIDE tombstone —
   * masking the side would un-do the anchor too. But with no tombstone at all,
   * clearing the local flag left extraSurfaceHit reading the untouched server
   * row, so the card un-ticked and then lit straight back up on the next
   * refetch. undoOfficeToday now stamps a mode-scoped tombstone; this reads it.
   */
  const extraModeUndone = (side: "morning" | "evening"): boolean => {
    const modes = extraModesFor(side);
    return modes.length > 0 && modes.every((m) => isOfficeModeUndoneToday(m));
  };
  const morningExtraDone = officeLocal.morningExtra
    || (!extraModeUndone("morning") && extraSurfaceHit("morning"));
  const eveningExtraDone = officeLocal.eveningExtra
    || (!extraModeUndone("evening") && extraSurfaceHit("evening"));
  const coreFlags = [
    ...(morningActive ? [morningDone] : []),
    // A side's SECOND practice has its own card, so it needs its own dot. It
    // had neither a dot here nor a row in the weekly grid, so the pill counted
    // fewer anchors than the home showed cards — and "the day is kept" could
    // never fire for anyone keeping two practices on a side, because the
    // second one's completion was counted nowhere.
    ...(morningExtraLevel ? [morningExtraDone] : []),
    ...(morningContemplationActive ? [morningContemplationDone] : []),
    // The SOLO Silence goal anchor — one goal card (with a progress bar) when
    // neither side carries a contemplation card (all guests; signed-in users
    // who set only the minutes goal), so it counts exactly one dot here and
    // the dots always match the cards.
    ...(silenceGoalCardActive ? [silenceGoalCardDone] : []),
    ...reflections.map((r) => r.done),
    ...(eveningActive ? [eveningDone] : []),
    ...(eveningExtraLevel ? [eveningExtraDone] : []),
    ...(eveningContemplationActive ? [eveningContemplationDone] : []),
  ];
  /**
   * A practice that can ALSO be kept by praying the office (VTS's Chapel).
   *
   * Chapel is sometimes Morning Prayer, and a student without the physical
   * prayer book should be able to pray it here and have it count (owner). The
   * practice's log sheet offers "Open Morning Prayer"; taking that door leaves
   * an intent stamp, and the credit is DERIVED here from that stamp plus the
   * office's own completion — rather than written when the office finishes.
   *
   * Derived, because the office already owns the fact of being prayed (it
   * counts only when its slideshow is finished) and a second stamp could
   * disagree with it. Doing it HERE, above the flags, is what keeps the card,
   * the day's dots and the widget reading one value — the completion-signal
   * invariant this hook exists to hold.
   */
  const customAnchorsWithOfficeCredit = customAnchors.map((a) => (
    !a.done && a.office && hasAnchorOfficeIntentToday(a.id)
      // THE OFFICE'S OWN FLAG, not the side's done-state.
      //
      // morningDone answers "is this person's morning practice complete",
      // which is a different question. VTS's morning is Simple Guided
      // Prayer, so completing SGP would have credited Chapel for an office
      // nobody prayed — and on a side carrying a second practice the reverse
      // also failed, because the side's completion modes exclude the full
      // office there. isOfficeLoggedToday asks the only question this
      // feature is about: was Morning Prayer itself prayed today.
      && isOfficeLoggedToday(a.office)
      ? { ...a, done: true }
      : a
  ));

  const extraFlags = [
    ...(cobreatheStandaloneActive ? [cobreatheDone] : []),
    ...(listeningActive ? [listeningDone] : []),
    ...(readingActive ? [readingDone] : []),
    ...(podcastsActive ? [podcastsDone] : []),
    ...(walkActive ? [walkDone] : []),
    ...(visioActive ? [visioDone] : []),
    ...(iconsActive ? [iconsDone] : []),
    ...(complineActive ? [complineDone] : []),
    // Only an anchor when there IS a list. The layout check alone counted it
    // for everyone — including guests, whose intentions query never runs — so
    // totalAnchors carried a practice with no card and no dot, doneCount
    // stopped one short forever, and "the day is kept" could never fire. The
    // card and the pill dot already gate on this; the count now agrees.
    // Matches the CARD's own gate (prayerListActiveCard = intentionsTotalCount
    // > 0) so the pill can't count a different number of practices than the
    // home shows. Guests, whose intentions query never runs, stay excluded.
    ...(intentionsTotalCount > 0 ? [prayerListDone] : []),
    ...(examenActive ? [examenDone] : []),
    /**
     * THE THREE INBOXES COUNT — they draw a card, so they get a dot.
     *
     * They were left out of both flag lists, so the home could report "the
     * day is kept" and play the whole-routine swell with an unread Taizé
     * meditation still sitting in Next, and the widget's dot count disagreed
     * with the home's. Card, dot, pill and widget read one computation; that
     * is the rule these three were quietly outside of.
     *
     * Their `done` is already the right shape: `waiting == null` means either
     * nothing new was published or this one has been read, and neither is a
     * thing the person still owes today. That is what makes an inbox an
     * inbox — an empty one is kept, not skipped.
     */
    ...(taizeActive ? [taizeDone] : []),
    ...(chittisterActive ? [chittisterDone] : []),
    // "Not today" customs drop out entirely — no dot, not counted. Same for a
    // custom scoped to weekdays on a day it isn't kept (anchorOnDay): it draws
    // NO card on that day, so counting it here would add a dot that can never
    // fill and hold `allHabitsDone` false all Saturday — the day could never
    // read as complete.
    ...customAnchorsWithOfficeCredit.filter((a) => !a.skipped && anchorOnDay(a)).map((a) => a.done),
  ];
  const allFlags = [...coreFlags, ...extraFlags];
  const totalAnchors = allFlags.length;
  const doneCount = allFlags.filter(Boolean).length;

  // Have the queries that determine each card's done-state resolved? Until
  // they have, every "*Done" flag reads false, so the cards would all render
  // under "Next" and then visibly jump into "Done" as the data lands. Consumers
  // gate their first paint on this to fade in the settled split instead of
  // animating that reshuffle. (Cached navigations resolve synchronously, so
  // this is true on the first render and the fade just plays once.)
  // Offline, the per-anchor completions query can't load (and may not be cached
  // on a cold boot), so don't let it block the routine from painting — the
  // structure still comes from the persisted office history / prefs / layout.
  // The extras just read "not done yet" until the connection returns.
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // A GUEST has no server queries to settle — the rhythm is device-local, so
  // the first paint is ready immediately.
  const ready = guest || (
    officeHistory !== undefined &&
    contStats !== undefined &&
    reflRead !== undefined &&
    officePrefs !== undefined &&
    (!anyExtraActive || completions !== undefined || offline) &&
    /**
     * The three inboxes settle before the first paint too.
     *
     * `waitingItem(source, undefined)` returns null, and null reads as done —
     * so an unsettled query painted the card in DONE ("Nothing new since the
     * last one") and then visibly threw it back into Next when the fetch
     * landed. That is the reshuffle `ready` exists to prevent, and now that
     * these count toward the day it would flip "the day is kept" too.
     *
     * `offline` still short-circuits, and the routes answer 204 with a 9s
     * timeout, so a dead upstream costs one wait rather than a blank home.
     */
    (!taizeActive || taizeLatest !== undefined || offline) &&
    (!chittisterActive || chittisterLatest !== undefined || offline));

  /**
   * The side's SECOND practice — active when one is stored AND it can be told
   * apart from the anchor. extraModesFor returns nothing for a colliding pair,
   * and a card whose done-state is really the anchor's would be worse than no
   * card, so the two conditions are the same condition.
   */

  return {
    ready,
    morningExtraLevel,
    eveningExtraLevel,
    morningExtraDone,
    eveningExtraDone,
    morningDone,
    reflectDone,
    silenceDone,
    eveningDone,
    eveningActive,
    morningActive,
    silenceActive,
    soloSilenceActive,
    silenceGoalCardActive,
    silenceGoalCardDone,
    cobreatheStandaloneActive,
    morningContemplationActive,
    eveningContemplationActive,
    morningContemplationDone,
    eveningContemplationDone,
    reflectActive,
    reflections,
    examenActive,
    listeningActive,
    readingActive,
    podcastsActive,
    walkActive,
    visioActive,
    taizeActive,
    taizeDone,
    taizeWaiting,
    groupReflection,
    chittisterActive,
    chittisterDone,
    chittisterWaiting,
    chittisterLatest: chittisterLatest ?? null,
    complineActive,
    cobreatheActive,
    prayerListActive,
    examenDone,
    listeningDone,
    readingDone,
    podcastsDone,
    walkDone,
    visioDone,
    iconsActive,
    iconsDone,
    complineDone,
    cobreatheDone,
    prayerListDone,
    intentionsTotalCount,
    intentionsPrayedCount,
    customAnchors: customAnchorsWithOfficeCredit,
    totalAnchors,
    doneCount,
    streak: rhythm?.streak ?? 0,
    last7: rhythm?.last7 ?? 0,
    keptToday: !!rhythm?.keptToday,
    gardenCount: prayerStreak?.gardenPrayedTodayCount ?? 0,
    cobreatheCount: cobreathe?.count ?? 0,
    prayerKind,
    contemplationMin,
    contemplationGoalMin,
    contemplationStyle,
    morningContemplationKind,
    eveningContemplationKind,
    contemplationLogMethod,
    silenceLadder: ladderEnabled && ladderData?.enabled && typeof ladderData.level === "number"
      ? { level: ladderData.level, levelDays: ladderData.levelDays ?? 0, daysToNext: ladderData.daysToNext ?? 0, nextLevel: ladderData.nextLevel ?? ladderData.level, atMax: !!ladderData.atMax }
      : null,
    novenaActive,
    novenaDone,
    novenaReplacesMorning,
    novenaReplacesEvening,
    novena: activeNovena
      ? { novenaId: activeNovena.novenaId, title: activeNovena.title, saint: activeNovena.saint, currentDay: activeNovena.currentDay, displayDayNumber: activeNovena.displayDayNumber, dayCount: activeNovena.dayCount, replacesSlot: activeNovena.replacesSlot, day: activeNovena.day }
      : null,
  };
}
