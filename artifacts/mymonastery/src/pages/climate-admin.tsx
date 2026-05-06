import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

interface Intercession {
  id: number;
  name: string;
  intention: string;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  scheduledTime: string;
  frequency: string;
  state: string;
  learnMoreUrl: string | null;
  createdAt: string;
}

interface IntercessionsResponse {
  intercessions: Intercession[];
  subscriberCount: number;
}

interface Walk {
  id: number;
  title: string | null;
  content: string;
  eventAt: string;
  location: string | null;
  createdAt: string;
}

interface WalksResponse {
  walks: Walk[];
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Curation portal for the climate feed's community intercessions. Beta-
// admin gated. Authoring uses the same primitives as a regular community
// intercession (shared_moments with templateType="intercession") — the
// only difference is they're scoped to the climate feed instead of a
// group, so subscribers receive them on the regular dashboard +
// prayer-mode slideshow.
export default function ClimateAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();

  // Editor state. `editing` is the row being edited, or "new" for create.
  const [editing, setEditing] = useState<Intercession | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [fullText, setFullText] = useState("");
  const [learnMoreUrl, setLearnMoreUrl] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!betaLoading && user && !rawIsAdmin) setLocation("/dashboard");
  }, [user, authLoading, rawIsAdmin, betaLoading, setLocation]);

  const { data, isLoading } = useQuery<IntercessionsResponse>({
    queryKey: ["/api/climate/admin/intercessions"],
    queryFn: () => apiRequest("GET", "/api/climate/admin/intercessions"),
    enabled: !!user && rawIsAdmin,
  });

  // Server defaults handle scheduledTime + frequency since they're
  // meaningless for feed intercessions — the moment lives in the prayer
  // list whenever the user prays, no per-intercession bell window.
  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/climate/admin/intercessions", {
        title,
        fullText,
        learnMoreUrl: learnMoreUrl || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/intercessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      closeEditor();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/climate/admin/intercessions/${id}`, {
        title,
        fullText,
        learnMoreUrl: learnMoreUrl || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/intercessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      closeEditor();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/climate/admin/intercessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/intercessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      closeEditor();
    },
  });

  function openEditor(target: Intercession | "new") {
    setEditing(target);
    if (target === "new") {
      setTitle("");
      setFullText("");
      setLearnMoreUrl("");
    } else {
      setTitle(target.intercessionTopic ?? target.name ?? "");
      setFullText(target.intercessionFullText ?? "");
      setLearnMoreUrl(target.learnMoreUrl ?? "");
    }
  }

  function closeEditor() {
    setEditing(null);
  }

  function handleSave() {
    if (!editing) return;
    if (editing === "new") {
      createMutation.mutate();
    } else {
      updateMutation.mutate(editing.id);
    }
  }

  if (authLoading || !user || !rawIsAdmin) {
    return <Layout><div /></Layout>;
  }

  const intercessions = data?.intercessions ?? [];
  const subscriberCount = data?.subscriberCount ?? 0;
  const active = intercessions.filter(i => i.state !== "archived");
  const archived = intercessions.filter(i => i.state === "archived");

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Admin
            </p>
            <h1
              className="text-2xl font-bold"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
                letterSpacing: "-0.03em",
              }}
            >
              Curate Phoebe Climate
            </h1>
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              {subscriberCount === 0
                ? "Climate intercessions surface on every subscriber's dashboard."
                : `${subscriberCount} ${subscriberCount === 1 ? "person is subscribed" : "people are subscribed"}.`}
            </p>
          </div>

          <Link
            href="/dashboard"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            ← Dashboard
          </Link>
        </div>

        {/* New intercession button */}
        {!editing && (
          <button
            onClick={() => openEditor("new")}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors"
            style={{
              background: "rgba(46,107,64,0.15)",
              border: "1px dashed rgba(46,107,64,0.3)",
              color: "#8FAF96",
            }}
          >
            + New intercession
          </button>
        )}

        {/* Editor */}
        {editing && (
          <div
            className="rounded-2xl p-5 flex flex-col gap-3"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.3)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {editing === "new" ? "New intercession" : "Edit intercession"}
              </p>
              <button onClick={closeEditor} className="text-xs" style={{ color: "#8FAF96" }}>
                Cancel
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. For the rising waters"
                className="px-3 py-2 rounded-lg text-sm bg-transparent"
                style={{
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                Prayer text
              </span>
              <textarea
                value={fullText}
                onChange={(e) => setFullText(e.target.value)}
                placeholder="The prayer body. This is what subscribers read in the slideshow."
                rows={6}
                className="px-3 py-2 rounded-lg text-sm bg-transparent resize-none italic"
                style={{
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                Learn-more link (optional)
              </span>
              <input
                type="url"
                value={learnMoreUrl}
                onChange={(e) => setLearnMoreUrl(e.target.value)}
                placeholder="https://grist.org/article-about-this-issue"
                className="px-3 py-2 rounded-lg text-sm bg-transparent"
                style={{
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                }}
              />
              <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.5)" }}>
                Surfaces as a "Read more" link on the slide.
              </span>
            </label>

            <div className="flex items-center justify-between gap-2 mt-2">
              <button
                onClick={handleSave}
                disabled={saving || !title.trim() || !fullText.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {editing !== "new" && (
                <button
                  onClick={() => {
                    if (window.confirm("Archive this intercession? It will stop showing on subscribers' dashboards.")) {
                      archiveMutation.mutate(editing.id);
                    }
                  }}
                  disabled={archiveMutation.isPending}
                  className="text-xs"
                  style={{ color: "#E89B9B" }}
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active intercessions */}
        {!editing && (
          <div className="flex flex-col gap-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mt-2"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Active
            </p>
            {isLoading ? (
              <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>Loading…</p>
            ) : active.length === 0 ? (
              <p className="text-sm" style={{ color: "#8FAF96" }}>
                No active intercessions yet. Tap "New intercession" to add one.
              </p>
            ) : (
              active.map((i) => (
                <button
                  key={i.id}
                  onClick={() => openEditor(i)}
                  className="text-left rounded-2xl px-4 py-3 transition-colors"
                  style={{
                    background: "rgba(46,107,64,0.10)",
                    border: "1px solid rgba(46,107,64,0.18)",
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {i.intercessionTopic ?? i.name}
                  </p>
                  {i.intercessionFullText && (
                    <p
                      className="text-xs mt-1 line-clamp-2 italic"
                      style={{
                        color: "rgba(200,212,192,0.6)",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {i.intercessionFullText}
                    </p>
                  )}
                </button>
              ))
            )}

            {/* Archived */}
            {archived.length > 0 && (
              <>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mt-6"
                  style={{ color: "rgba(200,212,192,0.4)" }}
                >
                  Archived
                </p>
                {archived.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => openEditor(i)}
                    className="text-left rounded-2xl px-4 py-3 transition-colors opacity-60"
                    style={{
                      background: "rgba(200,212,192,0.04)",
                      border: "1px solid rgba(46,107,64,0.12)",
                    }}
                  >
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {i.intercessionTopic ?? i.name}
                    </p>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Prayer walks — feed-scoped events. Same shape as a community
            announcement with kind=prayer_walk, just attached to the
            climate feed instead of a group. */}
        {!editing && <WalksSection />}
      </div>
    </Layout>
  );
}

// ─── Prayer walks admin section ────────────────────────────────────────────
function WalksSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Walk | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [location, setLocation] = useState("");

  const { data, isLoading } = useQuery<WalksResponse>({
    queryKey: ["/api/climate/admin/walks"],
    queryFn: () => apiRequest("GET", "/api/climate/admin/walks"),
  });

  function openEditor(target: Walk | "new") {
    setEditing(target);
    if (target === "new") {
      setTitle("");
      setContent("");
      setEventAt("");
      setLocation("");
    } else {
      setTitle(target.title ?? "");
      setContent(target.content ?? "");
      setEventAt(isoToLocalInput(target.eventAt));
      setLocation(target.location ?? "");
    }
  }
  function closeEditor() { setEditing(null); }

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/climate/admin/walks", {
        title,
        content,
        eventAt: eventAt ? new Date(eventAt).toISOString() : undefined,
        location: location || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/climate/walks"] });
      closeEditor();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/climate/admin/walks/${id}`, {
        title,
        content,
        eventAt: eventAt ? new Date(eventAt).toISOString() : undefined,
        location: location || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/climate/walks"] });
      closeEditor();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/climate/admin/walks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/climate/walks"] });
      closeEditor();
    },
  });

  function handleSave() {
    if (!editing) return;
    if (editing === "new") createMutation.mutate();
    else updateMutation.mutate(editing.id);
  }

  const walks = data?.walks ?? [];
  const now = Date.now();
  const upcoming = walks.filter(w => new Date(w.eventAt).getTime() >= now);
  const past = walks.filter(w => new Date(w.eventAt).getTime() < now);
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-2 mt-8">
      <div className="flex items-center justify-between mb-1">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(200,212,192,0.4)" }}
        >
          Prayer walks
        </p>
        {!editing && (
          <button
            onClick={() => openEditor("new")}
            className="text-xs font-semibold"
            style={{ color: "#A8C5A0" }}
          >
            + Schedule a walk
          </button>
        )}
      </div>

      {editing && (
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <p
              className="text-sm font-semibold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {editing === "new" ? "New prayer walk" : "Edit prayer walk"}
            </p>
            <button onClick={closeEditor} className="text-xs" style={{ color: "#8FAF96" }}>
              Cancel
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Walk title (e.g. Prayer along the Anacostia)"
            className="px-3 py-2 rounded-lg text-sm bg-transparent"
            style={{ border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
          />
          <input
            type="datetime-local"
            value={eventAt}
            onChange={e => setEventAt(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-transparent"
            style={{ border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6", colorScheme: "dark" }}
          />
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (e.g. Lincoln Park, DC)"
            className="px-3 py-2 rounded-lg text-sm bg-transparent"
            style={{ border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Describe the walk — what to expect, what to bring..."
            rows={4}
            className="px-3 py-2 rounded-lg text-sm bg-transparent resize-none"
            style={{ border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
          />

          <div className="flex items-center justify-between gap-2 mt-2">
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !content.trim() || !eventAt}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {editing !== "new" && (
              <button
                onClick={() => {
                  if (window.confirm("Delete this walk?")) deleteMutation.mutate(editing.id);
                }}
                disabled={deleteMutation.isPending}
                className="text-xs"
                style={{ color: "#E89B9B" }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {!editing && (
        <>
          {isLoading ? (
            <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>Loading…</p>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No walks scheduled. Tap "Schedule a walk" to add one.
            </p>
          ) : (
            <>
              {upcoming.map(w => (
                <button
                  key={w.id}
                  onClick={() => openEditor(w)}
                  className="text-left rounded-2xl px-4 py-3 transition-colors"
                  style={{
                    background: "rgba(46,107,64,0.10)",
                    border: "1px solid rgba(46,107,64,0.18)",
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {w.title ?? "Prayer walk"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                    {new Date(w.eventAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {w.location ? ` · ${w.location}` : ""}
                  </p>
                </button>
              ))}
              {past.length > 0 && (
                <>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mt-4"
                    style={{ color: "rgba(200,212,192,0.4)" }}
                  >
                    Past
                  </p>
                  {past.map(w => (
                    <button
                      key={w.id}
                      onClick={() => openEditor(w)}
                      className="text-left rounded-2xl px-4 py-3 opacity-60"
                      style={{
                        background: "rgba(200,212,192,0.04)",
                        border: "1px solid rgba(46,107,64,0.12)",
                      }}
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {w.title ?? "Prayer walk"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                        {new Date(w.eventAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
