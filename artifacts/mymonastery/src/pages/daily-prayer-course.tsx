import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useBetaStatus } from "@/hooks/useDemo";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import {
  COURSE_DAYS, COURSE_LENGTH, COURSE_TITLE, COURSE_EVENT,
  courseStart, currentDay, isDayRead, markDayRead, setDemoDay, demoDay, resetCourse,
} from "@/lib/dailyPrayerCourse";

/**
 * ONE DAY OF THE COURSE — "The Power of Daily Prayer", a sermon read a beat at
 * a time over eight days (owner: "they would read one thing at a time over the
 * course of 8 days"). A DEMO, admins only, so the shape can be walked before
 * anyone decides what a new person meets.
 *
 * The page shows TODAY's beat and nothing else: the argument for a daily
 * course is that you come back, and a page offering all eight at once is a
 * reading, not a rhythm. The exception is the demo strip at the foot, which
 * jumps between days precisely so the eight can be reviewed in a sitting —
 * gated on admin twice over, since the whole page is.
 */
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const DIM = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "1px solid rgba(46,107,64,0.35)";

export default function DailyPrayerCoursePage() {
  const [, setLocation] = useLocation();
  const { rawIsAdmin: isAdmin } = useBetaStatus();
  const [day, setDay] = useState(() => { courseStart(); return currentDay(); });
  const [read, setRead] = useState(() => isDayRead(currentDay()));
  const backdrop = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0]! : null;

  // Re-read when a day is marked, the demo jumps, or the course is reset.
  useEffect(() => {
    const refresh = () => { setDay(currentDay()); setRead(isDayRead(currentDay())); };
    window.addEventListener(COURSE_EVENT, refresh);
    return () => window.removeEventListener(COURSE_EVENT, refresh);
  }, []);

  // Admins only while this is a demo. Not a redirect loop: the row that opens
  // it is admin-gated too, so this is the belt to that pair of braces.
  useEffect(() => { if (!isAdmin) setLocation("/dashboard"); }, [isAdmin, setLocation]);
  if (!isAdmin) return null;

  const beat = COURSE_DAYS[Math.min(day, COURSE_LENGTH) - 1];
  if (!beat) return null;

  const finish = () => {
    markDayRead(day);
    setRead(true);
    setLocation("/dashboard");
  };

  return (
    <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/dashboard")}>
      <div style={{
        maxWidth: 560, margin: "0 auto", width: "100%",
        padding: "calc(var(--top-chrome, 0px) + 8px) 20px calc(env(safe-area-inset-bottom, 0px) + 28px)",
        display: "flex", flexDirection: "column", gap: 18, minHeight: "100%",
      }}>
        <div>
          <p style={{ color: DIM, fontFamily: FONT, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.14em", margin: 0 }}>
            {COURSE_TITLE} · Day {day} of {COURSE_LENGTH}
          </p>
          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 700, lineHeight: 1.15, margin: "10px 0 0" }}>
            {beat.headline}
          </h1>
        </div>

        {/* The beat itself, in the serif the app reads long-form in. */}
        <div style={{ background: CARD, border: CARD_B, borderRadius: 18, padding: 20 }}>
          {beat.body.split("\n\n").map((para, i) => (
            <p key={i} style={{
              color: "rgba(240,237,230,0.92)", fontFamily: SERIF, fontSize: 17, lineHeight: 1.72,
              margin: i === 0 ? 0 : "14px 0 0",
            }}>
              {para}
            </p>
          ))}
        </div>

        <p style={{ color: DIM, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
          From a sermon preached for Year A, Pentecost 14 — on Exodus 3, Romans 12 and Matthew 16.
        </p>

        <button
          type="button"
          onClick={finish}
          style={{
            background: "#2D5E3F", color: WARM, border: CARD_B, borderRadius: 999,
            padding: "15px 18px", fontFamily: FONT, fontSize: 15.5, fontWeight: 700, cursor: "pointer",
          }}
        >
          {read ? "Read again — done" : day >= COURSE_LENGTH ? "Finish the course" : "Done for today"}
        </button>
        {read && (
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13, textAlign: "center", margin: 0 }}>
            Today's reading is kept. The next one opens tomorrow.
          </p>
        )}

        {/* ── THE DEMO STRIP ────────────────────────────────────────────────
            Jumps between days so all eight can be walked in a sitting. This is
            the ONLY thing that overrides the calendar, and it exists because a
            course that takes eight days to review is a course nobody reviews.
            It goes when the demo does. */}
        <div style={{ marginTop: "auto", paddingTop: 20 }}>
          <p style={{ color: DIM, fontFamily: FONT, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>
            Demo · admins only
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: COURSE_LENGTH }, (_, i) => i + 1).map((n) => {
              const on = n === day;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setDemoDay(n); setDay(n); setRead(isDayRead(n)); }}
                  style={{
                    width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                    background: on ? "rgba(46,107,64,0.55)" : "transparent",
                    border: on ? "1px solid rgba(110,180,130,0.5)" : CARD_B,
                    color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 13,
                    fontWeight: isDayRead(n) ? 700 : 500,
                  }}
                  aria-label={`Day ${n}${isDayRead(n) ? ", read" : ""}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button type="button" onClick={() => { setDemoDay(null); setDay(currentDay()); setRead(isDayRead(currentDay())); }}
              style={{ background: "transparent", border: CARD_B, borderRadius: 10, color: SAGE, fontFamily: FONT, fontSize: 12.5, padding: "8px 12px", cursor: "pointer" }}>
              Back to today{demoDay() ? "" : " (already)"}
            </button>
            <button type="button" onClick={() => { resetCourse(); courseStart(); setDay(currentDay()); setRead(false); }}
              style={{ background: "transparent", border: CARD_B, borderRadius: 10, color: SAGE, fontFamily: FONT, fontSize: 12.5, padding: "8px 12px", cursor: "pointer" }}>
              Start over at day 1
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
