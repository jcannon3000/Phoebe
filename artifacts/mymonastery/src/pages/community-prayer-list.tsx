import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

/**
 * /communities/:slug/prayer-list — the parish prayer list, and the form that
 * feeds it.
 *
 * One page for members and leaders, because they are looking at the same list;
 * a leader simply also sees the queue. Splitting it would mean a leader had to
 * remember which screen showed the real list.
 *
 * WHAT A MEMBER IS TOLD, plainly and before they type: a leader reads this
 * first. That is not a legal disclaimer, it is the thing that changes what
 * people write — someone about to name a neighbour's diagnosis should know a
 * person will read it before a congregation does.
 */

const BG = "#0A1A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.9)";
const FAINT = "rgba(200,212,192,0.62)";
const BORDER = "rgba(200,212,192,0.18)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Req = {
  id: number; body: string; originalBody: string | null; status: string;
  submitterName: string | null; createdAt: string; sortOrder: number;
};

export default function CommunityPrayerListPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/communities/:slug/prayer-list");
  const slug = params?.slug ?? "";
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const list = useQuery<Req[]>({
    queryKey: [`/api/groups/${slug}/prayer-list`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-list`),
    enabled: !!slug,
  });

  /**
   * The queue. 403 for a non-admin, which is the answer — `queue.data` stays
   * undefined and the whole leader section simply isn't rendered. No separate
   * "am I an admin" call to get out of step with the real permission.
   */
  const queue = useQuery<Req[]>({
    queryKey: [`/api/groups/${slug}/prayer-list/all`, "pending"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-list/all?status=pending`),
    enabled: !!slug,
    retry: false,
  });
  const isLeader = Array.isArray(queue.data);

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/prayer-list`, { body: draft.trim() }),
    onSuccess: () => { setDraft(""); setSent(true); void queue.refetch(); },
  });

  const review = useMutation({
    mutationFn: (v: { id: number; status?: string; body?: string; sortOrder?: number }) =>
      apiRequest("PATCH", `/api/groups/${slug}/prayer-list/${v.id}`, v),
    onSuccess: () => { setEditing(null); void queue.refetch(); void list.refetch(); },
  });

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14,
    background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
    color: WARM, fontFamily: FONT, fontSize: 15, outline: "none", lineHeight: 1.6,
  };
  const pill = (label: string, onClick: () => void, tone: "go" | "quiet" | "warn" = "quiet") => (
    <button
      type="button" onClick={onClick}
      style={{
        borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: FONT,
        background: tone === "go" ? "rgba(46,107,64,0.9)" : "transparent",
        color: tone === "warn" ? "rgba(232,160,160,0.9)" : WARM,
        border: `1px solid ${tone === "go" ? "rgba(46,107,64,0.6)" : BORDER}`,
      }}
    >{label}</button>
  );

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 40px)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <button
          type="button" onClick={() => setLocation(`/communities/${slug}`)}
          style={{ background: "transparent", border: "none", color: FAINT, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 2px", marginBottom: 10 }}
        >← Back</button>

        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Prayer list</h1>
        <p style={{ color: FAINT, fontSize: 14, lineHeight: 1.55, margin: "0 0 24px" }}>
          What this community is carrying together.
        </p>

        {/* ── Ask for prayer ─────────────────────────────────────────────── */}
        <textarea
          value={draft} onChange={(e) => { setDraft(e.target.value); setSent(false); }}
          placeholder="Ask for prayer…" rows={4}
          style={{ ...field, marginBottom: 8, resize: "vertical" }}
        />
        <p style={{ color: FAINT, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 12px" }}>
          A leader reads this before it goes on the list. If you're asking on
          someone else's behalf, it's kinder to leave out their name and anything
          medical unless you know they'd want it shared.
        </p>
        {sent && (
          <p style={{ color: SAGE, fontSize: 13.5, margin: "0 0 12px" }}>
            Sent to your leader. It'll appear once they've read it.
          </p>
        )}
        <button
          type="button" disabled={!draft.trim() || submit.isPending} onClick={() => submit.mutate()}
          style={{
            width: "100%", borderRadius: 999, padding: "13px 20px", marginBottom: 32,
            background: draft.trim() ? "rgba(46,107,64,0.9)" : "rgba(240,237,230,0.06)",
            color: draft.trim() ? WARM : "rgba(240,237,230,0.42)",
            border: `1px solid ${draft.trim() ? "rgba(46,107,64,0.6)" : BORDER}`,
            fontFamily: FONT, fontSize: 15.5, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default",
          }}
        >
          {submit.isPending ? "Sending…" : "Ask for prayer"}
        </button>

        {/* ── The leader's queue ─────────────────────────────────────────── */}
        {isLeader && (queue.data ?? []).length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, margin: "0 0 10px" }}>
              Waiting for you · {(queue.data ?? []).length}
            </p>
            {(queue.data ?? []).map((r) => (
              <div key={r.id} style={{ borderRadius: 14, padding: 14, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, marginBottom: 10 }}>
                {editing === r.id ? (
                  <>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} style={{ ...field, marginBottom: 10 }} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {pill("Save & approve", () => review.mutate({ id: r.id, body: editText, status: "approved" }), "go")}
                      {pill("Cancel", () => setEditing(null))}
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{r.body}</p>
                    <p style={{ color: FAINT, fontSize: 12, margin: "0 0 12px" }}>
                      {r.submitterName ?? "Someone"} · {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {pill("Add to the list", () => review.mutate({ id: r.id, status: "approved" }), "go")}
                      {/* Editing is the point, not a nicety — see the route's
                          own note on third-party detail. */}
                      {pill("Edit first", () => { setEditing(r.id); setEditText(r.body); })}
                      {pill("Not this one", () => review.mutate({ id: r.id, status: "declined" }), "warn")}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── The list itself ────────────────────────────────────────────── */}
        <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, margin: "0 0 10px" }}>
          We are praying for
        </p>
        {(list.data ?? []).length === 0 && (
          <p style={{ color: FAINT, fontSize: 14 }}>Nothing on the list yet.</p>
        )}
        {(list.data ?? []).map((r) => (
          <div key={r.id} style={{ borderRadius: 14, padding: 14, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, marginBottom: 10 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{r.body}</p>
            {isLeader && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {pill("Move up", () => review.mutate({ id: r.id, sortOrder: r.sortOrder - 1 }))}
                {pill("Move down", () => review.mutate({ id: r.id, sortOrder: r.sortOrder + 1 }))}
                {pill("Answered", () => review.mutate({ id: r.id, status: "archived" }))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
