import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePilotMode } from "@/hooks/usePilotMode";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { scanForCrisisLanguage } from "@/lib/crisisScan";

// ── Visual language ─────────────────────────────────────────────────
// A calm DARK-BLUE surface (the app's reflection blue, #6FAF85, family) —
// solid, no drifting gradient — behind frosted-glass cards, Space Grotesk
// headings, Georgia-italic body, a blue-grey + warm-cream palette.
const BG = "#102816";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const SERIF = "Georgia, 'Times New Roman', serif";
const SPACE = "'Space Grotesk', sans-serif";
// Canonical frosted-glass look (matches FROST elsewhere) so the request form
// reads as frosted over the leaf backdrop, not a flat dark panel.
const GLASS = "rgba(9,26,16,0.297)";
const GLASS_BORDER = "rgba(200,212,192,0.16)";
// Shared glass field styling (textarea + inputs). No box-shadow inline so
// the global input :focus glow (index.css) still rings the field.
const glassField = {
  background: GLASS,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 18,
  color: CREAM,
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  outline: "none",
} as const;

// Kind comes from a `?kind=` query param set by the FAB on the home
// dashboard. Drives form copy AND is persisted to prayer_requests.kind
// so cards / slideshow can render the matching pill ("Life event" /
// "For justice"). Default "request" renders no pill. Community
// intercessions are not personal prayer requests — they go through
// /moment/new?template=intercession and live in shared_moments, so
// they never reach this form.
export type RequestKind = "request" | "life-event" | "justice";

// Per-kind copy is built from i18n via useKindCopy() — was a frozen
// module-level const before, which locked the labels to English at
// load time even when the user flipped to Spanish.
function useKindCopy(): Record<RequestKind, { emoji: string; eyebrow: string; title: string; subtitle: string; placeholder: string }> {
  const { t } = useTranslation();
  return {
    "request": {
      emoji: "🙏🏽",
      eyebrow: t("prayer_request.eyebrow_default", { defaultValue: "Prayer" }),
      title: t("prayer_request.title_default"),
      subtitle: t("prayer_request.subtitle_default"),
      placeholder: t("prayer_request.placeholder_default"),
    },
    "life-event": {
      emoji: "🌱",
      eyebrow: t("prayer_request.eyebrow_life_event", { defaultValue: "Life event" }),
      title: t("prayer_request.title_life_event"),
      subtitle: t("prayer_request.subtitle_life_event"),
      placeholder: t("prayer_request.placeholder_life_event"),
    },
    "justice": {
      emoji: "⚖️",
      eyebrow: t("prayer_request.eyebrow_justice", { defaultValue: "For justice" }),
      title: t("prayer_request.title_justice"),
      subtitle: t("prayer_request.subtitle_justice"),
      placeholder: t("prayer_request.placeholder_justice"),
    },
  };
}

// Full-screen, step-by-step authoring flow for sharing your own prayer
// request with the community. Mirrors the "gathering" and "pray-for-new"
// templates so the creation affordances all feel like siblings:
//   • dark #081912 canvas
//   • header = back button + progress pills
//   • one question per step, Space Grotesk titles, Playfair Display body
//
// Two steps:
//   0 — What are you asking prayer for?
//   1 — How long should we carry it? (3 or 7 days)
//
// On success we return to /prayer-list, where the new card will show up
// under "Prayer Requests".

export default function PrayerRequestNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const KIND_COPY = useKindCopy();

  const kind: RequestKind = useMemo(() => {
    const raw = new URLSearchParams(search).get("kind") ?? "";
    if (raw === "life-event" || raw === "justice") return raw;
    return "request";
  }, [search]);
  const copy = KIND_COPY[kind];

  const [body, setBody] = useState("");
  // Destination: keep it on your PRIVATE list (prayer_intentions) or SHARE it
  // with the community (prayer_requests). Only the default "request" kind can be
  // private — life-events / justice are inherently community asks. A private
  // item can also be "a person" (name + optional note), like the prayer list.
  const [dest, setDest] = useState<"share" | "list" | "group">(() => {
    // Default to keeping it private ("Keep on my list"): a plain request opens
    // with private pre-selected. Life-events / justice are inherently community
    // asks, so they default to sharing. ?dest=share|list|group can still override.
    try {
      const p = new URLSearchParams(search).get("dest");
      if (p === "share") return "share";
      if (p === "list") return "list";
      if (p === "group") return "group";
    } catch {}
    return kind === "request" ? "list" : "share";
  });
  const { isPilot } = usePilotMode();
  // Pilot is personal-only: always keep it on the private list, never share.
  useEffect(() => { if (isPilot) setDest("list"); }, [isPilot]);

  /**
   * "group" — submit to one or more specific communities' MODERATED prayer
   * lists (owner: "each time I submit a prayer request i need to select what
   * groups I am submiting it too"). This is NOT the old per-community
   * targeting that was removed 2026-09-02 (that path pushed straight to
   * every member with only a reactive admin mute after the fact). It goes
   * through the properly-gated queue instead — POST
   * /groups/:slug/prayer-list, one call per selected group, landing
   * "pending" until that group's own admin approves it — same route the
   * community's own Prayer list page already uses. "share" (whole-garden)
   * is untouched and stays a separate destination.
   */
  const myGroupsQuery = useQuery<{ groups: Array<{ id: number; slug: string; name: string; emoji: string | null; isPublic?: boolean; prayerRequestsEnabled?: boolean }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  // Same eligibility rule group-prayer-list.ts's listIsOpen enforces
  // server-side (prayerRequestsEnabled && !isPublic) — this just keeps the
  // picker from ever offering a group the server would refuse anyway.
  const openGroups = (myGroupsQuery.data?.groups ?? []).filter(
    (g) => !g.isPublic && g.prayerRequestsEnabled !== false,
  );
  const [selectedGroupSlugs, setSelectedGroupSlugs] = useState<string[]>([]);
  const toggleGroupSlug = (slug: string) => {
    setSelectedGroupSlugs((s) => s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]);
  };
  const createGroupSubmissionMutation = useMutation({
    mutationFn: async () => {
      const trimmed = body.trim();
      const results = await Promise.allSettled(
        selectedGroupSlugs.map((slug) => apiRequest("POST", `/api/groups/${slug}/prayer-list`, { body: trimmed })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length) throw new Error(t("prayer_request.group_submit_failed_all", { defaultValue: "Couldn't submit to any of those communities — try again." }));
      return { failed };
    },
    onSuccess: ({ failed }) => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/me/group-prayer-submissions"] });
      if (failed > 0) {
        // Partial failure — landed somewhere, so don't silently navigate away
        // as if it reached everywhere the person picked.
        setError(t("prayer_request.group_submit_partial", { defaultValue: "Sent to some communities, but not all — you may have left one since picking it." }));
      } else {
        close("/prayer-list");
      }
    },
    onError: (err: any) => {
      setError(err?.message || t("prayer_request.couldnt_share"));
    },
  });

  // One calm landscape behind the page, picked once and faded gently up under a
  // dark wash (matching the office/Co-Breathe slides).
  const bgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  // How long the garden carries it — a 1–7 day dropdown, default 3.
  // Share cadence, encoded in `days`: -1 = one time (surfaces first, leaves a
  // person's list once they've prayed it, 7-day expiry), 0 = ongoing. Default
  // one-time.
  const [days, setDays] = useState<number>(-1);
  const [error, setError] = useState("");
  // Sheet dismissal: this screen rises from the bottom on open and slides back
  // DOWN on close/finish (like a podcast player closing — but it doesn't dock).
  // `closing` holds the destination to navigate to once the slide-down finishes.
  const [closing, setClosing] = useState<string | null>(null);
  const close = (dest: string) => setClosing(dest);
  // Set instead of navigating away immediately when the server flags the
  // just-shared request (crisis language and/or a stripped link) — see the
  // overlay below.
  const [postCreateNotice, setPostCreateNotice] = useState<{ crisisFlagged: boolean; linksRemoved: boolean } | null>(null);
  // This flow is community-only now (the "ask one person" path lives on the home
  // — tap a face). So no tagged users / directOnly here.
  const taggedUserIds: number[] = [];

  // Life-event extras — a short title + the date it happens. Drives the
  // "how did it go?" follow-up. The body still holds the prayer focus.
  // Life-event / justice are community asks whose extra fields (title/date) only
  // travel through the community submit path — which pilot never takes (dest is
  // forced to "list"). So in pilot, treat it as a plain personal request rather
  // than render fields that would be silently dropped on save.
  const isLifeEvent = kind === "life-event" && !isPilot;
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(""); // YYYY-MM-DD from <input type=date>
  const todayStr = new Date().toLocaleDateString("en-CA");

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { bodyRef.current?.focus(); }, []);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prayer-requests", {
        body: body.trim(),
        isAnonymous: false,
        // "Ongoing" (days === 0) skips the day-clock — the server gives it a
        // far-future expiry; otherwise carry it for the chosen number of days.
        ...(days === 0 ? { ongoing: true } : days === -1 ? { oneTime: true } : { durationDays: days }),
        kind,
        // Life-event only: a title + the date (sent as LOCAL noon so the
        // owner-tz calendar date is unambiguous). Ignored for other kinds.
        ...(isLifeEvent ? {
          eventTitle: eventTitle.trim(),
          eventDate: eventDate ? new Date(`${eventDate}T12:00:00`).toISOString() : undefined,
        } : {}),
        // Server accepts an empty / missing array. A non-empty selection means
        // "to a fellow" — directOnly makes the request private to them + you.
        taggedUserIds,
        directOnly: taggedUserIds.length > 0,
        // groupIds intentionally omitted — see the note above the removed
        // picker. The server now hard-rejects a non-empty groupIds array;
        // omitting it entirely keeps this on the legacy whole-garden path.
      }),
    onSuccess: (res: any) => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      if (res?.crisisFlagged || res?.linksRemoved) {
        setPostCreateNotice({ crisisFlagged: !!res?.crisisFlagged, linksRemoved: !!res?.linksRemoved });
      } else {
        close("/prayer-list");
      }
    },
    onError: (err: any) => {
      setError(err?.message || t("prayer_request.couldnt_share"));
    },
  });

  // Private list: add to prayer_intentions instead of sharing — just the text.
  const addToListMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prayer-intentions", { kind: "text", body: body.trim() }),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-intentions"] });
      close("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || t("prayer_request.couldnt_share", { defaultValue: "Couldn't save that — try again." }));
    },
  });

  // Renew-instead: the user's most-recent PAST request (expired or released),
  // so they can bring it back for another 7 days instead of writing a fresh one
  // — the same surface the office-close ask slide shows.
  const lastMineQuery = useQuery<{ request: {
    id: number; body: string; closedAt: string | null;
    isAnswered: boolean; isActive: boolean; isExpired: boolean;
  } | null }>({
    queryKey: ["/api/prayer-requests/last-mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/last-mine"),
    enabled: !!user,
  });
  const renewableLastMine: { id: number; body: string } | null = (() => {
    const r = lastMineQuery.data?.request;
    if (!r || r.isActive || r.isAnswered) return null;
    if (!r.isExpired && !r.closedAt) return null;
    return { id: r.id, body: r.body };
  })();
  const renewMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
      setLocation("/prayer-list");
    },
  });

  // Needs the prayer text always; "group" also needs at least one community
  // picked — an empty selection has nowhere to submit to, and (unlike the
  // old removed path) must never silently fall back to anything wider.
  const canSubmit = body.trim().length > 0 && (dest !== "group" || selectedGroupSlugs.length > 0);
  const submitting = createMutation.isPending || addToListMutation.isPending || createGroupSubmissionMutation.isPending;

  // One slide now: validate, then submit. (Life events also carry a title + date.)
  function handleSubmit() {
    if (dest === "list") {
      if (body.trim().length === 0) { setError(t("prayer_request.write_request_first")); return; }
      setError("");
      addToListMutation.mutate();
      return;
    }
    if (dest === "group") {
      if (body.trim().length === 0) { setError(t("prayer_request.write_request_first")); return; }
      if (selectedGroupSlugs.length === 0) { setError(t("prayer_request.pick_a_community", { defaultValue: "Pick at least one community to submit to." })); return; }
      setError("");
      createGroupSubmissionMutation.mutate();
      return;
    }
    if (body.trim().length === 0) { setError(t("prayer_request.write_request_first")); return; }
    if (isLifeEvent) {
      if (eventTitle.trim().length === 0) { setError(t("prayer_request.life_event_need_title", { defaultValue: "Give it a short title." })); return; }
      if (!eventDate) { setError(t("prayer_request.life_event_need_date", { defaultValue: "Pick the date it happens." })); return; }
    }
    setError("");
    createMutation.mutate();
  }

  function handleBack() {
    close("/prayer-list");
  }

  // Auth guard — same pattern as the other template pages
  if (!user) {
    setLocation("/");
    return null;
  }

  return (
    <>
    <motion.div
      // Rises from the bottom on open; slides back DOWN on close/finish (like a
      // podcast player closing — but it doesn't stay docked). When the slide-down
      // completes we navigate to wherever `closing` points.
      initial={{ y: "100%" }}
      animate={{ y: closing ? "100%" : 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => { if (closing) setLocation(closing); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, isolation: "isolate", minHeight: "100dvh", overflowY: "auto", background: BG, overflowX: "hidden" }}
    >
      {/* A still landscape behind the page, faded gently up under a dark wash. */}
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            aria-hidden
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
        </>
      )}

      {/* Close — top-right X (matches the office-close ask slide). */}
      <div style={{ paddingTop: "max(0.75rem, var(--safe-top))", paddingLeft: 20, paddingRight: 16, paddingBottom: 2, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleBack}
          aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(240,237,230,0.7)", cursor: "pointer" }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", width: "100%", padding: "8px 24px calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px) + 24px)" }}>
        {/* One slide — centered, matching the office-close "How can the community
            pray for you?" ask: eyebrow, italic title, note, then write + share. */}
        <div className="flex flex-col items-center text-center gap-5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "rgba(143,175,150,0.45)", fontFamily: SPACE }}>
            {copy.eyebrow}
          </p>
          <h1 className="text-[24px] leading-[1.4] font-medium italic" style={{ color: "#E8E4D8", fontFamily: SPACE, marginTop: -4, marginBottom: -4, whiteSpace: "pre-line" }}>
            {copy.title}
          </h1>

          {/* Destination — keep it on your private list, share with your whole
              garden, or submit to specific communities' moderated lists. Only
              the default "request" kind offers privacy. */}
          {!isLifeEvent && kind === "request" && !isPilot && (
            <div className="w-full flex gap-2">
              {([
                ["list", t("prayer_request.dest_list", { defaultValue: "Keep on my list" })],
                ["share", t("prayer_request.dest_share", { defaultValue: "Share with community" })],
                ...(openGroups.length > 0 ? [["group", t("prayer_request.dest_group", { defaultValue: "Submit to a community" })] as const] : []),
              ] as const).map(([val, label]) => {
                const on = dest === val;
                return (
                  <button key={val} type="button" onClick={() => { setDest(val); setError(""); }}
                    className="flex-1 rounded-full text-[13px] font-semibold py-2.5 transition-opacity active:scale-[0.98]"
                    style={{ fontFamily: SPACE, color: on ? CREAM : SAGE, background: on ? "rgba(46,107,64,0.42)" : GLASS, border: `1px solid ${on ? "rgba(168,197,160,0.5)" : GLASS_BORDER}` }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* "group" — pick which communities. Reviewed by that community's
              own admin before it reaches anyone (owner). */}
          {dest === "group" && (
            <div className="w-full text-left">
              <p className="text-[12px] mb-2" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
                {t("prayer_request.pick_communities", { defaultValue: "Submit to which communities?" })}
              </p>
              <div className="flex flex-col gap-2">
                {openGroups.map((g) => {
                  const isSel = selectedGroupSlugs.includes(g.slug);
                  return (
                    <button
                      key={g.slug}
                      type="button"
                      onClick={() => toggleGroupSlug(g.slug)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors"
                      style={{ background: isSel ? "rgba(46,107,64,0.28)" : GLASS, border: `1px solid ${isSel ? "rgba(143,175,150,0.55)" : GLASS_BORDER}` }}
                    >
                      <span className="text-[16px] flex-shrink-0" aria-hidden>{g.emoji || "🏘️"}</span>
                      <span className="text-[14px] flex-1 truncate" style={{ color: CREAM, fontFamily: SPACE }}>{g.name}</span>
                      {isSel && <span style={{ color: "#C8D4C0" }} aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] mt-2.5" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
                {t("prayer_request.group_moderation_note", { defaultValue: "A leader reads this before it reaches the community." })}
              </p>
            </div>
          )}

          {/* Life-event: a short title + the date it happens. */}
          {isLifeEvent && (
            <div className="w-full space-y-3 text-left">
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => { setEventTitle(e.target.value.slice(0, 80)); setError(""); }}
                placeholder={t("prayer_request.life_event_title_placeholder", { defaultValue: "What is it? e.g. Knee surgery" })}
                className="w-full px-4 py-3.5 text-base"
                style={{ ...glassField, fontFamily: SPACE }}
              />
              <div>
                <label className="text-[12px] block mb-1.5" style={{ color: "#8FAF96", fontFamily: SPACE }}>
                  {t("prayer_request.life_event_date_label", { defaultValue: "When does it happen?" })}
                </label>
                <input
                  type="date"
                  value={eventDate}
                  min={todayStr}
                  onChange={(e) => { setEventDate(e.target.value); setError(""); }}
                  className="w-full px-4 py-3.5 text-base"
                  style={{ ...glassField, fontFamily: SPACE, colorScheme: "dark" }}
                />
              </div>
            </div>
          )}

          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setError(""); }}
            rows={4}
            placeholder={dest === "list"
              ? t("intentions.text_ph", { defaultValue: "What are you praying for?" })
              : copy.placeholder}
            className="w-full rounded-2xl px-5 py-4 text-[15px] outline-none resize-none text-left"
            style={{ background: "rgba(9,26,16, 0.308)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,225,210,0.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", color: CREAM, fontFamily: SPACE, fontStyle: "italic", lineHeight: 1.65, marginTop: 12 }}
          />

          {/* Crisis-resources line — owner: "I don't want the 988 call line
              below the field always, just that if a scan detects concerning
              language it comes up with a warning." Live client-side mirror
              of the server's scanForCrisisLanguage (contentSafety.ts) — a
              hint only, not enforcement; the server scan is still the
              authoritative layer (auto-flag, the post-create notice) for
              whatever this live check misses. Shown for the public/garden
              path only; the private list isn't read by anyone else. */}
          {(dest === "share" || dest === "group") && scanForCrisisLanguage(body) && (
            <p className="text-[12px] text-center" style={{ color: SAGE_DIM, fontFamily: SPACE, marginTop: -6 }}>
              {t("prayer_request.crisis_line", { defaultValue: "In crisis? Call or text 988, any time." })}
            </p>
          )}

          {/* Pointer to the "group" destination above — only shown for
              "share" (whole-garden); redundant once "group" is already
              selected, since that IS the moderated community path now. */}
          {dest === "share" && openGroups.length > 0 && (
            <p className="text-[12px] text-center" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
              {t("prayer_request.community_prayer_list_pointer", {
                defaultValue: "Want to ask just one community? Choose “Submit to a community” above instead.",
              })}
            </p>
          )}

          {/* How long the garden carries it — a 1–7 day dropdown (default 3).
              Life events derive their lifetime from the event date instead.
              A private list item isn't shared, so it has no carry window. */}
          {!isLifeEvent && dest === "share" && (
            <div className="w-full">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label={t("prayer_request.duration_question", { defaultValue: "How long should we carry it?" })}
              style={{
                width: "100%", background: "rgba(9,26,16, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", color: CREAM,
                border: "1px solid rgba(200,225,210,0.18)", borderRadius: 999,
                padding: "12px 24px", fontSize: 14, fontWeight: 600, fontFamily: SPACE,
                textAlignLast: "center", colorScheme: "dark", cursor: "pointer", outline: "none",
              }}
            >
              <option value={-1}>{t("prayer_request.duration_one_time", { defaultValue: "One time" })}</option>
              {/* Owner: "the dropdown should be one time or up to seven days...
                  There should be no ongoing if it's shared with community."
                  A bounded 2–8 day range — nothing open-ended, and no 9-day
                  Novena preset. A shared prayer is carried for a week-plus,
                  then released, rather than accumulating forever. */}
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {t("prayer_request.duration_n_days", { count: n, defaultValue: `${n} days` })}
                </option>
              ))}
            </select>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: "#C47A65" }}>{error}</p>}

          <div className="flex flex-col gap-3 w-full mt-1">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "rgba(46,107,64,0.55)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", color: CREAM, fontFamily: SPACE, border: "1px solid rgba(168,197,160,0.5)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", cursor: "pointer" }}
            >
              {dest === "list"
                ? (addToListMutation.isPending ? t("intentions.adding", { defaultValue: "Adding…" }) : t("intentions.add", { defaultValue: "Add to my list" }))
                : dest === "group"
                  ? (createGroupSubmissionMutation.isPending ? t("prayer_request.submitting", { defaultValue: "Submitting…" }) : t("prayer_request.submit_to_community", { defaultValue: "Submit for review" }))
                  : (createMutation.isPending ? t("prayer_request.sharing") : t("prayer_request.share_with_community"))}
            </button>
            <button
              onClick={handleBack}
              className="text-sm transition-opacity hover:opacity-80"
              style={{ color: "rgba(143,175,150,0.55)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE }}
            >
              {t("common.skip", { defaultValue: "Skip" })}
            </button>
          </div>
        </div>
      </div>
    </motion.div>

    {/* Shown instead of navigating away immediately when the server flagged
        the just-created/edited request — crisis language (resources, not a
        block: the post already went through) and/or a stripped link. Owner
        direction: an automated scan can't catch everything, so this is a
        second layer, not the only one — the standing 988 line near the
        textarea above is the layer that doesn't depend on the scan firing
        at all. "Continue" finishes the close/navigate that onSuccess
        deferred. */}
    {postCreateNotice && (
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center"
        style={{ background: "rgba(6,18,11,0.72)", backdropFilter: "blur(3px)" }}
      >
        <div
          className="w-full"
          style={{ maxWidth: 460, margin: "0 10px", background: "rgba(9,26,16,0.85)", backdropFilter: "blur(14.4px)", WebkitBackdropFilter: "blur(14.4px)", border: `1px solid ${GLASS_BORDER}`, borderRadius: "20px 20px 0 0", padding: "24px 22px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
          {postCreateNotice.crisisFlagged && (
            <div className="mb-5">
              <p className="text-[17px] font-semibold mb-2" style={{ color: CREAM, fontFamily: SPACE }}>
                {t("prayer_request.crisis_notice_title", { defaultValue: "Your prayer request was shared." })}
              </p>
              <p className="text-[14px] leading-relaxed mb-3" style={{ color: SAGE, fontFamily: SPACE }}>
                {t("prayer_request.crisis_notice_body", { defaultValue: "What you wrote sounds like it might be a hard moment. If you're in crisis, please reach out — you don't have to carry it alone." })}
              </p>
              <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(143,175,150,0.3)" }}>
                <p className="text-[14px] font-semibold" style={{ color: CREAM, fontFamily: SPACE }}>988 Suicide & Crisis Lifeline</p>
                <p className="text-[13px]" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
                  {t("prayer_request.crisis_notice_howto", { defaultValue: "Call or text 988, anytime — free and confidential." })}
                </p>
              </div>
            </div>
          )}
          {postCreateNotice.linksRemoved && (
            <p className="text-[13.5px] mb-5" style={{ color: SAGE_DIM, fontFamily: SPACE, fontStyle: "italic" }}>
              {t("prayer_request.link_removed_notice", { defaultValue: "One thing — links aren't shareable in prayer requests, so we removed it before posting." })}
            </p>
          )}
          <button
            type="button"
            onClick={() => { setPostCreateNotice(null); close("/prayer-list"); }}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.9)", color: CREAM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: SPACE }}
          >
            {t("common.continue", { defaultValue: "Continue" })}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// ── Audience picker ────────────────────────────────────────────────
//
// "Who is this for?" — the request goes to everyone you're connected with
// (the default garden feed) OR privately to a fellow (wide pills with their
// photo + name; multi-select allowed). Picking a fellow makes the request
// directOnly server-side, so only they + you can ever see it.
type FellowLite = { userId: number; name: string | null; avatarUrl: string | null };
function AudiencePicker({
  selectedIds,
  onChange,
}: {
  selectedIds: number[];
  onChange: (next: number[]) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Search your whole GARDEN (everyone you're connected with), not just fellows.
  const { data: garden } = usePeople(user?.id);
  const people = (garden ?? []).filter((p) => p.userId != null && p.userId !== user?.id);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? people.filter((p) => (p.name ?? "").toLowerCase().includes(q)) : people;
  // "individual" mode the moment someone's picked; otherwise the everyone default.
  const [mode, setMode] = useState<"everyone" | "individual">(selectedIds.length > 0 ? "individual" : "everyone");

  const toggle = (uid: number) => {
    onChange(selectedIds.includes(uid) ? selectedIds.filter(x => x !== uid) : [...selectedIds, uid]);
  };

  const Option = ({ active, emoji, title, sub, onClick }: { active: boolean; emoji: string; title: string; sub: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors"
      style={{ background: active ? "rgba(46,107,64,0.28)" : GLASS, border: `1px solid ${active ? "rgba(143,175,150,0.55)" : GLASS_BORDER}` }}
    >
      <span style={{ fontSize: 20 }} aria-hidden>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: CREAM, fontFamily: SPACE }}>{title}</span>
        <span className="block text-[12px]" style={{ color: SAGE, fontFamily: SPACE }}>{sub}</span>
      </span>
      {active && <span style={{ color: "#C8D4C0" }} aria-hidden>✓</span>}
    </button>
  );

  return (
    <div className="mb-6">
      <p className="text-[12px] font-semibold mb-2" style={{ color: SAGE, fontFamily: SPACE }}>
        {t("prayer_request.audience_q", { defaultValue: "Who is this for?" })}
      </p>
      <div className="flex flex-col gap-2">
        <Option
          active={mode === "everyone"}
          emoji="🌿"
          title={t("prayer_request.audience_everyone", { defaultValue: "Everyone you're connected with" })}
          sub={t("prayer_request.audience_everyone_sub", { defaultValue: "Shared with your circle's prayer feed" })}
          onClick={() => { setMode("everyone"); onChange([]); }}
        />
        <Option
          active={mode === "individual"}
          emoji="👤"
          title={t("prayer_request.audience_individual", { defaultValue: "An individual" })}
          sub={t("prayer_request.audience_individual_sub", { defaultValue: "Private — just between you and them" })}
          onClick={() => setMode("individual")}
        />
      </div>

      {mode === "individual" && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("prayer_request.audience_search", { defaultValue: "Search your garden…" })}
            className="w-full rounded-2xl px-4 py-2.5 text-[14px]"
            style={{ background: GLASS, border: `1px solid ${GLASS_BORDER}`, color: CREAM, fontFamily: SPACE, outline: "none" }}
          />
          {matches.length === 0 ? (
            <p className="text-[12px] italic px-1 py-2" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
              {q
                ? t("prayer_request.audience_no_match", { defaultValue: "No one by that name." })
                : t("prayer_request.audience_empty_garden", { defaultValue: "No one in your garden yet." })}
            </p>
          ) : matches.slice(0, 40).map((f) => {
            const isSel = selectedIds.includes(f.userId!);
            return (
              <button
                key={f.userId}
                type="button"
                onClick={() => toggle(f.userId!)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors"
                style={{ background: isSel ? "rgba(46,107,64,0.28)" : GLASS, border: `1px solid ${isSel ? "rgba(143,175,150,0.55)" : GLASS_BORDER}` }}
              >
                {f.avatarUrl ? (
                  <img src={f.avatarUrl} alt={f.name ?? ""} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold" style={{ background: "#1A4A2E", color: "#C8D4C0" }}>
                    {(f.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <span className="text-[14px] flex-1 truncate" style={{ color: CREAM, fontFamily: SPACE }}>{f.name ?? "Someone"}</span>
                {isSel && <span style={{ color: "#C8D4C0" }} aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
