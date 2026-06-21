/**
 * El Jardín "Today's reading" — a chapter-a-day plan through the New
 * Testament. Self-contained (no backend) for the passage itself: the day index
 * advances daily from a fixed epoch and opens on Bible.com in the Spanish NVI.
 * The "mark as read" check-in IS server-backed — it records the day and drives
 * a reading streak, turning the daily passage into a habit.
 */

import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { openExternal } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// New Testament: [Spanish name, YouVersion book code, chapter count].
const NT: ReadonlyArray<readonly [string, string, number]> = [
  ["Mateo", "MAT", 28], ["Marcos", "MRK", 16], ["Lucas", "LUK", 24], ["Juan", "JHN", 21],
  ["Hechos", "ACT", 28], ["Romanos", "ROM", 16], ["1 Corintios", "1CO", 16], ["2 Corintios", "2CO", 13],
  ["Gálatas", "GAL", 6], ["Efesios", "EPH", 6], ["Filipenses", "PHP", 4], ["Colosenses", "COL", 4],
  ["1 Tesalonicenses", "1TH", 5], ["2 Tesalonicenses", "2TH", 3], ["1 Timoteo", "1TI", 6], ["2 Timoteo", "2TI", 4],
  ["Tito", "TIT", 3], ["Filemón", "PHM", 1], ["Hebreos", "HEB", 13], ["Santiago", "JAS", 5],
  ["1 Pedro", "1PE", 5], ["2 Pedro", "2PE", 3], ["1 Juan", "1JN", 5], ["2 Juan", "2JN", 1],
  ["3 Juan", "3JN", 1], ["Judas", "JUD", 1], ["Apocalipsis", "REV", 22],
];

const PLAN: Array<{ ref: string; yv: string }> = NT.flatMap(([name, code, chapters]) =>
  Array.from({ length: chapters }, (_, i) => ({ ref: `${name} ${i + 1}`, yv: `${code}.${i + 1}` })),
);

const NVI = 128; // Bible.com Spanish NVI version id

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function JardinReadingCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const epoch = Date.UTC(2024, 0, 1);
  const dayNum = Math.floor((Date.now() - epoch) / 86400000);
  const idx = ((dayNum % PLAN.length) + PLAN.length) % PLAN.length;
  const today = PLAN[idx]!;
  const day = localDay();

  const { data } = useQuery<{ done: boolean; streak: number }>({
    queryKey: ["/api/jardin/reading", day],
    queryFn: () => apiRequest("GET", `/api/jardin/reading?day=${day}`),
  });
  const markRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/jardin/reading", { day, planIndex: idx }),
    onSuccess: (d) => qc.setQueryData(["/api/jardin/reading", day], d),
  });

  const done = !!data?.done;
  const streak = data?.streak ?? 0;

  return (
    <div className="rounded-2xl overflow-hidden flex" style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)", border: "1px solid rgba(200,212,192,0.18)" }}>
      <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.85)" }} />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT, margin: 0 }}>
            {t("jardin.todays_reading")} · {t("jardin.reading_day", { day: idx + 1 })}
          </p>
          {streak > 0 && (
            <span style={{ color: "#D9A45B", fontSize: 11.5, fontWeight: 600, fontFamily: FONT, flexShrink: 0 }}>
              🔥 {t("jardin.reading_streak", { count: streak })}
            </span>
          )}
        </div>
        <p style={{ color: WARM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: "4px 0 12px" }}>{today.ref}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openExternal(`https://www.bible.com/bible/${NVI}/${today.yv}`)}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: CTA, color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, cursor: "pointer" }}
          >
            {t("jardin.open_passage")}
          </button>
          {done ? (
            <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "rgba(46,107,64,0.18)", color: "rgba(240,237,230,0.85)", border: "1px solid rgba(46,107,64,0.45)", fontFamily: FONT }}>
              {t("jardin.read_today")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => markRead.mutate()}
              disabled={markRead.isPending}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "transparent", color: SAGE, border: "1px solid rgba(46,107,64,0.45)", fontFamily: FONT, cursor: "pointer" }}
            >
              {t("jardin.mark_as_read")}
            </button>
          )}
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 11.5, marginTop: 12, lineHeight: 1.5, fontFamily: FONT }}>
          {t("jardin.reading_plan_note")}
        </p>
      </div>
    </div>
  );
}
