/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * The rhythm content (the four anchors split into Next / Done + the streak
 * card) lives in DailyProgressBody so the same view can be reused as the home
 * screen for beta users. This page is just the chrome around it: back link,
 * title, and the Customize link.
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, Sliders } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { DailyProgressBody } from "@/components/DailyProgressBody";
import { getCustomAnchors, addCustomAnchor, removeCustomAnchor, CUSTOM_ANCHORS_EVENT } from "@/lib/customAnchors";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function DailyProgressPage() {
  const { t } = useTranslation();
  return (
    <Layout>
      {/* Capped on desktop, full-width on mobile. */}
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>
            {t("daily_progress.title", { defaultValue: "Daily progress" })}
          </h1>
          {/* Customize — shape which practices make up your rhythm. Top-right,
              vertically aligned with the title. */}
          <Link
            href="/rule-of-life"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 shrink-0 transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.10)",
              border: "1px solid rgba(46,107,64,0.28)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Sliders size={14} /> {t("daily_progress.customize", { defaultValue: "Customize" })}
          </Link>
        </div>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("daily_progress.subtitle", { defaultValue: "Where you are in today's rhythm — and what's next." })}
        </p>

        <DailyProgressBody />

        <CustomPracticesEditor />
      </div>
    </Layout>
  );
}

// ── Custom practices editor ──────────────────────────────────────────────────
// "Build your own routine" — add any daily practice you want to keep: a title +
// any emoji. It becomes a Daily-progress card you check off (counting as a dot),
// no special features needed. Stored per-device (lib/customAnchors); the cards +
// the counting live in DailyProgressBody / useRhythmState.
function CustomPracticesEditor() {
  const { t } = useTranslation();
  const [anchors, setAnchors] = useState(getCustomAnchors);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  useEffect(() => {
    const refresh = () => setAnchors(getCustomAnchors());
    window.addEventListener(CUSTOM_ANCHORS_EVENT, refresh);
    return () => window.removeEventListener(CUSTOM_ANCHORS_EVENT, refresh);
  }, []);
  const add = () => {
    if (!title.trim()) return;
    addCustomAnchor(title, emoji);
    setTitle("");
    setEmoji("");
  };
  return (
    <div className="mt-9">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
        {t("daily_progress.custom_heading", { defaultValue: "Your own practices" })}
      </p>
      <p className="text-[13px] mb-3.5" style={{ color: SAGE, fontFamily: FONT }}>
        {t("daily_progress.custom_sub", { defaultValue: "Keep anything you like — a walk, a stretch, a phone call. Name it, pick an emoji, and it becomes a card you check off." })}
      </p>
      {anchors.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {anchors.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: "rgba(143,170,150,0.10)", border: "1px solid rgba(143,170,150,0.24)" }}>
              <span className="text-lg leading-none">{a.emoji}</span>
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{a.title}</span>
              <button type="button" onClick={() => removeCustomAnchor(a.id)} aria-label={t("common.remove", { defaultValue: "Remove" })} className="text-[15px] px-1.5 active:opacity-60" style={{ color: "rgba(143,175,150,0.6)" }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
          placeholder="🙂"
          aria-label={t("daily_progress.custom_emoji", { defaultValue: "Emoji" })}
          className="w-12 text-center rounded-xl py-2.5"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.28)", color: WARM, fontSize: 18 }}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 40))}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={t("daily_progress.custom_placeholder", { defaultValue: "e.g. Morning walk" })}
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm min-w-0"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.28)", color: WARM, fontFamily: FONT }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!title.trim()}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold shrink-0 disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}
        >
          {t("common.add", { defaultValue: "Add" })}
        </button>
      </div>
    </div>
  );
}
