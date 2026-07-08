import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { isNativeShell } from "@/lib/isNativeShell";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import {
  getSideLevel, setSideLevel, setSideEntry,
  getSideContemplation, setSideContemplation,
  getReflectionSource, setReflectionSource, setSideReflection,
  setPsalmCycle, OFFICE_PREFS_EVENT,
  type ReflectionSource,
} from "@/lib/officePrefs";
import { getGuestSilenceGoalMin, setGuestSilenceGoalMin, getGuestStepGoal, setGuestStepGoal } from "@/lib/guestSeed";
import { pushRoutineConfig } from "@/lib/routineSync";

// ── /customize — the BASIC customizer for logged-out / device-local sessions ─
//
// Four dropdowns (Daily Prayer, Newsletter, Silence, Daily Steps [iOS only]),
// styled like the office/psalms "before you begin" pill chooser — category on
// the left, the current value + a caret on the right, a native <select>
// invisibly layered on top so it's a real dropdown on tap. Writes straight to
// the same device-local prefs the seeded guest rule + full customizer read, so
// the home reflects a change immediately; nothing here requires an account.
// A quiet "Customize more fully" link hands off to the full flow
// (/pilot/build), which is ALREADY gated by GuestGate to require signing in
// first — so this page is intentionally NOT in that gate's route set.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SOFT_GREEN = "rgba(200,212,192,0.75)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#0C1F12";

type DailyPrayer = "psalms" | "devotion" | "office" | "creation";

function currentDailyPrayer(): DailyPrayer {
  let style: "silent" | "cobreathe" = "silent";
  try { style = localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { /* ignore */ }
  if (style === "cobreathe" && (getSideContemplation("morning") || getSideContemplation("evening"))) return "creation";
  const lvl = getSideLevel("morning");
  if (lvl === "psalms") return "psalms";
  if (lvl === "office") return "office";
  return "devotion";
}

export default function CustomizePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const guest = isDeviceLocalGuest(user);

  // A still leaf backdrop, picked once — matching the office/psalms screens.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // A signed-in "light" account (real, but not device-local) has its silence
  // goal + step goal on the server; a device-local guest keeps them local.
  const { data: officePrefs, isLoading: officePrefsLoading } = useQuery<{ contemplationGoalMinutes?: number; dailyStepGoal?: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled: !guest,
  });
  // A guest's local values are available synchronously; a light account's
  // saved goals need this query to resolve first — render those two rows only
  // once we actually KNOW the value, so a light account never briefly sees a
  // wrong default (e.g. "5 min") before their real saved goal paints.
  const goalsReady = guest || !officePrefsLoading;

  const [dailyPrayer, setDailyPrayer] = useState<DailyPrayer>(() => currentDailyPrayer());
  const [newsletter, setNewsletter] = useState<ReflectionSource>(() => getReflectionSource());
  const [silenceMin, setSilenceMin] = useState<number>(() =>
    guest ? (getGuestSilenceGoalMin() || 5) : 5,
  );
  const [stepGoal, setStepGoalState] = useState<number>(() => (guest ? getGuestStepGoal() : 0));

  // Once office-prefs load for a light (non-guest) account, adopt its saved
  // goals instead of the guest fallback defaults above.
  const effectiveSilenceMin = guest ? silenceMin : (officePrefs?.contemplationGoalMinutes || silenceMin);
  const effectiveStepGoal = guest ? stepGoal : (officePrefs?.dailyStepGoal ?? stepGoal);

  const applyDailyPrayer = (choice: DailyPrayer) => {
    setDailyPrayer(choice);
    if (choice === "creation") {
      // "ask" is the real OfficeLevel for "no BCP anchor on this side" — the
      // same value the full customizer's PrayChoice "none" maps to.
      setSideLevel("morning", "ask");
      setSideLevel("evening", "ask");
      setSideContemplation("morning", true);
      setSideContemplation("evening", true);
      try { localStorage.setItem("phoebe:contemplation-style", "cobreathe"); window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
    } else {
      setSideContemplation("morning", false);
      setSideContemplation("evening", false);
      try { localStorage.setItem("phoebe:contemplation-style", "silent"); } catch { /* ignore */ }
      setSideLevel("morning", choice);
      setSideLevel("evening", choice);
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

  const applySilence = (min: number) => {
    setSilenceMin(min);
    if (guest) setGuestSilenceGoalMin(min);
    else void apiRequest("PUT", "/api/me/office-prefs", { contemplationGoalMinutes: min }).catch(() => { /* best-effort */ });
  };

  const applySteps = (goal: number) => {
    setStepGoalState(goal);
    if (guest) setGuestStepGoal(goal);
    else void apiRequest("PUT", "/api/me/office-prefs", { dailyStepGoal: goal }).catch(() => { /* best-effort */ });
  };

  const SILENCE_OPTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  const STEP_OPTS = [5000, 7500, 10000, 12500, 15000];

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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 24px max(2rem, env(safe-area-inset-bottom))" }}>
        <p style={{ color: "rgba(143,175,150,0.7)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "18px 0 6px", fontWeight: 600 }}>Your daily rhythm</p>
        <h1 style={{ fontFamily: FONT, fontSize: "clamp(30px, 7vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: "0 0 10px", textAlign: "center" }}>Customize</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, fontFamily: FONT, color: "rgba(200,212,192,0.85)", margin: "0 0 24px", textAlign: "center", maxWidth: 420 }}>
          A few quick choices — adjustable anytime, right here.
        </p>

        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
          {row("Daily Prayer", dailyPrayer, [
            { value: "psalms", label: "Psalms" },
            { value: "devotion", label: "Devotions" },
            { value: "office", label: "Offices" },
            { value: "creation", label: "Creation Prayer" },
          ], (v) => applyDailyPrayer(v as DailyPrayer))}

          {row("Newsletter", newsletter, [
            { value: "fdd", label: "Forward Day by Day" },
            { value: "ssje", label: "SSJE — Brother, Give Us a Word" },
            { value: "cac", label: "CAC Daily Meditation" },
          ], (v) => applyNewsletter(v as ReflectionSource))}

          {goalsReady && row("Silence", String(effectiveSilenceMin), SILENCE_OPTS.map((m) => ({ value: String(m), label: `${m} min` })), (v) => applySilence(parseInt(v, 10) || 5))}

          {/* Daily steps — Apple Health, iOS only. */}
          {isNativeShell() && goalsReady && row("Daily steps", String(effectiveStepGoal), [
            { value: "0", label: "Off" },
            ...STEP_OPTS.map((g) => ({ value: String(g), label: `${g.toLocaleString()} steps` })),
          ], (v) => applySteps(parseInt(v, 10) || 0))}
        </div>

        {/* The full customizer needs an account. A guest goes to sign-in
            DIRECTLY (with a redirect back to the full flow) — not via
            /pilot/build, which GuestGate now bounces back HERE (loop). A
            signed-in light account skips the wall and goes straight in. */}
        <Link
          href={guest ? `/signin?mode=signup&redirect=${encodeURIComponent("/pilot/build")}` : "/pilot/build"}
          className="mt-6 text-sm font-medium"
          style={{ color: SAGE, fontFamily: FONT }}
        >
          Customize more fully →
        </Link>
      </div>
    </div>
  );
}
