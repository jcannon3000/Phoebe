import type { ReactNode } from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { FeedEventCard, type FeedEvent } from "@/components/FeedEventCard";

// Upcoming-events rail for the office close. Pulls the SAME sources the
// Events page (dashboard in eventsOnly mode) draws on — community
// gatherings, fellow "How About" plans, community actions, and prayer-feed
// events — normalizes them to FeedEvent and renders each with the SAME
// FeedEventCard the events surface uses, so the close reads "just how they
// appear on the event page." If nothing is upcoming we render `onEmpty`
// instead (the original "prayed with N people" faces), so the close is
// never barren.

type NormEvent = { key: string; event: FeedEvent };

const SPACE_GROTESK = "'Space Grotesk', sans-serif";

export function OfficeCloseEvents({
  max = 3,
  onEmpty = null,
}: {
  max?: number;
  onEmpty?: ReactNode;
}) {
  const { user } = useAuth();
  const uid = user?.id;

  // Community gatherings (server already rolls up nextMeetupDate).
  const { data: rituals } = useQuery<any[]>({
    queryKey: ["/api/rituals", uid],
    queryFn: () => apiRequest("GET", `/api/rituals?ownerId=${uid}`),
    enabled: !!uid,
    staleTime: 60_000,
  });
  // Fellow "How About" plans (the dated subset becomes timeline events).
  const { data: plansData } = useQuery<{ plans: any[] }>({
    queryKey: ["/api/fellow-plans"],
    queryFn: () => apiRequest("GET", "/api/fellow-plans"),
    enabled: !!uid,
    staleTime: 60_000,
  });
  // Community actions across the user's communities.
  const { data: actionsData } = useQuery<{ actions: any[] }>({
    queryKey: ["/api/me/actions"],
    queryFn: () => apiRequest("GET", "/api/me/actions"),
    enabled: !!uid,
    staleTime: 60_000,
  });
  // Prayer-feed events the feed managers published.
  const { data: feedsData } = useQuery<{ subscriptions: any[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!uid,
    staleTime: 60_000,
  });

  const events = useMemo<NormEvent[]>(() => {
    const out: NormEvent[] = [];
    const now = Date.now();
    // Keep an event that started within the last hour (in progress) through
    // anything in the future; drop the clearly-past.
    const startMs = (iso?: string | null): number | null => {
      if (!iso) return null;
      const ms = new Date(iso).getTime();
      return Number.isFinite(ms) && ms > now - 60 * 60 * 1000 ? ms : null;
    };

    for (const r of rituals ?? []) {
      const ms = startMs(r?.nextMeetupDate);
      if (ms == null) continue;
      const join = typeof r?.meetingUrl === "string" && r.meetingUrl.trim() ? r.meetingUrl : null;
      out.push({
        key: `gathering-${r.id}`,
        event: { id: r.id, title: r.name ?? "Gathering", startsAt: r.nextMeetupDate, location: r.location ?? null, joinUrl: join },
      });
    }
    for (const p of plansData?.plans ?? []) {
      const ms = startMs(p?.startsAt);
      if (ms == null) continue;
      out.push({
        key: `plan-${p.id}`,
        event: { id: p.id, title: p.emoji ? `${p.emoji} ${p.title}` : p.title, startsAt: p.startsAt, location: p.location ?? null, joinUrl: null },
      });
    }
    for (const a of actionsData?.actions ?? []) {
      const ms = startMs(a?.eventAt);
      if (ms == null) continue;
      out.push({
        key: `action-${a.id}`,
        event: { id: a.id, title: a.title, startsAt: a.eventAt, location: a.location ?? null, joinUrl: null },
      });
    }
    for (const s of feedsData?.subscriptions ?? []) {
      for (const e of s?.upcomingEvents ?? []) {
        if (e?.state === "cancelled") continue;
        if (startMs(e?.startsAt) == null) continue;
        out.push({ key: `feedev-${e.id}`, event: e as FeedEvent });
      }
    }

    out.sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());
    const seen = new Set<string>();
    return out.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true))).slice(0, Math.max(1, max));
  }, [rituals, plansData, actionsData, feedsData, max]);

  if (events.length === 0) return <>{onEmpty}</>;

  return (
    <motion.div
      className="w-full"
      style={{ maxWidth: 380 }}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } } }}
    >
      {/* The "Coming up" eyebrow is provided by the caller (the office-close
          slide), so we don't render our own here — that double-stacked the
          label. */}
      <div className="flex flex-col gap-2.5 text-left">
        {events.map((e) => (
          <motion.div key={e.key} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } } }}>
            <FeedEventCard event={e.event} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
