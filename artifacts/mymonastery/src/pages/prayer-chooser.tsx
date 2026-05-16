import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";
import { playOpeningSwell } from "@/lib/amenFeedback";
import { readOfficeProgress, type LiturgyMode } from "@/pages/bcp-daily-office";

// ── Prayer chooser ──────────────────────────────────────────────────────────
// Replaces the dashboard's inline modal popup. The home-screen CTA links
// here; this page presents three depth options for today's prayer:
//
//   • Community Intercessions — the slideshow walk through your parish
//                               group's prayer requests + intercessions.
//   • Daily Devotion          — BCP short form, includes the prayer list.
//   • Daily Office            — BCP full Morning/Evening Prayer, includes
//                               the prayer list at the end.
//
// Time-of-day labels and links flip morning vs evening; the
// intercession slideshow is the same either way (it's the same
// underlying queue).
//
// On mount we play the opening swell — the same audio cue the prayer-
// mode slideshow uses on entry. The user explicitly asked for a sound
// effect to mark crossing into prayer; this is the same chord the
// rest of the app uses for that moment.

const FONT = "'Space Grotesk', sans-serif";

export default function PrayerChooserPage() {
  const [, setLocation] = useLocation();
  // The Examen is pilot-only — same gate as the menu entry + the
  // habit-slide pill.
  const { isBeta } = useBetaStatus();

  // Time-of-day split — same threshold the dashboard card uses (noon).
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const eyebrow = isMorning ? "🌅 This morning" : "🌙 This evening";
  const headline = isMorning ? "Start this morning's prayer" : "Start this evening's prayer";

  const devotionLabel = isMorning ? "Morning Devotion" : "Evening Devotion";
  const officeLabel = isMorning ? "Morning Office" : "Evening Office";
  const devotionMode: LiturgyMode = isMorning ? "morning-devotion" : "early-evening-devotion";
  const officeMode: LiturgyMode = isMorning ? "morning" : "evening";

  // Office prefs power the streak chip in the corner — pulled from the
  // same endpoint the dashboard card uses, cached for 60s so a
  // back-and-forth from this page doesn't refetch.
  const { data: officePrefs } = useQuery<{ officeStreak: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const officeStreak = officePrefs?.officeStreak ?? 0;

  // Per-mode progress: drives the verb in the corner pill (Start /
  // Continue / Pray again) and the ?reset=1 suffix on the link.
  const devotionState = readOfficeProgress(devotionMode);
  const officeStateLocal = readOfficeProgress(officeMode);
  const verbFor = (state: { kind: string }) =>
    state.kind === "done" ? "Pray again" : state.kind === "in-progress" ? "Continue" : "Start";

  // Play the opening swell on mount. Fire-and-forget — the audio
  // helper handles autoplay-policy unlock and visibility-resume.
  // We let it fail silently on browsers that block audio until a
  // user gesture (the user did just tap a button to get here, so
  // it should normally unlock).
  useEffect(() => {
    try {
      playOpeningSwell();
    } catch {
      /* non-fatal */
    }
  }, []);

  type Option = {
    title: string;
    sub: string;
    duration: string;
    href: string;
    verb: string;
  };
  // Three options: Community Intercessions (slideshow) first as the
  // shortest depth, then Devotion (BCP short form), then Office
  // (BCP full Morning/Evening Prayer).
  const options: Option[] = [
    {
      title: "Community Intercessions",
      sub: "Your prayer list, no liturgy",
      duration: "< 5 Min",
      href: "/prayer-mode",
      verb: "Start",
    },
    {
      title: devotionLabel,
      sub: "From the Book of Common Prayer",
      duration: "5–10 Min",
      href: `/bcp/daily-devotions?mode=${encodeURIComponent(devotionMode)}${devotionState.kind === "done" ? "&reset=1" : ""}`,
      verb: verbFor(devotionState),
    },
    {
      title: officeLabel,
      sub: "From the Book of Common Prayer",
      duration: "15–20 Min",
      href: `/bcp/daily-office?mode=${encodeURIComponent(officeMode)}${officeStateLocal.kind === "done" ? "&reset=1" : ""}`,
      verb: verbFor(officeStateLocal),
    },
    // Ignatian Examen — the contemplative close to the day. Sits at
    // the bottom, and only after 5pm (it's an end-of-day prayer) for
    // pilot users.
    ...(hour >= 17 && isBeta ? [{
      title: "Ignatian Examen",
      sub: "A reflective close to the day",
      duration: "5–10 Min",
      href: "/examen",
      verb: "Start",
    }] : []),
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0C1F12", color: "#F0EDE6", fontFamily: FONT }}
    >
      {/* Top bar — back to dashboard. Keeps the back affordance in the
          same place as every other Phoebe sub-screen. */}
      <header
        className="px-5 pb-2"
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          ← Back
        </button>
      </header>

      {/* Mobile/native: content sits near the top (justify-start +
          a modest pt) so there isn't a yawning gap above the eyebrow.
          Wide web keeps the centered composition. */}
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-5 pt-6 md:pt-0 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}
            >
              {eyebrow}
            </p>
            {officeStreak > 0 && (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full tabular-nums shrink-0"
                style={{
                  background: "rgba(168,197,160,0.12)",
                  color: "rgba(168,197,160,0.95)",
                  border: "1px solid rgba(168,197,160,0.3)",
                  fontFamily: FONT,
                }}
              >
                🔥 {officeStreak}
              </span>
            )}
          </div>

          <h1
            className="text-2xl font-semibold leading-tight mb-2"
            style={{ color: "#F0EDE6", fontFamily: FONT }}
          >
            {headline}
          </h1>
          <p
            className="text-sm mb-7"
            style={{ color: "#8FAF96", fontFamily: FONT }}
          >
            Choose how to pray with your community today.
          </p>

          <div className="space-y-3">
            {options.map((opt, i) => (
              <motion.div
                key={opt.href}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.08 * (i + 1), ease: "easeOut" }}
              >
                <Link href={opt.href}>
                  <div
                    className="w-full rounded-2xl p-4 cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      background: "rgba(46,107,64,0.14)",
                      border: "1px solid rgba(46,107,64,0.35)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="text-base font-semibold"
                            style={{
                              color: "#F0EDE6",
                              fontFamily: FONT,
                              margin: 0,
                              lineHeight: 1.2,
                            }}
                          >
                            {opt.title}
                          </p>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "rgba(46,107,64,0.2)",
                              color: "rgba(143,175,150,0.9)",
                              border: "1px solid rgba(46,107,64,0.3)",
                              fontFamily: FONT,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opt.duration}
                          </span>
                        </div>
                        <p
                          className="text-[12px] mt-1"
                          style={{ color: "rgba(143,175,150,0.85)", margin: 0 }}
                        >
                          {opt.sub}
                        </p>
                      </div>
                      <span
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
                        style={{
                          background: "rgba(46,107,64,0.35)",
                          color: "#C8D4C0",
                          border: "1px solid rgba(46,107,64,0.55)",
                          fontFamily: FONT,
                        }}
                      >
                        {opt.verb} →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
