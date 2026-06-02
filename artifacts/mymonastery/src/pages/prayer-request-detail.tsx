import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { amenWithLocation } from "@/lib/prayLocation";
import { playOpeningSwell, triggerAmenFeedback, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { RequestWordField } from "@/components/RequestWordField";
import { PrayerKindPill } from "@/components/prayer-kind-pill";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { sharePrayerRequest } from "@/lib/sharePrayerRequest";

// Deep-link landing for "X is asking for your prayers" (and the
// other prayer-request pushes — first amen, third amen, word of
// comfort, renewal nudge). The slide is intentionally a 1:1 copy of
// the slideshow's `kind === "request"` slide: same author face +
// pulse, same eyebrow + kind pill, same italic Georgia body, same
// word-of-comfort composer, same 7-second-hold Amen button.
//
// Owner branch (rare here — the new-prayer-request push doesn't
// target the author) keeps the engagement-history view: latest
// amen avatar pulse, count line, full pray-er rail, every word.

type PrayerWord = {
  id: number;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string | null;
};

type PrayerAmen = {
  userId: number;
  userName: string | null;
  userAvatarUrl: string | null;
  prayedAt: string;
};

type TaggedUser = {
  id: number;
  name: string | null;
  avatarUrl: string | null;
};

type PrayerRequestDetail = {
  id: number;
  body: string;
  kind: string | null;
  ownerId: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  viewerIsOwner: boolean;
  // True when the viewer was explicitly tagged in this prayer
  // request. Drives the "Remove me" affordance + a small "Tagged
  // here" pill so a viewer who's not an owner / garden member
  // understands why they're seeing this.
  viewerIsTagged: boolean;
  // Users the owner tagged in this prayer ("praying for my friend
  // Matthew"). Rendered as a row of small avatars beneath the
  // body. Empty array when nobody was tagged.
  tags: TaggedUser[];
  // Owner-only share token. Drives the "Share" button on the
  // detail page — populated only when viewerIsOwner is true,
  // otherwise null. /p/:token is the public-share URL fragment
  // built from this.
  shareToken: string | null;
  words: PrayerWord[];
  amens: PrayerAmen[];
  amenCountTotal: number;
  myWord: string | null;
  myAmenedToday: boolean;
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

// 7-second pause-before-Amen, byte-for-byte the same as the
// slideshow's AmenButton (prayer-mode.tsx). Lifted in here so the
// notification deep-link slide feels identical to the slideshow
// surface — same wash animation, same haptic on reveal, same
// medium impact on tap. Re-mounts (and therefore restarts the
// timer) when slideKey changes; here that's a no-op because the
// slide is the page itself, but we keep the prop for parity.
function AmenButton({ slideKey, onAdvance }: { slideKey: string | number; onAdvance: () => void }) {
  const { t } = useTranslation();
  const HOLD_MS = 4000;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReady(true);
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
        );
      } catch { /* non-fatal */ }
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [slideKey]);

  return (
    <button
      onClick={() => { if (ready) onAdvance(); }}
      disabled={!ready}
      aria-disabled={!ready}
      aria-label={ready ? t("prayer_request_detail.amen") : t("prayer_request_detail.amen_hold")}
      className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide active:scale-[0.98] relative overflow-hidden"
      style={{
        background: ready ? "#2D5E3F" : "rgba(46,107,64,0.18)",
        border: `1px solid ${ready ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
        color: "#F0EDE6",
        cursor: ready ? "pointer" : "default",
        minWidth: 140,
        transition: ready
          ? "background-color 360ms ease-out, border-color 360ms ease-out"
          : "none",
      }}
    >
      <span
        aria-hidden
        key={slideKey}
        className="absolute left-0 top-0 bottom-0 amen-progress-fill"
        style={{
          background: "rgba(46,107,64,0.45)",
          pointerEvents: "none",
          opacity: ready ? 0 : 1,
          transition: "opacity 360ms ease-out",
        }}
      />
      <span
        style={{
          position: "relative",
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(2px)",
          transition: "opacity 280ms ease-out, transform 280ms ease-out",
          display: "inline-block",
        }}
      >
        {t("prayer_request_detail.amen_button")}
      </span>
    </button>
  );
}

export default function PrayerRequestDetailPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/prayer-requests/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const search = useSearch();
  const queryClient = useQueryClient();

  const showRenewSlide = useMemo(() => {
    return new URLSearchParams(search).get("renew") === "1";
  }, [search]);

  // Only feature a single "Amen from {name}" when the viewer arrived from
  // the first-amen push (?amen=1), which is heralding that pray-er.
  // Opening the request any other way (e.g. tapping it in the prayer
  // list) shouldn't single out one amen above the others.
  const fromAmenPush = useMemo(() => {
    return new URLSearchParams(search).get("amen") === "1";
  }, [search]);

  const { data, isLoading, error } = useQuery<PrayerRequestDetail>({
    queryKey: [`/api/prayer-requests/by-id/${id}`],
    queryFn: () => apiRequest("GET", `/api/prayer-requests/by-id/${id}`) as Promise<PrayerRequestDetail>,
    enabled: Number.isFinite(id),
  });

  // Clear the push notification for this request as soon as the
  // detail page mounts. The user has obviously seen the request
  // (they tapped through to view it) so the lock-screen banner
  // shouldn't keep lingering. Native shell listens for this event
  // and removes any delivered notification whose APN thread-id
  // matches `prayer-request-{id}`. No-op on web.
  useEffect(() => {
    if (!Number.isFinite(id)) return;
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:clear-notifications", { detail: { threadId: `prayer-request-${id}` } })
      );
    } catch { /* non-fatal */ }
  }, [id]);

  const [amened, setAmened] = useState(false);
  const amenMutation = useMutation({
    mutationFn: () => amenWithLocation(id),
    onSuccess: () => {
      // Same feedback the slideshow fires on Amen — a medium-impact
      // haptic + the chapel chime. Keeps the deep-link slide feeling
      // like a slide, not a settings row.
      try { triggerAmenFeedback(); } catch { /* non-fatal */ }
      // Clear the push notification for this request — the user has
      // responded, so it shouldn't linger on the lock screen.
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:clear-notifications", { detail: { threadId: `prayer-request-${id}` } })
        );
      } catch { /* non-fatal */ }
      setAmened(true);
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const renewMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      triggerSubmitFeedback();
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      // Renewing / releasing changes the Prayer List "Past" backlog.
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
      setLocation("/prayer-list");
    },
  });
  const releaseMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/prayer-requests/${id}/release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
      setLocation("/prayer-list");
    },
  });

  // Tagged-user opt-out. Lets a viewer who was tagged ("praying
  // for my friend Matthew") remove themselves quietly — the row is
  // soft-deleted server-side (removed_at stamped) so the audit
  // trail persists, and they stop receiving pushes / lose request-
  // scoped visibility on the next refetch. We invalidate both
  // detail + list so the dashboard reflects the change immediately.
  const removeMyTag = useMutation({
    mutationFn: (userId: number) =>
      apiRequest("DELETE", `/api/prayer-requests/${id}/tags/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  // Owner-side tag management. addTags POSTs the requested userIds;
  // the server uses ON CONFLICT DO UPDATE to revive soft-removed
  // rows or insert fresh. We use the same DELETE endpoint as
  // removeMyTag (owner is also authorized server-side) but key the
  // mutation off the target user id so the UI can show per-row
  // pending state if multiple removals overlap.
  const addTags = useMutation({
    mutationFn: (userIds: number[]) =>
      apiRequest("POST", `/api/prayer-requests/${id}/tags`, { userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });
  const removeTag = useMutation({
    mutationFn: (userId: number) =>
      apiRequest("DELETE", `/api/prayer-requests/${id}/tags/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  // Owner inline body edit — the slide replaces the modal that used
  // to carry Edit; reuse the same PATCH endpoint the prayer-list
  // modal used. `editing` toggles the textarea over the body; the
  // draft seeds from data.body when the owner taps Edit.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const editBodyMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("PATCH", `/api/prayer-requests/${id}`, { body }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  // Paint Safari/WebView background to the slide bg + play the opening
  // swell + medium haptic on arrival. We do NOT lock body scroll here
  // — the slideshow does because each slide fits in one viewport, but
  // an owner viewing this deep-link page can have a long amen rail +
  // words-of-comfort list that overflow. Locking body scroll trapped
  // the user with no way to reach the bottom and no X-out either.
  useEffect(() => {
    const SLIDE_BG = "#0C1F12";
    const html = document.documentElement;
    const body = document.body;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlBg = html.style.backgroundColor;
    body.style.backgroundColor = SLIDE_BG;
    html.style.backgroundColor = SLIDE_BG;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content") ?? "#091A10";
    meta?.setAttribute("content", SLIDE_BG);
    playOpeningSwell(0);
    try {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }));
    } catch { /* ignore */ }
    return () => {
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
    };
  }, []);

  // ── Layout ──────────────────────────────────────────────────────────────
  // The recipient view is short and stays vertically centered like a
  // slideshow slide. The owner view can grow tall (amen rail + every
  // word-of-comfort card) so it justifies to the top and scrolls
  // naturally. Either way a fixed X in the top-right always provides
  // a no-fail exit.
  const SLIDE_BG = "#0C1F12";
  const isOwnerView = data?.viewerIsOwner === true;

  return (
    <div
      style={{
        background: SLIDE_BG,
        minHeight: "100dvh",
        position: "relative",
      }}
    >
      {/* Always-visible close + share — fixed position so they never
          scroll off, and high enough above any iOS notch / safe area
          that the user can always reach them. Share sits to the left
          of the close. The Share button only mounts when the request
          actually has a share token (the same gate the inline button
          used to use). */}
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 16,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {data?.shareToken && (
          <ShareLinkIconButton
            shareToken={data.shareToken}
            ownerName={data.ownerName ?? t("prayer_request_detail.someone")}
          />
        )}
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          aria-label={t("prayer_request_detail.close")}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(46,107,64,0.18)",
            border: "1px solid rgba(46,107,64,0.35)",
            color: "#C8D4C0",
            fontSize: 18,
            fontFamily: "'Space Grotesk', sans-serif",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          minHeight: "100dvh",
          // Recipient view stays vertically centered (single slide-
          // shaped column). Owner view top-anchors so a long amen
          // rail + every word-of-comfort can scroll naturally without
          // pushing the body off the top of the screen.
          justifyContent: isOwnerView ? "flex-start" : "center",
          paddingTop: "clamp(64px, 14dvh, 140px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)",
        }}
      >
        {isLoading && (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.55)" }}>
            {t("prayer_request_detail.loading")}
          </p>
        )}

        {!isLoading && (error || !data) && (
          <p className="text-sm" style={{ color: "rgba(200,212,192,0.55)" }}>
            {t("prayer_request_detail.couldnt_load")}
          </p>
        )}

        {data && !data.viewerIsOwner && (
          // ── Recipient view: 1:1 with the slideshow's request slide ──
          // Author face + name + Prayer Request eyebrow + kind pill +
          // body + word-of-comfort composer + 7s Amen.
          <div className="w-full flex flex-col items-center text-center gap-5">
            {/* Author avatar with the soft prayer-avatar-pulse breathing
                border — same visual heartbeat the slideshow uses to
                anchor each request to a specific person. */}
            <div className="flex flex-col items-center gap-3">
              {data.ownerAvatarUrl ? (
                <img
                  src={data.ownerAvatarUrl}
                  alt={data.ownerName ?? t("prayer_request_detail.prayer_author_alt")}
                  className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
                  style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                >
                  {initials(data.ownerName ?? "")}
                </div>
              )}
              {data.ownerName && (
                <p
                  className="text-[14px]"
                  style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {data.ownerName}
                </p>
              )}
            </div>

            {/* Eyebrow + kind pill on a single row, same shape as
                the slideshow. */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                  style={{ color: "rgba(143,175,150,0.45)" }}
                >
                  {t("prayer_request_detail.eyebrow_request")}
                </p>
                <PrayerKindPill kind={data.kind} />
              </div>
            </div>

            {/* Body — italic Georgia, 22px, leading 1.5 — identical
                to the slideshow body styling. */}
            <p
              className="text-[22px] leading-[1.5] font-medium italic"
              style={{
                color: "#E8E4D8",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {data.body}
            </p>

            {/* Tagged users row — shared with the owner view below. */}
            {data.tags.length > 0 && (
              <TaggedRow
                tags={data.tags}
                viewerIsTagged={data.viewerIsTagged}
                ownerEditing={false}
                ownerAddTags={() => undefined}
                ownerRemoveTag={() => undefined}
                ownerUserId={data.ownerId}
                onRemoveSelf={(uid) => removeMyTag.mutate(uid)}
                removingId={removeMyTag.isPending ? removeMyTag.variables ?? null : null}
              />
            )}

            {data.viewerIsTagged ? (
              // ── Tagged subject: the prayer is FOR this viewer, so show
              // who prayed for them + the words of comfort, not a "pray
              // for this" composer. (Mirrors the owner view's engagement
              // surface; kept inline so the owner view stays untouched.)
              <div className="w-full flex flex-col items-center text-center gap-4">
                {data.amenCountTotal > 0 ? (
                  <p
                    className="text-[13px]"
                    style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {t("prayer_request_detail.prayed_for_you", { count: data.amenCountTotal })}
                  </p>
                ) : (
                  <p
                    className="text-[13px] italic"
                    style={{ color: "rgba(143,175,150,0.7)", fontFamily: "Georgia, 'Times New Roman', serif" }}
                  >
                    {t("prayer_request_detail.tagged_awaiting")}
                  </p>
                )}

                {/* Avatar rail — everyone who prayed for you, recent first. */}
                {data.amens.length > 0 && (
                  <div className="flex items-center justify-center">
                    {data.amens.slice(0, 8).map((a, i) => (
                      <div
                        key={`${a.userId}-${a.prayedAt}`}
                        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2"
                        style={{ borderColor: SLIDE_BG, marginLeft: i === 0 ? 0 : -8, background: "#1A4A2E", color: "#A8C5A0" }}
                        title={a.userName ?? t("prayer_request_detail.someone")}
                      >
                        {a.userAvatarUrl ? (
                          <img src={a.userAvatarUrl} alt={a.userName ?? t("prayer_request_detail.someone")} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-semibold">{initials(a.userName ?? "")}</span>
                        )}
                      </div>
                    ))}
                    {data.amens.length > 8 && (
                      <span className="ml-2 text-[11px]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}>
                        +{data.amens.length - 8}
                      </span>
                    )}
                  </div>
                )}

                {/* Words of comfort left on the request, newest first. */}
                {data.words.length > 0 && (
                  <div className="w-full flex flex-col gap-3 mt-1">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "rgba(143,175,150,0.45)" }}>
                      {t("prayer_request_detail.words_of_comfort", { count: data.words.length })}
                    </p>
                    {data.words.map(w => (
                      <div
                        key={w.id}
                        className="w-full rounded-2xl px-5 py-4 flex flex-col items-center text-center gap-2"
                        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.15)" }}
                      >
                        {w.authorAvatarUrl ? (
                          <img src={w.authorAvatarUrl} alt={w.authorName} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                            {initials(w.authorName)}
                          </div>
                        )}
                        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "rgba(143,175,150,0.45)" }}>
                          {t("prayer_request_detail.from_name", { name: w.authorName })}
                        </p>
                        <p className="italic" style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 16, lineHeight: 1.55 }}>
                          {w.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Word of comfort — shared component the slideshow uses,
                    so the composer behavior (existing word display, ×-clear,
                    error mapping) matches exactly. */}
                <RequestWordField requestId={data.id} initialWord={data.myWord ?? null} />

                {/* 7-second Amen. After tap, swap to a quiet "✓ Amen sent"
                    state — same once-per-day server throttle as the
                    slideshow's path; re-tapping is a no-op. */}
                {amened || data.myAmenedToday ? (
                  <div
                    className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide"
                    style={{
                      background: "rgba(46,107,64,0.18)",
                      border: "1px solid rgba(46,107,64,0.45)",
                      color: "#A8C5A0",
                      fontFamily: "'Space Grotesk', sans-serif",
                      minWidth: 140,
                    }}
                  >
                    {t("prayer_request_detail.amen_sent")}
                  </div>
                ) : (
                  <AmenButton
                    slideKey={data.id}
                    onAdvance={() => { if (!amenMutation.isPending) amenMutation.mutate(); }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {data && data.viewerIsOwner && (
          // ── Owner view: engagement history (rare — the new-request
          // push doesn't target the author, but they CAN navigate here
          // from the prayer-list, the renewal nudge, etc.). Same slide
          // chrome as the recipient view (centered column, paddings)
          // but the active surfaces below are amens / words / renew
          // controls instead of an Amen button.
          <div className="w-full flex flex-col items-center text-center gap-5">
            <div className="flex flex-col items-center gap-1.5">
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{ color: "rgba(143,175,150,0.45)" }}
              >
                {showRenewSlide ? t("prayer_request_detail.eyebrow_owner_wrapping_up") : t("prayer_request_detail.eyebrow_owner")}
              </p>
            </div>

            {editing ? (
              // Inline edit — textarea in the body slot + Save/Cancel.
              // Same shape the prayer-list modal used; the Edit pill
              // next to Back toggles this on.
              <div className="w-full" style={{ maxWidth: 480 }}>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                  style={{
                    background: "#091A10",
                    border: "1px solid rgba(46,107,64,0.3)",
                    color: "#F0EDE6",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 16, // iOS Safari: ≥16 to prevent auto-zoom
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.55)" }}>
                    {editDraft.trim().length}/1000
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      disabled={editBodyMutation.isPending}
                      className="text-xs font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ color: "rgba(143,175,150,0.75)", border: "1px solid rgba(143,175,150,0.2)" }}
                    >
                      {t("prayer_request_detail.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => editBodyMutation.mutate(editDraft.trim())}
                      disabled={!editDraft.trim() || editDraft.trim() === data.body || editBodyMutation.isPending}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                    >
                      {editBodyMutation.isPending ? t("prayer_request_detail.saving") : t("prayer_request_detail.save")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p
                className="text-[22px] leading-[1.5] font-medium italic"
                style={{
                  color: "#E8E4D8",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                {data.body}
              </p>
            )}

            {/* Tagged users — read row + per-chip remove + "+ Tag
                someone" pill. Owner can manage tags after creation:
                tap × on a chip to untag (soft-delete), tap + Tag
                someone to open a picker. */}
            <TaggedRow
              tags={data.tags}
              viewerIsTagged={false}
              ownerEditing
              ownerAddTags={(ids) => addTags.mutate(ids)}
              ownerRemoveTag={(uid) => removeTag.mutate(uid)}
              ownerUserId={data.ownerId}
              removingId={removeTag.isPending ? removeTag.variables ?? null : null}
              onRemoveSelf={() => undefined}
            />


            {/* Featured amen — pulses the pray-er the first-amen push is
                heralding. Only shown when the viewer arrived from that
                push (?amen=1); opening from the prayer list shows the
                count + faces row below, but no single featured amen. */}
            {fromAmenPush && data.amens.length > 0 && (() => {
              const latestAmen = data.amens[0];
              const latestAmenName = latestAmen.userName ?? t("prayer_request_detail.someone");
              return (
                <div className="w-full flex flex-col items-center text-center gap-3 mt-2">
                  {latestAmen.userAvatarUrl ? (
                    <img
                      src={latestAmen.userAvatarUrl}
                      alt={latestAmenName}
                      className="w-14 h-14 rounded-full object-cover prayer-avatar-pulse"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-base font-semibold prayer-avatar-pulse"
                      style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                    >
                      {initials(latestAmenName)}
                    </div>
                  )}
                  <p
                    className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                    style={{ color: "rgba(143,175,150,0.5)" }}
                  >
                    {t("prayer_request_detail.amen_from", { name: latestAmenName })}
                  </p>
                </div>
              );
            })()}

            {data.amenCountTotal > 0 && (
              <p
                className="text-[13px]"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {t("prayer_request_detail.prayed_n", { count: data.amenCountTotal })}
              </p>
            )}

            {data.amens.length === 0 && !showRenewSlide && (
              <p
                className="text-[13px] italic"
                style={{
                  color: "rgba(143,175,150,0.7)",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                {t("prayer_request_detail.community_notified")}
              </p>
            )}

            {/* Renew / release decision UI — only when the viewer is
                the owner AND ?renew=1 is on the URL. */}
            {showRenewSlide && (
              <div className="w-full flex flex-col items-center gap-3 mt-4">
                <button
                  onClick={() => renewMutation.mutate()}
                  disabled={renewMutation.isPending || releaseMutation.isPending}
                  className="px-8 py-3 rounded-full text-sm font-semibold disabled:opacity-50"
                  style={{ background: "#2D5E3F", color: "#F0EDE6", minWidth: 240 }}
                >
                  {renewMutation.isPending ? t("prayer_request_detail.renewing") : t("prayer_request_detail.renew_for_7")}
                </button>
                <button
                  onClick={() => releaseMutation.mutate()}
                  disabled={renewMutation.isPending || releaseMutation.isPending}
                  className="text-[13px] transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  {releaseMutation.isPending ? t("prayer_request_detail.closing") : t("prayer_request_detail.let_it_close")}
                </button>
                <button
                  onClick={() => setLocation("/pray-request/new?kind=request")}
                  className="text-[13px] transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  {t("prayer_request_detail.share_something_new")}
                </button>
              </div>
            )}

            {/* Share button now sits next to the close (×) in the
                top-right fixed-position header — see
                <ShareLinkIconButton /> above. The old inline pill is
                gone. */}

            {/* Avatar rail — every distinct pray-er, most recent first. */}
            {data.amens.length > 1 && (
              <div className="flex items-center justify-center -mt-1">
                {data.amens.slice(0, 8).map((a, i) => (
                  <div
                    key={`${a.userId}-${a.prayedAt}`}
                    className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2"
                    style={{
                      borderColor: SLIDE_BG,
                      marginLeft: i === 0 ? 0 : -8,
                      background: "#1A4A2E",
                      color: "#A8C5A0",
                    }}
                    title={a.userName ?? t("prayer_request_detail.someone")}
                  >
                    {a.userAvatarUrl ? (
                      <img
                        src={a.userAvatarUrl}
                        alt={a.userName ?? t("prayer_request_detail.someone")}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold">
                        {initials(a.userName ?? "")}
                      </span>
                    )}
                  </div>
                ))}
                {data.amens.length > 8 && (
                  <span
                    className="ml-2 text-[11px]"
                    style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    +{data.amens.length - 8}
                  </span>
                )}
              </div>
            )}

            {/* Every word of comfort, newest first. */}
            {data.words.length > 0 && (
              <div className="w-full flex flex-col gap-3 mt-3">
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                  style={{ color: "rgba(143,175,150,0.45)" }}
                >
                  {t("prayer_request_detail.words_of_comfort", { count: data.words.length })}
                </p>
                {data.words.map(w => (
                  <div
                    key={w.id}
                    className="w-full rounded-2xl px-5 py-4 flex flex-col items-center text-center gap-2"
                    style={{
                      background: "rgba(46,107,64,0.10)",
                      border: "1px solid rgba(46,107,64,0.15)",
                    }}
                  >
                    {w.authorAvatarUrl ? (
                      <img
                        src={w.authorAvatarUrl}
                        alt={w.authorName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                      >
                        {initials(w.authorName)}
                      </div>
                    )}
                    <p
                      className="text-[10px] uppercase tracking-[0.16em] font-semibold"
                      style={{ color: "rgba(143,175,150,0.45)" }}
                    >
                      {t("prayer_request_detail.from_name", { name: w.authorName })}
                    </p>
                    <p
                      className="italic"
                      style={{
                        color: "#E8E4D8",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: 16,
                        lineHeight: 1.55,
                      }}
                    >
                      "{w.content}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quiet "Back" anchored at the bottom — both branches share
            this so a recipient who tapped Amen and an owner reading
            their amen rail both have the same exit. The owner also
            gets Edit + Renew pills inline with Back (replacing the
            prayer-list popup that used to carry them). */}
        {data && (
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setLocation("/dashboard")}
              className="px-6 py-3 rounded-full text-sm font-medium"
              style={{
                color: "#C8D4C0",
                background: "rgba(200,212,192,0.08)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {t("prayer_request_detail.back")}
            </button>
            {data.viewerIsOwner && !editing && (
              <>
                <button
                  onClick={() => { setEditDraft(data.body); setEditing(true); }}
                  className="px-5 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
                  style={{
                    color: "#C8D4C0",
                    background: "rgba(46,107,64,0.18)",
                    border: "1px solid rgba(46,107,64,0.4)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {t("prayer_request_detail.edit")}
                </button>
                <button
                  onClick={() => renewMutation.mutate()}
                  disabled={renewMutation.isPending}
                  className="px-5 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    color: "#C8D4C0",
                    background: "rgba(46,107,64,0.18)",
                    border: "1px solid rgba(46,107,64,0.4)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {renewMutation.isPending ? t("prayer_request_detail.renewing") : t("prayer_request_detail.renew")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tagged row ────────────────────────────────────────────────────────
//
// Shared component for both viewer-classes (owner + recipient).
//
// Three render shapes:
//   • Recipient viewer (default) — read-only chip row.
//   • Recipient who happens to be tagged — chip row + "Remove me".
//   • Owner editing — chip row + "×" on each chip + "+ Tag someone"
//     pill that opens an inline picker.
function TaggedRow({
  tags,
  viewerIsTagged,
  ownerEditing,
  ownerAddTags,
  ownerRemoveTag,
  ownerUserId,
  onRemoveSelf,
  removingId,
}: {
  tags: TaggedUser[];
  viewerIsTagged: boolean;
  ownerEditing: boolean;
  ownerAddTags: (userIds: number[]) => void;
  ownerRemoveTag: (userId: number) => void;
  ownerUserId: number;
  onRemoveSelf: (userId: number) => void;
  removingId: number | null;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Picker draws from the owner's people garden — same set the
  // compose form uses. We're rendering the owner-edit picker only
  // when ownerEditing is true, so usePeople(ownerUserId) is the
  // right scope (people the owner can already see).
  const { data: people = [] } = usePeople(ownerEditing ? ownerUserId : undefined);
  const taggedIds = useMemo(() => new Set(tags.map(t => t.id)), [tags]);
  const eligible = useMemo(
    () => people.filter((p): p is PersonSummary & { userId: number } =>
      typeof p.userId === "number" && !taggedIds.has(p.userId),
    ),
    [people, taggedIds],
  );
  // Name / email filter for the picker list. With a large garden the
  // un-searchable scroll was hard to use — this narrows as you type.
  const filteredEligible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(p =>
      (p.name ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q),
    );
  }, [eligible, query]);

  // Don't render anything when there's no row and no edit affordance
  // (recipient view + no tags = nothing to surface).
  if (tags.length === 0 && !ownerEditing) return null;

  return (
    <div className="w-full flex flex-col items-center gap-2 mt-1">
      {tags.length > 0 && (
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          {t("prayer_request_detail.tagged")}
        </p>
      )}
      <div className="flex items-center justify-center flex-wrap gap-2">
        {tags.map((tag) => {
          const removingThis = removingId === tag.id;
          return (
            <div
              key={tag.id}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.4)",
                opacity: removingThis ? 0.5 : 1,
              }}
            >
              {tag.avatarUrl ? (
                <img
                  src={tag.avatarUrl}
                  alt={tag.name ?? ""}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                >
                  {(tag.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <span
                className="text-[13px]"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {tag.name ?? t("prayer_request_detail.someone")}
              </span>
              {ownerEditing && (
                <button
                  type="button"
                  onClick={() => ownerRemoveTag(tag.id)}
                  disabled={removingThis}
                  aria-label={t("prayer_request_detail.untag_aria", { name: tag.name ?? t("prayer_request_detail.this_person") })}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(143,175,150,0.85)",
                    cursor: removingThis ? "default" : "pointer",
                    padding: 0,
                    marginLeft: 2,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {ownerEditing && (
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="text-[12px] font-medium px-3 py-1 rounded-full transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.10)",
              border: "1px dashed rgba(46,107,64,0.5)",
              color: "rgba(168,197,160,0.9)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {t("prayer_request_detail.tag_someone")}
          </button>
        )}
      </div>
      {ownerEditing && pickerOpen && (
        <div
          className="mt-2 rounded-xl w-full"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(46,107,64,0.35)",
            padding: 8,
            maxWidth: 380,
          }}
        >
          {eligible.length === 0 ? (
            <p className="text-xs italic text-center py-2" style={{ color: "rgba(143,175,150,0.55)" }}>
              {t("prayer_request_detail.everyone_tagged")}
            </p>
          ) : (
            <>
              {/* Search — narrows the list by name / email. Auto-
                  focused so the keyboard is ready the moment the
                  picker opens. */}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("prayer_request_detail.search_people_placeholder")}
                autoFocus
                className="w-full mb-2 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "rgba(200,212,192,0.06)",
                  border: "1px solid rgba(46,107,64,0.35)",
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  outline: "none",
                }}
              />
              {filteredEligible.length === 0 ? (
                <p className="text-xs italic text-center py-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                  {t("prayer_request_detail.no_one_matches", { query: query.trim() })}
                </p>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {filteredEligible.map(p => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => {
                    ownerAddTags([p.userId]);
                    setPickerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,212,192,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={p.name ?? ""}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                    >
                      {(p.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-sm flex-1 truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {p.name}
                  </span>
                </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {viewerIsTagged && (
        <RemoveSelfButton
          tags={tags}
          onRemoveSelf={onRemoveSelf}
          removingId={removingId}
        />
      )}
    </div>
  );
}

// Renders the "Remove me from this prayer" button. We resolve the
// viewer's id from the auth cache (the same /api/auth/me query the
// rest of the app reads) so the parent doesn't have to thread the
// id all the way down.
function RemoveSelfButton({
  tags,
  onRemoveSelf,
  removingId,
}: {
  tags: TaggedUser[];
  onRemoveSelf: (userId: number) => void;
  removingId: number | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<{ id?: number }>(["/api/auth/me"]);
  const myId = me?.id;
  if (!myId) return null;
  const myTag = tags.find(tag => tag.id === myId);
  if (!myTag) return null;
  const pending = removingId === myId;
  return (
    <button
      type="button"
      onClick={() => onRemoveSelf(myId)}
      disabled={pending}
      className="mt-1 text-[11px] transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{
        background: "transparent",
        border: "none",
        color: "rgba(143,175,150,0.7)",
        textDecoration: "underline",
        textDecorationColor: "rgba(143,175,150,0.35)",
        textUnderlineOffset: 3,
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: pending ? "default" : "pointer",
        padding: 4,
      }}
    >
      {pending ? t("prayer_request_detail.removing") : t("prayer_request_detail.remove_me")}
    </button>
  );
}

// ── Share-link button (owner-only) ───────────────────────────────────
//
// Renders on the owner's view of a prayer request, beneath the amen
// recap. Hands off to `sharePrayerRequest`, which picks the best
// share surface for the runtime — native iOS share sheet via the
// Capacitor Share plugin, the Web Share API on mobile browsers, or
// the clipboard as last resort. The clipboard path briefly flips the
// button to "Link copied ✓" so the user gets feedback that the
// action landed.
// Icon-only variant of <ShareLinkButton /> sized to sit alongside the
// 36×36 close (×) chip in the page's fixed-position top-right header.
// Same share/copy behavior; no "Share this prayer →" text — the action
// is conveyed by the upload-arrow glyph.
function ShareLinkIconButton({
  shareToken,
  ownerName,
}: {
  shareToken: string;
  ownerName: string;
}) {
  const { t } = useTranslation();
  const [justCopied, setJustCopied] = useState(false);

  async function handleShare() {
    const { copied } = await sharePrayerRequest({ shareToken, ownerName });
    if (copied) {
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t("prayer_request_detail.share_aria")}
      title={justCopied ? t("prayer_request_detail.link_copied_short") : t("prayer_request_detail.share_aria")}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "rgba(46,107,64,0.18)",
        border: "1px solid rgba(46,107,64,0.35)",
        color: "#C8D4C0",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {justCopied ? (
        // Tiny check mark — survives 1.8s, matches the existing pill's
        // "Link copied ✓" feedback in one glyph.
        <span style={{ fontSize: 16, lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif" }}>✓</span>
      ) : (
        // iOS-style share: square-with-up-arrow, rendered as inline SVG
        // so it picks up the chip's text color rather than needing a
        // separate asset.
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.5v8.5M5.25 4.25 8 1.5l2.75 2.75"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 7.5v5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function ShareLinkButton({
  shareToken,
  ownerName,
}: {
  shareToken: string;
  ownerName: string;
}) {
  const { t } = useTranslation();
  const [justCopied, setJustCopied] = useState(false);

  async function handleShare() {
    const { copied } = await sharePrayerRequest({ shareToken, ownerName });
    if (copied) {
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="mt-2 px-5 py-2 rounded-full text-[13px] font-medium transition-opacity hover:opacity-90"
      style={{
        background: "rgba(46,107,64,0.18)",
        color: "#C8D4C0",
        border: "1px solid rgba(46,107,64,0.4)",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {justCopied ? t("prayer_request_detail.link_copied_pill") : t("prayer_request_detail.share_pill")}
    </button>
  );
}
