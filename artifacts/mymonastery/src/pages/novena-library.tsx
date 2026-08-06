import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { MenuHub } from "@/components/MenuHub";

// Browse the novena library — same MenuHub list pattern as Courses (menu-learn.tsx).
// Tapping a card opens its preview/detail page (/novena/:id) rather than
// starting it immediately; that page holds the source/attribution info, the
// Start button, and the replace-vs-addition + slot-picker flow.

type Novena = { id: number; title: string; saint: string | null; sourceNote: string | null; dayCount: number };

export default function NovenaLibraryPage() {
  const [, setLocation] = useLocation();
  const { novena: activeNovena } = useRhythmState();

  const { data } = useQuery<{ novenas: Novena[] }>({
    queryKey: ["/api/novenas"],
    queryFn: () => apiRequest("GET", "/api/novenas"),
  });

  const novenas = useMemo(() => data?.novenas ?? [], [data]);

  return (
    <MenuHub
      title="Novenas"
      emoji="🕊️"
      subtitle="Nine days of prayer, one day at a time — riding your daily routine until they're complete."
      backLabel="Practices"
      backHref="/menu/practices"
      groups={[{
        items: novenas.map((n) => {
          const isCurrent = activeNovena?.novenaId === n.id;
          return {
            emoji: "🕊️",
            label: n.title,
            sub: [n.saint, `${n.dayCount} days`].filter(Boolean).join(" · ") + (isCurrent ? " · In your routine" : ""),
            dot: isCurrent,
            onClick: () => setLocation(`/novena/${n.id}`),
          };
        }),
      }]}
    />
  );
}
