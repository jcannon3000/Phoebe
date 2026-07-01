import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { usePilotMode } from "@/hooks/usePilotMode";
import { isMorningNow } from "@/pages/welcome-public";
import { getExplicitSideLevel, getSideLevel } from "@/lib/officePrefs";

// ── Pilot home ────────────────────────────────────────────────────────────
// The calm home a signed-in PILOT user lands on (PilotGate points /dashboard
// here). Deliberately tiny — not the full 7k-line dashboard. Two primary
// choices, exactly as designed: pray the day's office (time-aware) or build /
// keep a daily prayer rhythm. Below: their personal prayer list + quiet links.
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const FROST = "rgba(9,26,16, 0.297)";

export default function PilotHomePage() {
  const { user, isLoading } = useAuth();
  const { isPilot, isLoading: pilotLoading } = usePilotMode();
  const [, setLocation] = useLocation();

  // A non-pilot (full-app) user who somehow lands here goes to the real home.
  useEffect(() => {
    if (isLoading || pilotLoading) return;
    if (user && !isPilot) setLocation("/dashboard");
  }, [user, isPilot, isLoading, pilotLoading, setLocation]);

  const morning = isMorningNow();
  const officeLabel = morning ? "Pray Morning Prayer" : "Pray Evening Prayer";
  const officeEmoji = morning ? "🌅" : "🌙";
  // Route the office CTA to the office the user actually BUILT (so "Create your
  // daily habit" is honored), and to a pilot-ALLOWED route. Pilot builds only
  // devotion / office / contemplation; a converted account with any other level
  // (psalms/examen/fdd → all blocked) falls safely to Devotion. All three
  // targets ( /bcp/*, /contemplation ) are on the pilot allowlist, and the
  // BCP office hands off to the personalized reflection + silence close.
  const officeSide = morning ? "morning" : "evening";
  const officeLevel = getExplicitSideLevel(officeSide) ?? getSideLevel(officeSide);
  const officeHref =
    officeLevel === "office" ? `/bcp/daily-office?mode=${officeSide}`
    : officeLevel === "reflect-sit" ? "/contemplation?begin=1"
    : `/bcp/daily-devotions?mode=${morning ? "morning-devotion" : "early-evening-devotion"}`;
  // Has the user already shaped a rhythm? Drives the second card's copy.
  const hasRhythm = !!(user?.ruleConfig || user?.homeLayout);
  const firstName = (user?.name ?? "").trim().split(" ")[0] || "";

  return (
    <Layout>
      <div className="w-full max-w-md mx-auto px-1 pt-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 px-1"
        >
          <h1 className="text-[26px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT, letterSpacing: "-0.02em" }}>
            {firstName ? `Peace, ${firstName}.` : "Peace be with you."}
          </h1>
          <p className="text-sm mt-1" style={{ color: SAGE, fontFamily: FONT }}>
            {morning ? "Begin the day in prayer." : "Rest the day in prayer."}
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          <HomeCard
            href={officeHref}
            emoji={officeEmoji}
            title={officeLabel}
            blurb="The day's office from the Book of Common Prayer."
            delay={0.05}
          />
          <HomeCard
            href="/pilot/build"
            emoji="🌿"
            title={hasRhythm ? "Your daily habit of prayer" : "Create your daily habit of prayer"}
            blurb={hasRhythm ? "Review or adjust your rhythm." : "Shape a simple rhythm you can keep."}
            delay={0.09}
          />
          <HomeCard
            href="/prayer-list"
            emoji="🙏🏽"
            title="Your prayer list"
            blurb="The people and things you're holding in prayer."
            delay={0.13}
          />
        </div>

        <div className="mt-6 pt-6 flex flex-col gap-3" style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}>
          <HomeCard href="/menu/practices" emoji="🕯️" title="Practices" blurb="Listen to Scripture · Contemplation." delay={0.18} muted />
        </div>
      </div>
    </Layout>
  );
}

function HomeCard({ href, emoji, title, blurb, delay, muted }: {
  href: string; emoji: ReactNode; title: string; blurb: string; delay: number; muted?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      <Link
        href={href}
        className="block rounded-2xl px-5 py-5 transition-opacity hover:opacity-95 active:scale-[0.99]"
        style={{ background: FROST, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(46,107,64,${muted ? 0.2 : 0.3})` }}
      >
        <div className="flex items-start gap-3">
          <span className="text-[26px] flex-shrink-0 leading-none mt-0.5" aria-hidden>{emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold leading-snug mb-1" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
            <p className="text-[13px] leading-snug" style={{ color: SAGE }}>{blurb}</p>
          </div>
          <span className="text-lg flex-shrink-0" style={{ color: FAINT }} aria-hidden>→</span>
        </div>
      </Link>
    </motion.div>
  );
}
