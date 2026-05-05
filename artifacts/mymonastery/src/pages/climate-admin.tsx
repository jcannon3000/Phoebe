import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

interface Entry {
  id: number;
  feedId: number;
  entryDate: string; // YYYY-MM-DD in feed tz
  title: string;
  body: string;
  scriptureRef: string | null;
  state: "draft" | "scheduled" | "published";
  prayCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EntriesResponse {
  entries: Entry[];
  today: string;
}

// Curation portal for the daily climate prayer entries. Beta-admin gated
// (matches the requireClimateAdmin middleware on the API). List view
// shows recent + upcoming entries; tap one to edit, or tap "New entry"
// to author a future date.
export default function ClimateAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();

  // Editor state. `editingDate` doubles as the "is the editor open" flag.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scriptureRef, setScriptureRef] = useState("");
  const [state, setState] = useState<"draft" | "scheduled" | "published">("draft");

  const queryClient = useQueryClient();

  // Gate: redirect non-admins away. Note we also gate the API server-side,
  // so this is just UX hygiene to avoid empty-state confusion.
  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!betaLoading && user && !rawIsAdmin) setLocation("/climate");
  }, [user, authLoading, rawIsAdmin, betaLoading, setLocation]);

  const { data, isLoading } = useQuery<EntriesResponse>({
    queryKey: ["/api/climate/admin/entries"],
    queryFn: () => apiRequest("GET", "/api/climate/admin/entries"),
    enabled: !!user && rawIsAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/climate/admin/entries", {
        entryDate: editingDate,
        title,
        body,
        scriptureRef: scriptureRef || null,
        state,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/entries"] });
      // Also invalidate the public today endpoint so an admin who just
      // published today's entry sees it on /climate without a hard reload.
      queryClient.invalidateQueries({ queryKey: ["/api/climate/today"] });
      closeEditor();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (date: string) =>
      apiRequest("DELETE", `/api/climate/admin/entries/${date}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/admin/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/climate/today"] });
      closeEditor();
    },
  });

  function openEditorForDate(date: string) {
    const existing = (data?.entries ?? []).find((e) => e.entryDate === date);
    setEditingDate(date);
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    setScriptureRef(existing?.scriptureRef ?? "");
    setState(existing?.state ?? "draft");
  }

  function openNewEntry() {
    // Default date: tomorrow in the feed's tz (which we approximate via
    // the server-provided "today" string).
    const today = data?.today ?? new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(today + "T00:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    setEditingDate(dateStr);
    setTitle("");
    setBody("");
    setScriptureRef("");
    setState("draft");
  }

  function closeEditor() {
    setEditingDate(null);
  }

  if (authLoading || !user || !rawIsAdmin) {
    return <Layout><div /></Layout>;
  }

  const entries = data?.entries ?? [];
  const today = data?.today ?? "";

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
              The daily prayer for creation. Authored once, sent to every
              enrolled user at 7am local.
            </p>
          </div>

          <Link
            href="/climate"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            ← View
          </Link>
        </div>

        {/* New entry button */}
        {!editingDate && (
          <button
            onClick={openNewEntry}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors"
            style={{
              background: "rgba(46,107,64,0.15)",
              border: "1px dashed rgba(46,107,64,0.3)",
              color: "#8FAF96",
            }}
          >
            + New entry
          </button>
        )}

        {/* Editor */}
        {editingDate && (
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
                {entries.find((e) => e.entryDate === editingDate) ? "Edit entry" : "New entry"}
              </p>
              <button
                onClick={closeEditor}
                className="text-xs"
                style={{ color: "#8FAF96" }}
              >
                Cancel
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                Date (in feed timezone)
              </span>
              <input
                type="date"
                value={editingDate}
                onChange={(e) => setEditingDate(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm bg-transparent"
                style={{
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                  colorScheme: "dark",
                }}
              />
            </label>

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
                Prayer body
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="The prayer itself. This is what people read in the slideshow."
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
                Scripture reference (optional)
              </span>
              <input
                type="text"
                value={scriptureRef}
                onChange={(e) => setScriptureRef(e.target.value)}
                placeholder="e.g. Romans 8:19–22"
                className="px-3 py-2 rounded-lg text-sm bg-transparent"
                style={{
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                }}
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                State
              </span>
              <div className="flex gap-1.5">
                {(["draft", "scheduled", "published"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setState(s)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors"
                    style={{
                      background: state === s ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.12)",
                      color: state === s ? "#F0EDE6" : "#8FAF96",
                      border: "1px solid rgba(46,107,64,0.3)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
                Only <span className="font-semibold">published</span> entries appear on the climate tab and trigger the 7am push.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={
                  saveMutation.isPending ||
                  !title.trim() ||
                  !body.trim() ||
                  !editingDate
                }
                className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
              {entries.find((e) => e.entryDate === editingDate) && (
                <button
                  onClick={() => {
                    if (window.confirm("Delete this entry?")) {
                      deleteMutation.mutate(editingDate);
                    }
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

        {/* Entry list */}
        {!editingDate && (
          <div className="flex flex-col gap-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mt-2"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Entries
            </p>
            {isLoading ? (
              <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>
                Loading…
              </p>
            ) : entries.length === 0 ? (
              <p className="text-sm" style={{ color: "#8FAF96" }}>
                No entries in this window. Tap "New entry" to add one.
              </p>
            ) : (
              entries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => openEditorForDate(e.entryDate)}
                  className="text-left rounded-2xl px-4 py-3 transition-colors"
                  style={{
                    background:
                      e.entryDate === today
                        ? "rgba(46,107,64,0.18)"
                        : "rgba(46,107,64,0.08)",
                    border: "1px solid rgba(46,107,64,0.2)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="text-xs font-medium"
                      style={{ color: "#8FAF96" }}
                    >
                      {e.entryDate}
                      {e.entryDate === today ? " · today" : ""}
                    </p>
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold"
                      style={{
                        color:
                          e.state === "published"
                            ? "#A8C5A0"
                            : e.state === "scheduled"
                              ? "#C8B978"
                              : "rgba(143,175,150,0.6)",
                      }}
                    >
                      {e.state}
                    </span>
                  </div>
                  <p
                    className="text-sm font-semibold mt-1"
                    style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {e.title}
                  </p>
                  {e.body && (
                    <p
                      className="text-xs mt-1 line-clamp-2 italic"
                      style={{
                        color: "rgba(200,212,192,0.6)",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {e.body}
                    </p>
                  )}
                  {e.state === "published" && e.prayCount > 0 && (
                    <p
                      className="text-[11px] mt-1.5"
                      style={{ color: "rgba(143,175,150,0.5)" }}
                    >
                      {e.prayCount} {e.prayCount === 1 ? "person" : "people"} prayed
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
