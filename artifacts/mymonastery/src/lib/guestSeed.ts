// First-open seed for the PUBLIC no-login version — writes the precoded rule
// of life into the same device-local officePrefs the customizer uses, ONCE, so
// a brand-new person lands on a home that's already going:
//
//   Morning Simple Guided Prayer (PACT) · Evening Daily Scripture Readings ·
//   Forward Day by Day · a 5-minute silence daily goal (its own single goal
//   card with a progress bar — NOT the per-side contemplation cards).
//
// Matches the same morning-guided-prayer/evening-readings new-user default
// getSideLevel()'s own fallback uses (owner, 2026-08-20) — this seed
// previously wrote "psalms"/"examen", which pre-dated that decision and
// silently overrode it for every guest (setSideLevel writes an EXPLICIT
// level, so getSideLevel's fallback never even got consulted for a seeded
// device).
//
// Adjustable afterward in Daily progress → Customize, exactly like any rule.
// (The after-noon "morning belongs to tomorrow" rule lives in
// DailyProgressBody now — for guests it applies EVERY day, not just the seed
// day.) See memory "project_public_no_login".

import { ROUTINE_KEYS } from "@/lib/routineSync";
import { setSideLevel, setReflectionSource, setSideReflection, getExplicitSideLevel, getExplicitReflectionSource, OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { clearSpuriousGuestHomeLayout, readCachedHomeLayout, cacheHomeLayoutLocalOnly, addHomeCard, removeHomeCard } from "@/lib/homeLayoutCache";
import { setPracticeSlot, setRelationalPractices, activeRelationalPractices } from "@/lib/customAnchors";
import { clearRoutineSyncClock } from "@/lib/routineSync";
import { getStoredDefaultSeed, type DefaultSeed } from "@/lib/rulePresetsStore";

const SEED_KEY = "phoebe:guest-seeded-ymd"; // local YMD of the first-open seed

// ── Stale-seed migration ─────────────────────────────────────────────────────
// Owner: "I thought the signed out default was simple in the morning and
// scripture reading in the evening" — reported against a signed-out browser
// showing Morning Psalms / Evening Psalms.
//
// It was, for NEW devices. But seedGuestRule() returns early whenever SEED_KEY
// is present, so a device seeded by an older bundle keeps that bundle's default
// forever — and this seed has changed three times (psalms/psalms →
// guided-prayer/examen → psalms/… → today's guided-prayer/readings). Anyone
// who opened Phoebe signed-out before the change is still praying the old
// default, and nothing would ever move them.
//
// So: version the seed and migrate, but ONLY a device whose levels still match
// a known historical seed exactly. That's the safe signal that the person never
// touched it — anything else means they customized, and their rule is theirs.
/**
 * Exported because the SAME cleanup runs in a second place.
 *
 * `clearSpuriousGuestHomeLayout` decides a layout is spurious by asking
 * whether `order` contains "office" — and the current default (Visio, no
 * office) looks spurious by that test. The gate below is what stops it
 * eating the default, and a copy of the call in customize.tsx had no gate at
 * all. Anyone calling that cleanup must ask this question first.
 */
export const SEED_VERSION_KEY = "phoebe:guest-seed-version";

/** True when this device predates the seed version stamp — the only devices
 *  the spurious-layout cleanup was ever written for. */
export function predatesSeedStamp(): boolean {
  try { return !localStorage.getItem(SEED_VERSION_KEY); } catch { return false; }
}
// v8 (owner, 2026-09-05): "Morning: Simple · Newsletter: Forward · Share
// Gratitude · Visio Divina · Evening: Examen".
//
// v9 (2026-09-08) changes NOTHING about what the default IS — it exists purely
// to re-run migrateStaleSeed on devices already stamped "8", because those are
// the ones carrying two newsletters (see the note in the migration). A version
// bump is the only way to reach a device that already thinks it is current.
const SEED_VERSION = "9";
// Every (morning, evening) pair this seed has written historically. A device
// sitting on one of these has an untouched seed. Add to this list, never
// remove: the whole point is recognizing rules we ourselves wrote.
const STALE_SEEDS: Array<[string, string]> = [
  ["psalms", "psalms"],          // 484e3f5e
  ["guided-prayer", "examen"],   // 1640800e, and again as v6's own default
  ["psalms", "examen"],          // 54fdabbe
  ["guided-prayer", "readings"], // the v2 default, replaced by the one below
  // The v4 default itself — devices already sitting on the current pair, which
  // is what a device seeded before Express Gratitude joined looks like. Without
  // this row they match no stale seed and the migration below never runs for
  // them, so the addition would only ever reach devices installing fresh.
  ["guided-prayer", "ask"],
  // v8's own pair. Already present as row 2 ("guided-prayer"/"examen"), noted
  // here because v9's migration depends on it: a device seeded fresh on v8 has
  // to match a stale row or the two-newsletter fix never reaches it.
];

// v5's own evening level ("ask") is also v6's stale-seed row above, so a
// device on v5 (guided-prayer/ask, CAC + Visio) is caught by that same row —
// migrateStaleSeed only needs to know what ELSE changed for it.

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function guestSeededYmd(): string | null {
  try { return localStorage.getItem(SEED_KEY); } catch { return null; }
}

// Forget the seed (Settings → "Reset routine to default") so the NEXT
// seedGuestRule() re-writes the precoded default from scratch. Also clears the
// device-local silence + step goals so they return to their defaults.
export function clearGuestSeed(): void {
  try {
    localStorage.removeItem(SEED_KEY);
    // Drop the version stamp too, or a reset device would re-seed the current
    // default and then still look "already migrated" to a future migration.
    localStorage.removeItem(SEED_VERSION_KEY);
    localStorage.removeItem(GUEST_GOAL_KEY);
    localStorage.removeItem(GUEST_STEP_GOAL_KEY);
  } catch { /* private mode */ }
}

/**
 * Visio Divina, as the default rule's contemplative practice.
 *
 * Owner: "the default preset [should] also include Visio Divina … have Visio
 * Divina be the contemplative practice and take out the silence. So it'd be
 * simple guided, CAC, and Visio Divina."
 *
 * Two writes, because they answer different questions and the card needs both:
 * the home LAYOUT decides the practice is on, and phoebe:slot:visio only says
 * when it rides. A slot with no layout entry is a practice nothing renders.
 */
function seedVisio(): void {
  setPracticeSlot("visio", "anytime");
  const { layout, changed } = addHomeCard(readCachedHomeLayout(), "visio");
  if (changed) cacheHomeLayoutLocalOnly(layout);
}

/**
 * THE CAC CARD MUST BE IN THE LAYOUT, NOT LEFT TO THE FALLBACK.
 *
 * `useRhythmState`'s `reflectFallback` only fires when there is NO saved home
 * layout at all (`!hl`) — it exists for a guest who has never customized
 * anything, so the single reflection preference alone decides the card. The
 * moment `seedVisio()` started writing a real layout, `hl` was no longer
 * null, `fromLayout` (which reads the layout) came back empty because "cac"
 * was never actually IN it, and `chosenReflections` fell through to nothing.
 * The reflection source was set correctly; the card that reads it was not.
 * Owner: "CAC Newsletter (Its not showing up)" — this is why.
 */
/** Put one newsletter card IN THE LAYOUT (see the note above). */
function seedCard(key: "cac" | "fdd"): void {
  const { layout, changed } = addHomeCard(readCachedHomeLayout(), key);
  if (changed) cacheHomeLayoutLocalOnly(layout);
}
/**
 * Take a PREVIOUS default's card back out when the default moves.
 *
 * `removeHomeCard` drops the key from `order` rather than adding it to
 * `hidden`, which is what we want: `hidden` means "the person deliberately
 * removed this", and nobody removed anything here — the default changed under
 * them. It also matters because a guest layout is routinely `hidden: []`, so
 * anything left in `order` is ON.
 */
function unseedCard(key: "cac" | "fdd"): void {
  const current = readCachedHomeLayout();
  if (!current) return;
  const { layout, changed } = removeHomeCard(current, key);
  if (changed) cacheHomeLayoutLocalOnly(layout);
}

/**
 * THE DEFAULT AS DATA — a rhythm a super admin edited (routine_presets'
 * "__default__" row, cached by lib/rulePresetsStore).
 *
 * The same writes the hardcoded seed below makes, taken from the row instead:
 * the two side levels, the newsletter, the cards to turn on, the relational
 * practices, the silence goal and any practice slots. When there is no row —
 * no network yet, an untouched install, an admin who never edited it — the
 * hardcoded default stands, which is why this returns false rather than
 * writing a half-rhythm.
 */
/**
 * `mode` decides how much of the person's own rhythm this is allowed to
 * replace.
 *
 * "fresh" — a device with no rule at all. The admin's default IS the rhythm,
 * so it is written whole.
 *
 * "migrate" — a device that has been used. `untouched` upstream is decided by
 * the TWO SIDE LEVELS ALONE, and STALE_SEEDS includes the pair that ships
 * today, so someone who kept the default morning and evening but chose their
 * own relational practices, their own silence goal, or removed a card still
 * reads as untouched. Written whole, this deleted all three the first time an
 * admin ever saved a default — while /admin/presets promised the opposite:
 * "A person who has customized their own rhythm is never touched by this."
 *
 * So a migration is ADDITIVE, exactly as the hardcoded branch below already
 * is: relational practices are unioned, never removed; a silence goal the
 * person chose is left alone; and a card they deliberately took off their
 * home stays off.
 */
function applyDefaultSeed(d: DefaultSeed | null, mode: "fresh" | "migrate" = "fresh"): boolean {
  if (!d) return false;
  const migrating = mode === "migrate";
  setSideLevel("morning", d.morning as Parameters<typeof setSideLevel>[1]);
  setSideLevel("evening", d.evening as Parameters<typeof setSideLevel>[1]);
  if (d.reflection && d.reflection !== "none") {
    setReflectionSource(d.reflection);
    setSideReflection("morning", d.reflection);
  }
  let layout: ReturnType<typeof addHomeCard>["layout"] | null = readCachedHomeLayout();
  let changed = false;
  for (const key of d.cards ?? []) {
    const r = addHomeCard(layout, key, migrating ? { respectRemoval: true } : undefined);
    layout = r.layout; changed = changed || r.changed;
  }
  if (changed && layout) cacheHomeLayoutLocalOnly(layout);
  for (const [key, slot] of Object.entries(d.slots ?? {})) {
    setPracticeSlot(key as Parameters<typeof setPracticeSlot>[0], slot as Parameters<typeof setPracticeSlot>[1]);
  }
  if (migrating) {
    // Union — a curated anchor the admin's default omits is not evidence the
    // person wanted it gone, and removing it here tombstones and pushes it.
    const have = activeRelationalPractices();
    const add = (d.relational ?? []).filter((r) => !have.includes(r));
    if (add.length > 0) setRelationalPractices([...have, ...add]);
    // Only a device with no goal of its own, or still on the retired 5.
    const currentGoal = localStorage.getItem(GUEST_GOAL_KEY);
    if (currentGoal == null || currentGoal === "5") setGuestSilenceGoalMin(d.silenceMin ?? 0);
  } else {
    setRelationalPractices(d.relational ?? []);
    setGuestSilenceGoalMin(d.silenceMin ?? 0);
  }
  // What version of the admin's default this device is standing on, so a later
  // edit can reach an untouched device (SEED_VERSION does the same job for
  // changes made in code).
  try { localStorage.setItem(DEFAULT_SEED_VERSION_KEY, String(d.version ?? 1)); } catch { /* private mode */ }
  return true;
}

/** The admin default this device last applied, or 0. */
function appliedDefaultVersion(): number {
  try { return parseInt(localStorage.getItem(DEFAULT_SEED_VERSION_KEY) ?? "0", 10) || 0; } catch { return 0; }
}
export const DEFAULT_SEED_VERSION_KEY = "phoebe:guest-seed-default-version";

/** Move a device still sitting on an OLD untouched seed onto today's default.
 *  No-op once stamped, and no-op the moment the levels don't match a seed we
 *  wrote — a customized rule is never overwritten. */
function migrateStaleSeed(): void {
  try {
    const stored = getStoredDefaultSeed();
    // An admin edit reaches an untouched device even when the CODE seed hasn't
    // moved — that's what the stored version is for. Without this the overlay
    // would only ever apply to installs that had never opened the app.
    const adminMoved = !!stored && (stored.version ?? 1) > appliedDefaultVersion();
    if (localStorage.getItem(SEED_VERSION_KEY) === SEED_VERSION && !adminMoved) return;
    const morning = getExplicitSideLevel("morning");
    const evening = getExplicitSideLevel("evening");
    const untouched = STALE_SEEDS.some(([m, e]) => m === morning && e === evening);
    if (untouched && applyDefaultSeed(stored, "migrate")) {
      // The admin's default replaced the code one wholesale; nothing below
      // applies (it would re-add practices their rhythm leaves out).
      try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
      clearRoutineSyncClock();
      localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
      return;
    }
    if (untouched) {
      setSideLevel("morning", "guided-prayer");
      // THE EXAMEN IN THE EVENING (owner, v8). v7 had left the evening off
      // ("ask") with Visio riding that slot; a device on an untouched pair had
      // no evening opinion of its own to preserve.
      setSideLevel("evening", "examen");
      /**
       * ONE NEWSLETTER, AND THE CURRENT ONE (owner, 2026-09-08, seeing both
       * Forward Day by Day AND the CAC Daily Meditation on a default rhythm:
       * "it should just have one").
       *
       * This line said `seedCac()` — v7's newsletter — while the fresh seed
       * below had already moved to Forward Day by Day for v8. So a device that
       * MIGRATED got CAC and a device installed fresh got FDD, and a device
       * that had been through both ends of that carried the two of them at
       * once. It is invisible in review because both calls are correct in
       * isolation; only the pair is wrong.
       *
       * The reflection SOURCE is still not migrated — a device can sit on
       * untouched levels and still have chosen its own daily word. But when it
       * has NOT chosen (`reflection-source` unset, which is exactly the state
       * a seeded-then-migrated device is in), the default's newsletter is the
       * one that belongs on the home screen, and the previous default's card
       * is taken back off. A device that chose its own is left completely
       * alone — `chose` gates both halves.
       */
      // getExplicitReflectionSource, NOT getReflectionSource — the latter
      // defaults to "cac" when nothing was ever chosen, so every untouched
      // device would read as having picked the CAC.
      //
      // ONE NEWSLETTER, WHICHEVER ONE, ENFORCED BOTH WAYS. Branching on
      // "did they choose?" and only tidying up in the no branch was
      // ORDER-DEPENDENT and did not work: something writes the reflection
      // source during boot, so by the time the migration ran the device
      // looked like it had chosen, took the other branch, and kept both
      // cards (measured on the Android emulator — stamp advanced to 9,
      // source became "fdd", and "cac" was still in `order`). Deciding which
      // card to KEEP and then removing the other is the same statement
      // without the ordering assumption.
      const chose = getExplicitReflectionSource();
      const keep: "cac" | "fdd" = chose === "cac" || chose === "fdd" ? chose : "fdd";
      if (!chose) {
        setReflectionSource(keep);
        setSideReflection("morning", keep);
      }
      seedCard(keep);
      unseedCard(keep === "fdd" ? "cac" : "fdd");
      // VISIO DIVINA, as the EVENING practice (owner, v7). Slotted to evening
      // rather than the practice's own "anytime" default, because the ask was
      // specifically "Visio Divina as the evening practice."
      seedVisio();
      // Any time of day now that the Examen has the evening (v8).
      setPracticeSlot("visio", "anytime");
      // The v6 default's 5-minute silence goal is gone — Visio replaces it as
      // the contemplative practice. Only cleared for a device still on that
      // OLD goal (or none); someone's own chosen goal is never overwritten.
      const currentGoal = localStorage.getItem(GUEST_GOAL_KEY);
      if (currentGoal == null || currentGoal === "5") setGuestSilenceGoalMin(0);
      // Express Gratitude joins the default for devices still on an older
      // untouched seed too — added, never removed, so a device that turned it
      // off in the customizer does not get it back on the next boot.
      if (!activeRelationalPractices().includes("gratitude")) {
        setRelationalPractices([...activeRelationalPractices(), "gratitude"]);
      }
            try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
      // Same reasoning as the seed below: a precoded default must never migrate
      // up to an account on sign-in, so zero the clock the setters just bumped.
      clearRoutineSyncClock();
    }
    // Stamp either way — a customized device shouldn't be re-checked on every
    // boot for the rest of its life.
    localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
  } catch { /* private mode — nothing to migrate */ }
}

/** Seed the precoded guest rule once (no-op if the device already has ANY
 *  explicit rule or has seeded before). Safe to call on every guest boot. */
export function seedGuestRule(): void {
  try {
    /**
     * Undo a stale home layout a short-lived bug wrote for the Breathing Together
     * pick, which was hiding the newsletter card (see
     * clearSpuriousGuestHomeLayout).
     *
     * ONLY FOR DEVICES THIS BUNDLE HASN'T SEEDED. That cleanup decides a layout
     * is spurious by asking whether it contains "office" — a fine proxy while
     * the only legitimate guest layout came from the full customizer, and wrong
     * the moment the seed itself started writing one. The default now includes
     * Visio Divina, whose layout has no "office" in it, so running this
     * unconditionally would delete the Visio card on the next boot and every
     * boot after. Gating on the version stamp keeps the cleanup pointed at the
     * old bundles it was written for.
     */
    /* GATED ON NEVER-STAMPED, NOT ON VERSION-MISMATCH. The cleanup below
       decides a layout is spurious by asking whether it contains "office",
       and the current default (Visio, no office) looks spurious by that test.
       While this read `!== SEED_VERSION` it re-armed itself every time the
       seed version was bumped — bumping to "5" for Express Gratitude would
       have deleted the Visio card from every device stamped "4", which is
       the very failure the note above describes. The old bundles this was
       written for carry no stamp at all, so that is what to test. */
    if (!localStorage.getItem(SEED_VERSION_KEY)
        && clearSpuriousGuestHomeLayout()) {
      try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
    }
    if (localStorage.getItem(SEED_KEY)) {
      // (The old backfill that wrote a 5-minute goal here is gone with the
      // silence itself — it would have put the Silence card back on every boot.)
      migrateStaleSeed();
      return; // already seeded
    }
    // Respect an existing rule (e.g. a device that used the app signed-in).
    if (getExplicitSideLevel("morning") || getExplicitSideLevel("evening")) return;
    /**
     * THE DEFAULT ROUTINE (owner): Simple Guided Prayer in the morning, the
     * CAC's Daily Meditation as the day's reading, and Visio Divina as the
     * contemplative practice — and NO EVENING. The evening is written as
     * "ask", which is a side's off state, so a new person gets three cards
     * rather than a fourth they never asked for.
     *
     * It seeded five minutes of silence until the owner replaced it with Visio
     * ("take out the silence … so it'd be simple guided, CAC, and Visio
     * Divina"). Three practices either way; the third is now something you
     * look at rather than a timer.
     */
    /**
     * THE DEFAULT ROUTINE, current version (owner): Simple Guided in the
     * morning, an Evening Devotion, the CAC's Daily Meditation, Express
     * Gratitude, and Breathing Together.
     *
     * Every card here except the two office sides is a LAYOUT entry, not a
     * side level — CAC and Breathing Together are both read from the home
     * layout by `useRhythmState`, and a guest who has never saved one gets
     * only the single-reflection fallback (which is what silently dropped
     * CAC the moment Visio's layout write made the fallback stop firing).
     */
    // THE ADMIN'S DEFAULT, when there is one (routine_presets "__default__").
    // The block below is what ships in the app, and it is what a device with
    // no cached overlay gets — a first open with no network still lands on a
    // real rhythm rather than waiting for one.
    if (applyDefaultSeed(getStoredDefaultSeed())) {
      localStorage.setItem(SEED_KEY, todayYmd());
      localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
      clearRoutineSyncClock();
      return;
    }
    setSideLevel("morning", "guided-prayer");
    // THE DEFAULT, v8 (owner, 2026-09-05): "Morning: Simple · Newsletter:
    // Forward · Share Gratitude · Visio Divina · Evening: Examen". The Examen
    // takes the evening anchor again; Forward Day by Day is the day's word.
    setSideLevel("evening", "examen");
    setReflectionSource("fdd");
    setSideReflection("morning", "fdd");
    setRelationalPractices(["gratitude"]);
    seedCard("fdd");
    // Visio Divina rides any time of day now that the Examen has the evening.
    seedVisio();
    setPracticeSlot("visio", "anytime");
    localStorage.setItem(SEED_KEY, todayYmd());
    // Freshly seeded devices are already current — stamp so migrateStaleSeed
    // never has anything to do for them.
    localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
    // The precoded seed is NOT a user-authored routine, so it must never migrate
    // up to an account on sign-in. The setters above bumped the routine sync
    // clock (via OFFICE_PREFS_EVENT → pushRoutineConfig); zero it back out — and
    // cancel that queued (session-less, doomed) guest push — so a pure seed has
    // localAt === 0. The owner-switch guard in routineSync then skips migrating
    // it, and a genuine later customization re-bumps the clock and migrates
    // normally. (Without this, reinstall → psalms seed → sign in → the seed
    // clobbered an office account whose method lived only in office-prefs, and
    // the morning reminder went out worded for psalms.)
    clearRoutineSyncClock();
  } catch { /* private mode — the starter defaults still apply */ }
}

// The guest silence daily goal (minutes) — device-local stand-in for the
// server's contemplationGoalMinutes. The customizer's silence step and the
// home goal card both read/write this when in guest mode.
export const GUEST_GOAL_KEY = "phoebe:guest-silence-goal-min";
export function getGuestSilenceGoalMin(): number {
  try {
    const v = parseInt(localStorage.getItem(GUEST_GOAL_KEY) ?? "", 10);
    return Number.isFinite(v) && v >= 0 && v <= 180 ? v : 0;
  } catch { return 0; }
}
/** The stored goal itself, or null when the device has never written one —
 *  lets the customizer tell "a chosen value (even 0 = no goal)" apart from
 *  "nothing yet" (which falls back to the 5-minute default). */
export function getGuestSilenceGoalMinRaw(): number | null {
  try {
    const s = localStorage.getItem(GUEST_GOAL_KEY);
    if (s == null) return null;
    const v = parseInt(s, 10);
    return Number.isFinite(v) && v >= 0 && v <= 180 ? v : null;
  } catch { return null; }
}
export function setGuestSilenceGoalMin(min: number): void {
  try {
    localStorage.setItem(GUEST_GOAL_KEY, String(Math.max(0, Math.min(180, Math.round(min)))));
    // Same live-update signal the officePrefs setters fire, so the home cards
    // and the simple rule editor re-read the goal without a reload.
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* ignore */ }
}

// The guest DAILY STEP goal (steps) — device-local stand-in for the server's
// dailyStepGoal (which guests, being login-free, don't reach). The Daily steps
// page + the home step card read/write this when in guest mode. 0 = off.
export const GUEST_STEP_GOAL_KEY = "phoebe:guest-step-goal";
export function getGuestStepGoal(): number {
  try {
    const v = parseInt(localStorage.getItem(GUEST_STEP_GOAL_KEY) ?? "", 10);
    return Number.isFinite(v) && v >= 0 && v <= 200000 ? v : 0;
  } catch { return 0; }
}
export function setGuestStepGoal(steps: number): void {
  try {
    localStorage.setItem(GUEST_STEP_GOAL_KEY, String(Math.max(0, Math.min(200000, Math.round(steps)))));
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* ignore */ }
}

// Reset ALL device-local rule / preference state on LOGOUT, so the next person
// on this device (a guest) starts from the STANDARD seeded rule — not the
// signed-out user's customizations. The authoritative rule data lives on the
// server (rule_config, office-prefs, home layout, custom anchors, Way of Love)
// and is restored on the next sign-in, so clearing the DEVICE copy is safe. It
// also fixes re-login on the SAME device: a blank device + a zeroed routine
// sync clock makes routineSync ADOPT the server config in full, instead of a
// stale local copy winning last-write-wins. Clearing the guest-seeded marker
// makes seedGuestRule() re-run fresh on the next guest boot → the standard rule.
export function resetDeviceRuleForLogout(): void {
  try {
    const PREFIXES = [
      "phoebe:office:",           // per-side levels/entries/reflections/minutes/etc.
      "phoebe:office-completed:", // today's office done flags
      "phoebe:practice-done:",    // today's optional-practice done flags
      "phoebe:contemplation",     // per-side sit done flags + style
      "phoebe:slot:",             // practice time-of-day slots
      "phoebe:guest-",            // guest silence/step goals, seed marker, welcome, migrated
      "phoebe:home-layout",       // cached home card order/visibility
      "phoebe:routine",           // routine sync clock (UPDATED_AT) + owner
      "phoebe:health-",           // Apple Health connect/step flags
      "phoebe:course:",           // course progress (rides rule_config; flushed
                                  // on logout, restored from the server on re-login)
      "phoebe:spotify",           // Spotify OAuth token/verifier/state (audit #19:
                                  // otherwise user B inherits user A's Spotify tokens
                                  // on a shared device)
      /**
       * Everything below is a genuine content-history gap, not tidiness: on a
       * shared device, the next person to sign in inherited the previous
       * person's Audio Divina listening history, podcast position, Sacred
       * Library selections, newsletter subscriptions, and per-source
       * devotional read-state — none of it in any prior list. Grouped by
       * feature, one prefix each.
       */
      "phoebe:listening-",        // Audio Divina: goal, log, songs, artists, history
      "phoebe:podcast:pos:",      // per-episode playback position
      "phoebe:podcast-home-shows",// followed podcast shows
      "phoebe:sacred-library",    // curated music library selections
      "phoebe:news",              // newsletter subscriptions + read-state
      "phoebe:icon-",             // Praying with Icons: history, physical log, week pick
      "phoebe:visio-",            // Visio Divina: history, week pick
      "phoebe:weekly-",           // Way of Love weekly log (done/day, distinct from the
                                   // synced phoebe:weekly-practices, already covered below)
      // Per-source devotional read-state — "did I open today's word", one
      // per reflection source.
      "phoebe:cac-", "phoebe:fdd-", "phoebe:ssje-", "phoebe:vts-",
      "phoebe:grist-", "phoebe:sojo-", "phoebe:nouwen-", "phoebe:taize-",
      "phoebe:psalms-read", "phoebe:readings-prayed", "phoebe:guided-prayer-read",
    ];
    /**
     * DERIVED from ROUTINE_KEYS, not hand-listed beside it.
     *
     * The hand-written set missed five of them — phoebe:practice-days,
     * phoebe:cobreathe-length, phoebe:weekly-practices, phoebe:rest-window and
     * phoebe:hide-turn-learn-pray — so the next guest on a shared device
     * inherited the previous user's weekday scoping (cards vanishing on days
     * they never chose), their sabbath window, their breath count and their
     * weekly-card visibility. Worse, that guest's rule then carried a genuinely
     * edited local clock and could migrate those values UP into a fresh
     * account. The near-miss says it best: the prefix list has
     * "phoebe:practice-done:" and the exact list wanted "phoebe:practice-days"
     * — one character apart, and nothing to catch it.
     *
     * This function's own promise is "reset ALL device-local rule state", so
     * ROUTINE_KEYS is exactly the right definition of "all".
     */
    const EXACT = new Set([
      ...ROUTINE_KEYS,
      "phoebe:scripture-scope", "phoebe:commitment-start", "phoebe:dp-pulse",
      // Decides whether the Prayer List satisfies morningDone/eveningDone —
      // completion-signal structure, not a device preference, and it was in no
      // list at all (it doesn't sync either; see routineSync).
      "phoebe:prayer-list-slot",
    ]);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (EXACT.has(k) || PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch { /* private mode — nothing to reset */ }
}
