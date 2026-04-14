import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { Layout } from "@/components/layout";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  { bg: "rgba(46,107,64,0.15)", text: "#4a6e50" },
  { bg: "rgba(193,127,36,0.15)", text: "#8a5a18" },
  { bg: "rgba(212,137,106,0.15)", text: "#9a5a3a" },
];

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏🏽",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "lectio-divina": "📜",
  "custom": "🌱",
};

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function sortPeople(people: PersonSummary[], presentEmails: Set<string>): PersonSummary[] {
  return [...people].sort((a, b) => {
    const aPrayer = a.activePrayerRequest ? 1 : 0;
    const bPrayer = b.activePrayerRequest ? 1 : 0;
    if (aPrayer !== bPrayer) return bPrayer - aPrayer;
    const aPresent = presentEmails.has(a.email) ? 1 : 0;
    const bPresent = presentEmails.has(b.email) ? 1 : 0;
    if (aPresent !== bPresent) return bPresent - aPresent;
    return new Date(b.lastActiveDate).getTime() - new Date(a.lastActiveDate).getTime();
  });
}

/* ── Split-flap rotating subtitle ───────────────────────────────────── */

const FLAP_CSS = `
.pf-root { height: 20px; overflow: hidden; position: relative; }
.pf-line { position: absolute; left: 0; right: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
           font-size: 13px; line-height: 20px; color: #8FAF96; }
.pf-line-out { animation: pf-out 200ms ease-in forwards; }
.pf-line-in  { animation: pf-in  260ms ease-out forwards; }
@keyframes pf-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6px); } }
@keyframes pf-in  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

type FlapPhase = "show" | "out" | "blank" | "in";

function RotatingLine({ lines }: { lines: string[] }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<FlapPhase>("show");

  useEffect(() => {
    setIdx(0);
    setPhase("show");
  }, [lines.join("|")]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const delays: Record<FlapPhase, number> = { show: 4000, out: 200, blank: 140, in: 260 };
    const t = setTimeout(() => {
      if (phase === "show") setPhase("out");
      else if (phase === "out") setPhase("blank");
      else if (phase === "blank") { setIdx(i => (i + 1) % lines.length); setPhase("in"); }
      else setPhase("show");
    }, delays[phase]);
    return () => clearTimeout(t);
  }, [phase, lines.length]);

  if (lines.length === 0) return null;
  if (lines.length === 1) return <div className="pf-root"><div className="pf-line">{lines[0]}</div></div>;

  const text = lines[idx] ?? "";
  const visible = phase !== "blank";
  const cls = phase === "out" ? "pf-line-out" : phase === "in" ? "pf-line-in" : "";

  return (
    <div className="pf-root">
      {visible && <div className={`pf-line ${cls}`}>{text}</div>}
    </div>
  );
}

/* ── Person card ─────────────────────────────────────────────────────── */

function PersonCard({ person, isPresent }: { person: PersonSummary; isPresent: boolean }) {
  const color = colorFor(person.email);

  // Build rotating subtitle lines
  const practiceNames = person.sharedPractices.map(p => {
    const emoji = PRACTICE_EMOJI[p.templateType ?? "custom"] ?? "🌱";
    return `${emoji} ${p.name}`;
  });
  const traditionNames = person.sharedTraditions.map(t => `🤝🏽 ${t.name}`);
  const allNames = [...practiceNames, ...traditionNames];

  const prayerLine = person.activePrayerRequest
    ? `🙏🏽 ${truncate(person.activePrayerRequest.body, 40)}`
    : "";

  const flapLines = [prayerLine, ...allNames].filter(s => s.length > 0);

  // Best streak across shared practices
  const bestStreak = Math.max(person.maxSharedStreak, ...person.sharedPractices.map(p => p.currentStreak), 0);

  return (
    <Link href={`/people/${encodeURIComponent(person.email)}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
        style={{
          background: "#0F2818",
          border: "1px solid rgba(92,138,95,0.28)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-4 pt-3 pb-2.5">
          <div className="flex items-start justify-between gap-3">
            {/* Left: avatar + text */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {initials(person.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold truncate" style={{ color: "#F0EDE6" }}>
                    {person.name}
                  </span>
                  {isPresent && (
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "#5C7A5F" }}
                    />
                  )}
                </div>
                <RotatingLine lines={flapLines} />
              </div>
            </div>

            {/* Right: streak or arrow */}
            <div className="flex flex-col items-end shrink-0 pt-0.5 gap-1">
              {bestStreak > 0 ? (
                <>
                  <span className="text-[10px] font-semibold uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                    🔥 {bestStreak}
                  </span>
                  <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.4)" }}>streak</span>
                </>
              ) : (
                <span className="text-muted-foreground/30 text-lg">→</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function People() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const gardenEmails = useMemo(() => new Set((people ?? []).map(p => p.email)), [people]);
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenEmails, emptyMomentIds);
  const presentEmails = useMemo(() => new Set(presentUsers.map(u => u.email)), [presentUsers]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [people, highlightEmail]);

  if (authLoading || !user) return null;

  const sorted = people ? sortPeople(people, presentEmails) : [];

  return (
    <Layout>
      <style>{FLAP_CSS}</style>
      <div className="max-w-2xl mx-auto w-full pb-20">
        {/* Header — matches dashboard style */}
        <div className="mb-5">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            Stay close to your community
          </p>
          <h1 style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            People 🌿
          </h1>
        </div>

        {/* Section divider */}
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[11px] font-bold" style={{ color: "#F0EDE6" }}>Your garden</p>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        ) : !people || people.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div
              className="rounded-xl px-5 py-5 mb-6 flex items-center gap-4"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
            >
              <span style={{ fontSize: "32px" }}>🌱</span>
              <div>
                <p className="font-semibold" style={{ color: "#F0EDE6", fontSize: "16px", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Your garden is empty
                </p>
                <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                  Start a practice with someone to see them here
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {sorted.map(person => {
              const isHighlighted = highlightEmail === person.email;
              return (
                <div
                  key={person.email}
                  ref={isHighlighted ? highlightRef : null}
                >
                  <PersonCard
                    person={person}
                    isPresent={presentEmails.has(person.email)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
