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

interface BellTodayResponse {
  userName: string;
  timezone: string;
  practices: BellPractice[];
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
            {data?.practices && data.practices.length > 0
              ? `You have ${data.practices.length} ${data.practices.length === 1 ? "practice" : "practices"} today.`
              : "A gentle moment to pause and be present."}
          </p>
        </motion.div>

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
