/**
 * Weekly-plan deck route — /communities/:slug/weekly-plan/deck/:itemId
 * (behind WEEKLY_PLAN_ENABLED). Loads the week's plan, finds the deck item,
 * and plays it full-screen (WeeklyPlanDeck). The closing Amen completes the
 * item and returns to the checklist; "Not now" / ✕ exit without credit.
 */
import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";
import { WeeklyPlanDeck } from "@/components/WeeklyPlanDeck";
import { thisWeekStart, type WeeklyItemPayload } from "@/lib/weeklyDeck";

type ServerItem = { id: number; kind: string; title: string; payload: WeeklyItemPayload | null };

export default function CommunityWeeklyPlanDeckPage() {
  const { slug, itemId } = useParams<{ slug: string; itemId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const weekStart = thisWeekStart();
  const backTo = `/communities/${slug}/weekly-plan`;

  useEffect(() => {
    if (!WEEKLY_PLAN_ENABLED) setLocation(`/communities/${slug}`, { replace: true });
  }, [slug, setLocation]);

  const { data, isLoading } = useQuery<{ items: ServerItem[] }>({
    queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/weekly-plan?weekStart=${weekStart}`),
    enabled: WEEKLY_PLAN_ENABLED,
  });
  const { data: groupData } = useQuery<{ group?: { name?: string } }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: WEEKLY_PLAN_ENABLED && !!slug,
    staleTime: 5 * 60_000,
  });

  const item = data?.items.find((i) => i.id === Number(itemId) && i.kind === "deck");
  const slides = item?.payload && "slides" in item.payload ? item.payload.slides : null;

  const complete = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/weekly-plan/complete`, { itemId: Number(itemId), done: true }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] });
      setLocation(backTo);
    },
  });

  useEffect(() => {
    // A stale/removed item (or a non-deck id) has nothing to show — go back.
    if (!isLoading && data && (!item || !slides || slides.length === 0)) setLocation(backTo, { replace: true });
  }, [isLoading, data, item, slides, setLocation, backTo]);

  if (!WEEKLY_PLAN_ENABLED || !item || !slides || slides.length === 0) return null;

  return (
    <WeeklyPlanDeck
      title={item.title}
      groupName={groupData?.group?.name ?? null}
      slides={slides}
      onAmen={() => complete.mutate()}
      onClose={() => setLocation(backTo)}
    />
  );
}
