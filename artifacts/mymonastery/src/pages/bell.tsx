import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ─── Template emoji mapping ─────────────────────────────────────────────────

const TEMPLATE_EMOJI: Record<string, string> = {
  "morning-prayer": "\u{1F305}",
  "evening-prayer": "\u{1F319}",
  morning_prayer: "\u{1F305}",
  evening_prayer: "\u{1F319}",
  intercession: "\u{1F64F}\u{1F3FD}",
  breath_together: "\u{1F32C}\uFE0F",
  contemplative_sit: "\u{1F33F}",
  walk_together: "\u{1F6B6}\u{1F3FD}",
  morning_coffee: "\u2615",
  custom: "\u2728",
  breath: "\u{1F32C}\uFE0F",
  contemplative: "\u{1F33F}",
  walk: "\u{1F6B6}\u{1F3FD}",
  listening: "\u{1F3B5}",
  fasting: "\u{1F343}",
  "lectio-divina": "\u{1F4D6}",
};

function practiceEmoji(templateType: string | null | undefined): string {
  return (templateType && TEMPLATE_EMOJI[templateType]) || "\u{1F33F}";
}

// ─── Practice link builder ──────────────────────────────────────────────────

function practiceHref(p: { templateType: string | null; momentToken: string; userToken: string }): string {
  if (p.templateType === "lectio-divina") {
    return `/lectio/${p.momentToken}/${p.userToken}`;
  }
  if (p.templateType === "morning-prayer") {
    return `/morning-prayer/${p.momentToken}/${p.userToken}`;
  }
  return `/moment/${p.momentToken}/${p.userToken}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface BellPractice {
  id: number;
  name: string;
  intention: string;
  templateType: string | null;
  frequency: string;
  scheduledTime: string;
  momentToken: string;
  userToken: string;
}

// ── Prayer Circles (beta) — daily focus surfaced alongside practices.
// One entry per circle-group the viewer belongs to, with today's list of
// what the circle is praying for. The bell mechanism itself is unchanged;
// this is just extra content the bell screen knows how to render.
interface BellCircleFocus {
  id: number;
  focusType: "person" | "situation" | "cause" | "custom";
  subjectName: string | null;
  subjectAvatarUrl: string | null;
  subjectText: string | null;
}
interface BellCircle {
  groupId: number;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
  intention: string | null;
  focus: BellCircleFocus[];
}

interface BellTodayResponse {
  userName: string;
  timezone: string;
  practices: BellPractice[];
  circles?: BellCircle[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BellPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const { data, isLoading: bellLoading } = useQuery<BellTodayResponse>({
    queryKey: ["/api/bell/today"],
    queryFn: () => apiRequest("GET", "/api/bell/today"),
    enabled: !!user,
  });

  if (isLoading || !user) return null;

  const greeting = getGreeting();

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-xl mx-auto pb-24">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 text-center"
        >
          <div className="text-4xl mb-4">🔔</div>
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {greeting}, {data?.userName ?? user.name ?? "friend"}.
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {(() => {
              const practiceCount = data?.practices?.length ?? 0;
              const circleCount = data?.circles?.length ?? 0;
              if (practiceCount > 0) {
                return `You have ${practiceCount} ${practiceCount === 1 ? "practice" : "practices"} today.`;
              }
              if (circleCount > 0) {
                return circleCount === 1
                  ? "Your circle is praying together today."
                  : "Your circles are praying together today.";
              }
              return "A gentle moment to pause and be present.";
            })()}
          </p>
        </motion.div>

        {/* ── Prayer Circles (beta) ─────────────────────────────────────
            Each circle shows its stated intention and today's focus list.
            Entries are read-only here — adding / removing lives on the
            circle's community page — the bell is for bringing everything
            named into one morning view. */}
        {data?.circles && data.circles.length > 0 && (
          <div className="space-y-4 mb-6">
            {data.circles.map((c, ci) => (
              <motion.div
                key={c.groupId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: ci * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl px-5 py-4"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
              >
                <Link href={`/communities/${c.groupSlug}`} className="block">
                  <div className="flex items-center gap-2 mb-2">
                    {c.groupEmoji && <span className="text-lg leading-none">{c.groupEmoji}</span>}
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: "#C8D4C0" }}
                    >
                      {c.groupName}
                    </p>
                  </div>
                  {c.intention && (
                    <p
                      className="text-base italic leading-snug mb-3"
                      style={{
                        color: "#F0EDE6",
                        fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                      }}
                    >
                      {c.intention}
                    </p>
                  )}
                </Link>
                {c.focus.length > 0 ? (
                  <div className="space-y-1.5">
                    {c.focus.map(f => {
                      const label = f.subjectName || f.subjectText || "";
                      return (
                        <div
                          key={f.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.2)" }}
                        >
                          {f.subjectAvatarUrl ? (
                            <img
                              src={f.subjectAvatarUrl}
                              alt={f.subjectName ?? ""}
                              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                              style={{ border: "1px solid rgba(46,107,64,0.4)" }}
                            />
                          ) : (
                            <span className="text-xs flex-shrink-0" style={{ color: "#E8B872" }}>
                              {f.focusType === "person" ? "◉" : "✦"}
                            </span>
                          )}
                          <p
                            className="text-sm leading-snug truncate"
                            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                          >
                            {label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] italic" style={{ color: "rgba(143,175,150,0.6)" }}>
                    Nothing named yet today.
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Practice cards */}
        {bellLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl h-20 animate-pulse" style={{ background: "rgba(46,107,64,0.08)" }} />
            ))}
          </div>
        ) : data?.practices && data.practices.length > 0 ? (
          <div className="space-y-3">
            {data.practices.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href={practiceHref(p)}
                  className="block rounded-2xl px-5 py-4 transition-all"
                  style={{
                    background: "rgba(46,107,64,0.10)",
                    border: "1px solid rgba(46,107,64,0.18)",
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl flex-shrink-0">{practiceEmoji(p.templateType)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                        {p.name}
                      </p>
                      {p.intention && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "#8FAF96" }}>
                          {p.intention}
                        </p>
                      )}
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "rgba(200,212,192,0.4)" }}>
                      →
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (data?.circles && data.circles.length > 0) ? (
          // Circles are already on screen above — don't stack an "empty"
          // practices card underneath; the bell has content.
          null
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl px-6 py-8 text-center"
            style={{ background: "rgba(46,107,64,0.06)", border: "1px dashed rgba(46,107,64,0.2)" }}
          >
            <p className="text-lg mb-2">🌿</p>
            <p className="text-sm mb-1" style={{ color: "#F0EDE6" }}>No practices scheduled today</p>
            <p className="text-xs" style={{ color: "#8FAF96" }}>Enjoy the stillness.</p>
          </motion.div>
        )}

        {/* Footer links */}
        <div className="mt-8 flex justify-center gap-6">
          <Link
            href="/practices"
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            All practices →
          </Link>
          <Link
            href="/dashboard"
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            Dashboard →
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
