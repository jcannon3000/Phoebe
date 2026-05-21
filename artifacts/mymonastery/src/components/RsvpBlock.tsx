import { useEffect, useMemo } from "react";
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
  // so changes propagate everywhere we render RSVP counts. The summary
  // is stored under TWO cache keys — the keyed query ["meetups-rsvp-
  // summary", idsKey] and the canonical mirror ["meetups-rsvp-summary"]
  // that RsvpSummaryStrip reads. Use a predicate so any cache entry
  // whose key starts with "meetups-rsvp-summary" is invalidated; that
  // covers both the keyed query AND the mirror without us having to
  // know what the current idsKey is.
  function invalidate() {
    qc.invalidateQueries({ queryKey: [`/api/meetups/${meetupId}/rsvps`] });
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === "meetups-rsvp-summary",
    });
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
            label="Interested"
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
            <AttendeeRowBlock title={`🤔 Interested (${maybe.length})`} rows={maybe} />
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
  if (slot.maybeCount > 0) parts.push(`${slot.maybeCount} interested`);

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
//
// Two cache slots are kept in sync:
//   • ["meetups-rsvp-summary", idsKey] — the React Query entry for
//     the actual fetch. Re-fires when the id set changes.
//   • ["meetups-rsvp-summary"]         — a canonical mirror with no
//     params suffix that RsvpSummaryStrip reads. Mirrored in a
//     useEffect so the write is observed by React (rather than the
//     during-render version which produced stale paints after an
//     RSVP toggle).
export function useDashboardRsvpSummary(meetupIds: number[]) {
  // Stable string so the query refetches only when the id set changes,
  // not on every re-render of the dashboard component.
  const idsKey = [...new Set(meetupIds)].sort((a, b) => a - b).join(",");
  const qc = useQueryClient();
  const { data } = useQuery<SummaryResponse>({
    queryKey: ["meetups-rsvp-summary", idsKey],
    queryFn: () => apiRequest("GET", `/api/meetups/rsvp-summary?ids=${idsKey}`),
    enabled: meetupIds.length > 0,
    staleTime: 30_000,
  });
  // Mirror the latest payload to the canonical key whenever it
  // changes. Effect (not in-render) so React's render cycle picks up
  // the update reliably and consumers re-paint after a mutation
  // invalidates either key.
  useEffect(() => {
    if (data) qc.setQueryData(["meetups-rsvp-summary"], data);
  }, [data, qc]);
}
