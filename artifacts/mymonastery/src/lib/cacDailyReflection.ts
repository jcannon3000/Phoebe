// ─── CAC Daily Reflection — read in-app instead of linking out ──────────────
//
// Admin-tools beta (owner, 2026-08-01): CAC's own daily-meditations pages
// block bot-shaped requests and can't be iframed (X-Frame-Options), so the
// existing /cac/today-meta only ever surfaced a title + "read on cac.org"
// link. GET /api/cac/today-full additionally scrapes the RSS feed's
// <content:encoded> and strips it to plain-text paragraphs server-side (see
// routes/cac.ts extractParagraphs) — no HTML ever reaches the client, so
// there's no dangerouslySetInnerHTML / sanitizer surface for third-party
// content to exploit.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface CacDailyReflection {
  title: string;
  url: string;
  paragraphs: string[];
}

export function useCacDailyReflection() {
  return useQuery<CacDailyReflection>({
    queryKey: ["/api/cac/today-full"],
    queryFn: () => apiRequest("GET", "/api/cac/today-full"),
    staleTime: 5 * 60_000,
  });
}
