import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Meetup RSVP block ───────────────────────────────────────────────────────
//
// Drop-in component for the gathering detail surface (modal + page).
// Renders:
//   • A three-pill picker:  Going · Maybe · Clear
//   • Two attendee lists:    🌿 Going (N)  ·  🤔 Maybe (M)
//
// Loads its own data via /api/meetups/:id/rsvps so call sites just need
// to hand it a meetupId. Mutations write through /api/meetups/:id/rsvp
// and invalidate so the picker and the lists update together. The
// dashboard's batch RSVP summary cache is invalidated too so the home
// screen count refreshes immediately after a tap.

type RsvpStatus = "going" | "maybe" | null;

interface AttendeeRow {
  userId: number;
  status: "going" | "maybe";
  respondedAt: string;
  name: string | null;
  avatarUrl: string | null;
}

interface RsvpsResponse {
  yourStatus: RsvpStatus;
  going: AttendeeRow[];
  maybe: AttendeeRow[];
}

const ACCENT = "#7AAF7D";
const SOFT_TEXT = "#C8D4C0";
const FAINT = "rgba(143,175,150,0.55)";

export function RsvpBlock({ meetupId }: { meetupId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<RsvpsResponse>({
    queryKey: [`/api/meetups/${meetupId}/rsvps`],
    queryFn: () => apiRequest("GET", `/api/meetups/${meetupId}/rsvps`),
  });

  // Invalidate both the detail query and the dashboard batch summary
  // so changes propagate everywhere we render RSVP counts.
  function invalidate() {
    qc.invalidateQueries({ queryKey: [`/api/meetups/${meetupId}/rsvps`] });
    qc.invalidateQueries({ queryKey: ["meetups-rsvp-summary"] });
  }

  const setStatus = useMutation({
    mutationFn: (status: "going" | "maybe") =>
      apiRequest("PUT", `/api/meetups/${meetupId}/rsvp`, { status }),
    onSuccess: invalidate,
  });

  const clearStatus = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/meetups/${meetupId}/rsvp`),
    onSuccess: invalidate,
  });

  const yourStatus = data?.yourStatus ?? null;
  const going = data?.going ?? [];
  const maybe = data?.maybe ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: FAINT }}
        >
          Are you coming?
        </p>
        <div className="grid grid-cols-3 gap-2">
          <PillButton
            label="Going"
            emoji="🌿"
            active={yourStatus === "going"}
            disabled={setStatus.isPending || clearStatus.isPending || isLoading}
            onClick={() => setStatus.mutate("going")}
          />
          <PillButton
            label="Maybe"
            emoji="🤔"
            active={yourStatus === "maybe"}
            disabled={setStatus.isPending || clearStatus.isPending || isLoading}
            onClick={() => setStatus.mutate("maybe")}
          />
          <PillButton
            label="Clear"
            emoji="—"
            active={false}
            dim
            disabled={
              yourStatus === null ||
              setStatus.isPending ||
              clearStatus.isPending ||
              isLoading
            }
            onClick={() => clearStatus.mutate()}
          />
        </div>
      </div>

      {(going.length > 0 || maybe.length > 0) && (
        <div className="flex flex-col gap-3">
          {going.length > 0 && (
            <AttendeeRowBlock title={`🌿 Going (${going.length})`} rows={going} />
          )}
          {maybe.length > 0 && (
            <AttendeeRowBlock title={`🤔 Maybe (${maybe.length})`} rows={maybe} />
          )}
        </div>
      )}
    </div>
  );
}

function PillButton({
  label,
  emoji,
  active,
  dim,
  disabled,
  onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  dim?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-40"
      style={{
        background: active
          ? "rgba(122,175,125,0.22)"
          : dim
            ? "rgba(143,175,150,0.06)"
            : "rgba(46,107,64,0.10)",
        border: `1px solid ${active ? "rgba(122,175,125,0.55)" : "rgba(46,107,64,0.25)"}`,
        color: active ? ACCENT : SOFT_TEXT,
      }}
    >
      <span style={{ marginRight: 6 }}>{emoji}</span>
      {label}
    </button>
  );
}

function AttendeeRowBlock({ title, rows }: { title: string; rows: AttendeeRow[] }) {
  return (
    <div>
      <p
        className="text-[11px] font-semibold mb-2"
        style={{ color: SOFT_TEXT }}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.userId} className="flex items-center gap-2.5">
            <Avatar name={r.name} avatarUrl={r.avatarUrl} size={26} />
            <span className="text-[13px]" style={{ color: SOFT_TEXT }}>
              {r.name || "Someone"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Compact avatar / initials bubble. Small enough for inline lists.
export function Avatar({
  name,
  avatarUrl,
  size = 24,
}: {
  name: string | null;
  avatarUrl: string | null;
  size?: number;
}) {
  const initials = useMemo(() => {
    const n = (name ?? "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  }, [name]);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ""}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(122,175,125,0.20)",
        border: "1px solid rgba(122,175,125,0.35)",
        color: ACCENT,
        fontSize: Math.max(10, size * 0.42),
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── Compact RSVP summary strip ─────────────────────────────────────────────
// Renders inline on the dashboard gathering card: small stacked avatars
// + "N going · M maybe". Reads from the dashboard's batch
// /api/meetups/rsvp-summary cache (queryKey: ["meetups-rsvp-summary"])
// — populated by useDashboardRsvpSummary below — so it never triggers
// its own fetch.

interface SummarySlot {
  goingCount: number;
  maybeCount: number;
  goingPreview: Array<{ userId: number; name: string | null; avatarUrl: string | null }>;
  maybePreview: Array<{ userId: number; name: string | null; avatarUrl: string | null }>;
  yourStatus: "going" | "maybe" | null;
}
interface SummaryResponse {
  meetups: Record<number, SummarySlot>;
}

export function RsvpSummaryStrip({
  meetupId,
  align = "left",
}: {
  meetupId: number;
  align?: "left" | "right";
}) {
  // Pull from the cached dashboard query. If the dashboard hasn't
  // primed it yet, render nothing — no fetch trip from the card.
  const qc = useQueryClient();
  const cache = qc.getQueryData<SummaryResponse>(["meetups-rsvp-summary"]);
  const slot = cache?.meetups?.[meetupId];
  if (!slot) return null;
  if (slot.goingCount === 0 && slot.maybeCount === 0) return null;

  const parts: string[] = [];
  if (slot.goingCount > 0) parts.push(`${slot.goingCount} going`);
  if (slot.maybeCount > 0) parts.push(`${slot.maybeCount} maybe`);

  // Stack the going-previews first, fall back to maybe-previews when
  // there are no goings (so a gathering with only "maybe" RSVPs still
  // surfaces those faces).
  const previewPool = slot.goingPreview.length > 0 ? slot.goingPreview : slot.maybePreview;
  const previews = previewPool.slice(0, 4);

  return (
    <div
      className={`flex items-center gap-2 mt-1.5 ${align === "right" ? "justify-end" : ""}`}
    >
      {previews.length > 0 && (
        <div className="flex" style={{ marginLeft: 0 }}>
          {previews.map((p, i) => (
            <div
              key={p.userId}
              style={{
                marginLeft: i === 0 ? 0 : -6,
                outline: "2px solid #0F2618",
                borderRadius: "50%",
              }}
            >
              <Avatar name={p.name} avatarUrl={p.avatarUrl} size={18} />
            </div>
          ))}
        </div>
      )}
      <span className="text-[11px] font-medium" style={{ color: FAINT }}>
        {parts.join(" · ")}
      </span>
    </div>
  );
}

// Hook the dashboard mounts once to prime the batch summary cache for
// every visible meetup. Returns nothing — its only job is to populate
// the ["meetups-rsvp-summary"] queryKey that RsvpSummaryStrip reads.
export function useDashboardRsvpSummary(meetupIds: number[]) {
  // Stable string so the query refetches only when the id set changes,
  // not on every re-render of the dashboard component.
  const idsKey = [...new Set(meetupIds)].sort((a, b) => a - b).join(",");
  useQuery<SummaryResponse>({
    queryKey: ["meetups-rsvp-summary", idsKey],
    queryFn: () => apiRequest("GET", `/api/meetups/rsvp-summary?ids=${idsKey}`),
    enabled: meetupIds.length > 0,
    staleTime: 30_000,
    // Mirror to the canonical short key so RsvpSummaryStrip can read
    // without juggling the params suffix.
    select: (data) => {
      const qc = (window as unknown as { __pq__?: { setQueryData?: (k: unknown, v: unknown) => void } }).__pq__;
      void qc;
      return data;
    },
    // Use onSuccess via React Query v5 — set the canonical cache key.
    // (queryClient.setQueryData is the cleanest path.)
  });
  // Side-effect: keep the canonical cache slot in sync. We can't
  // use the hook's `qc.setQueryData` inside the queryFn cleanly, so
  // do it in an effect.
  const qc = useQueryClient();
  const stored = qc.getQueryData<SummaryResponse>(["meetups-rsvp-summary", idsKey]);
  if (stored) qc.setQueryData(["meetups-rsvp-summary"], stored);
}
