import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MenuHub } from "@/components/MenuHub";

// Browse the novena library — same MenuHub list pattern as Courses (menu-learn.tsx).
// Tapping a card opens its preview/detail page (/novena/:id) rather than
// starting it immediately; that page holds the source/attribution info, the
// Start button, and the replace-vs-addition + slot-picker flow.

type Novena = {
  id: number; title: string; saint: string | null; sourceNote: string | null; dayCount: number;
  isCurrent: boolean; lastCompletedAt: string | null;
};

function formatLastCompleted(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function NovenaLibraryPage() {
  const [, setLocation] = useLocation();

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
          const bits = [n.saint, `${n.dayCount} days`];
          if (n.isCurrent) bits.push("In your routine");
          else if (n.lastCompletedAt) bits.push(`Last completed ${formatLastCompleted(n.lastCompletedAt)}`);
          return {
            emoji: "🕊️",
            label: n.title,
            sub: bits.filter(Boolean).join(" · "),
            dot: n.isCurrent,
            onClick: () => setLocation(`/novena/${n.id}`),
          };
        }),
      }]}
    />
  );
}
