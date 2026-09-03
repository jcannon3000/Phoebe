import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { spiritualsVisible } from "@/lib/spiritualsFlag";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import {
  getSideLevel, setSideLevel, setSideEntry,
  getSideContemplation, setSideContemplation, setSideMinutes,
  getReflectionSource, setReflectionSource, setSideReflection,
  setPsalmCycle, setSideCustomName, OFFICE_PREFS_EVENT, OFFICE_LEVELS_SET, type OfficeLevel,
  type ReflectionSource,
  setSideContemplationKind, setSideDayRules, setDaySwapSuppressed, clearSideDaySwap,
  TRACKED_REFLECTION_SOURCES,
} from "@/lib/officePrefs";
import { getGuestSilenceGoalMin, setGuestSilenceGoalMin, predatesSeedStamp } from "@/lib/guestSeed";
import { RULE_PRESETS, type RulePreset, type OfficeSideKey } from "@/lib/rulePresets";
import { addCustomAnchor, getCustomAnchors, removeCustomAnchor, setPracticeSlot, type SlottedPractice, type CustomSlot, isRelationalAnchor } from "@/lib/customAnchors";
import { pushRoutineConfig } from "@/lib/routineSync";
import { clearSpuriousGuestHomeLayout, readCachedHomeLayout, saveHomeLayout, cacheHomeLayoutLocalOnly, HOME_LAYOUT_VERSION, type HomeLayout } from "@/lib/homeLayoutCache";

// ── /customize — the BASIC customizer for logged-out / device-local sessions ─
//
// Three dropdowns (Daily Prayer, Newsletter, Silence), styled like the
// office/psalms "before you begin" pill chooser — category on
// the left, the current value + a caret on the right, a native <select>
// invisibly layered on top so it's a real dropdown on tap. Writes straight to
// the same device-local prefs the seeded guest rule + full customizer read, so
// the home reflects a change immediately; nothing here requires an account.
// A quiet "Customize more fully" link hands off to the FULL rule-of-life
// builder (/rule-of-life — an account is the unlock; guests route through
// sign-in first). This page is intentionally NOT in GuestGate's route set.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SOFT_GREEN = "rgba(200,212,192,0.75)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#0C1F12";

type DailyPrayer = "guided-prayer" | "psalms" | "devotion" | "office" | "readings" | "contemplation";

// "Add a practice" — the same contemplative add-ons the full customizer's
// "Add an additional practice" step offers (Audio Divina / The Examen /
// Contemplative Walk / Visio Divina / Taize / Spirituals), just ONE at a time here (this page is meant to stay a
// few quick dropdowns, not a multi-select). Backed by the same home-layout
// module keys those toggles write in WayOfLoveRuleFlow.tsx.
type AddPractice = "none" | "listening" | "examen" | "walk" | "visio" | "spirituals" | "taize" | "icons" | "lectio";
const PRACTICE_KEYS: readonly AddPractice[] = ["listening", "examen", "walk", "visio", "spirituals", "taize", "icons", "lectio"];
function homeCardOn(hl: HomeLayout | null, key: string): boolean {
  return !!hl && hl.order.includes(key) && !hl.hidden.includes(key);
}

// Contemplative Prayer from the basic editor: the SILENCE GOAL is the total
// daily silence (default 20 min, chosen in 10-min steps), and the two per-side
// cards SPLIT it — Morning + Evening Contemplation each carry half (20 → 10+10).
// Halves land on 5–30, the per-side sit clamp DailyProgressBody applies.
const CONTEMPLATION_GOAL_DEFAULT_MIN = 20;

function currentDailyPrayer(): DailyPrayer {
  // Contemplative Prayer clears the BCP office and turns on per-side
  // contemplation (the silent-sit style) — read the device-local pref back so
  // the dropdown reopens on the user's current pick.
  const perSideContemplation = getSideContemplation("morning") || getSideContemplation("evening");
  if (perSideContemplation) return "contemplation";
  const lvl = getSideLevel("morning");
  if (lvl === "guided-prayer") return "guided-prayer";
  if (lvl === "psalms") return "psalms";
  if (lvl === "office") return "office";
  if (lvl === "readings") return "readings";
  // "Devotions" is no longer a selectable option here — an existing user
  // whose level is still "devotion" (or anything else unmatched) shows
  // "Offices" pre-selected, the closest remaining option. A "custom" level
  // (named in the full customizer) is handled separately by isOwnPractice
  // below — this fallback never actually surfaces for that case.
  return "office";
}

// A practice someone named for themselves in the FULL customizer ("Create
// your own") has no matching option in this page's short Daily Prayer list —
// showing a fallback like "Offices" pre-selected here would look correct but
// silently overwrite their real practice the moment they picked anything.
// So this page just locks the row read-only instead of guessing.
function isOwnPracticeSide(): boolean {
  return getSideLevel("morning") === "custom" || getSideLevel("evening") === "custom";
}

export default function CustomizePage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  // Wait for auth to settle before treating the session as a guest — while
  // /auth/me is in flight `user` is null, which reads as guest and would run
  // the guest-only self-heal (and paint guest fallbacks) for a signed-in user.
  const guest = !authLoading && isDeviceLocalGuest(user);
  const qc = useQueryClient();
  const entitlements = useEntitlements();

  // A still leaf backdrop, picked once — matching the office/psalms screens.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Fade + rise in on mount, matching the office/psalms "before you begin" entrance.
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, []);

  /**
   * Self-heal a stale home layout a short-lived Creation Prayer bug wrote,
   * which hid the newsletter card. Guests only.
   *
   * GATED ON A DEVICE THAT PREDATES THE SEED STAMP — the same gate guestSeed
   * puts on the same call, and the reason is written out there: the cleanup
   * decides a layout is spurious by asking whether it contains "office", and
   * the default rule (Visio Divina, no office) fails that test. Ungated, this
   * ran on every visit to this page: a new user opened the app, saw Visio,
   * tapped "Shape your rhythm", and came back to a home with no Visio card —
   * permanently, because seedGuestRule early-returns once SEED_KEY is set and
   * never re-seeds. The slot key survived, so the edit list and the widget
   * went on believing the practice was in the rhythm.
   */
  useEffect(() => {
    if (guest && predatesSeedStamp() && clearSpuriousGuestHomeLayout()) {
      window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    }
  }, [guest]);

  // A signed-in "light" account (real, but not device-local) has its silence
  // goal on the server; a device-local guest keeps it local.
  const { data: officePrefs, isLoading: officePrefsLoading } = useQuery<{ contemplationGoalMinutes?: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled: !guest,
  });
  // A guest's local value is available synchronously; a light account's
  // saved goal needs this query to resolve first — render the row only once
  // we actually KNOW the value, so a light account never briefly sees a
  // wrong default (e.g. "5 min") before their real saved goal paints.
  const goalsReady = guest || !officePrefsLoading;

  const [dailyPrayer, setDailyPrayer] = useState<DailyPrayer>(() => currentDailyPrayer());
  const [ownPracticeLocked] = useState<boolean>(() => isOwnPracticeSide());
  const [newsletter, setNewsletter] = useState<ReflectionSource>(() => getReflectionSource());
  // 0 is a real answer ("no silence goal") — the seed's default has none, now
  // that Visio Divina is its contemplative practice. `|| 5` turned a fresh
  // guest's 0 into a row reading "5 min" over a home with no Silence card.
  const [silenceMin, setSilenceMin] = useState<number>(() =>
    guest ? getGuestSilenceGoalMin() : 5,
  );
  // Once office-prefs load for a light (non-guest) account, adopt its saved
  // goal instead of the guest fallback default above (`??`, so a saved 0 holds).
  const effectiveSilenceMin = guest ? silenceMin : (officePrefs?.contemplationGoalMinutes ?? silenceMin);

  // "Add a practice" — read straight from the current home layout every render
  // (a guest's cached copy is instant; a light account's arrives via useAuth's
  // own /auth/me fetch, gated by authLoading below) until this session makes
  // its own pick, which then wins locally without waiting on a round-trip.
  const [addPracticeLocal, setAddPracticeLocal] = useState<AddPractice | null>(null);
  const currentHomeLayout: HomeLayout | null = guest ? readCachedHomeLayout() : (user?.homeLayout ?? null);
  const addPractice: AddPractice = addPracticeLocal ?? (PRACTICE_KEYS.find((k) => homeCardOn(currentHomeLayout, k)) ?? "none");

  // The one-day practice swap is invisible in here (see officePrefs) — the
  // Daily Prayer dropdown seeds from getSideLevel, and every apply below
  // writes the STANDING rule; a swapped day would otherwise show the stand-in
  // as the rule and re-save it as such. An explicit apply also ENDS the swap:
  // the person just said what their practice is.
  useEffect(() => {
    setDaySwapSuppressed(true);
    return () => setDaySwapSuppressed(false);
  }, []);

  const applyDailyPrayer = (choice: DailyPrayer) => {
    // Re-selecting the current anchor is a no-op — without this, re-picking
    // Contemplative Prayer would re-clobber an adjusted goal back to 20.
    if (choice === dailyPrayer) return;
    setDailyPrayer(choice);
    // An explicit choice of daily prayer ends today's one-day swap on both
    // sides — whichever branch below it takes.
    clearSideDaySwap("morning"); clearSideDaySwap("evening");
    if (choice === "contemplation") {
      // Contemplative Prayer = a silent sit as this side's prayer. Same per-side
      // anchor as Creation Prayer but the "silent" style, so the home renders
      // Morning + Evening Contemplation cards (🕯️, the sit timer). The Silence
      // GOAL becomes the day's TOTAL silence (default 20 min, 10-min steps) and
      // the two sessions SPLIT it — each side sits half. No home-layout write
      // (keeps the newsletter fallback).
      setSideLevel("morning", "ask");
      setSideLevel("evening", "ask");
      setSideContemplation("morning", true);
      setSideContemplation("evening", true);
      writeSilenceGoal(CONTEMPLATION_GOAL_DEFAULT_MIN, { splitAcrossSides: true });
      // WHICH practice, per side — this pick is the silent sit on both (see
      // officePrefs.setSideContemplationKind; it keeps the global flag in step
      // for the side-less surfaces).
      setSideContemplationKind("morning", "silent");
      setSideContemplationKind("evening", "silent");
      window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    } else {
      // Back to a BCP form on both sides — clear the per-side Creation Prayer
      // anchor and the breath style so the office cards return.
      setSideContemplation("morning", false);
      setSideContemplation("evening", false);
      try { localStorage.setItem("phoebe:contemplation-style", "silent"); } catch { /* ignore */ }
      // Simple Guided Prayer is a MORNING shape — PACT (Praise · Ask · Confess
      // · Thanks) opens the day; the day is closed by the Examen, the classic
      // evening review. So this one pick programs BOTH sides, rather than
      // praying PACT twice. Every other choice stays the same on both sides.
      setSideLevel("morning", choice);
      setSideLevel("evening", choice === "guided-prayer" ? "examen" : choice);
      // Owner: "on the light customizer, if they chose offices, have the medium
      // be venite." Only the FULL office — Venite has no working deep link for
      // anything else (Compline renders blank there, and psalms/devotion/
      // readings aren't offices it serves), so every other pick still reads on
      // screen. Both sides map to morning-prayer / evening-prayer, which are
      // exactly the two Venite handles.
      const entry = choice === "office" ? "venite" : "read";
      setSideEntry("morning", entry);
      setSideEntry("evening", entry);
      if (choice === "psalms") setPsalmCycle("office");
      window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    }
    // Push this device's routine up (rule_config) — same call the full
    // customizer makes on commit — so the choice reaches this account's other
    // devices instead of staying stuck on this one. Safe for any session
    // (real or the anonymous device user); a truly logged-out visitor has no
    // session to push to and the PUT just 401s silently.
    if (user) pushRoutineConfig();
  };

  /**
   * Adopt a named starter rule from THIS editor.
   *
   * Owner: presets should be available in the light customizer too. It can't
   * hand off to the full builder's preset picker — that needs an account, and
   * this page exists precisely for sessions that don't have one — so it writes
   * the rule straight to the same device-local prefs every other control here
   * writes. The RULE ITSELF is shared (lib/rulePresets), so a preset can't
   * mean one thing in this editor and another in the full one.
   */
  const applyPreset = (preset: RulePreset) => {
    // PrayChoice → the office LEVEL this page's prefs speak in.
    const levelFor = (c: RulePreset["pray"]): string =>
      c === "offices" ? "office"
      : c === "guidedPrayer" ? "guided-prayer"
      : c === "ownPractice" ? "custom"
      : c === "none" || c === "contemplation" || c === "community" ? "ask"
      : c; // devotion / psalms / readings / fdd / examen / compline map straight through

    // Validated, not cast: every PrayChoice happens to map to a real
    // OfficeLevel today, but a cast would write garbage silently the first
    // time one didn't. Anything unrecognised falls back to "ask" (no anchor),
    // which is recoverable, rather than a level nothing can read.
    const safeLevel = (c: RulePreset["pray"]): OfficeLevel => {
      const l = levelFor(c);
      return (OFFICE_LEVELS_SET.has(l) ? l : "ask") as OfficeLevel;
    };
    const eveningChoice = preset.evening ?? preset.pray;
clearSideDaySwap("morning"); clearSideDaySwap("evening");
    setSideLevel("morning", safeLevel(preset.pray));
    setSideLevel("evening", safeLevel(eveningChoice));
    setSideEntry("morning", preset.pray === "offices" ? "venite" : "read");
    setSideEntry("evening", eveningChoice === "offices" ? "venite" : "read");
    if (preset.pray === "psalms" || eveningChoice === "psalms") setPsalmCycle("office");

    // A side named by the rule ("Chapel") — without this an ownPractice side
    // adopts an anchor called "Morning Practice".
    if (preset.customNames?.morning) setSideCustomName("morning", preset.customNames.morning);
    if (preset.customNames?.evening) setSideCustomName("evening", preset.customNames.evening);

    // The contemplative practice, on whichever sides the rule turns on. Same
    // rule adoptRule uses: silenceSide pins it to ONE side when set.
    const contemplationOn = {
      morning: preset.silence && preset.sides.morning && preset.silenceSide !== "evening",
      evening: preset.silence && preset.sides.evening && preset.silenceSide !== "morning",
    };
    setSideContemplation("morning", contemplationOn.morning);
    setSideContemplation("evening", contemplationOn.evening);
    // The rule's contemplative practice, recorded on each side that keeps one.
    const presetKind = preset.contemplationStyle === "cobreathe" ? "creation" : "silent";
    for (const sd of ["morning", "evening"] as const) {
      if (contemplationOn[sd]) {
        setSideContemplationKind(sd, presetKind);
      } else {
        /**
         * CLEAR the side this preset turns contemplation OFF for.
         *
         * `WayOfLoveRuleFlow.tsx`'s `adoptRule` does this same cleanup with a
         * comment describing exactly why: "a stale 'creation'/2-minute sit
         * speaks for a rule that never chose it." `getSideContemplationKind`
         * reads the raw per-side key regardless of whether contemplation is
         * currently on, so a mark left here by an earlier rule stays live the
         * moment contemplation is re-enabled without an explicit re-pick.
         * Reproducible before this fix: adopt VTS (evening kind="creation",
         * minutes=10), then "A Gentle Start" — the evening's stale
         * creation-kind/10-minute stamp survived in storage.
         */
        try {
          localStorage.removeItem(`phoebe:office:contemplation-kind:${sd}`);
          localStorage.removeItem(`phoebe:office:minutes:${sd}`);
        } catch { /* private mode */ }
      }
    }
    try { localStorage.setItem("phoebe:contemplation-style", preset.contemplationStyle ?? "silent"); } catch { /* ignore */ }

    // The daily contemplative-minutes goal. Not split across sides here: a
    // rule's goalMin is already the DAY's total (that split only belongs to
    // this page's own Contemplative Prayer pick, which sets no goal of its
    // own), and splitting a rule's would halve what it promised.
    writeSilenceGoal(preset.silence ? preset.goalMin : 0);

    const refl = preset.reflections[0] ?? "none";
    setNewsletter(refl);
    setReflectionSource(refl);
    setSideReflection("morning", refl);
    setSideReflection("evening", refl);
    // …then any side whose ANCHOR reads a different one (see anchorReflection).
    for (const [side, src] of Object.entries(preset.anchorReflection ?? {}) as Array<[OfficeSideKey, ReflectionSource]>) {
      if (src) setSideReflection(side, src);
    }

    // A side's custom NAME goes with the rule that named it — mirrors
    // adoptRule's sweep, or the two paths disagree ("Chapel" survived here
    // and prefilled "Create your own" for a side VTS once owned).
    for (const sd of ["morning", "evening"] as const) {
      const namedHere = preset.customNames?.[sd]
        || (preset.dayRules?.[sd] ?? []).some((r) => r.pray === "ownPractice" && r.name);
      if (!namedHere) { try { localStorage.removeItem(`phoebe:office:custom-name:${sd}`); } catch { /* ignore */ } }
    }
    // Custom anchors are part of the rhythm (owner: "replaces" means
    // replaces) — any anchor the new rule doesn't name by title is removed,
    // tombstoned and pushed like any other deletion. Mirrors adoptRule; the
    // two adopt paths must not disagree about what a preset replaces.
    {
      const named = new Set((preset.customAnchors ?? []).map((c) => c.title.trim().toLowerCase()));
      /**
       * RELATIONAL PRACTICES SURVIVE A PRESET. They are not part of any rule
       * — no preset carries one, and RulePreset has no field that could — so
       * "the preset doesn't name it" is not evidence the person is finished
       * with it. Without this line, adopting ANY starter rule silently and
       * permanently deleted the seeded Express Gratitude every new user
       * starts with: removeCustomAnchor tombstones and pushes, and nothing
       * ever re-seeds. The full customizer never had the bug, because its
       * sweep is followed by setRelationalPractices re-adding them — the two
       * adopt paths disagreeing is the exact failure this block warns about.
       */
      // isRelationalAnchor, not a title Set: a hand-typed relational practice
      // carries only the stored flag and is on no curated list to match.
      for (const a of getCustomAnchors()) {
        if (!named.has(a.title.trim().toLowerCase()) && !isRelationalAnchor(a)) removeCustomAnchor(a.id);
      }
    }
    // The rule's own standing practices, idempotent by title.
    if (preset.customAnchors?.length) {
      const existing = new Set(getCustomAnchors().map((a) => a.title.trim().toLowerCase()));
      for (const c of preset.customAnchors) {
        if (existing.has(c.title.trim().toLowerCase())) continue;
        // Pass `office` too — the simple customizer adopts the same presets,
        // and dropping it here made a VTS Chapel without its "Open Morning
        // Prayer" door depending on which editor you adopted from.
        addCustomAnchor(c.title, c.emoji, c.slot, undefined, c.days, c.office);
        existing.add(c.title.trim().toLowerCase());
      }
    }

    /**
     * The rest of what a preset can carry.
     *
     * This page applies presets independently of the full customizer's
     * adoptRule, so anything the RulePreset type grows has to be added in BOTH
     * or the same rule behaves differently depending on where you adopt it —
     * which is exactly what happened: VTS's weekday schedule and Contemplative
     * Art's practices were silently dropped here.
     */
    // Saturday / Sunday alternatives.
    for (const sd of ["morning", "evening"] as const) {
      const rules = preset.dayRules?.[sd];
      setSideDayRules(sd, (rules ?? []).map((r) => ({
        days: r.days,
        level: safeLevel(r.pray),
        ...(r.pray === "ownPractice" ? { customName: r.name ?? "Worship" } : {}),
      })));
    }
    /**
     * The rule's home layout — ADOPTING A RULE REPLACES, it doesn't add to.
     *
     * Two reported bugs came out of this block. It ran only `if
     * (preset.practices)` — and VTS has no `practices` key, so adopting VTS
     * wrote NO layout at all: the pre-existing Forward Day by Day stayed
     * visible and VTS's own card stayed hidden, and re-opening the full
     * customizer read the layout back as "Forward Day by Day is selected".
     * And inside it, an unnamed practice was only ever left alone, never
     * turned off — so adopting a rule with a Walk and then adopting VTS kept
     * the walk, which is "Contemplative Walk was selected which I did not
     * have."
     *
     * Runs unconditionally now, and every key the rule doesn't name is
     * hidden — the same all-or-nothing shape the full customizer's commit()
     * has always had.
     */
    {
      const existing = currentHomeLayout;
      const order = [...(existing?.order ?? [])];
      const hidden = new Set(existing?.hidden ?? []);
      const wanted: Record<string, boolean> = {
        /**
         * EVERY TRACKED NEWSLETTER, not four of the seven.
         *
         * This named only fdd/ssje/cac/vts — nouwen, sojo and grist were
         * missing, so a preset could turn any of those three OFF only by
         * accident (they'd survive from whatever the person had before,
         * contradicting the header comment above, which claims "every key
         * the rule doesn't name is hidden"). Full list now, so the claim is
         * actually true.
         */
        ...Object.fromEntries(TRACKED_REFLECTION_SOURCES.map((n) => [n, refl === n])),
        // Its standing practices, and only those. NOTE the one name that
        // differs between the two vocabularies: the home-layout key is
        // "listening", the preset's practices key is "audio". Looking up
        // practices["listening"] always found undefined, so a preset could
        // never turn Audio Divina ON here — it was hidden every time.
        // Canterbury Downtown was the rule that exposed it; the owner has
        // since reshaped that rule and no preset asks for Audio Divina right
        // now, so the mapping is latent again — and wrong again the moment one
        // does, which is why it stays.
        //
        // "icons" and "taize" added alongside the newsletters above, for the
        // same reason — neither existed as a home-layout key when this list
        // was written, so a preset adopted here could never turn either off
        // if the person already had it on, or on if a future preset asks for
        // it.
        ...Object.fromEntries((["listening", "walk", "visio", "cobreathe", "examen", "compline", "reading", "podcasts", "prayer-list", "icons", "taize", "lectio"] as const)
          .map((k) => {
            const practiceKey = k === "listening" ? "audio" : k;
            return [k, preset.practices?.[practiceKey as keyof typeof preset.practices] === true];
          })),
      };
      /**
       * VTS's Creation Prayer isn't named in `preset.practices` at all — it's
       * expressed as `silence: true, contemplationStyle: "cobreathe"` (the
       * preset's own per-side-sit vocabulary), the same fields the full
       * customizer's `wantCobreathe` reads (`anyContemplation &&
       * anySideCreation`). Without this, adopting VTS Chapel & Commentary
       * from this page produced no Creation Prayer card at all, while the
       * full customizer produces one for the identical preset.
       */
      if (preset.silence && preset.contemplationStyle === "cobreathe") {
        wanted.cobreathe = true;
      }
      /**
       * NO EXAMEN CARD WHEN A SIDE IS ALREADY ANCHORED ON EXAMEN.
       *
       * The full customizer's `wantExamenCard` guards against exactly this
       * — a side whose own anchor IS the Examen, plus a second standalone
       * Examen practice card, would be the same practice counted twice.
       * No shipped preset sets both today, so this hasn't fired yet, but
       * nothing here protected against the day one does.
       */
      if (preset.pray === "examen" || eveningChoice === "examen") {
        wanted.examen = false;
      }
      for (const [key, on] of Object.entries(wanted)) {
        if (!order.includes(key)) order.push(key);
        if (on) hidden.delete(key); else hidden.add(key);
      }
      /**
       * THE STRUCTURAL KEYS, which this page had never written.
       *
       * The full customizer's order begins "requests, office, contemplation,
       * …, feeds"; this one built its order out of newsletters and practices
       * alone, so nothing it wrote ever contained "office". That is the exact
       * test `clearSpuriousGuestHomeLayout` uses to decide a layout is
       * garbage — so every preset adopted here was deleted on the next visit
       * to this page. Adopt "Contemplative Art", get Visio and a Walk, come
       * back to change the newsletter, and both are gone.
       *
       * They are appended rather than prepended so an existing order keeps
       * the arrangement the person has; cleanHomeLayout backfills anything
       * still missing.
       */
      for (const key of ["requests", "office", "contemplation", "feeds"]) {
        if (!order.includes(key)) order.push(key);
      }
      const layout: HomeLayout = { order, hidden: [...hidden], v: HOME_LAYOUT_VERSION };
      if (guest) cacheHomeLayoutLocalOnly(layout);
      else void saveHomeLayout(layout).catch(() => { /* best-effort */ });
    }
    for (const [key, slot] of Object.entries(preset.practiceSlots ?? {}) as Array<[SlottedPractice, CustomSlot]>) {
      if (slot) setPracticeSlot(key, slot);
    }

    setDailyPrayer(currentDailyPrayer());
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    if (user) pushRoutineConfig();
  };

  const applyNewsletter = (id: ReflectionSource) => {
    setNewsletter(id);
    setReflectionSource(id);
    setSideReflection("morning", id);
    setSideReflection("evening", id);
    /**
     * THE LAYOUT HAS TO CHANGE TOO, or the picker does nothing.
     *
     * `useRhythmState` reads the newsletter CARD from the home layout
     * (`homeCardActive`), and falls back to the bare reflection-source
     * preference only when there is no saved layout at all. The seed now
     * always writes one (so the CAC card would actually appear), which
     * means every guest has a real layout the moment they open this page —
     * so setting the preference here changed the source but not what the
     * layout showed, and the newsletter card kept displaying whatever was
     * already in `order`. Owner: "the simple customizer is not changing the
     * newsletter."
     *
     * So: unhide the chosen source, hide every other tracked one, same as
     * the add-practice and contemplative-toggle actions on this page already
     * do for their own keys.
     */
    if (id !== "none") {
      const existing = currentHomeLayout;
      const order = [...(existing?.order ?? [])];
      const hidden = new Set(existing?.hidden ?? []);
      if (!order.includes(id)) order.push(id);
      hidden.delete(id);
      for (const other of TRACKED_REFLECTION_SOURCES) {
        if (other === id) continue;
        if (!order.includes(other)) order.push(other);
        hidden.add(other);
      }
      const layout: HomeLayout = { order, hidden: [...hidden], v: HOME_LAYOUT_VERSION };
      if (guest) cacheHomeLayoutLocalOnly(layout);
      else void saveHomeLayout(layout).catch(() => { /* best-effort */ });
    }
    if (user) pushRoutineConfig();
  };

  // Turn one contemplative add-on on (replacing whichever of the three was on
  // before) or all the way off ("none"). There's no partial home-layout write
  // anywhere in the app — every save replaces the whole order/hidden pair —
  // so this starts from whatever layout already exists (an existing light
  // account may have one from the full customizer) and only touches the three
  // practice keys, leaving everything else exactly as it was. A user who has
  // NEVER saved a layout gets a fresh minimal one seeded from this page's own
  // choices, with every OTHER opt-in module (reading/Co-Breathe/Prayer List)
  // explicitly hidden so they don't silently appear just because a layout now
  // exists where none did before.
  const applyAddPractice = (choice: AddPractice) => {
    if (choice === addPractice) return;
    setAddPracticeLocal(choice);
    const existing = currentHomeLayout;
    // EVERY tracked source, not the four this list used to name. The fallback
    // layout below hides the newsletters the person did NOT pick — and a
    // source missing from here is a source left UNHIDDEN, which (see
    // cleanHomeLayout: every known key gets backfilled into `order`) is how a
    // card nobody asked for arrives on the home screen.
    const otherNewsletters = TRACKED_REFLECTION_SOURCES.filter((n) => n !== newsletter);
    const baseOrder = existing?.order ?? ["requests", "office", "contemplation", newsletter, "feeds", "ncmp", "podcasts", ...otherNewsletters];
    const baseHidden = existing?.hidden ?? ["ncmp", "podcasts", "reading", "cobreathe", "prayer-list", ...otherNewsletters];
    /**
     * The practice keys are stripped so exactly one can be re-added below —
     * but the STRUCTURAL keys have to survive that.
     *
     * On a freshly seeded guest `existing.order` is `["visio"]`: every element
     * is a practice key, so this filtered the order to `[]`. Choosing "None"
     * to mean "no extra practice" wrote an empty layout, which is not the same
     * statement — with a layout present but empty, the newsletter fallback is
     * suppressed too, so the CAC card went with it. The person meant "no
     * extras" and got "nothing".
     */
    const order = baseOrder.filter((k) => !PRACTICE_KEYS.includes(k as AddPractice));
    for (const key of ["requests", "office", "contemplation", "feeds"]) {
      if (!order.includes(key)) order.push(key);
    }
    const hidden = new Set(baseHidden.filter((k) => !PRACTICE_KEYS.includes(k as AddPractice)));
    if (choice !== "none") {
      const feedsIdx = order.indexOf("feeds");
      if (feedsIdx >= 0) order.splice(feedsIdx, 0, choice);
      else order.push(choice);
    }
    for (const k of PRACTICE_KEYS) if (k !== "none" && k !== choice) hidden.add(k);
    const layout: HomeLayout = { order, hidden: [...hidden], v: HOME_LAYOUT_VERSION };
    if (guest) cacheHomeLayoutLocalOnly(layout);
    else void saveHomeLayout(layout).catch(() => { /* best-effort */ });
    if (user) pushRoutineConfig();
  };

  // Write the silence goal everywhere it's read: local row state, the guest
  // key or the server pref (with the query cache updated so the row doesn't
  // snap back to the stale fetched value), and — when Contemplative Prayer is
  // the anchor — the two per-side sit lengths, each HALF the goal (two
  // sessions split the day's total silence).
  function writeSilenceGoal(min: number, opts?: { splitAcrossSides?: boolean }) {
    setSilenceMin(min);
    if (guest) setGuestSilenceGoalMin(min);
    else {
      qc.setQueryData(["/api/me/office-prefs"], (old: Record<string, unknown> | undefined) =>
        ({ ...(old ?? {}), contemplationGoalMinutes: min }));
      void apiRequest("PUT", "/api/me/office-prefs", { contemplationGoalMinutes: min }).catch(() => { /* best-effort */ });
    }
    if (opts?.splitAcrossSides) {
      const half = Math.round(min / 2);
      setSideMinutes("morning", half);
      setSideMinutes("evening", half);
    }
  }

  const applySilence = (min: number) => {
    writeSilenceGoal(min, { splitAcrossSides: dailyPrayer === "contemplation" });
  };

  // Contemplative Prayer counts silence as the day's TOTAL across two sits, so
  // its steps are 10-minute (each side gets a clean half); every other anchor
  // keeps the finer 5-minute goal steps.
  const SILENCE_OPTS = dailyPrayer === "contemplation"
    ? [10, 20, 30, 40, 50, 60]
    : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

  // Read-only version of `row` — same pill, no <select> overlay, no caret.
  // Used for the Daily Prayer row when it's locked (see isOwnPracticeSide).
  const staticRow = (label: string, value: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", borderRadius: 14, padding: "15px 18px", background: "rgba(24,46,34,0.4)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(168,197,160,0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
      <span style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 600 }}>{label}</span>
      <span style={{ color: SOFT_GREEN, fontFamily: FONT, fontSize: 14.5 }}>{value}</span>
    </div>
  );

  const row = (label: string, value: string, opts: Array<{ value: string; label: string }>, onChange: (v: string) => void) => (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", borderRadius: 14, padding: "15px 18px", background: "rgba(24,46,34,0.4)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(168,197,160,0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
      <span style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 600 }}>{label}</span>
      <span style={{ color: SOFT_GREEN, fontFamily: FONT, fontSize: 14.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
        {opts.find((o) => o.value === value)?.label ?? opts[0]?.label}
        <span aria-hidden style={{ opacity: 0.7 }}>▾</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", border: "none", outline: "none", cursor: "pointer", background: "transparent", color: WARM }}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      {leaf && (
        <>
          <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, zIndex: -2 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(12,31,18,0.75) 0%, rgba(12,31,18,0.58) 45%, rgba(12,31,18,0.8) 100%)" }} />
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(0.75rem, var(--safe-top)) 20px 4px", flexShrink: 0 }}>
        <button onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 15, cursor: "pointer", padding: 6 }}>← Back</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 24px max(2rem, env(safe-area-inset-bottom))", opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(14px)", transition: "opacity 420ms ease, transform 420ms ease" }}>
        <p style={{ color: "rgba(143,175,150,0.7)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "18px 0 6px", fontWeight: 600 }}>Your daily rhythm</p>
        <h1 style={{ fontFamily: FONT, fontSize: "clamp(30px, 7vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: "0 0 10px", textAlign: "center" }}>Customize</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, fontFamily: FONT, color: "rgba(200,212,192,0.85)", margin: "0 0 24px", textAlign: "center", maxWidth: 420 }}>
          A few quick choices — adjustable anytime, right here.
        </p>

        {/* Start from a whole rule, rather than assembling one row at a time
            (owner). Same named rules the full builder offers, from the same
            list — applied straight to this device's prefs, since the full
            preset picker is behind an account and this editor exists for
            sessions that don't have one. Collapsed by default: the three
            dropdowns stay the page's centre of gravity. */}
        <details style={{ width: "100%", maxWidth: 420, marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", listStyle: "none", color: SAGE, fontFamily: FONT, fontSize: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(9,26,16,0.42)", border: "1px solid rgba(200,212,192,0.18)", textAlign: "center" }}>
            Start from a preset rhythm
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {RULE_PRESETS.filter((p) => p.title).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  if (!window.confirm(`Adopt "${preset.title}"? This replaces your current rhythm.`)) return;
                  applyPreset(preset);
                }}
                style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "12px 14px", background: "rgba(9,26,16,0.42)", border: "1px solid rgba(200,212,192,0.18)", color: WARM, fontFamily: FONT }}
              >
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>
                  <span aria-hidden>{preset.emoji}</span> {preset.title}
                </span>
                {preset.blurb && (
                  <span style={{ display: "block", fontSize: 12.5, color: SOFT_GREEN, marginTop: 3, lineHeight: 1.4 }}>{preset.blurb}</span>
                )}
                {/* The rows ARE the contract — the full customizer shows them
                    before adopting, and this picker showed only the blurb, so
                    a reader here agreed to a rule they'd never seen itemized
                    (today's incident shipped precisely because nobody compared
                    rows-promised to rows-produced). */}
                {(preset.rows ?? []).length > 0 && (
                  <span style={{ display: "block", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(200,212,192,0.14)" }}>
                    {(preset.rows ?? []).map((r) => (
                      <span key={r.label} style={{ display: "block", fontSize: 12.5, color: WARM, opacity: 0.85, padding: "2px 0" }}>
                        <span aria-hidden>{r.emoji}</span> {r.label}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </details>

        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
          {ownPracticeLocked
            ? (
              <>
                {staticRow("Daily Prayer", "Your own practice")}
                {/* Adopting a preset whose morning is the person's OWN practice
                    (VTS's Chapel) lands here too, now that presets are offered
                    on this page — and this row can't edit a named practice, so
                    without a way out a guest could be stuck with it. Adopting
                    another preset above is that way out. */}
                <p style={{ color: SOFT_GREEN, fontSize: 12.5, fontFamily: FONT, margin: "-2px 4px 0", lineHeight: 1.45 }}>
                  Named in your rhythm. To change it, adopt a preset above — or customize more fully below.
                </p>
              </>
            )
            : row("Daily Prayer", dailyPrayer, [
                { value: "guided-prayer", label: "Simple Guided Prayer" },
                { value: "psalms", label: "Psalms" },
                // "Offices" (and the Venite devotion entry it carried) removed
                // from this row (owner). Anyone already on it keeps it — this
                // list only decides what a NEW pick offers.
                { value: "readings", label: "Daily Scripture Readings" },
                { value: "contemplation", label: "Contemplative Prayer" },
              ], (v) => applyDailyPrayer(v as DailyPrayer))}

          {/* VTS is feed-gated: the Dean's Commentary only appears once the
              viewer follows the VTS feed (see useEntitlements). Someone who
              already had it selected and then unfollowed keeps seeing the
              row — dropping the option out from under their current choice
              would silently reset their reflection to something they never
              picked. */}
          {row("Newsletter", newsletter, [
            // FDD and SSJE moved to the bottom of the list (owner).
            { value: "cac", label: "CAC Daily Meditation" },
            { value: "sojo", label: "Sojourners Daily Devotion" },
            { value: "nouwen", label: "Nouwen Daily Devotion" },
            { value: "grist", label: "Grist Climate News" },
            ...(entitlements.vts || newsletter === "vts"
              ? [{ value: "vts", label: "VTS Dean's Commentary" }]
              : []),
            { value: "fdd", label: "Forward Day by Day" },
            { value: "ssje", label: "SSJE — Brother, Give Us a Word" },
          ], (v) => applyNewsletter(v as ReflectionSource))}

          {/* "None" leads: the default rhythm keeps no silence goal, and a
              row that can only say 5–60 can't show the truth for it. */}
          {goalsReady && row("Silence", String(effectiveSilenceMin), [{ value: "0", label: "None" }, ...SILENCE_OPTS.map((m) => ({ value: String(m), label: `${m} min` }))], (v) => applySilence(parseInt(v, 10) || 0))}

          {/* Same contemplative add-ons as the full customizer's "Add an
              additional practice" step — just one at a time here. This list
              and PRACTICE_KEYS above are a SECOND copy of the practice set
              held by WayOfLoveRuleFlow's commit(); a practice added there and
              not here is unreachable for every light account, which is the
              only customizer most people ever see. Gated on
              auth having settled so a light account's saved layout doesn't
              briefly read as "None" before it loads. */}
          {!authLoading && row("Add a practice", addPractice, [
            { value: "none", label: "None" },
            { value: "listening", label: "Audio Divina" },
            { value: "examen", label: "The Examen" },
            { value: "walk", label: "Contemplative Walk" },
            { value: "visio", label: "Visio Divina" },
            { value: "taize", label: "Taizé meditation" },
            { value: "icons", label: "Praying with Icons" },
            { value: "lectio", label: "Lectio Divina" },
            ...(spiritualsVisible(user?.isSuperAdmin)
              ? [{ value: "spirituals", label: "Meditating on Spirituals" }]
              : []),
          ], (v) => applyAddPractice(v as AddPractice))}
        </div>

        {/* Every row above already applies the moment it's changed — this
            button is the confirming "you're done" action back to the home,
            not a separate persistence step. */}
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="mt-7 w-full"
          style={{ maxWidth: 420, borderRadius: 14, padding: "14px 20px", background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 15.5, border: "1px solid rgba(46,107,64,0.6)", cursor: "pointer" }}
        >
          Save
        </button>

        {/* The full customizer needs an account. A guest goes to sign-in
            DIRECTLY (with a redirect back to the full flow) — not via
            /rule-of-life, which GuestGate bounces back HERE for device-local
            sessions (loop). A signed-in account goes straight to the FULL
            rule-of-life builder (account = the unlock; /pilot/build is the
            trimmed pilot variant and no longer the upgrade target). */}
        <Link
          href={guest ? `/signin?mode=signup&from=customize&redirect=${encodeURIComponent("/rule-of-life")}` : "/rule-of-life"}
          className="mt-6 text-sm font-medium"
          style={{ color: SAGE, fontFamily: FONT }}
        >
          Customize more fully →
        </Link>
      </div>
    </div>
  );
}
