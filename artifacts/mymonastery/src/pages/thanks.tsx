/**
 * Thanks — the "thank three people" daily gratitude practice (BETA).
 *
 * NOT a journal. It invites you to thank three real people out loud each day —
 * a text, a word, a call — then write their names in three slots, reminders-app
 * style. Resets at local midnight. State lives in lib/gratitudeThanks
 * (localStorage, per-device); a future v2 syncs to the server.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import {
  THANKS_SLOTS, THANKS_EVENT,
  getTodayThanks, setThank, thanksFilledCount, recentThankedNames,
} from "@/lib/gratitudeThanks";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const G = "46,107,64";

export default function ThanksPage() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta } = useBetaStatus();
  const [, setLocation] = useLocation();

  const [names, setNames] = useState<string[]>(getTodayThanks);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Re-read on the thanks event (e.g. the daily-progress card changed it) and on
  // return-to-app signals (covers the local-midnight rollover to fresh slots).
  useEffect(() => {
    const resync = () => setNames(getTodayThanks());
    window.addEventListener(THANKS_EVENT, resync);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    window.addEventListener("phoebe:appactive", resync);
    return () => {
      window.removeEventListener(THANKS_EVENT, resync);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("phoebe:appactive", resync);
    };
  }, []);

  // Beta-only surface; bounce others home.
  useEffect(() => {
    if (!authLoading && (!user || !rawIsBeta)) setLocation("/dashboard");
  }, [authLoading, user, rawIsBeta, setLocation]);
  if (authLoading || !user || !rawIsBeta) return null;

  const filled = thanksFilledCount(names);
  const onChange = (i: number, value: string) => {
    const next = [...names];
    next[i] = value;
    setNames(next);   // controlled, responsive
    setThank(i, value); // persist (fires THANKS_EVENT)
  };

  const recent = recentThankedNames(7).filter((n) => !names.some((m) => m.trim().toLowerCase() === n.toLowerCase()));

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        {/* Header */}
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
          🙏 {t("thanks.eyebrow", { defaultValue: "Gratitude" })}
        </p>
        <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
          {t("thanks.title", { defaultValue: "Who did you thank today?" })}
        </h1>
        <p className="text-[14px] mt-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
          {t("thanks.subtitle", { defaultValue: "Thank three people out loud today — a text, a word, a call — then write their names here." })}
        </p>

        {/* Three slots */}
        <div className="flex flex-col gap-2.5 mt-6">
          {Array.from({ length: THANKS_SLOTS }).map((_, i) => {
            const value = names[i] ?? "";
            const done = value.trim().length > 0;
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors"
                style={{
                  background: done ? `rgba(${G},0.16)` : `rgba(${G},0.08)`,
                  border: `1px solid rgba(${G},${done ? 0.45 : 0.26})`,
                }}
              >
                {/* Index → check when filled */}
                <span
                  className="shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors"
                  style={{
                    width: 28, height: 28,
                    background: done ? `rgba(${G},0.9)` : "transparent",
                    border: done ? "none" : `1.5px solid rgba(143,175,150,0.4)`,
                    color: done ? "#EAF6F4" : "rgba(143,175,150,0.7)",
                    fontFamily: FONT,
                  }}
                  aria-hidden
                >
                  {done ? "✓" : i + 1}
                </span>
                <input
                  ref={(el) => { inputsRef.current[i] = el; }}
                  value={value}
                  onChange={(e) => onChange(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") inputsRef.current[i + 1]?.focus(); }}
                  enterKeyHint={i < THANKS_SLOTS - 1 ? "next" : "done"}
                  placeholder={t("thanks.slot_placeholder", { defaultValue: "Someone you thanked" })}
                  aria-label={t("thanks.slot_label", { n: i + 1, defaultValue: `Person ${i + 1}` })}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[16px]"
                  style={{ color: WARM, fontFamily: FONT }}
                />
              </div>
            );
          })}
        </div>

        {/* Progress / blessing line */}
        <p className="text-[13px] mt-4 text-center" style={{ color: filled >= THANKS_SLOTS ? "#A8C5A0" : SAGE, fontFamily: FONT }}>
          {filled >= THANKS_SLOTS
            ? t("thanks.complete", { defaultValue: "Three thanks given today 🌿" })
            : t("thanks.progress", { filled, total: THANKS_SLOTS, defaultValue: `${filled} of ${THANKS_SLOTS} thanked today` })}
        </p>

        {/* Quiet trail of people thanked recently — tap to thank again */}
        {recent.length > 0 && (
          <div className="mt-9">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("thanks.recent", { defaultValue: "Thanked this week" })}
            </p>
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 12).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const slot = names.findIndex((m) => m.trim().length === 0);
                    if (slot >= 0) { onChange(slot, n); inputsRef.current[slot]?.focus(); }
                  }}
                  className="rounded-full px-3 py-1.5 text-[13px] active:scale-[0.97] transition-transform"
                  style={{ background: "rgba(143,170,150,0.10)", border: "1px solid rgba(143,170,150,0.24)", color: WARM, fontFamily: FONT }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
