import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getSideEntry } from "@/lib/officePrefs";
import { markOfficeBookComplete, isOfficeLoggedToday } from "@/lib/officeManualLog";

// The physical-book quick-log, shown beneath the office card. For someone who
// prays the office from their actual Book of Common Prayer, this is a one-tap
// "I prayed it" — no need to open the page-number guide. Self-gates: only the
// office whose "way to pray" is the book, and only until it's marked prayed.
export function BookOfficeLogRow({ side, done }: { side: "morning" | "evening"; done: boolean }) {
  const { t } = useTranslation();
  const [logged, setLogged] = useState(false);

  if (getSideEntry(side) !== "book") return null;
  if (done || logged || isOfficeLoggedToday(side)) return null;

  const RGB = side === "morning" ? "46,107,64" : "124,116,196";
  return (
    <div
      className="mt-2 flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{ background: `rgba(${RGB},0.08)`, border: `1px solid rgba(${RGB},0.28)` }}
    >
      <span className="text-[18px] flex-shrink-0" aria-hidden>📖</span>
      <p className="flex-1 min-w-0 text-[13px] leading-snug" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
        {t("rhythm.book_log_prompt", { defaultValue: "Praying from your BCP? Just log it." })}
      </p>
      <button
        onClick={() => { markOfficeBookComplete(side); setLogged(true); }}
        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full text-[12px] font-semibold px-3.5 py-1.5 active:scale-95 transition-transform"
        style={{ background: `rgba(${RGB},0.85)`, color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <span aria-hidden style={{ opacity: 0.85 }}>✓</span> {t("rhythm.book_log_cta", { defaultValue: "I prayed it" })}
      </button>
    </div>
  );
}
