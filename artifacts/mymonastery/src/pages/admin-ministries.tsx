import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

// ── /admin/ministries — manage the ministry websites Phoebe scrapes ──────
//
// Beta-admin CRUD over ministry_sources (see routes/ministries.ts). Add a
// ministry by name + events-page URL; the server creates its prayer feed and
// runs an initial scrape. Scraped events arrive as drafts on that feed —
// tap "Review events" to confirm the date/time/location and publish.

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

type MinistrySource = {
  id: number;
  name: string;
  eventsUrl: string;
  feedId: number;
  enabled: boolean;
  lastStatus: string | null;
  lastSyncedAt: string | null;
  feedSlug: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never synced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `synced ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export default function AdminMinistriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin: isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isAdmin) setLocation("/dashboard");
  }, [user, isAdmin, authLoading, betaLoading, setLocation]);

  const listQ = useQuery<{ sources: MinistrySource[] }>({
    queryKey: ["/api/ministries"],
    queryFn: () => apiRequest("GET", "/api/ministries"),
    enabled: !!user && isAdmin,
  });
  const sources = listQ.data?.sources ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/ministries"] });
  const resetForm = () => { setName(""); setUrl(""); setEditingId(null); setError(null); };

  const createMut = useMutation({
    mutationFn: (body: { name: string; eventsUrl: string }) => apiRequest("POST", "/api/ministries", body),
    onSuccess: (r: { result?: { found: number; created: number } }) => {
      invalidate();
      resetForm();
      const res = r.result;
      if (res) setError(`Added. First scrape found ${res.found}, created ${res.created} draft${res.created === 1 ? "" : "s"}.`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't add the ministry."),
  });
  const updateMut = useMutation({
    mutationFn: (vars: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/ministries/${vars.id}`, vars.body),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save."),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/ministries/${id}`),
    onSuccess: invalidate,
  });
  const syncMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/ministries/${id}/sync`),
    onSuccess: invalidate,
  });
  const syncAllMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ministries/sync-all"),
    onSuccess: invalidate,
  });

  if (authLoading || betaLoading || !user || !isAdmin) return null;

  function submit() {
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) { setError("A name and an events-page URL are required."); return; }
    if (!/^https?:\/\//i.test(u)) { setError("The URL must start with http:// or https://"); return; }
    if (editingId != null) updateMut.mutate({ id: editingId, body: { name: n, eventsUrl: u } });
    else createMut.mutate({ name: n, eventsUrl: u });
  }
  function startEdit(s: MinistrySource) {
    setEditingId(s.id); setName(s.name); setUrl(s.eventsUrl); setError(null);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  const inputStyle = {
    background: "rgba(15,40,24,0.6)", border: "1px solid rgba(46,107,64,0.4)",
    color: WARM, fontFamily: FONT, outline: "none",
  } as const;
  const pill = "text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0";

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-24">
        <button onClick={() => setLocation("/admin/tools")} className="text-sm mb-3" style={{ color: SAGE, fontFamily: FONT }}>
          ← Admin tools
        </button>
        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>Scraped Ministries</h1>
        <p className="text-sm mb-5" style={{ color: SAGE, fontFamily: FONT }}>
          Add a ministry's events page; Phoebe scrapes upcoming events into its feed as drafts for you to review and publish.
        </p>

        {/* Add / edit form */}
        <div className="rounded-2xl p-4 mb-5" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)", fontFamily: FONT }}>
            {editingId != null ? "Edit ministry" : "Add a ministry"}
          </p>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            placeholder="Name, e.g. Rural & Migrant Ministry"
            className="w-full rounded-xl px-3.5 py-2.5 text-[15px] mb-2" style={inputStyle}
          />
          <input
            type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500}
            placeholder="Events page URL, e.g. https://ruralmigrantministry.org/events/"
            className="w-full rounded-xl px-3.5 py-2.5 text-[15px]" style={inputStyle}
          />
          {error && <p className="text-xs mt-2" style={{ color: "#E8B872", fontFamily: FONT }}>{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button" onClick={submit} disabled={createMut.isPending || updateMut.isPending}
              className="flex-1 text-sm font-semibold rounded-full py-2.5 disabled:opacity-50"
              style={{ background: "#2E6B40", color: WARM, fontFamily: FONT }}
            >
              {editingId != null
                ? (updateMut.isPending ? "Saving…" : "Save changes")
                : (createMut.isPending ? "Adding & scraping…" : "Add & scrape")}
            </button>
            {editingId != null && (
              <button type="button" onClick={resetForm} className="text-sm font-medium rounded-full px-4 py-2.5"
                style={{ background: "transparent", border: "1px solid rgba(46,107,64,0.4)", color: SAGE, fontFamily: FONT }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {sources.length > 1 && (
          <button
            type="button" onClick={() => syncAllMut.mutate()} disabled={syncAllMut.isPending}
            className="text-xs font-semibold rounded-full px-3.5 py-2 mb-4 disabled:opacity-50"
            style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0", fontFamily: FONT }}
          >
            {syncAllMut.isPending ? "Syncing all…" : "⟳ Sync all enabled"}
          </button>
        )}

        {listQ.isLoading && <p className="text-sm" style={{ color: SAGE, fontFamily: FONT }}>Loading…</p>}
        {!listQ.isLoading && sources.length === 0 && (
          <p className="text-sm" style={{ color: FAINT, fontFamily: FONT }}>No ministries yet — add one above.</p>
        )}

        <div className="flex flex-col gap-3">
          {sources.map((s) => {
            const busy = syncMut.isPending && syncMut.variables === s.id;
            return (
              <div key={s.id} className="rounded-xl px-4 py-3"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)", opacity: s.enabled ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{s.name}</p>
                    <p className="text-[11px] truncate" style={{ color: FAINT, fontFamily: FONT }}>{s.eventsUrl}</p>
                    <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                      {s.lastStatus ?? "not synced yet"} · {timeAgo(s.lastSyncedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateMut.mutate({ id: s.id, body: { enabled: !s.enabled } })}
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={s.enabled
                      ? { background: "rgba(46,107,64,0.25)", color: "#A8C5A0" }
                      : { background: "rgba(143,175,150,0.15)", color: "rgba(200,212,192,0.6)" }}
                  >
                    {s.enabled ? "On" : "Off"}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <button type="button" onClick={() => syncMut.mutate(s.id)} disabled={busy}
                    className={pill + " disabled:opacity-50"}
                    style={{ background: "#2E6B40", color: WARM, fontFamily: FONT }}>
                    {busy ? "Syncing…" : "Sync now"}
                  </button>
                  {s.feedSlug && (
                    <button type="button" onClick={() => setLocation(`/prayer-feeds/${s.feedSlug}/manage`)}
                      className={pill}
                      style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0", fontFamily: FONT }}>
                      Review events →
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(s)}
                    className={pill}
                    style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0", fontFamily: FONT }}>
                    Edit
                  </button>
                  <button type="button"
                    onClick={() => { if (typeof window !== "undefined" && !window.confirm(`Remove "${s.name}" from scraping? (Its feed + published events stay.)`)) return; delMut.mutate(s.id); }}
                    className={pill}
                    style={{ background: "transparent", border: "1px solid rgba(193,154,58,0.4)", color: "#E8B872", fontFamily: FONT }}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
