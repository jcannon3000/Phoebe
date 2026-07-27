import { markOfficeBookComplete } from "@/lib/officeManualLog";

const WARM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// BookOfficeLogSheet — the same bottom-sheet shell LogSheet uses, for the
// physical-BCP office: a "Log" button (marks the office prayed, same flag
// BookOfficeLogRow's inline "I prayed it" writes) and, instead of "Not
// today" (there's no "skip the office" concept), "Page numbers and
// readings" — the way through to the in-app guide for whoever wants it.
//
// Shared between DailyProgressBody's own rawCard hero path and
// dashboard.tsx's PrayerOfficeCard, since the latter is what actually
// renders the visible home hero when the office leads.
export function BookOfficeLogSheet({
  side,
  title,
  onClose,
  onOpenGuide,
  t,
}: {
  side: "morning" | "evening";
  title: string;
  onClose: () => void;
  onOpenGuide: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(6,18,11,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{ maxWidth: 460, margin: "0 10px", background: "rgba(6,18,11,0.62)", backdropFilter: "blur(14.4px)", WebkitBackdropFilter: "blur(14.4px)", border: "1px solid rgba(111,175,133,0.25)", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span style={{ fontSize: 26 }}>📖</span>
          <p className="text-[17px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
        </div>

        <button
          type="button"
          onClick={() => { markOfficeBookComplete(side); onClose(); }}
          className="w-full rounded-2xl py-3.5 text-[15px] font-semibold active:scale-[0.99]"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
        >
          ✓ {t("rhythm.log_done", { defaultValue: "Log" })}
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          className="w-full rounded-2xl py-3 mt-2 text-[14px] font-semibold active:scale-[0.99]"
          style={{ background: "transparent", color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
        >
          {t("rhythm.book_page_guide", { defaultValue: "Page numbers and readings" })}
        </button>
      </div>
    </div>
  );
}
