import { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useRhythmState } from "@/hooks/useRhythmState";

// ── Today's Rhythm ──────────────────────────────────────────────────────────
//
// A glanceable card that answers "where am I in today's rhythm, and what's
// next?" — four anchors (Morning · Reflect · Silence · Evening) fill as the
// day is kept; a single time-aware prompt names the next step; a grace-based
// streak line rewards consistency; and a quiet garden line turns "my
// checklist" into "our common life".
//
// The done-state + counts come from useRhythmState (shared with the header
// "Daily progress" pill and the /daily-progress page). This card no longer
// lives on the home top — it's shown on the slideshow closing slide and on
// the daily-progress page.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

type Anchor = {
  key: "morning" | "reflect" | "silence" | "evening";
  label: string;
  icon: string;       // emoji glyph
  done: boolean;
  href: string;       // where the next-step CTA routes
  cta: string;        // verb for the prompt ("Pray Morning Prayer")
  blurb: string;      // one-line invitation under the prompt
};

export function TodaysRhythm() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const hour = new Date().getHours();

  const {
    morningDone, reflectDone, silenceDone, eveningDone,
    streak, last7, gardenCount, cobreatheCount,
  } = useRhythmState();

  const anchors: Anchor[] = [
    {
      key: "morning", label: t("rhythm.morning", { defaultValue: "Morning" }), icon: "🌅",
      done: morningDone, href: "/begin-prayer",
      cta: t("rhythm.cta_morning", { defaultValue: "Pray Morning Prayer" }),
      blurb: t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" }),
    },
    {
      key: "reflect", label: t("rhythm.reflect", { defaultValue: "Reflect" }), icon: "📖",
      done: reflectDone, href: "/menu/reflections",
      cta: t("rhythm.cta_reflect", { defaultValue: "Read today's reflection" }),
      blurb: t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" }),
    },
    {
      key: "silence", label: t("rhythm.silence", { defaultValue: "Silence" }), icon: "🕯️",
      done: silenceDone, href: "/cobreathe",
      cta: t("rhythm.cta_silence", { defaultValue: "Keep two minutes of silence" }),
      blurb: t("rhythm.blurb_silence", { defaultValue: "Sit, or cobreathe for justice" }),
    },
    {
      key: "evening", label: t("rhythm.evening", { defaultValue: "Evening" }), icon: "🌙",
      done: eveningDone, href: hour >= 20 ? "/examen" : "/begin-prayer",
      cta: hour >= 20
        ? t("rhythm.cta_compline", { defaultValue: "Close the day — Compline & examen" })
        : t("rhythm.cta_evening", { defaultValue: "Pray Evening Prayer" }),
      blurb: hour >= 20
        ? t("rhythm.blurb_compline", { defaultValue: "Examine the day and rest" })
        : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
    },
  ];

  // Next step — the first undone anchor in a time-of-day order. Morning leads
  // before noon; the reflective middle leads through the afternoon; the
  // evening close leads after 8pm. All done → a benediction.
  const order: Anchor["key"][] = useMemo(() => {
    if (hour < 12) return ["morning", "reflect", "silence", "evening"];
    if (hour < 20) return ["reflect", "silence", "evening", "morning"];
    return ["evening", "silence", "reflect", "morning"];
  }, [hour]);

  const byKey = (k: Anchor["key"]) => anchors.find((a) => a.key === k)!;
  const next = order.map(byKey).find((a) => !a.done) ?? null;
  const allKept = anchors.every((a) => a.done);

  const go = useCallback((href: string) => setLocation(href), [setLocation]);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-8 flex"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.24)" }}
    >
      {/* Left accent bar — the "side panel" that matches the other home cards. */}
      <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.85)" }} />
      <div className="flex-1 p-4">
      {/* Anchor strip */}
      <div className="flex items-start justify-around">
        {anchors.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => go(a.href)}
            className="flex flex-col items-center gap-1.5 flex-1"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            aria-label={a.label}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 38, height: 38,
                background: a.done ? "rgba(46,107,64,0.30)" : "transparent",
                border: a.done ? "1.5px solid rgba(110,180,130,0.85)" : "1.5px dashed rgba(143,175,150,0.40)",
                fontSize: 16,
                filter: a.done ? "none" : "grayscale(0.7) opacity(0.65)",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              {a.done ? "✓" : a.icon}
            </span>
            <span
              className="text-[10.5px]"
              style={{ color: a.done ? SAGE : "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}
            >
              {a.label}
            </span>
          </button>
        ))}
      </div>

      {/* Streak / grace line */}
      {(streak > 0 || last7 > 0) && (
        <p className="text-[11.5px] text-center mt-2.5" style={{ color: "rgba(110,180,130,0.85)", fontFamily: SPACE_GROTESK }}>
          {streak > 0
            ? t("rhythm.streak_line", { streak, last7, defaultValue: `🔥 Day ${streak} of your rhythm · kept ${last7} of the last 7` })
            : t("rhythm.last7_line", { last7, defaultValue: `Kept ${last7} of the last 7 days` })}
        </p>
      )}

      {/* Next step prompt — or benediction when the day is fully kept */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(46,107,64,0.18)" }}>
        {next ? (
          <button
            type="button"
            onClick={() => go(next.href)}
            className="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span className="text-xl flex-shrink-0">{next.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("rhythm.next_prefix", { defaultValue: "Next" })}: {next.cta}
              </p>
              <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>
                {next.key === "silence" && cobreatheCount > 0
                  ? t("rhythm.blurb_silence_count", { count: cobreatheCount, defaultValue: `Sit, or cobreathe — ${cobreatheCount} have breathed today` })
                  : next.blurb}
              </p>
            </div>
            <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK }}>
              {t("rhythm.begin", { defaultValue: "Begin" })}
            </span>
          </button>
        ) : allKept ? (
          <div className="flex items-center gap-3">
            <span className="text-xl flex-shrink-0">🌿</span>
            <p className="text-[13.5px] leading-snug" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
              {t("rhythm.benediction", { defaultValue: "The day is kept. Rest now — the work and the prayer will keep till morning." })}
            </p>
          </div>
        ) : null}
      </div>

      {/* Garden social-proof line — our common life */}
      {gardenCount > 0 && (
        <Link href="/prayer-list">
          <p className="text-[11.5px] text-center mt-3 cursor-pointer" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
            {t("rhythm.garden_line", { count: gardenCount, defaultValue: `${gardenCount} ${gardenCount === 1 ? "person" : "people"} in your garden ${gardenCount === 1 ? "has" : "have"} prayed today` })}
          </p>
        </Link>
      )}
      </div>
    </div>
  );
}
