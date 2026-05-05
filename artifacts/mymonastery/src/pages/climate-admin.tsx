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
  createdAt: string;
}

interface IntercessionsResponse {
  intercessions: Intercession[];
  subscriberCount: number;
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
  const [scheduledTime, setScheduledTime] = useState("07:00");
  const [frequency, setFrequency] = useState("daily");

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

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/climate/admin/intercessions", {
        title,
        fullText,
        scheduledTime,
        frequency,
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
        scheduledTime,
        frequency,
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
      setScheduledTime("07:00");
      setFrequency("daily");
    } else {
      setTitle(target.intercessionTopic ?? target.name ?? "");
      setFullText(target.intercessionFullText ?? "");
      setScheduledTime(target.scheduledTime ?? "07:00");
      setFrequency(target.frequency ?? "daily");
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

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
                  Scheduled time
                </span>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
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
                  Frequency
                </span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm bg-transparent"
                  style={{
                    border: "1px solid rgba(46,107,64,0.4)",
                    color: "#F0EDE6",
                    colorScheme: "dark",
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
            </div>

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
                  <p className="text-[11px] mt-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    {i.frequency} · {i.scheduledTime}
                  </p>
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
      </div>
    </Layout>
  );
}
