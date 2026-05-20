import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, X, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Admin-only settings page for a single gathering. Reached via the
// gear icon in the gathering detail modal (community-detail page).
//
// Scope:
//   - Multi-community share: list / attach / detach additional
//     communities the caller admins.
//   - Delete the gathering entirely (with confirm step).
//
// Editing the gathering's name / time / description lives elsewhere
// (tradition-new flow) — this page is just for the things that don't
// fit in the small detail-modal footprint.
const FONT = "'Space Grotesk', sans-serif";

type ShareRow = { id: number; name: string; slug: string; emoji: string | null };
type Gathering = {
  id: number;
  name: string;
  ownerId?: number;
  groupId?: number | null;
  description: string | null;
  meetingUrl: string | null;
  location: string | null;
};

export default function GatheringSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ritualId = id ? parseInt(id, 10) : NaN;

  // The gathering itself — for the name in the header + the
  // post-delete redirect target (back to the host community).
  const ritualQ = useQuery<Gathering>({
    queryKey: [`/api/rituals/${ritualId}`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}`),
    enabled: Number.isFinite(ritualId),
  });

  // Communities this gathering is shared with.
  const shareQ = useQuery<{ primary: ShareRow | null; additional: ShareRow[] }>({
    queryKey: [`/api/rituals/${ritualId}/groups`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}/groups`),
    enabled: Number.isFinite(ritualId),
  });

  // All communities the viewer admins — the picker only offers the
  // ones not already linked.
  const myGroupsQ = useQuery<{ groups: Array<{ id: number; name: string; slug: string; emoji: string | null; myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const myAdminGroups = (myGroupsQ.data?.groups ?? []).filter(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
  const linkedIds = new Set<number>([
    ...(shareQ.data?.primary ? [shareQ.data.primary.id] : []),
    ...((shareQ.data?.additional ?? []).map((r) => r.id)),
  ]);
  const addable = myAdminGroups.filter((g) => !linkedIds.has(g.id));

  const attach = useMutation({
    mutationFn: (groupId: number) =>
      apiRequest("POST", `/api/rituals/${ritualId}/groups`, { groupId }),
    onSuccess: (_, groupId) => {
      qc.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}/groups`] });
      // Invalidate any community gatherings list this might surface in.
      const justAdded = myAdminGroups.find((g) => g.id === groupId);
      if (justAdded) qc.invalidateQueries({ queryKey: [`/api/groups/${justAdded.slug}/gatherings`] });
      toast({ title: "Community added", description: "It now shows on their dashboard." });
    },
    onError: () => toast({ title: "Couldn't add community", variant: "destructive" }),
  });
  const detach = useMutation({
    mutationFn: (groupId: number) =>
      apiRequest("DELETE", `/api/rituals/${ritualId}/groups/${groupId}`),
    onSuccess: (_, groupId) => {
      qc.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}/groups`] });
      const justRemoved = (shareQ.data?.additional ?? []).find((r) => r.id === groupId);
      if (justRemoved) qc.invalidateQueries({ queryKey: [`/api/groups/${justRemoved.slug}/gatherings`] });
      toast({ title: "Community removed" });
    },
    onError: () => toast({ title: "Couldn't remove community", variant: "destructive" }),
  });

  const deleteRitual = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/rituals/${ritualId}`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ title: "Gathering deleted" });
      // Land back on the primary community (or home if we somehow lost it).
      const home = shareQ.data?.primary?.slug
        ? `/communities/${shareQ.data.primary.slug}`
        : "/";
      setLocation(home);
    },
    onError: () => toast({ title: "Couldn't delete gathering", variant: "destructive" }),
  });

  const [pendingAddId, setPendingAddId] = useState<number | "">("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!Number.isFinite(ritualId)) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-12">
          <p className="text-sm" style={{ color: "#C8D4C0" }}>Invalid gathering.</p>
        </div>
      </Layout>
    );
  }

  const primary = shareQ.data?.primary ?? null;
  const additional = shareQ.data?.additional ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-16">
        {/* Header — back link to the host community */}
        <button
          type="button"
          onClick={() => {
            if (primary) setLocation(`/communities/${primary.slug}`);
            else window.history.back();
          }}
          className="flex items-center gap-1 text-[12px] font-medium mb-3 transition-opacity hover:opacity-80"
          style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT, cursor: "pointer" }}
        >
          <ChevronLeft size={14} />
          {primary ? `Back to ${primary.emoji ?? "⛪"} ${primary.name}` : "Back"}
        </button>

        <p
          className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1"
          style={{ color: "rgba(200,212,192,0.55)" }}
        >
          Gathering settings
        </p>
        <h1 className="text-2xl font-bold mb-6" style={{ color: "#F0EDE6", fontFamily: FONT, letterSpacing: "-0.01em" }}>
          {ritualQ.data?.name ?? "Loading…"}
        </h1>

        {/* ─── Shared with ────────────────────────────────────────────── */}
        <section
          className="rounded-2xl px-5 py-4 mb-4"
          style={{ background: "#0F2618", border: "1px solid rgba(111,175,133,0.25)" }}
        >
          <h2 className="text-base font-semibold mb-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
            Shared with
          </h2>
          <p className="text-[12px] mb-3" style={{ color: "rgba(143,175,150,0.75)" }}>
            Other communities that see this gathering on their dashboard.
          </p>

          {/* Primary community — read-only badge so the user can see
              who hosts this; it can't be removed from this page. */}
          {primary && (
            <div className="mb-3">
              <p
                className="text-[9px] font-bold uppercase tracking-[0.14em] mb-1.5"
                style={{ color: "rgba(200,212,192,0.45)" }}
              >
                Primary host
              </p>
              <span
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(46,107,64,0.25)",
                  border: "1px solid rgba(46,107,64,0.5)",
                  color: "#F0EDE6",
                  fontFamily: FONT,
                }}
              >
                {primary.emoji ?? "⛪"} {primary.name}
              </span>
            </div>
          )}

          {/* Additional communities — admins can detach. */}
          <p
            className="text-[9px] font-bold uppercase tracking-[0.14em] mb-1.5"
            style={{ color: "rgba(200,212,192,0.45)" }}
          >
            Also shared with
          </p>
          {additional.length === 0 ? (
            <p className="text-[12px] italic mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
              No additional communities yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {additional.map((row) => (
                <span
                  key={row.id}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(46,107,64,0.18)",
                    border: "1px solid rgba(46,107,64,0.4)",
                    color: "#F0EDE6",
                    fontFamily: FONT,
                  }}
                >
                  <span>{row.emoji ?? "⛪"} {row.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => detach.mutate(row.id)}
                    disabled={detach.isPending}
                    className="ml-0.5 rounded-full hover:opacity-80 transition-opacity"
                    style={{ color: "rgba(200,212,192,0.65)", cursor: "pointer" }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add picker — admins only see groups they admin and that
              aren't already linked. */}
          {addable.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={pendingAddId}
                onChange={(e) => setPendingAddId(e.target.value ? Number(e.target.value) : "")}
                className="flex-1 text-[13px] px-3 py-2 rounded-lg"
                style={{
                  background: "rgba(200,212,192,0.06)",
                  border: "1px solid rgba(200,212,192,0.18)",
                  color: "#F0EDE6",
                  fontFamily: FONT,
                }}
              >
                <option value="">+ Add a community…</option>
                {addable.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.emoji ?? "⛪"} {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pendingAddId || attach.isPending}
                onClick={() => {
                  if (typeof pendingAddId === "number") {
                    attach.mutate(pendingAddId);
                    setPendingAddId("");
                  }
                }}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                style={{
                  background: "#2D5E3F",
                  color: "#F0EDE6",
                  border: "1px solid rgba(46,107,64,0.6)",
                  fontFamily: FONT,
                  cursor: pendingAddId ? "pointer" : "not-allowed",
                }}
              >
                {attach.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          ) : (
            <p className="text-[12px] italic" style={{ color: "rgba(143,175,150,0.55)" }}>
              You don't admin any other communities to share with.
            </p>
          )}
        </section>

        {/* ─── Danger zone ─────────────────────────────────────────────── */}
        <section
          className="rounded-2xl px-5 py-4"
          style={{ background: "rgba(61,42,16,0.25)", border: "1px solid rgba(196,122,101,0.35)" }}
        >
          <h2 className="text-base font-semibold mb-1" style={{ color: "#F5C9B8", fontFamily: FONT }}>
            Delete this gathering
          </h2>
          <p className="text-[12px] mb-3" style={{ color: "rgba(245,201,184,0.7)" }}>
            Permanently removes the gathering, every scheduled meetup, and
            its calendar events for invitees. This can't be undone.
          </p>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90"
              style={{
                background: "rgba(196,122,101,0.18)",
                border: "1px solid rgba(196,122,101,0.45)",
                color: "#F5C9B8",
                fontFamily: FONT,
                cursor: "pointer",
              }}
            >
              <Trash2 size={14} />
              Delete gathering
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => deleteRitual.mutate()}
                disabled={deleteRitual.isPending}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{
                  background: "#7A3F33",
                  border: "1px solid rgba(196,122,101,0.55)",
                  color: "#F5C9B8",
                  fontFamily: FONT,
                  cursor: "pointer",
                }}
              >
                {deleteRitual.isPending ? "Deleting…" : "Yes, delete forever"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[13px] font-medium px-3 py-2"
                style={{ color: "rgba(245,201,184,0.7)", fontFamily: FONT, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
