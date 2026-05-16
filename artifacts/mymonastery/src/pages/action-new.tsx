import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";

// ── New action ───────────────────────────────────────────────────────────────
// Admin-only form for creating a community "action" (an advocacy /
// community-action event). Reached from the dashboard's admin compose
// menu. On submit the server fans out an on-creation push to the whole
// community and schedules the week-before / day-before reminders.

const FONT = "'Space Grotesk', sans-serif";

const INPUT_STYLE: React.CSSProperties = {
  background: "#0F2818",
  border: "1px solid rgba(46,107,64,0.4)",
  color: "#F0EDE6",
  fontFamily: FONT,
};

type Group = {
  id: number;
  name: string;
  emoji: string | null;
  slug: string;
  myRole: string;
};

type Intercession = { id: number; name: string; intention: string };

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
      style={{ color: "rgba(143,175,150,0.7)" }}
    >
      {children}
    </label>
  );
}

export default function ActionNewPage() {
  const [, setLocation] = useLocation();

  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });

  // Only communities the user actually administers can host an action.
  const adminGroups = useMemo(
    () =>
      (groupsData?.groups ?? []).filter(
        (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
      ),
    [groupsData],
  );

  const [groupId, setGroupId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [eventAt, setEventAt] = useState(""); // datetime-local string
  const [location, setLocationField] = useState("");
  const [description, setDescription] = useState("");
  const [learnMoreUrl, setLearnMoreUrl] = useState("");
  const [attachedMomentId, setAttachedMomentId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Default the community to the only one the user administers.
  const effectiveGroupId = groupId ?? (adminGroups.length === 1 ? adminGroups[0].id : null);

  // Intercessions belonging to the chosen community — offered as the
  // optional "attach a prayer" link.
  const { data: intercessionData } = useQuery<{ intercessions: Intercession[] }>({
    queryKey: [`/api/actions/intercession-options?groupId=${effectiveGroupId}`],
    queryFn: () =>
      apiRequest("GET", `/api/actions/intercession-options?groupId=${effectiveGroupId}`),
    enabled: effectiveGroupId != null,
  });
  const intercessions = intercessionData?.intercessions ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const iso = new Date(eventAt).toISOString();
      return apiRequest("POST", "/api/actions", {
        groupId: effectiveGroupId,
        title: title.trim(),
        description: description.trim(),
        eventAt: iso,
        location: location.trim() || undefined,
        learnMoreUrl: learnMoreUrl.trim() || undefined,
        attachedMomentId: attachedMomentId ?? undefined,
      }) as Promise<{ action: { id: number } }>;
    },
    onSuccess: (res) => {
      setLocation(`/actions/${res.action.id}`);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't create the action.",
      );
    },
  });

  const submit = () => {
    setFormError(null);
    if (effectiveGroupId == null) {
      setFormError("Choose a community.");
      return;
    }
    if (!title.trim()) {
      setFormError("Give the action a title.");
      return;
    }
    if (!description.trim()) {
      setFormError("Add a description so people know what they're showing up for.");
      return;
    }
    if (!eventAt) {
      setFormError("Set the date and time.");
      return;
    }
    if (isNaN(new Date(eventAt).getTime())) {
      setFormError("That date and time looks off.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0C1F12", color: "#F0EDE6", fontFamily: FONT }}
    >
      <header
        className="px-5 pb-2"
        style={{ paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          ← Back
        </button>
      </header>

      <main className="flex-1 px-5 pb-16">
        <div className="w-full max-w-md mx-auto">
          <h1
            className="text-2xl font-semibold leading-tight mt-2 mb-1"
            style={{ color: "#F0EDE6" }}
          >
            Call your community to action
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            Everyone in the community gets a heads-up now, a week before, and
            the day before.
          </p>

          {adminGroups.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(200,212,192,0.7)" }}>
              You need to be an admin of a community to create an action.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Community — only shown as a picker when the admin runs
                  more than one community. */}
              {adminGroups.length > 1 && (
                <div>
                  <Label>Community</Label>
                  <select
                    value={effectiveGroupId ?? ""}
                    onChange={(e) => {
                      setGroupId(Number(e.target.value) || null);
                      setAttachedMomentId(null);
                    }}
                    className="w-full rounded-xl px-3 py-3 text-sm"
                    style={INPUT_STYLE}
                  >
                    <option value="">Choose a community…</option>
                    {adminGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.emoji ? `${g.emoji} ` : ""}
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label>Title</Label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Show up for the city council vote"
                  maxLength={200}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>Date &amp; time</Label>
                <input
                  type="datetime-local"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>Location (optional)</Label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocationField(e.target.value)}
                  placeholder="City Hall, 100 Main St"
                  maxLength={500}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's happening, why it matters, and what to expect."
                  rows={5}
                  maxLength={8000}
                  className="w-full rounded-xl px-3 py-3 text-sm leading-relaxed"
                  style={{ ...INPUT_STYLE, resize: "vertical" }}
                />
              </div>

              <div>
                <Label>Learn more link (optional)</Label>
                <input
                  type="url"
                  value={learnMoreUrl}
                  onChange={(e) => setLearnMoreUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={2000}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              {/* Attach a prayer — links one of the community's existing
                  intercessions so members can pray toward the action. */}
              {intercessions.length > 0 && (
                <div>
                  <Label>Attach a prayer (optional)</Label>
                  <select
                    value={attachedMomentId ?? ""}
                    onChange={(e) =>
                      setAttachedMomentId(Number(e.target.value) || null)
                    }
                    className="w-full rounded-xl px-3 py-3 text-sm"
                    style={INPUT_STYLE}
                  >
                    <option value="">No attached prayer</option>
                    {intercessions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <p
                    className="text-[12px] mt-1.5"
                    style={{ color: "rgba(143,175,150,0.7)" }}
                  >
                    Links a community intercession to this action.
                  </p>
                </div>
              )}

              {formError && (
                <p className="text-sm" style={{ color: "rgba(220,150,150,0.95)" }}>
                  {formError}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={createMutation.isPending}
                className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  background: "#2D5E3F",
                  border: "1px solid rgba(46,107,64,0.7)",
                  color: "#F0EDE6",
                  fontFamily: FONT,
                  cursor: createMutation.isPending ? "default" : "pointer",
                }}
              >
                {createMutation.isPending ? "Posting…" : "Post action"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
