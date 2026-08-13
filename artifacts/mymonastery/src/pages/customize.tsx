import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import {
  getSideLevel, setSideLevel, setSideEntry,
  getSideContemplation, setSideContemplation, setSideMinutes,
  getReflectionSource, setReflectionSource, setSideReflection,
  setPsalmCycle, OFFICE_PREFS_EVENT,
  type ReflectionSource,
} from "@/lib/officePrefs";
import { getGuestSilenceGoalMin, setGuestSilenceGoalMin } from "@/lib/guestSeed";
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

type DailyPrayer = "guided-prayer" | "psalms" | "devotion" | "office" | "contemplation";

// "Add a practice" — the same contemplative add-ons the full customizer's
// "Add an additional practice" step offers (Audio Divina / The Examen /
// Contemplative Walk), just ONE at a time here (this page is meant to stay a
// few quick dropdowns, not a multi-select). Backed by the same home-layout
// module keys those toggles write in WayOfLoveRuleFlow.tsx.
type AddPractice = "none" | "listening" | "examen" | "walk";
const PRACTICE_KEYS: readonly AddPractice[] = ["listening", "examen", "walk"];
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

  // A still leaf backdrop, picked once — matching the office/psalms screens.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Fade + rise in on mount, matching the office/psalms "before you begin" entrance.
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, []);

  // Self-heal a stale home layout a short-lived Creation Prayer bug wrote, which
  // hid the newsletter card. Guests only (they never have a legit home layout).
  useEffect(() => {
    if (guest && clearSpuriousGuestHomeLayout()) window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
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
  const [silenceMin, setSilenceMin] = useState<number>(() =>
    guest ? (getGuestSilenceGoalMin() || 5) : 5,
  );
  // Once office-prefs load for a light (non-guest) account, adopt its saved
  // goal instead of the guest fallback default above.
  const effectiveSilenceMin = guest ? silenceMin : (officePrefs?.contemplationGoalMinutes || silenceMin);

  // "Add a practice" — read straight from the current home layout every render
  // (a guest's cached copy is instant; a light account's arrives via useAuth's
  // own /auth/me fetch, gated by authLoading below) until this session makes
  // its own pick, which then wins locally without waiting on a round-trip.
  const [addPracticeLocal, setAddPracticeLocal] = useState<AddPractice | null>(null);
  const currentHomeLayout: HomeLayout | null = guest ? readCachedHomeLayout() : (user?.homeLayout ?? null);
  const addPractice: AddPractice = addPracticeLocal ?? (PRACTICE_KEYS.find((k) => homeCardOn(currentHomeLayout, k)) ?? "none");

  const applyDailyPrayer = (choice: DailyPrayer) => {
    // Re-selecting the current anchor is a no-op — without this, re-picking
    // Contemplative Prayer would re-clobber an adjusted goal back to 20.
    if (choice === dailyPrayer) return;
    setDailyPrayer(choice);
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
      try { localStorage.setItem("phoebe:contemplation-style", "silent"); } catch { /* ignore */ }
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
      setSideEntry("morning", "read");
      setSideEntry("evening", "read");
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

  const applyNewsletter = (id: ReflectionSource) => {
    setNewsletter(id);
    setReflectionSource(id);
    setSideReflection("morning", id);
    setSideReflection("evening", id);
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
    const otherNewsletters = (["cac", "fdd", "ssje", "vts"] as const).filter((n) => n !== newsletter);
    const baseOrder = existing?.order ?? ["requests", "office", "contemplation", newsletter, "feeds", "ncmp", "podcasts", ...otherNewsletters];
    const baseHidden = existing?.hidden ?? ["ncmp", "podcasts", "reading", "cobreathe", "prayer-list", ...otherNewsletters];
    const order = baseOrder.filter((k) => !PRACTICE_KEYS.includes(k as AddPractice));
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

        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
          {ownPracticeLocked
            ? staticRow("Daily Prayer", "Your own practice")
            : row("Daily Prayer", dailyPrayer, [
                { value: "guided-prayer", label: "Simple Guided Prayer" },
                { value: "psalms", label: "Psalms" },
                { value: "office", label: "Offices" },
                { value: "contemplation", label: "Contemplative Prayer" },
              ], (v) => applyDailyPrayer(v as DailyPrayer))}

          {row("Newsletter", newsletter, [
            { value: "fdd", label: "Forward Day by Day" },
            { value: "ssje", label: "SSJE — Brother, Give Us a Word" },
            { value: "cac", label: "CAC Daily Meditation" },
            { value: "vts", label: "VTS Dean's Commentary" },
          ], (v) => applyNewsletter(v as ReflectionSource))}

          {goalsReady && row("Silence", String(effectiveSilenceMin), SILENCE_OPTS.map((m) => ({ value: String(m), label: `${m} min` })), (v) => applySilence(parseInt(v, 10) || 5))}

          {/* Same three contemplative add-ons as the full customizer's "Add an
              additional practice" step — just one at a time here. Gated on
              auth having settled so a light account's saved layout doesn't
              briefly read as "None" before it loads. */}
          {!authLoading && row("Add a practice", addPractice, [
            { value: "none", label: "None" },
            { value: "listening", label: "Audio Divina" },
            { value: "examen", label: "The Examen" },
            { value: "walk", label: "Contemplative Walk" },
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
