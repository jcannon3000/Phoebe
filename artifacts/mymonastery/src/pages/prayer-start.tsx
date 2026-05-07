import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

// ── Prayer chooser ──────────────────────────────────────────────────────────
//
// Lands here when the user taps the home-screen prayer-list CTA
// ("Begin prayer" / "Pray again" / "Start prayer"). Asks how they'd
// like to pray today — full Office, abbreviated Devotion, or just
// the intercessions rotation — and routes accordingly.
//
// Time-of-day default: under noon → morning labels, at-or-after noon
// → evening labels. Mirrors the same threshold the Daily Office and
// Devotion pickers use to highlight their "now" card.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type ChoiceKey = "office" | "devotion" | "intercessions";

interface Choice {
  key: ChoiceKey;
  label: string;
  sub: string;
  href: string;
}

function buildChoices(): Choice[] {
  const isMorning = new Date().getHours() < 12;
  return [
    {
      key: "office",
      label: isMorning ? "Pray Morning Prayer" : "Pray Evening Prayer",
      sub: "The full Daily Office",
      href: isMorning
        ? "/bcp/daily-office?mode=morning"
        : "/bcp/daily-office?mode=evening",
    },
    {
      key: "devotion",
      label: isMorning ? "Pray Morning Devotion" : "Pray Evening Devotion",
      sub: "The short BCP form for personal use",
      href: isMorning
        ? "/bcp/daily-devotions?mode=morning-devotion"
        : "/bcp/daily-devotions?mode=early-evening-devotion",
    },
    {
      key: "intercessions",
      label: "Pray intercessions",
      sub: "Just the prayer-list slideshow",
      href: "/prayer-mode",
    },
  ];
}

export default function PrayerStartPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  const choices = buildChoices();

  return (
    <Layout>
      <div
        className="flex flex-col items-center w-full max-w-xl mx-auto"
        style={{
          minHeight: "calc(100vh - 80px)",
          paddingTop: "clamp(48px, 12vh, 120px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
          gap: 32,
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="text-center"
          style={{
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: "clamp(28px, 6vw, 40px)",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            margin: 0,
            padding: "0 24px",
          }}
        >
          How would you like to pray today?
        </motion.h1>

        <div
          className="w-full flex flex-col items-center"
          style={{ gap: 14, padding: "0 20px" }}
        >
          {choices.map((c, i) => (
            <motion.button
              key={c.key}
              type="button"
              onClick={() => setLocation(c.href)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.35 }}
              whileTap={{ scale: 0.98 }}
              className="w-full"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.45)",
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                borderRadius: 999,
                padding: "20px 28px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              }}
            >
              <span
                style={{
                  fontSize: "clamp(17px, 3.5vw, 20px)",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {c.label}
              </span>
              <span style={{ fontSize: 12, color: SAGE, fontWeight: 400 }}>
                {c.sub}
              </span>
            </motion.button>
          ))}
        </div>

        <motion.button
          type="button"
          onClick={() => setLocation("/dashboard")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          style={{
            background: "none",
            border: "none",
            color: SAGE,
            fontFamily: SPACE_GROTESK,
            fontSize: 13,
            cursor: "pointer",
            padding: 8,
          }}
        >
          ← Back
        </motion.button>
      </div>
      <style>{`body { background: ${BG}; }`}</style>
    </Layout>
  );
}
