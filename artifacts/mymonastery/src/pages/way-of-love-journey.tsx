/**
 * The Way of Love — an 8-week journey of daily devotions (/way-of-love).
 *
 * Walks the EDOW devotional (wayOfLoveDevotions): each day is a tiny office —
 * a centering invitation, a Scripture passage (Georgia-italic on the drifting
 * green ground), a reflection question you can carry into your journal (reusing
 * FddJournalSheet — the same sheet the office's Forward Day by Day reflection
 * uses), and a Prayer for Today. Completing a day credits the daily Learn & Pray
 * (which feeds Turn); finishing a practice-week invites that practice into your
 * Rule of Life. Progress is gentle + local — an invitation, never a ledger.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import FddJournalSheet from "@/components/FddJournalSheet";
import { apiRequest } from "@/lib/queryClient";
import {
  WOL_DEVOTIONS, WOL_INVITATION, WOL_TOTAL_DAYS,
  loadWolProgress, saveWolProgress, dayKey, nextWolDay,
} from "@/lib/wayOfLoveDevotions";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const BG = "#091A10";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }

export default function WayOfLoveJourneyPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [done, setDone] = useState<Set<string>>(() => new Set(loadWolProgress().done));
  const start = useMemo(() => nextWolDay(done), []); // where "Continue" lands, fixed on mount
  const [pos, setPos] = useState<{ week: number; day: number }>(start);
  const [journalOpen, setJournalOpen] = useState(false);

  const week = WOL_DEVOTIONS.find((w) => w.week === pos.week)!;
  const entry = week.days.find((d) => d.day === pos.day)!;
  const k = dayKey(pos.week, pos.day);
  const isDone = done.has(k);
  const isWeekDone = (w: number) => WOL_DEVOTIONS.find((x) => x.week === w)!.days.every((d) => done.has(dayKey(w, d.day)));
  const completedCount = done.size;

  function go(week: number, day: number) { setJournalOpen(false); setPos({ week, day }); window.scrollTo(0, 0); }
  function nextDay() {
    const i = week.days.findIndex((d) => d.day === pos.day);
    if (i < week.days.length - 1) { go(pos.week, week.days[i + 1].day); return; }
    if (pos.week < 8) go(pos.week + 1, 1);
  }
  function prevDay() {
    const i = week.days.findIndex((d) => d.day === pos.day);
    if (i > 0) { go(pos.week, week.days[i - 1].day); return; }
    if (pos.week > 1) { const pw = WOL_DEVOTIONS.find((x) => x.week === pos.week - 1)!; go(pw.week, pw.days[pw.days.length - 1].day); }
  }

  function markComplete() {
    if (!isDone) {
      const next = new Set(done); next.add(k);
      setDone(next); saveWolProgress({ done: [...next] });
      // Credit the daily Learn & Pray (idempotent server-side) → feeds Turn.
      const today = new Date();
      apiRequest("POST", "/api/practice-completion", {
        section: "learn_pray", localDate: ymd(today), weekStart: ymd(sundayStart(today)),
      }).catch(() => {});
    }
    nextDay();
  }

  // After finishing a practice-week's last day, invite that practice into the rule.
  const showRuleInvite = isDone && pos.day === 5 && week.sectionKey !== null && isWeekDone(pos.week);

  return (
    <Layout>
      <div style={{ position: "relative", minHeight: "70vh", isolation: "isolate" }}>
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", width: "100%", padding: "4px 2px 40px" }}>
          <button type="button" onClick={() => setLocation("/this-week")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "4px 0 8px" }}>
            <ChevronLeft size={16} /> {t("common.back", { defaultValue: "Back" })}
          </button>

          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>{t("wol_journey.title", { defaultValue: "The Way of Love" })}</h1>
          <p style={{ color: SAGE, fontSize: 13, fontFamily: FONT, margin: "5px 0 16px" }}>
            {t("wol_journey.sub", { defaultValue: "An 8-week journey · {{n}} of {{total}} days", n: completedCount, total: WOL_TOTAL_DAYS })}
          </p>

          {/* Week strip — tap to jump to a week's first day. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
            {WOL_DEVOTIONS.map((w) => {
              const here = w.week === pos.week;
              const wdone = isWeekDone(w.week);
              return (
                <button key={w.week} type="button" onClick={() => go(w.week, 1)}
                  title={w.title}
                  style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 999, cursor: "pointer", fontFamily: FONT, fontSize: 15, lineHeight: 1,
                    background: here ? "rgba(46,107,64,0.5)" : wdone ? "rgba(46,107,64,0.22)" : CARD,
                    border: `1px solid ${here ? "rgba(168,197,160,0.8)" : CARD_B}`, color: WARM, opacity: wdone || here ? 1 : 0.75 }}>
                  {wdone ? "✓" : w.emoji}
                </button>
              );
            })}
          </div>

          {/* The day */}
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, fontFamily: FONT, margin: "0 0 4px" }}>
            {week.emoji} {t("wol_journey.week_label", { defaultValue: "Week {{n}} · {{practice}}", n: week.week, practice: week.title })} · {t("wol_journey.day_label", { defaultValue: "Day {{d}} of 5", d: pos.day })}
          </p>

          {/* Centering invitation — the same gentle opening each day. */}
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6, margin: "8px 0 20px" }}>{WOL_INVITATION}</p>

          {/* Scripture */}
          <div style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 16, padding: "18px 18px" }}>
            <p style={{ color: SAGE_DIM, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, fontFamily: FONT, margin: "0 0 10px" }}>{entry.scriptureRef}</p>
            <p style={{ color: WARM, fontSize: 18, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{entry.scriptureText}</p>
          </div>

          {/* Reflection question → journal */}
          <p style={{ color: WARM, fontSize: 16.5, fontFamily: SERIF, lineHeight: 1.55, margin: "22px 2px 12px" }}>{entry.question}</p>
          <button type="button" onClick={() => setJournalOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(46,107,64,0.18)", border: `1px solid ${CARD_B}`, color: WARM, borderRadius: 12, padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            ✎ {t("wol_journey.reflect", { defaultValue: "Reflect in your journal" })}
          </button>

          {/* Prayer for Today */}
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, fontFamily: FONT, margin: "26px 0 6px" }}>{t("wol_journey.prayer_label", { defaultValue: "A Prayer for Today" })}</p>
          <p style={{ color: WARM, fontSize: 15.5, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{entry.prayer}</p>

          {/* Week-one has no practice; later weeks deep-link to the practice page (Budde's audio lives there). */}
          {week.sectionKey && pos.day === 1 && (
            <button type="button" onClick={() => setLocation(`/home-beta/${week.sectionKey}`)}
              style={{ display: "block", width: "100%", marginTop: 22, background: "none", border: `1px solid ${CARD_B}`, color: SAGE, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, fontFamily: FONT, cursor: "pointer", textAlign: "left" }}>
              🎧 {t("wol_journey.listen", { defaultValue: "Listen: Bishop Budde on {{practice}} →", practice: week.title })}
            </button>
          )}

          {/* Complete + advance */}
          <button type="button" onClick={markComplete}
            style={{ width: "100%", marginTop: 24, background: isDone ? "rgba(46,107,64,0.25)" : CTA, border: isDone ? `1px solid ${CARD_B}` : "none", color: WARM, borderRadius: 12, padding: "14px 16px", fontSize: 15.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            {isDone ? t("wol_journey.next", { defaultValue: "Next day →" }) : t("wol_journey.complete", { defaultValue: "Mark complete & continue" })}
          </button>

          {showRuleInvite && (
            <div style={{ marginTop: 16, background: "rgba(46,107,64,0.24)", border: "1px solid rgba(168,197,160,0.5)", borderRadius: 14, padding: "15px 17px" }}>
              <p style={{ color: WARM, fontSize: 14.5, fontFamily: FONT, margin: "0 0 10px", lineHeight: 1.5 }}>
                {t("wol_journey.rule_invite", { defaultValue: "You've walked {{practice}} for a week. Make it part of your Rule of Life?", practice: week.title })}
              </p>
              <button type="button" onClick={() => setLocation("/rule-of-life")} style={{ background: CTA, border: "none", color: WARM, borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                {t("wol_journey.rule_cta", { defaultValue: "Add to my Rule →" })}
              </button>
            </div>
          )}

          {/* Within-week prev/next */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <button type="button" onClick={prevDay} disabled={pos.week === 1 && pos.day === 1}
              style={{ background: "none", border: "none", color: SAGE, fontSize: 13, fontFamily: FONT, cursor: pos.week === 1 && pos.day === 1 ? "default" : "pointer", opacity: pos.week === 1 && pos.day === 1 ? 0.4 : 1 }}>
              ← {t("wol_journey.prev", { defaultValue: "Previous" })}
            </button>
            <button type="button" onClick={nextDay} disabled={pos.week === 8 && pos.day === 5}
              style={{ background: "none", border: "none", color: SAGE, fontSize: 13, fontFamily: FONT, cursor: pos.week === 8 && pos.day === 5 ? "default" : "pointer", opacity: pos.week === 8 && pos.day === 5 ? 0.4 : 1 }}>
              {t("wol_journey.skip", { defaultValue: "Next" })} →
            </button>
          </div>
        </div>
      </div>

      {journalOpen && (
        <FddJournalSheet
          promptTag={`Way of Love · ${week.title} · ${entry.question}`}
          onClose={() => setJournalOpen(false)}
          onSaved={() => setJournalOpen(false)}
        />
      )}
    </Layout>
  );
}
