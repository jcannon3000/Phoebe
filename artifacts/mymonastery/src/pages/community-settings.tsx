import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Users, Plus, X, Trash2, UserPlus } from "lucide-react";

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
  // ── Contemplation community (beta) — admins can flip a community into a
  // contemplation template (shared minute goal + CAC feed) or back. focus
  // is null on standard communities, "contemplation" on the template.
  focus?: string | null;
  contemplationGoalMinutes?: number | null;
  // ── Pilot group (public no-login version) — designated by APP SUPER ADMINS
  // only; members of a pilot group are the only users who keep the full app
  // once the guest flag flips.
  isPilotGroup?: boolean;
  // Listed on /communities/browse for anyone signed in to find and request
  // to join. Off by default — most communities are invite-only.
  isPublic?: boolean;
  // Free-text location (no geocoding) — shown + searchable on the public
  // directory alongside name.
  city?: string | null;
  state?: string | null;
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
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isBeta } = useBetaStatus();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");
  const [calendarUrl, setCalendarUrl] = useState("");
  // ── Prayer Circle (beta) admin controls ─────────────────────────────
  const [isPrayerCircle, setIsPrayerCircle] = useState(false);
  // ── Contemplation community (beta) admin controls ────────────────────
  const [isContemplation, setIsContemplation] = useState(false);
  const [contemplationGoalMinutes, setContemplationGoalMinutes] = useState(20);
  // ── Public directory listing ──────────────────────────────────────────
  const [isPublic, setIsPublic] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const GOAL_PRESETS = [10, 15, 20, 30];
  const [saved, setSaved] = useState(false);

  // Add-intention dialog state. Shape mirrors the intercession flow —
  // a short title (the prayer itself) plus an optional description for
  // context (scripture, a situation, a person's story).
  const [addOpen, setAddOpen] = useState(false);
  const [newIntentionTitle, setNewIntentionTitle] = useState("");
  const [newIntentionDescription, setNewIntentionDescription] = useState("");

  const INTENTION_EXAMPLES = [
    t("community_settings.intention_example_sick"),
    t("community_settings.intention_example_violence"),
    t("community_settings.intention_example_neighbors"),
    t("community_settings.intention_example_left_church"),
  ];

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string; intentions?: Intention[] }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });

  // ── Pilot group (app super admins only) ─────────────────────────────
  // Only super admins (beta_users.is_admin) ever see the toggle; the check
  // is one cheap cached GET. The PATCH applies immediately.
  const { data: amSuper } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ["/api/admin/am-super"],
    queryFn: () => apiRequest("GET", "/api/admin/am-super"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const pilotMutation = useMutation({
    mutationFn: (on: boolean) => apiRequest("PATCH", `/api/admin/groups/${slug}/pilot`, { isPilotGroup: on }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // Pending join-request count for this community — drives the badge
  // on the "Join requests" settings row. /me endpoint is the cheap
  // lookup since the user has it cached for the drawer too.
  const { data: pendingCounts } = useQuery<{ total: number; byGroup: Record<number, number> }>({
    queryKey: ["/api/me/pending-join-request-counts"],
    queryFn: () => apiRequest("GET", "/api/me/pending-join-request-counts"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const pendingForThis = groupData?.group
    ? pendingCounts?.byGroup[groupData.group.id] ?? 0
    : 0;

  const intentions: Intention[] = groupData?.intentions ?? [];

  const group = groupData?.group;
  // Intentionally not gated on useCommunityAdminToggle: the toggle is a UX
  // choice to preview the member experience on the dashboard / nav, not an
  // access-control flag. An admin who explicitly navigates to the settings
  // URL should always see the settings page — otherwise a fresh login
  // (toggle defaults off) silently redirects them back to the group page.
  // Hidden admins have full admin powers (see routes/groups.ts isAdminRole)
  // and must also reach the settings page, otherwise a pilot-designated
  // hidden admin can't manage a community they're technically running.
  const isAdmin = groupData?.myRole === "admin" || groupData?.myRole === "hidden_admin";

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
      setIsContemplation(group.focus === "contemplation");
      if (group.contemplationGoalMinutes) setContemplationGoalMinutes(group.contemplationGoalMinutes);
      setIsPublic(!!group.isPublic);
      setCity(group.city ?? "");
      setState(group.state ?? "");
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
      // Contemplation template: send "contemplation" to enable, null to
      // revert. The server pins the CAC reflection source on enable and
      // clears the goal on disable.
      focus: isContemplation ? "contemplation" : null,
      contemplationGoalMinutes: isContemplation ? contemplationGoalMinutes : null,
      isPublic,
      city: city || "",
      state: state || "",
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

  // Permanent group deletion. Two-step UX (open the panel → type the
  // name → confirm) to make it nearly impossible to nuke a real
  // community by accident. Server cascades on group_members,
  // intentions, daily_focus, announcements, etc.; shared_moments
  // (intercessions) keep their own state with groupId set NULL —
  // they don't disappear, they just become un-scoped.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/groups/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      // Drop the now-stale per-group cache so navigating back to a
      // community detail URL with this slug 404s cleanly instead of
      // showing the cached page.
      queryClient.removeQueries({ queryKey: ["/api/groups", slug] });
      setLocation("/communities");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : t("community_settings.delete_failed");
      setDeleteError(msg);
    },
  });
  const canDelete = !!group && deleteConfirmText.trim() === group.name.trim();

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
          {t("community_settings.title")}
        </h1>
        <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>{t("community_settings.subtitle", { name: group.name })}</p>

        <button
          onClick={() => setLocation(`/communities/${slug}?tab=members`)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-3 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <span className="flex items-center gap-2.5">
            <Users size={15} style={{ color: "#A8C5A0" }} />
            <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{t("community_settings.edit_members")}</span>
          </span>
          <span className="text-sm" style={{ color: "rgba(200,212,192,0.4)" }}>→</span>
        </button>

        {/* Join requests — links to the dedicated requests panel.
            Renders an amber count badge when pending so the admin can
            spot work to do without opening the drawer. */}
        <button
          onClick={() => setLocation(`/communities/${slug}/requests`)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-6 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <span className="flex items-center gap-2.5">
            <UserPlus size={15} style={{ color: "#A8C5A0" }} />
            <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{t("community_settings.join_requests")}</span>
          </span>
          <span className="flex items-center gap-2">
            {pendingForThis > 0 && (
              <span
                className="inline-flex items-center justify-center text-[10px] font-bold rounded-full"
                style={{
                  background: "#C58A2A",
                  color: "#1A1208",
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                }}
              >
                {pendingForThis}
              </span>
            )}
            <span className="text-sm" style={{ color: "rgba(200,212,192,0.4)" }}>→</span>
          </span>
        </button>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Emoji */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            {t("community_settings.icon_label")}
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
            {t("community_settings.name_label")}
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
            {t("community_settings.description_label")} <span style={{ opacity: 0.5 }}>{t("community_settings.optional")}</span>
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
            {t("community_settings.calendar_url_label")} <span style={{ opacity: 0.5 }}>{t("community_settings.optional")}</span>
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
          <p className="font-semibold" style={{ color: "#A8C5A0" }}>{t("community_settings.calendar_help_heading")}</p>
          <p>{t("community_settings.calendar_help_step1")}</p>
          <p>{t("community_settings.calendar_help_step2")}</p>
          <p>{t("community_settings.calendar_help_step3_prefix")} <strong>{t("community_settings.calendar_help_step3_strong")}</strong></p>
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 pt-1 font-semibold"
              style={{ color: "#6FAF85" }}>
              <ExternalLink size={11} /> {t("community_settings.test_link")}
            </a>
          )}
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* ── Daily reflection (beta) ──────────────────────────────────────
            Admins pick a daily-reflection source for the community — CAC
            Daily Reflection or Forward Day by Day. Members then get a
            card on /communities/:slug with an "Open today's reading"
            button + a write-and-share composer. Off by default; the
            admin can set, change, or clear it any time. */}

        {/* ── Sunday Service Reflections (beta) ────────────────────────────
            Admin-flipped toggle. When on, the bell scanner sends every
            joined member a Sunday-evening push inviting a short
            reflection on this week's service. The composer page lives at
            /communities/:slug/sunday-reflection and stays open the whole
            week — members edit until the next Sunday rolls over. */}

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
              onChange={e => {
                setIsPrayerCircle(e.target.checked);
                if (e.target.checked) setIsContemplation(false);
              }}
              className="mt-1 w-4 h-4 flex-shrink-0 rounded"
              style={{ accentColor: "#2D5E3F" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                {t("community_settings.prayer_circle")}
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                {t("community_settings.prayer_circle_desc")}
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
                {t("community_settings.intentions_label")}
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
                  <p className="text-xs italic" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                    {t("community_settings.intentions_empty")}
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
                          fontFamily: "Georgia, 'Times New Roman', serif",
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
                        if (confirm(t("community_settings.archive_intention_confirm"))) {
                          archiveIntentionMutation.mutate(intn.id);
                        }
                      }}
                      className="text-[10px] flex-shrink-0 rounded-md px-1.5 py-1 transition-opacity hover:opacity-100"
                      style={{ color: "rgba(200,212,192,0.5)", opacity: 0.7 }}
                      title={t("community_settings.archive_intention_title")}
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
                <span>{t("community_settings.add_intention")}</span>
              </button>
            </div>

            <p className="text-[11px] italic mb-6" style={{ color: "rgba(143,175,150,0.65)" }}>
              {t("community_settings.prayer_circle_beta_note")}
            </p>
          </>
        )}

        {/* ── Contemplation community (beta) ─────────────────────────────────
            A template that swaps the daily offices for a shared contemplation
            goal + the CAC meditation the community reflects on together.
            Enabling it pins the CAC reflection source server-side; disabling
            reverts to a standard community and clears the goal. Mutually
            exclusive with prayer circle in the UI. */}
        <div
          className="rounded-xl px-4 py-3.5 mb-4"
          style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isContemplation}
              onChange={e => {
                setIsContemplation(e.target.checked);
                if (e.target.checked) setIsPrayerCircle(false);
              }}
              className="mt-1 w-4 h-4 flex-shrink-0 rounded"
              style={{ accentColor: "#2D5E3F" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                {t("community_settings.contemplation")}
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                {t("community_settings.contemplation_desc")}
              </p>
            </div>
          </label>

          {isContemplation && (
            <div className="mt-3.5 pl-7">
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
                {t("community_settings.shared_daily_goal")}
              </label>
              <div className="flex flex-wrap gap-2">
                {GOAL_PRESETS.map(min => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setContemplationGoalMinutes(min)}
                    className="px-3.5 py-1.5 rounded-full text-sm transition-all"
                    style={{
                      background: contemplationGoalMinutes === min ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${contemplationGoalMinutes === min ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                      color: contemplationGoalMinutes === min ? "#F0EDE6" : "#8FAF96",
                      fontFamily: FONT,
                    }}
                  >
                    {t("community_settings.minutes", { count: min })}
                  </button>
                ))}
              </div>
              <p className="text-[11px] italic mt-2.5" style={{ color: "rgba(143,175,150,0.65)" }}>
                {t("community_settings.contemplation_beta_note")}
              </p>
            </div>
          )}
        </div>

        {/* ── Public directory listing ─────────────────────────────────────
            When on, this community shows up on /communities/browse for any
            signed-in user to find by name and request to join — the
            "parish directory" experience. Defaults ON at the schema level
            (groups.is_public defaults true) for every community, including
            this one — this toggle is the first UI that lets an admin turn
            it OFF for a community that should stay invite-only. Saved with
            the regular Save button below (not its own immediate PATCH,
            unlike the super-admin pilot toggle). */}
        <div
          className="rounded-xl px-4 py-3.5 mb-4"
          style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
              className="mt-1 w-4 h-4 flex-shrink-0 rounded"
              style={{ accentColor: "#2D5E3F" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                {t("community_settings.public_listing", { defaultValue: "List in the community directory" })}
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                {t("community_settings.public_listing_desc", { defaultValue: "Anyone signed in can find this community by name and request to join. On by default — turn off to keep this community invite-only." })}
              </p>
            </div>
          </label>

          {/* City/State — shown alongside name in the directory and
              searchable there too (no geocoding, plain text match). Useful
              for a church/parish so people can find one near them. */}
          <div className="grid grid-cols-2 gap-3 mt-3.5">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                {t("community_settings.city_label", { defaultValue: "City" })} <span style={{ opacity: 0.5 }}>{t("community_settings.optional")}</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Austin"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                {t("community_settings.state_label", { defaultValue: "State" })} <span style={{ opacity: 0.5 }}>{t("community_settings.optional")}</span>
              </label>
              <input
                type="text"
                value={state}
                onChange={e => setState(e.target.value)}
                placeholder="TX"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
              />
            </div>
          </div>
        </div>

        {/* ── Pilot group (app super admins only) ───────────────────────────
            Members of a pilot group are the ONLY users who keep the FULL app
            once the public no-login version ships — everyone else gets the
            light shape. The toggle only renders for app super admins
            (beta_users.is_admin, checked via /api/admin/am-super); saving is
            immediate (its own PATCH, separate from the Save button). */}
        {amSuper?.isSuperAdmin && (
          <div
            className="rounded-xl px-4 py-3.5 mb-4"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(168,197,160,0.35)" }}
          >
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={groupData?.group?.isPilotGroup === true}
                disabled={pilotMutation.isPending}
                onChange={(e) => pilotMutation.mutate(e.target.checked)}
                className="mt-1 w-4 h-4 flex-shrink-0 rounded"
                style={{ accentColor: "#2D5E3F" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                  {t("community_settings.pilot_group", { defaultValue: "Pilot group" })}
                </p>
                <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                  {t("community_settings.pilot_group_desc", { defaultValue: "Members of a pilot group get the full app. Everyone else uses the simplified public version. Visible to app administrators only." })}
                </p>
              </div>
            </label>
          </div>
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
                  {t("community_settings.add_intention_title")}
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
                  {t("community_settings.prayer_label")}
                </label>
                <input
                  type="text"
                  value={newIntentionTitle}
                  onChange={e => setNewIntentionTitle(e.target.value)}
                  placeholder={t("community_settings.prayer_placeholder")}
                  maxLength={500}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    color: "#F0EDE6",
                    fontFamily: "Georgia, 'Times New Roman', serif",
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
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                  {t("community_settings.context_label")} <span style={{ opacity: 0.5 }}>{t("community_settings.optional")}</span>
                </label>
                <textarea
                  value={newIntentionDescription}
                  onChange={e => setNewIntentionDescription(e.target.value)}
                  placeholder={t("community_settings.context_placeholder")}
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
                  {t("community_settings.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => addIntentionMutation.mutate()}
                  disabled={!newIntentionTitle.trim() || addIntentionMutation.isPending}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {addIntentionMutation.isPending ? t("community_settings.adding") : t("community_settings.add")}
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
          {saveMutation.isPending ? t("community_settings.saving") : saved ? <>✓ {t("community_settings.saved")}</> : t("community_settings.save_changes")}
        </button>

        {/* ── Danger zone ───────────────────────────────────────────────────
            Permanent community deletion. Two-step: tapping "Delete community"
            opens a confirm panel asking the admin to type the community's
            name before the destructive button enables. This is the same
            pattern GitHub / Discord / Linear use for repo / server / team
            deletion — high-friction by design so a misclick can't end a
            community. */}
        <div className="mt-12 pt-6" style={{ borderTop: "1px solid rgba(196,122,101,0.18)" }}>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: "transparent",
                border: "1px solid rgba(196,122,101,0.4)",
                color: "#C47A65",
                fontFamily: FONT,
              }}
            >
              <Trash2 size={14} />
              {t("community_settings.delete_community")}
            </button>
          ) : (
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(196,122,101,0.08)",
                border: "1px solid rgba(196,122,101,0.35)",
              }}
            >
              <p
                className="text-[13px] font-semibold mb-2"
                style={{ color: "#E8A28D", fontFamily: FONT }}
              >
                {t("community_settings.delete_confirm_heading", { name: group?.name })}
              </p>
              <p
                className="text-[12px] leading-relaxed mb-4"
                style={{ color: "rgba(232,162,141,0.85)", fontFamily: FONT }}
              >
                {t("community_settings.delete_confirm_body")} <strong>{t("community_settings.delete_confirm_irreversible")}</strong>
              </p>
              <label
                className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5"
                style={{ color: "rgba(232,162,141,0.6)", fontFamily: FONT }}
              >
                {t("community_settings.delete_confirm_prompt")}
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(null); }}
                placeholder={group?.name ?? ""}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none mb-3"
                style={{
                  background: "rgba(196,122,101,0.08)",
                  border: `1px solid ${canDelete ? "rgba(196,122,101,0.6)" : "rgba(196,122,101,0.25)"}`,
                  color: "#F0EDE6",
                  fontFamily: FONT,
                }}
              />
              {deleteError && (
                <p
                  className="text-[12px] mb-3"
                  style={{ color: "#C47A65", fontFamily: FONT }}
                >
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                    setDeleteError(null);
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(143,175,150,0.3)",
                    color: "rgba(200,212,192,0.75)",
                    fontFamily: FONT,
                  }}
                >
                  {t("community_settings.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canDelete) return;
                    deleteMutation.mutate();
                  }}
                  disabled={!canDelete || deleteMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{
                    background: canDelete ? "#7A2818" : "rgba(122,40,24,0.35)",
                    color: "#F0EDE6",
                    fontFamily: FONT,
                  }}
                >
                  {deleteMutation.isPending ? t("community_settings.deleting") : t("community_settings.delete_forever")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ─── Reflection source picker (beta) ──────────────────────────────────────
// Lets a community admin choose the daily-reflection source (CAC Daily
// Reflection or Forward Day by Day), or clear it. Backed by the
// /api/groups/:slug/reflection-source endpoint pair. Each tap saves
// immediately — reads as a setting, not a form, matching the office-
// reminder picker pattern on the user settings page.
function ReflectionSourcePicker({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data } = useQuery<{
    source: "cac" | "fdd" | null;
    isAdmin: boolean;
  }>({
    queryKey: [`/api/groups/${slug}/reflection-source`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/reflection-source`),
    enabled: !!slug,
  });
  const save = useMutation({
    mutationFn: (source: "cac" | "fdd" | null) =>
      apiRequest("PUT", `/api/groups/${slug}/reflection-source`, { source }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/reflection-source`] });
      queryClient.invalidateQueries({
        // The detail-page ReflectionEntryCard reads the same `/reflections`
        // endpoint that returns `source`, so we have to invalidate any
        // date-stamped variant — predicate matches the partial key.
        predicate: (q) =>
          Array.isArray(q.queryKey)
          && typeof q.queryKey[0] === "string"
          && q.queryKey[0] === `/api/groups/${slug}/reflections`,
      });
    },
  });
  const current = data?.source ?? null;
  const options: Array<{ value: "cac" | "fdd" | null; label: string; sub: string }> = [
    {
      value: null,
      label: t("community_settings.reflection_off_label"),
      sub: t("community_settings.reflection_off_sub"),
    },
    {
      value: "cac",
      label: t("community_settings.reflection_cac_label"),
      sub: t("community_settings.reflection_cac_sub"),
    },
    {
      value: "fdd",
      label: t("community_settings.reflection_fdd_label"),
      sub: t("community_settings.reflection_fdd_sub"),
    },
  ];
  return (
    <>
      <label
        className="text-[11px] font-semibold uppercase tracking-widest block mb-2"
        style={{ color: "rgba(143,175,150,0.6)" }}
      >
        {t("community_settings.daily_reflection")}
        <span
          className="ml-2 inline-flex items-center px-1.5 py-0 rounded-full text-[8px]"
          style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", letterSpacing: "0.1em" }}
        >
          {t("community_settings.beta_badge")}
        </span>
      </label>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(168,197,160,0.7)" }}>
        {t("community_settings.daily_reflection_desc")}
      </p>
      <div
        className="rounded-xl px-4 py-2 mb-6"
        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
      >
        {options.map((opt, i) => {
          const isSelected = current === opt.value;
          return (
            <button
              key={String(opt.value ?? "off")}
              type="button"
              onClick={() => save.mutate(opt.value)}
              disabled={save.isPending}
              className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-50"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.10)",
                background: "transparent",
                cursor: save.isPending ? "wait" : "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                  {opt.sub}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── Sunday reflections toggle (beta) ────────────────────────────────────
// Single on/off control mirrored on the groups.sundayReflectionsEnabled
// column. Flipping on does NOT instantly fire a push — the bell scanner
// dispatches at the next Sunday-evening window (server local 18:00–23:00).
// Flipping off doesn't delete past reflections; they survive in
// group_reflections as history if the admin turns the feature back on.
function SundayReflectionsToggle({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  // Reuses the sunday-reflection feed endpoint — its response carries
  // `enabled` so we don't need a separate settings GET. (Reads against
  // the same key as the reflection page so flipping here invalidates
  // there with no extra plumbing.)
  const { data } = useQuery<{ enabled: boolean; isAdmin: boolean }>({
    queryKey: [`/api/groups/${slug}/sunday-reflection`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/sunday-reflection`),
    enabled: !!slug,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", `/api/groups/${slug}/sunday-reflection/enabled`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/sunday-reflection`] });
    },
  });
  const enabled = !!data?.enabled;
  return (
    <>
      <label
        className="text-[11px] font-semibold uppercase tracking-widest block mb-2"
        style={{ color: "rgba(143,175,150,0.6)" }}
      >
        {t("community_settings.sunday_reflection")}
        <span
          className="ml-2 inline-flex items-center px-1.5 py-0 rounded-full text-[8px]"
          style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", letterSpacing: "0.1em" }}
        >
          {t("community_settings.beta_badge")}
        </span>
      </label>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(168,197,160,0.7)" }}>
        {t("community_settings.sunday_reflection_desc")}
      </p>
      <div
        className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3"
        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
      >
        <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          {enabled ? t("community_settings.sunday_reflection_on") : t("community_settings.sunday_reflection_off")}
        </p>
        <button
          type="button"
          onClick={() => save.mutate(!enabled)}
          disabled={save.isPending}
          aria-label={enabled ? t("community_settings.sunday_reflection_aria_off") : t("community_settings.sunday_reflection_aria_on")}
          className="rounded-full transition-colors"
          style={{
            width: 44, height: 26,
            background: enabled ? "#A8C5A0" : "rgba(143,175,150,0.25)",
            border: "none",
            cursor: save.isPending ? "wait" : "pointer",
            position: "relative",
            opacity: save.isPending ? 0.6 : 1,
          }}
        >
          <span
            style={{
              position: "absolute", top: 3, left: enabled ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#0F2818",
              transition: "left 0.18s ease",
            }}
          />
        </button>
      </div>
    </>
  );
}

