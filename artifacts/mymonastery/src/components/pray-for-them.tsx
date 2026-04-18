import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────
export type MyActivePrayerFor = {
  id: number;
  prayerText: string;
  durationDays: number;
  startedAt: string;
  expiresAt: string;
  acknowledgedAt: string | null;
  recipientUserId: number;
  recipientName: string;
  recipientEmail: string;
  recipientAvatarUrl: string | null;
  expired: boolean;
};

export type PrayerForMe = {
  id: number;
  startedAt: string;
  expiresAt: string;
  prayerText: string;
  prayerUserId: number;
  prayerName: string;
  prayerEmail: string;
  prayerAvatarUrl: string | null;
};

// Hook that returns the currently-active (unacknowledged) prayer I am
// offering for this recipient, if any.
export function useMyPrayerForRecipient(recipientUserId: number | null | undefined) {
  const query = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
  });
  const match = recipientUserId
    ? (query.data ?? []).find(p => p.recipientUserId === recipientUserId && !p.expired) ?? null
    : null;
  return { prayer: match, isLoading: query.isLoading };
}

// ─── Pray for them button ──────────────────────────────────────────────────
// Navigates to the full-screen authoring flow at /pray-for/new/:email
// (see pages/prayer-for-new.tsx), matching the "gathering" template pattern.
// Previously opened a bottom-sheet modal.
export function PrayForThemButton({
  recipientUserId,
  recipientEmail,
  recipientName,
}: {
  recipientUserId: number;
  recipientEmail: string;
  recipientName: string;
}) {
  const [, setLocation] = useLocation();
  const firstName = recipientName.split(" ")[0];

  const { prayer: existing } = useMyPrayerForRecipient(recipientUserId);

  // Day X of Y label — simple Math.ceil from startedAt.
  let dayLabel: string | null = null;
  if (existing) {
    const started = new Date(existing.startedAt).getTime();
    const day = Math.min(
      existing.durationDays,
      Math.max(1, Math.ceil((Date.now() - started) / (1000 * 60 * 60 * 24))),
    );
    dayLabel = `Day ${day} of ${existing.durationDays}`;
  }

  const targetHref = existing
    ? `/pray-for/${encodeURIComponent(recipientEmail)}`
    : `/pray-for/new/${encodeURIComponent(recipientEmail)}`;

  return (
    <button
      onClick={() => setLocation(targetHref)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 mb-6"
      style={{
        background: existing ? "rgba(46,107,64,0.12)" : "#2D5E3F",
        border: existing ? "1px solid rgba(46,107,64,0.35)" : "1px solid rgba(46,107,64,0.5)",
        color: existing ? "#A8C5A0" : "#F0EDE6",
      }}
    >
      <span className="flex items-center gap-2">
        <span>🙏</span>
        <span>{existing ? `You're praying for ${firstName}` : `Write a prayer for ${firstName}`}</span>
      </span>
      <span className="text-[11px]" style={{ color: existing ? "rgba(168,197,160,0.7)" : "rgba(240,237,230,0.7)" }}>
        {existing ? dayLabel : "Begin"}
      </span>
    </button>
  );
}
