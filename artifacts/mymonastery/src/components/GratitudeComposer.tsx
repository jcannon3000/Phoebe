import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";

// Shared gratitude composer — "name what you're grateful for." Private by
// default with an opt-in "share with the garden" toggle (the "both"
// shape). Used inline on the Gratitude page and inside GratitudeNudge,
// the overlay the Daily Office close offers.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function GratitudeComposer({
  onSubmitted,
  autoFocus,
}: {
  onSubmitted?: () => void;
  autoFocus?: boolean;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [shared, setShared] = useState(false);
  const wc = words(text);
  // Accept any non-empty thanks — even one word is a gift. The only ceiling is
  // a gentle 50-word cap so it stays a quick beat, not a journal entry.
  const valid = wc >= 1 && wc <= 50;

  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gratitude", { text: text.trim(), shared }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gratitude/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gratitude/responses"] });
      // Writing a gratitude = the optional "gratitude" practice is done today,
      // so the Daily-progress anchor (when added) checks off immediately.
      try { markPracticeDoneToday("gratitude"); } catch { /* non-fatal */ }
      setText("");
      setShared(false);
      onSubmitted?.();
    },
  });

  return (
    <div className="w-full">
      <textarea
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("gratitude_composer.placeholder")}
        className="w-full rounded-2xl px-4 py-3 resize-none"
        style={{
          background: "rgba(15,40,24,0.6)",
          border: "1px solid rgba(46,107,64,0.4)",
          color: WARM,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 16,
          lineHeight: 1.5,
        }}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px]" style={{ color: wc > 50 ? "#E8B872" : "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
          {wc === 0
            ? ""
            : wc > 50
              ? t("gratitude_composer.keep_under_50")
              : t("gratitude_composer.word_count", { count: wc })}
        </span>
        <button
          type="button"
          onClick={() => setShared((s) => !s)}
          className="flex items-center gap-2 text-[12px] transition-opacity hover:opacity-80"
          style={{ color: shared ? "#A8C5A0" : "rgba(143,175,150,0.7)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
        >
          <span
            style={{
              width: 16, height: 16, borderRadius: 4,
              border: `1.5px solid ${shared ? "#A8C5A0" : "rgba(143,175,150,0.45)"}`,
              background: shared ? "#A8C5A0" : "transparent",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "#0C1F12", fontSize: 11, lineHeight: 1,
            }}
          >
            {shared ? "✓" : ""}
          </span>
          {t("gratitude.share_with_community")}
        </button>
      </div>
      <button
        type="button"
        disabled={!valid || save.isPending}
        onClick={() => save.mutate()}
        className="w-full mt-3 rounded-xl py-3 text-sm font-semibold transition-opacity active:scale-[0.99]"
        style={{
          background: valid ? "#2D5E3F" : "rgba(46,107,64,0.18)",
          border: `1px solid ${valid ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
          color: valid ? WARM : "rgba(143,175,150,0.5)",
          cursor: valid ? "pointer" : "default",
          fontFamily: SPACE_GROTESK,
        }}
      >
        {save.isPending ? t("gratitude_composer.giving_thanks") : t("gratitude_composer.give_thanks")}
      </button>
      {save.isError && (
        <p className="text-[12px] mt-2 text-center" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
          {t("gratitude_composer.couldnt_save")}
        </p>
      )}
    </div>
  );
}

// Full-screen overlay version — the Daily Office close offers this so a
// gratitude beat folds into the daily rhythm without leaving the office.
export function GratitudeNudge({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6"
        style={{ background: "#0C1F12" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 16,
            width: 36, height: 36, background: "rgba(46,107,64,0.18)",
            border: "1px solid rgba(46,107,64,0.35)", color: "#C8D4C0", fontSize: 18, lineHeight: 1, cursor: "pointer",
          }}
        >
          ×
        </button>
        <div className="w-full" style={{ maxWidth: 420 }}>
          {done ? (
            <div className="text-center">
              <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {t("gratitude_composer.thanks_be_to_god")}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full px-10 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("contemplation_timer.amen")}
              </button>
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3 text-center" style={{ color: "rgba(143,175,150,0.55)" }}>
                {t("gratitude_composer.before_you_go")}
              </p>
              <p className="text-[22px] leading-[1.4] font-medium italic mb-6 text-center" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {t("gratitude_composer.name_one_thing")}
              </p>
              <GratitudeComposer autoFocus onSubmitted={() => setDone(true)} />
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-3 text-[13px] transition-opacity hover:opacity-80"
                style={{ color: "rgba(143,175,150,0.6)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("gratitude_composer.maybe_later")}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
