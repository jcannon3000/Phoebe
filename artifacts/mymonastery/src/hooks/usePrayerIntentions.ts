import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePrayerListEnabled } from "@/hooks/usePrayerRequests";

// The reader's own private prayer list (prayer_intentions / /intentions),
// resolved to the small headline/subline shape the tail-of-practice slides
// render — a person's name (+ optional note) or a free-text intention.
// Only fetched for a real signed-up account (matches menu.tsx's `signedUp`
// check) AND only while the feature is on — otherwise every Guided Prayer /
// Psalms visit fired a GET for private prayer data nobody could ever see.
export function useActivePrayerIntentions(): { headline: string; subline: string }[] {
  const { user } = useAuth();
  const signedUp = !!user && !user.isAnonymous;
  const prayerListEnabled = usePrayerListEnabled();
  const { data } = useQuery<{ intentions: Array<{ id: number; kind: "text" | "person"; personName: string; body: string; answered: boolean }> }>({
    queryKey: ["/api/prayer-intentions"],
    queryFn: () => apiRequest("GET", "/api/prayer-intentions"),
    enabled: signedUp && prayerListEnabled,
    staleTime: 60_000,
  });
  return useMemo(
    () => (data?.intentions ?? [])
      .filter((it) => !it.answered)
      .map((it) => ({
        headline: it.kind === "person" ? (it.personName || "Someone") : (it.body || ""),
        subline: it.kind === "person" ? it.body : "",
      }))
      .filter((it) => it.headline),
    [data],
  );
}
