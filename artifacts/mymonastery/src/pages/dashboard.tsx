import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEE, MMM d");
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-3 mb-1"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/letters/new"); }}
              className="px-5 py-4 rounded-2xl text-left transition-colors"
              style={{ background: "#E8E2D5", boxShadow: "0 4px 20px rgba(44,24,16,0.10), 0 1px 4px rgba(44,24,16,0.04)", minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: "#2C1810" }}>📮 Start a correspondence</p>
              <p className="text-xs mt-1" style={{ color: "#8C7B6B" }}>Write letters with someone you care about</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-5 py-4 rounded-2xl text-left transition-colors"
              style={{ background: "#E8E2D5", boxShadow: "0 4px 20px rgba(44,24,16,0.10), 0 1px 4px rgba(44,24,16,0.04)", minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: "#2C1810" }}>🎉 Start a tradition</p>
              <p className="text-xs mt-1" style={{ color: "#8C7B6B" }}>Meet together regularly</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform btn-sage"
        style={{ background: "#5C7A5F", color: "#fff" }}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </button>
    </div>
  );
}

// ─── Section header — quiet marker ───────────────────────────────────────────

function SectionHeader({ label, epigraph }: { label: string; epigraph?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="section-header">{label}</h2>
        <div className="flex-1 h-px" style={{ background: "#D4CFC4" }} />
      </div>
      {epigraph && (
        <p className="text-[13px] italic leading-relaxed" style={{ color: "#8C7B6B" }}>
          {epigraph}
        </p>
      )}
    </div>
  );
}

// ─── Letters Section ──────────────────────────────────────────────────────────

function LettersSection() {
  const { user } = useAuth();
  const { data: correspondences, isLoading } = useQuery<Array<{
    id: number;
    name: string;
    groupType: string;
    unreadCount: number;
    members: Array<{ name: string | null; email: string; homeCity: string | null }>;
    recentPostmarks: Array<{ authorName: string; city: string; sentAt: string }>;
    currentPeriod: {
      periodNumber: number;
      periodLabel: string;
      hasWrittenThisPeriod: boolean;
      isLastThreeDays: boolean;
      membersWritten: Array<{ name: string; hasWritten: boolean }>;
    };
  }>>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <>
        <SectionHeader label="Letters 📮" />
        <div className="space-y-4 mb-16">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "#DDD9CC" }} />
          ))}
        </div>
      </>
    );
  }

  const items = correspondences ?? [];

  return (
    <div className="mb-16">
      <SectionHeader label="Letters 📮" />

      {items.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "#E8E2D5", border: "1px dashed #D4CFC4" }}
        >
          <div className="text-3xl mb-3">📮</div>
          <p className="text-sm mb-2 font-medium" style={{ color: "#2C1810" }}>For centuries, monks have cultivated relationships through writing.</p>
          <p className="text-xs mb-4" style={{ color: "#8C7B6B" }}>But today, this practice gets lost in the noise of texts and emails. Phoebe creates a sacred place to renew this tradition.</p>
          <Link href="/letters/new">
            <span className="text-sm font-medium" style={{ color: "#5C7A5F" }}>Start a correspondence →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((c) => {
            const isOneToOne = c.groupType === "one_to_one";
            const otherMembers = c.members
              .filter(m => m.email !== user?.email)
              .map(m => m.name || m.email.split("@")[0])
              .join(", ");

            const iWrote = c.currentPeriod.membersWritten.find(m => m.name === user?.name)?.hasWritten ?? false;
            const theyWrote = c.currentPeriod.membersWritten.find(m => m.name !== user?.name)?.hasWritten ?? false;
            const hasUnread = c.unreadCount > 0;
            const needsWrite = !iWrote;

            let statusText = "";
            let statusColor = "#8C7B6B";

            if (hasUnread) {
              statusText = `${otherMembers} wrote 🌿`;
              statusColor = "#5C7A5F";
            } else if (iWrote && !theyWrote) {
              statusText = isOneToOne ? `Waiting for ${otherMembers}... 🌿` : `Your update is in 🌿`;
              statusColor = "#8C7B6B";
            } else if (needsWrite) {
              statusText = isOneToOne ? `Your turn to write 📮` : `Share your update 📮`;
              statusColor = "#5C7A5F";
            } else {
              statusText = "All written 🌿";
              statusColor = "#5C7A5F";
            }

            const lastPostmark = c.recentPostmarks[0];
            const needsAction = hasUnread || needsWrite;

            return (
              <Link key={c.id} href={`/letters/${c.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2, boxShadow: "0 6px 24px rgba(44,24,16,0.10)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative flex rounded-2xl overflow-hidden cursor-pointer"
                  style={{
                    background: "#E8E2D5",
                    boxShadow: needsAction
                      ? "0 2px 16px rgba(92,122,95,0.10), 0 1px 4px rgba(44,24,16,0.04)"
                      : "0 2px 12px rgba(44,24,16,0.06)",
                  }}
                >
                  {/* Left bar */}
                  <div
                    className={needsAction ? "w-1 flex-shrink-0 animate-pulse" : "w-1 flex-shrink-0"}
                    style={{ background: "#5C7A5F" }}
                  />
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-semibold" style={{ color: "#2C1810" }}>
                          {c.name || (isOneToOne ? `Letters with ${otherMembers}` : otherMembers)}
                        </span>
                        {hasUnread && (
                          <span
                            className="ml-2 inline-block w-2 h-2 rounded-full align-middle animate-pulse"
                            style={{ background: "#5C7A5F" }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#5C7A5F", letterSpacing: "0.08em" }}>
                        {isOneToOne ? `Letter ${c.currentPeriod.periodNumber}` : `Week ${c.currentPeriod.periodNumber}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <p className="text-sm font-medium" style={{ color: statusColor }}>
                        {statusText}
                        <span className="font-normal" style={{ color: "#8C7B6B" }}>
                          {" · "}{c.currentPeriod.periodLabel}{lastPostmark?.city ? ` · ${lastPostmark.city}` : ""}
                        </span>
                      </p>
                      {needsWrite && (
                        <Link
                          href={`/letters/${c.id}/write`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <motion.span
                            animate={{ scale: [1, 1.03, 1] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            className="btn-sage text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 inline-block"
                            style={{ background: "#5C7A5F", color: "#fff" }}
                          >
                            Write 📮
                          </motion.span>
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gatherings Section ───────────────────────────────────────────────────────

function GatheringsSection() {
  const { user } = useAuth();
  const { data: rituals, isLoading } = useListRituals({ ownerId: user?.id });

  if (isLoading) {
    return (
      <>
        <SectionHeader
          label="Traditions 🎉"
          />
        <div className="space-y-4 mb-16">
          {[1].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "#DDD9CC" }} />
          ))}
        </div>
      </>
    );
  }

  const gatherings = rituals ?? [];

  return (
    <div className="mb-16">
      <SectionHeader
        label="Traditions 🎉"
      />

      {gatherings.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "#E8E2D5", border: "1px dashed #D4CFC4" }}
        >
          <div className="text-3xl mb-3">🎉</div>
          <p className="text-sm mb-2 font-medium" style={{ color: "#2C1810" }}>Monks have always known: connection grows through repeated gatherings.</p>
          <p className="text-xs mb-4" style={{ color: "#8C7B6B" }}>Phoebe helps you commit to a rhythm — weekly, fortnightly, or monthly — and keeps the tradition alive.</p>
          <Link href="/tradition/new">
            <span className="text-sm font-medium" style={{ color: "#C17F24" }}>Start a tradition →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
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
                  whileHover={{ y: -2, boxShadow: "0 6px 24px rgba(44,24,16,0.10)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative flex rounded-2xl overflow-hidden cursor-pointer"
                  style={{
                    background: "#E8E2D5",
                    boxShadow: "0 2px 12px rgba(44,24,16,0.06)",
                  }}
                >
                  {/* Amber left bar */}
                  <div className="w-1 flex-shrink-0" style={{ background: "#C17F24" }} />
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-base font-semibold" style={{ color: "#2C1810" }}>{ritual.name}</span>
                      <span className="text-[11px]" style={{ color: "#8C7B6B" }}>{rhythmLabel}</span>
                    </div>

                    {ritual.participants && (ritual.participants as any[]).length > 0 && (
                      <p className="text-sm mb-1.5" style={{ color: "#8C7B6B" }}>
                        with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                        {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
                      </p>
                    )}

                    {next && (
                      <p className="text-sm" style={{ color: "#8C7B6B" }}>
                        {dayLabel(next)} · {format(next, "h:mm a")}
                        {ritual.location && <> · {ritual.location}</>}
                      </p>
                    )}

                    {r.intercessionIntention && (
                      <p className="text-xs mt-2" style={{ color: "#A89E92" }}>🙏 Praying for {r.intercessionIntention}</p>
                    )}
                    {r.fastingDescription && (
                      <p className="text-xs mt-1" style={{ color: "#A89E92" }}>🌿 Fasting together</p>
                    )}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-28">

        {/* ── Date — the bell that calls you back ── */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </h1>
        </div>

        {/* ── Letters ── */}
        <LettersSection />

        {/* ── Traditions ── */}
        <GatheringsSection />

        {/* ── Prayer Requests ── */}
        <PrayerSection />

        {/* FAB */}
        <FAB />
      </div>
    </Layout>
  );
}
