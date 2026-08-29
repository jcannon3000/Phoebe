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
import { setSideLevel, setReflectionSource, setSideReflection, getExplicitSideLevel, OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { clearSpuriousGuestHomeLayout, readCachedHomeLayout, cacheHomeLayoutLocalOnly, addHomeCard } from "@/lib/homeLayoutCache";
import { setPracticeSlot, setRelationalPractices, activeRelationalPractices } from "@/lib/customAnchors";
import { clearRoutineSyncClock } from "@/lib/routineSync";

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
const SEED_VERSION_KEY = "phoebe:guest-seed-version";
const SEED_VERSION = "5";
// Every (morning, evening) pair this seed has written historically. A device
// sitting on one of these has an untouched seed. Add to this list, never
// remove: the whole point is recognizing rules we ourselves wrote.
const STALE_SEEDS: Array<[string, string]> = [
  ["psalms", "psalms"],          // 484e3f5e
  ["guided-prayer", "examen"],   // 1640800e
  ["psalms", "examen"],          // 54fdabbe
  ["guided-prayer", "readings"], // the v2 default, replaced by the one below
  // The v4 default itself — devices already sitting on the current pair, which
  // is what a device seeded before Express Gratitude joined looks like. Without
  // this row they match no stale seed and the migration below never runs for
  // them, so the addition would only ever reach devices installing fresh.
  ["guided-prayer", "ask"],
];

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

/** Move a device still sitting on an OLD untouched seed onto today's default.
 *  No-op once stamped, and no-op the moment the levels don't match a seed we
 *  wrote — a customized rule is never overwritten. */
function migrateStaleSeed(): void {
  try {
    if (localStorage.getItem(SEED_VERSION_KEY) === SEED_VERSION) return;
    const morning = getExplicitSideLevel("morning");
    const evening = getExplicitSideLevel("evening");
    const untouched = STALE_SEEDS.some(([m, e]) => m === morning && e === evening);
    if (untouched) {
      setSideLevel("morning", "guided-prayer");
      // NO EVENING in the default (owner). "ask" is a side's off state — the
      // one thing isActiveLevel and the customizer both read as "not part of
      // the rhythm" — so this turns the evening off rather than leaving a
      // practice on it.
      setSideLevel("evening", "ask");
      // The REFLECTION is deliberately not migrated. A device can sit on an
      // untouched pair of levels and still have chosen its own daily word;
      // moving the levels is what this migration is for, and rewriting a
      // reading someone picked would be a different, unasked-for act.
      //
      // Visio joins the default, and the silence leaves it — but the silence
      // only goes if it is still EXACTLY the five minutes the old seed wrote.
      // Matching levels means the rule is untouched; it does not mean the goal
      // is, and someone who set their own silence should keep it. A different
      // value, or none, is left alone.
      seedVisio();
      // Express Gratitude joins the default for devices still on an older
      // untouched seed too — added, never removed, so a device that turned it
      // off in the customizer does not get it back on the next boot.
      if (!activeRelationalPractices().includes("gratitude")) {
        setRelationalPractices([...activeRelationalPractices(), "gratitude"]);
      }
      if (localStorage.getItem(GUEST_GOAL_KEY) === "5") localStorage.removeItem(GUEST_GOAL_KEY);
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
     * Undo a stale home layout a short-lived bug wrote for the Creation Prayer
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
    setSideLevel("morning", "guided-prayer");
    setSideLevel("evening", "ask");
    setReflectionSource("cac");
    setSideReflection("morning", "cac");
    /**
     * AND EXPRESS GRATITUDE (owner: "lets put Express Gratitude in the
     * standard routine").
     *
     * It is a relational practice, so it arrives as an ordinary custom anchor
     * carrying a QUESTION rather than a checkbox — "Did you tell someone, or
     * send someone a message, saying what you are grateful for?" — and rides
     * the "anytime" slot. Nothing about the seed is special-cased for it: it
     * is the same row the customizer's Relational Practices step writes, so
     * turning it off there removes it like any other.
     */
    setRelationalPractices(["gratitude"]);
    // Visio Divina is this rule's contemplative practice, in place of the five
    // minutes of silence it used to seed (owner). No GUEST_GOAL_KEY is written:
    // the goal key is what raises the Silence card, so its absence is how the
    // silence is "taken out" rather than shown at zero.
    seedVisio();
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
