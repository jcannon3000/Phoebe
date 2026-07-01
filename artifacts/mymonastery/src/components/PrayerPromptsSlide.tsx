// PrayerPromptsSlide — an extra CLOSING slide for the prayer slideshow (the
// office / devotion / community-prayer close all flow through PrayerModePage).
// Seven FULL-WIDTH prompt pills; tapping one opens an input screen, in place,
// where you write the prayer and either keep it on your list or share it with
// the community. "Continue" finishes without adding.
import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { usePilotMode } from "@/hooks/usePilotMode";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const RGB = "96,140,180"; // the prayer-list dove blue
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

// Ordered widest → most personal: "the world" sits on top, "yourself" last.
const PROMPTS: Array<{ emoji: string; key: string; label: string }> = [
  { emoji: "🌍", key: "world", label: "For the world" },
  { emoji: "📅", key: "event", label: "For an event coming up" },
  { emoji: "💔", key: "heartbreak", label: "For something that breaks your heart" },
  { emoji: "🌱", key: "hopeful", label: "For something you're hopeful for" },
  { emoji: "⚖️", key: "justice", label: "For a justice concern" },
  { emoji: "💞", key: "friends_family", label: "For your friends or family" },
  { emoji: "🙏", key: "self", label: "For yourself" },
];

export function PrayerPromptsSlide({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const { isPilot } = usePilotMode();
  const [, setLocation] = useLocation();
  // null = the pill grid; otherwise the input screen for the chosen prompt.
  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const back = () => { setPicked(null); setText(""); setSaved(false); };

  // Add to my own prayer list (private) OR share with the community (a one-time
  // request). Either way we land on a brief "added" state, then Continue closes.
  const save = async (share: boolean) => {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/prayer-intentions", { kind: "text", body });
      if (share) {
        try { await apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, oneTime: true }); }
        catch { /* saved to the list even if the community share failed */ }
      }
      setSaved(true);
    } catch { /* keep the input so they can retry */ }
    finally { setSaving(false); }
  };

  // ── Input screen ─────────────────────────────────────────────────────────
  if (picked) {
    return (
      <div className="w-full flex flex-col items-stretch gap-4" style={{ maxWidth: 460, margin: "0 auto" }}>
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-center" style={{ color: `rgba(${RGB},0.95)`, fontFamily: FONT }}>
          {t(`prayer_prompts.${picked.key}`, { defaultValue: picked.label })}
        </p>

        {saved ? (
          <>
            <p className="text-[18px] leading-[1.5] italic text-center px-2" style={{ color: "#E8E4D8", fontFamily: SERIF }}>
              {t("prayer_prompts.added", { defaultValue: "Added to your prayers 🌿" })}
            </p>
            <button onClick={onContinue} className="w-full rounded-full py-3.5 text-[15px] font-semibold active:scale-[0.99]"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}>
              {t("prayer_prompts.continue", { defaultValue: "Continue" })} →
            </button>
            <button onClick={back} className="w-full rounded-full py-2.5 text-[13px] font-semibold active:scale-[0.99]"
              style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}>
              {t("prayer_prompts.add_another", { defaultValue: "Add another" })}
            </button>
          </>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("prayer_prompts.input_ph", { hint: picked.label.toLowerCase(), defaultValue: `Pray ${picked.label.toLowerCase()}…` })}
              rows={4}
              autoFocus
              className="w-full rounded-2xl px-4 py-3 text-[15px] outline-none resize-none"
              style={{ background: "rgba(0,0,0,0.28)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.3)` }}
            />
            <button onClick={() => save(false)} disabled={!text.trim() || saving}
              className="w-full rounded-full py-3.5 text-[15px] font-semibold active:scale-[0.99] disabled:opacity-40"
              style={{ background: `rgba(${RGB},0.9)`, color: "#0C1F12", fontFamily: FONT, cursor: text.trim() ? "pointer" : "default" }}>
              {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("prayer_prompts.add_to_list", { defaultValue: "Add to my list" })}
            </button>
            {/* Pilot is personal-only — no community share. */}
            {!isPilot && (
            <button onClick={() => save(true)} disabled={!text.trim() || saving}
              className="w-full rounded-full py-3 text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40"
              style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", color: WARM, border: `1px solid rgba(${RGB},0.4)`, fontFamily: FONT }}>
              {t("prayer_prompts.share_community", { defaultValue: "Share with the community" })}
            </button>
            )}
            <button onClick={back} className="w-full py-2 text-[13px] font-semibold" style={{ background: "transparent", color: SAGE, fontFamily: FONT }}>
              {t("common.back", { defaultValue: "← Back" })}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Pill grid (full-width) ───────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col items-stretch text-center gap-4" style={{ maxWidth: 460, margin: "0 auto" }}>
      <p className="text-[20px] leading-[1.5] italic px-2" style={{ color: "#E8E4D8", fontFamily: SERIF }}>
        {t("prayer_prompts.title", { defaultValue: "Before you go — is there anything to lift up?" })}
      </p>
      <p className="text-[12.5px] leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
        {t("prayer_prompts.sub", { defaultValue: "Tap one to write a prayer." })}
      </p>

      <div className="w-full flex flex-col gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => { setPicked({ key: p.key, label: p.label }); setText(""); setSaved(false); }}
            className="w-full rounded-full flex items-center gap-3 px-5 py-3.5 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{
              background: "rgba(9,26,16, 0.297)",
              backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: `1px solid rgba(${RGB},0.4)`,
            }}
          >
            <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>{p.emoji}</span>
            <span style={{ color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600 }}>
              {t(`prayer_prompts.${p.key}`, { defaultValue: p.label })}
            </span>
          </button>
        ))}
      </div>

      {/* …or browse the Book of Common Prayer's intercessions and keep one on
          your list. Leaves the slideshow for the BCP library (a closing-slide
          action, so exiting here is fine). */}
      <button
        type="button"
        onClick={() => setLocation("/bcp/intercessions?add=1")}
        className="w-full rounded-full flex items-center gap-3 px-5 py-3.5 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
        style={{
          background: "rgba(46,107,64,0.2)",
          backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(168,197,160,0.4)",
        }}
      >
        <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>📖</span>
        <span className="flex-1" style={{ color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600 }}>
          {t("prayer_prompts.bcp", { defaultValue: "From the Book of Common Prayer" })}
        </span>
        <span aria-hidden style={{ color: SAGE, fontSize: 16 }}>›</span>
      </button>

      <button
        onClick={onContinue}
        className="mt-1 w-full rounded-full py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
      >
        {t("prayer_prompts.skip", { defaultValue: "Skip" })}
      </button>
    </div>
  );
}
