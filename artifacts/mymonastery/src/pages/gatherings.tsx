import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { parseISO, format } from "date-fns";
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

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
              Gatherings 🎉
            </h1>
            <p className="text-sm mt-1" style={{ color: "#9a9390" }}>
              Your community, meeting regularly, with intention.
            </p>
          </div>
          <Link href="/tradition/new">
            <button
              className="btn-sage px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#5C7A5F", color: "#fff" }}
            >
              Start a gathering
            </button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#DDD9CC" }} />
            ))}
          </div>
        ) : gatherings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12"
          >
            <div className="text-5xl mb-6">⛪</div>
            <p className="text-base font-medium mb-1" style={{ color: "#2C1810" }}>Community grows where people keep showing up.</p>
            <p className="text-sm mb-8" style={{ color: "#9a9390" }}>
              Commit to a rhythm. Phoebe handles the rest.
            </p>
            <Link href="/tradition/new">
              <button
                className="btn-sage px-6 py-3.5 rounded-2xl text-base font-semibold"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                Start a gathering
              </button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {gatherings.map((ritual) => {
              const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
              const r = ritual as any;
              const rhythm = r.rhythm as string | undefined;
              const rhythmLabel = rhythm === "weekly" ? "Every week"
                : rhythm === "fortnightly" ? "Every two weeks"
                : rhythm === "monthly" ? "Once a month"
                : ritual.frequency ?? "Recurring";

              return (
                <Link key={ritual.id} href={`/ritual/${ritual.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(44,24,16,0.13), 0 2px 8px rgba(44,24,16,0.07)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative flex rounded-xl overflow-hidden cursor-pointer"
                    style={{
                      background: "#E8E4D8",
                      border: "1px solid rgba(193,127,36,0.2)",
                      boxShadow: "0 2px 8px rgba(44,24,16,0.07), 0 1px 3px rgba(44,24,16,0.04)",
                    }}
                  >
                    <div className="w-1 flex-shrink-0" style={{ background: "#C17F24" }} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-base font-semibold" style={{ color: "#2C1810" }}>{ritual.name}</span>
                        <span className="text-[11px]" style={{ color: "#9a9390" }}>{rhythmLabel}</span>
                      </div>

                      {ritual.participants && (ritual.participants as any[]).length > 0 && (
                        <p className="text-sm mb-1" style={{ color: "#6b6460" }}>
                          with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                          {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
                        </p>
                      )}

                      {next && (
                        <p className="text-sm" style={{ color: "#6b6460" }}>
                          {dayLabel(next)} · {format(next, "h:mm a")}
                          {ritual.location && <> · {ritual.location}</>}
                        </p>
                      )}

                      {r.intercessionIntention && (
                        <p className="text-xs mt-1" style={{ color: "#9a9390" }}>🙏 Praying for {r.intercessionIntention}</p>
                      )}
                      {r.fastingDescription && (
                        <p className="text-xs mt-0.5" style={{ color: "#9a9390" }}>🌿 Fasting together</p>
                      )}
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
