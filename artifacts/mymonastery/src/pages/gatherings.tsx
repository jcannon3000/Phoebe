import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { parseISO, format, isToday, isBefore, addDays, startOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useListRituals } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";

function dayLabel(d: Date) {
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

export default function GatheringsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: rituals, isLoading } = useListRituals({ ownerId: user?.id });

  if (!user) {
    setLocation("/");
    return null;
  }

  const gatherings = rituals ?? [];

  // ── Time buckets ────────────────────────────────────────────────────────────
  // "This week" is the calendar week Sunday → next Sunday, not a rolling
  // next-7-days window.
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const nextWeekStart = addDays(weekStart, 7);
  const todayGatherings: typeof gatherings = [];
  const weekGatherings: typeof gatherings = [];
  const monthGatherings: typeof gatherings = [];

  for (const r of gatherings) {
    if (!r.nextMeetupDate) {
      monthGatherings.push(r);
    } else {
      const d = parseISO(r.nextMeetupDate);
      if (isToday(d)) {
        todayGatherings.push(r);
      } else if (isBefore(d, nextWeekStart)) {
        weekGatherings.push(r);
      } else {
        monthGatherings.push(r);
      }
    }
  }

  function SectionHeader({ label }: { label: string }) {
    return (
      <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
        <span className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: "rgba(200,212,192,0.45)" }}>
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
    );
  }

  function GatheringCard({ ritual }: { ritual: typeof gatherings[0] }) {
    const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
    const r = ritual as any;
    const rhythm = r.rhythm as string | undefined;
    const rhythmLabel = rhythm === "weekly" ? "Every week"
      : rhythm === "fortnightly" ? "Every two weeks"
      : rhythm === "monthly" ? "Once a month"
      : ritual.frequency ?? "Recurring";

    return (
      <Link href={`/ritual/${ritual.id}`} className="block">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative flex rounded-xl overflow-hidden cursor-pointer"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(92,138,95,0.3)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>🤝 {ritual.name}</span>
              <span className="text-[11px]" style={{ color: "#8FAF96" }}>{rhythmLabel}</span>
            </div>

            {ritual.participants && (ritual.participants as any[]).length > 0 && (
              <p className="text-sm mb-1" style={{ color: "#A8C5A0" }}>
                with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
              </p>
            )}

            {next && (
              <p className="text-sm" style={{ color: "#A8C5A0" }}>
                {dayLabel(next)} · {format(next, "h:mm a")}
                {ritual.location && <> · {ritual.location}</>}
              </p>
            )}

            {r.intercessionIntention && (
              <p className="text-xs mt-1" style={{ color: "#8FAF96" }}>🙏 Praying for {r.intercessionIntention}</p>
            )}
            {r.fastingDescription && (
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>🌿 Fasting together</p>
            )}
          </div>
        </motion.div>
      </Link>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-20">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Gatherings 🤝
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            Your community, meeting regularly, with intention.
          </p>
        </div>

        <div className="h-px mb-2" style={{ background: "rgba(200,212,192,0.12)" }} />

        {isLoading ? (
          <div className="space-y-3 mt-4">
            {[1, 2].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        ) : gatherings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12"
          >
            <div className="text-5xl mb-6">🤝</div>
            <p className="text-base font-medium mb-1" style={{ color: "#F0EDE6" }}>Community grows where people keep showing up.</p>
            <p className="text-sm mb-8" style={{ color: "#9a9390" }}>
              Commit to a rhythm. Phoebe handles the rest.
            </p>
            <Link href="/tradition/new">
              <button
                className="px-6 py-3.5 rounded-2xl text-base font-semibold"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                Start a gathering
              </button>
            </Link>
          </motion.div>
        ) : (
          <div>
            {todayGatherings.length > 0 && (
              <>
                <SectionHeader label="Today" />
                <div className="space-y-3 mb-2">
                  {todayGatherings.map(r => <GatheringCard key={r.id} ritual={r} />)}
                </div>
              </>
            )}
            {weekGatherings.length > 0 && (
              <>
                <SectionHeader label="This Week" />
                <div className="space-y-3 mb-2">
                  {weekGatherings.map(r => <GatheringCard key={r.id} ritual={r} />)}
                </div>
              </>
            )}
            {monthGatherings.length > 0 && (
              <>
                <SectionHeader label="This Month" />
                <div className="space-y-3">
                  {monthGatherings.map(r => <GatheringCard key={r.id} ritual={r} />)}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Floating + FAB */}
      <Link
        href="/tradition/new"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#1A4A2E", color: "#F0EDE6" }}
        aria-label="New gathering"
      >
        <Plus size={24} />
      </Link>
    </Layout>
  );
}
