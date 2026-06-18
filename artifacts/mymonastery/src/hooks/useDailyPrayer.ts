import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── Types (mirror api-server/src/routes/daily-prayer.ts responses) ─────────
export interface PartnerCard {
  id: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface DailyPrayerRow {
  id: number;
  authorId: number;
  ymd: string;
  body: string;
  createdAt: string;
  // Next-morning delivery: the instant this prayer unseals to partners (ISO).
  // null on legacy rows (delivered immediately).
  deliverAfter?: string | null;
}

export interface MyAttention { counted: boolean; seconds: number }

export interface PartnerThreadSummary {
  partner: PartnerCard | null;
  streak: number;
  theirLatest: DailyPrayerRow | null;
  myAttention: MyAttention;
  isNew: boolean;
}
export interface ShareReceipt {
  partner: PartnerCard | null;
  counted: boolean;
  viewedAt: string | null;
}

export interface DailyPrayerToday {
  status: "active" | "none";
  mine: DailyPrayerRow | null;
  canShareToday: boolean;
  shareReceipts: ShareReceipt[];
  partners: PartnerThreadSummary[];
  shouldPromptSendBack: boolean;
}

export interface PartnerInvite {
  id: number;
  createdAt: string;
  inviterId: number;
  inviterName: string | null;
  inviterAvatarUrl: string | null;
}

export interface ThreadItem {
  id: number;
  authorId: number;
  isMine: boolean;
  body: string;
  ymd: string;
  createdAt: string;
  attention: { counted: boolean; countedAt: string | null; seconds: number } | null;
}
export interface PrayerThread {
  partner: PartnerCard | null;
  streak: number;
  items: ThreadItem[];
}

const TODAY_KEY = ["/api/daily-prayer/today"];
const INVITES_KEY = ["/api/prayer-partner/invites"];

// ── Queries ────────────────────────────────────────────────────────────────
// Poll while the home is open so a partner's share / a fresh prayer appears
// without a manual refresh (same cadence as the messaging inbox).
export function useDailyPrayerToday() {
  return useQuery<DailyPrayerToday>({ queryKey: TODAY_KEY, refetchInterval: 60_000, staleTime: 30_000, meta: { silentError: true } });
}
export function usePartnerInvites() {
  return useQuery<PartnerInvite[]>({ queryKey: INVITES_KEY, refetchInterval: 60_000, meta: { silentError: true } });
}
export function usePrayerThread(partnerId: number | null) {
  return useQuery<PrayerThread>({
    queryKey: [`/api/prayer-thread/${partnerId}`],
    enabled: !!partnerId,
    refetchInterval: 30_000,
    meta: { silentError: true },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────
function useInvalidateExchange() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: INVITES_KEY });
    qc.invalidateQueries({ queryKey: ["/api/prayer-partners"] });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/prayer-thread/") });
  };
}

export function useShareDailyPrayer() {
  const invalidate = useInvalidateExchange();
  return useMutation({
    mutationFn: (body: string) => apiRequest("POST", "/api/daily-prayer", { body }),
    onSuccess: invalidate,
  });
}
// Start a Heart to Heart with one specific person and send them a prayer in a
// single tap. Auto-pairs (active immediately) and the first prayer of a brand
// new dialogue delivers instantly; afterward the next-morning cadence applies.
export function useStartHeartToHeart() {
  const invalidate = useInvalidateExchange();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { partnerUserId: number; body: string }) =>
      apiRequest<{ delivered: boolean }>("POST", "/api/prayer-partner/start", v),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/walk"] }); },
  });
}
export function useInvitePartner() {
  const invalidate = useInvalidateExchange();
  return useMutation({
    mutationFn: (recipientUserId: number) => apiRequest("POST", "/api/prayer-partner/invite", { recipientUserId }),
    onSuccess: invalidate,
  });
}
export function useAcceptInvite() {
  const invalidate = useInvalidateExchange();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayer-partner/invites/${id}/accept`, {}),
    onSuccess: invalidate,
  });
}
export function useDeclineInvite() {
  const invalidate = useInvalidateExchange();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayer-partner/invites/${id}/decline`, {}),
    onSuccess: invalidate,
  });
}
export function useEndPartner() {
  const invalidate = useInvalidateExchange();
  return useMutation({
    mutationFn: (partnerUserId: number) => apiRequest("POST", "/api/prayer-partner/end", { partnerUserId }),
    onSuccess: invalidate,
  });
}
