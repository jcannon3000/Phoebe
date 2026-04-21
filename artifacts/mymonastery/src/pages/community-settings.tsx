import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Users, Plus, X } from "lucide-react";

const FONT = "'Space Grotesk', sans-serif";

const EMOJI_OPTIONS = ["🏘️","⛪","✝️","🕊️","🙏🏽","🌿","🌱","🕯️","📖","🫂","💒","🌾","🔔","🫙","🌻","🍃","🏔️","🌊","☀️","🌙"];

type Group = {
  id: number; name: string; description: string | null; slug: string;
  emoji: string | null; calendarUrl: string | null;
  // ── Prayer Circle (beta) — admins can flip an ordinary community into a
  // prayer circle from this page. Turning it on requires an `intention`;
  // turning it off clears intention + circleDescription server-side.
  isPrayerCircle?: boolean;
  intention?: string | null;
  circleDescription?: string | null;
};

type Intention = {
  id: number;
  title: string;
  description: string | null;
  createdByUserId: number;
  createdAt: string;
};

export default function CommunitySettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");
  const [calendarUrl, setCalendarUrl] = useState("");
  // ── Prayer Circle (beta) admin controls ─────────────────────────────
  const [isPrayerCircle, setIsPrayerCircle] = useState(false);
  const [saved, setSaved] = useState(false);

  // Add-intention dialog state. Shape mirrors the intercession flow —
  // a short title (the prayer itself) plus an optional description for
  // context (scripture, a situation, a person's story).
  const [addOpen, setAddOpen] = useState(false);
  const [newIntentionTitle, setNewIntentionTitle] = useState("");
  const [newIntentionDescription, setNewIntentionDescription] = useState("");

  const INTENTION_EXAMPLES = [
    "For the sick in our parish.",
    "For an end to gun violence.",
    "For our neighbors who are new to this country.",
    "For those who have left the church.",
  ];

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string; intentions?: Intention[] }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });

  const intentions: Intention[] = groupData?.intentions ?? [];

  const group = groupData?.group;
  // Intentionally not gated on useCommunityAdminToggle: the toggle is a UX
  // choice to preview the member experience on the dashboard / nav, not an
  // access-control flag. An admin who explicitly navigates to the settings
  // URL should always see the settings page — otherwise a fresh login
  // (toggle defaults off) silently redirects them back to the group page.
  const isAdmin = groupData?.myRole === "admin";

  // Redirect non-admins
  useEffect(() => {
    if (groupData && !isAdmin) setLocation(`/communities/${slug}`);
  }, [groupData, isAdmin, slug, setLocation]);

  // Populate form when group loads
  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description ?? "");
      setEmoji(group.emoji ?? "🏘️");
      setCalendarUrl(group.calendarUrl ?? "");
      setIsPrayerCircle(!!group.isPrayerCircle);
    }
  }, [group]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/groups/${slug}`, {
      name,
      description: description || undefined,
      emoji,
      calendarUrl: calendarUrl || "",
      isPrayerCircle,
      // Intentions now live in their own table; this PATCH only updates the
      // group metadata. The server seeds a first intention from this payload
      // only when transitioning to a circle with no active intentions yet —
      // our normal save skips the `intention` field entirely so we don't
      // create duplicates on every settings save.
    }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
  });

  // Add an intention. The flow is intercession-shaped: title + optional
  // description, reused on both the community page and the daily bell.
  const addIntentionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/intentions`, {
      title: newIntentionTitle.trim(),
      description: newIntentionDescription.trim() || undefined,
    }),
    onSuccess: () => {
      setNewIntentionTitle("");
      setNewIntentionDescription("");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  // Archive (soft-delete) an intention — stays in the DB for later reflection
  // but disappears from the active card list immediately.
  const archiveIntentionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${slug}/intentions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  if (!group) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
        <button
          onClick={() => setLocation(`/communities/${slug}`)}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← {group.name}
        </button>

        <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
          Community Settings
        </h1>
        <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>Edit details for {group.name}.</p>

        <button
          onClick={() => setLocation(`/communities/${slug}?tab=members`)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-6 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <span className="flex items-center gap-2.5">
            <Users size={15} style={{ color: "#A8C5A0" }} />
            <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Edit Members</span>
          </span>
          <span className="text-sm" style={{ color: "rgba(200,212,192,0.4)" }}>→</span>
        </button>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Emoji */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Icon
          </label>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
              {emoji}
            </div>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  className="text-xl w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                  style={{
                    background: emoji === e ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${emoji === e ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Description <span style={{ opacity: 0.5 }}>(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Calendar URL */}
        <div className="mb-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Parish Calendar URL <span style={{ opacity: 0.5 }}>(optional)</span>
          </label>
          <input
            type="url"
            value={calendarUrl}
            onChange={e => setCalendarUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/..."
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>
        <div className="rounded-xl px-4 py-3 mb-6 text-xs space-y-1" style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.12)", color: "#8FAF96" }}>
          <p className="font-semibold" style={{ color: "#A8C5A0" }}>How to find your Google Calendar link:</p>
          <p>1. Open Google Calendar → Settings → select your calendar</p>
          <p>2. Scroll to "Integrate calendar"</p>
          <p>3. Copy the <strong>Public address in iCal format</strong></p>
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 pt-1 font-semibold"
              style={{ color: "#6FAF85" }}>
              <ExternalLink size={11} /> Test this link
            </a>
          )}
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* ── Prayer Circle (beta) ──────────────────────────────────────────
            Admins can turn any community into a prayer circle here, or toggle
            an existing circle back to a normal community. When on, the
            intention is required and both intention + description can be
            edited; when off, the server nulls both on save so the detail page
            reverts to its ordinary form. */}
        <div
          className="rounded-xl px-4 py-3.5 mb-4"
          style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPrayerCircle}
              onChange={e => setIsPrayerCircle(e.target.checked)}
              className="mt-1 w-4 h-4 flex-shrink-0 rounded"
              style={{ accentColor: "#2D5E3F" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                Prayer circle
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                A prayer circle is a group bound by a shared intention. Members see what the circle is praying for, and it surfaces in each member's daily bell.
              </p>
            </div>
          </label>
        </div>

        {isPrayerCircle && (
          <>
            {/* Intentions — rendered as a stacked list of cards. Each card is
                one intention; admins can archive any, the author can archive
                their own. The "Add intention" button opens an intercession-
                style dialog. */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
                Intentions
              </label>

              {intentions.length === 0 && (
                <div
                  className="rounded-xl px-4 py-6 mb-2 text-center"
                  style={{
                    background: "rgba(46,107,64,0.05)",
                    border: "1px dashed rgba(46,107,64,0.25)",
                    color: "rgba(200,212,192,0.7)",
                  }}
                >
                  <p className="text-xs italic" style={{ fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif" }}>
                    No intentions yet. Add the first prayer this circle holds.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 mb-2">
                {intentions.map(intn => (
                  <div
                    key={intn.id}
                    className="rounded-xl px-4 py-3 flex items-start gap-3"
                    style={{
                      background: "rgba(46,107,64,0.10)",
                      border: "1px solid rgba(46,107,64,0.25)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm leading-snug"
                        style={{
                          color: "#F0EDE6",
                          fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                          fontStyle: "italic",
                        }}
                      >
                        {intn.title}
                      </p>
                      {intn.description && (
                        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "#8FAF96" }}>
                          {intn.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Archive this intention? It will disappear from the circle.")) {
                          archiveIntentionMutation.mutate(intn.id);
                        }
                      }}
                      className="text-[10px] flex-shrink-0 rounded-md px-1.5 py-1 transition-opacity hover:opacity-100"
                      style={{ color: "rgba(200,212,192,0.5)", opacity: 0.7 }}
                      title="Archive intention"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(46,107,64,0.08)",
                  border: "1px dashed rgba(46,107,64,0.35)",
                  color: "#A8C5A0",
                }}
              >
                <Plus size={14} />
                <span>Add intention</span>
              </button>
            </div>

            <p className="text-[11px] italic mb-6" style={{ color: "rgba(143,175,150,0.65)" }}>
              Prayer circles are a beta feature. We are learning what makes them flourish — we would love your feedback.
            </p>
          </>
        )}

        {/* ── Add intention dialog ─────────────────────────────────────────
            Intercession-shaped: title (the prayer itself) plus an optional
            description for scripture, situation, or person's story. Example
            chips populate the title field to suggest patterns without
            constraining form. */}
        {addOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: "rgba(10,20,15,0.65)", backdropFilter: "blur(6px)" }}
            onClick={() => setAddOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl p-5"
              style={{
                background: "#1A2A1F",
                border: "1px solid rgba(46,107,64,0.35)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                  An intention for this circle
                </h3>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-full p-1 transition-opacity hover:opacity-80"
                  style={{ color: "rgba(200,212,192,0.5)" }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-3">
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                  Prayer
                </label>
                <input
                  type="text"
                  value={newIntentionTitle}
                  onChange={e => setNewIntentionTitle(e.target.value)}
                  placeholder="What are we praying for?"
                  maxLength={500}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    color: "#F0EDE6",
                    fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                    fontStyle: "italic",
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INTENTION_EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setNewIntentionTitle(ex)}
                      className="text-[11px] italic px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(46,107,64,0.12)",
                        border: "1px solid rgba(46,107,64,0.25)",
                        color: "rgba(200,212,192,0.8)",
                        fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                  Context <span style={{ opacity: 0.5 }}>(optional)</span>
                </label>
                <textarea
                  value={newIntentionDescription}
                  onChange={e => setNewIntentionDescription(e.target.value)}
                  placeholder="A scripture, a story, a situation the circle is holding…"
                  maxLength={2000}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    color: "#F0EDE6",
                  }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)", color: "#8FAF96" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => addIntentionMutation.mutate()}
                  disabled={!newIntentionTitle.trim() || addIntentionMutation.isPending}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {addIntentionMutation.isPending ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => saveMutation.mutate()}
          disabled={
            !name.trim() ||
            // A circle with zero intentions is a contradiction — block save
            // until at least one intention exists (either already saved on
            // the group, or added this session). Turning a non-circle INTO a
            // circle with no intentions yet is still blocked by the server's
            // own "prayer circles require an intention" guard via the legacy
            // `intention` column check; for beta we keep this client guard
            // advisory-only.
            (isPrayerCircle && intentions.length === 0 && !group?.intention) ||
            saveMutation.isPending
          }
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
          style={{ background: saved ? "rgba(46,107,64,0.5)" : "#2D5E3F", color: "#F0EDE6" }}
        >
          {saveMutation.isPending ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>
    </Layout>
  );
}
