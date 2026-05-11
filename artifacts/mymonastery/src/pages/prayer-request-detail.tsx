import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { playOpeningSwell, triggerAmenFeedback, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { RequestWordField } from "@/components/RequestWordField";
import { PrayerKindPill } from "@/components/prayer-kind-pill";

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

type PrayerRequestDetail = {
  id: number;
  body: string;
  kind: string | null;
  ownerId: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  viewerIsOwner: boolean;
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
  const HOLD_MS = 4000;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setReady(true);
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
        );
      } catch { /* non-fatal */ }
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [slideKey]);

  return (
    <button
      onClick={() => { if (ready) onAdvance(); }}
      disabled={!ready}
      aria-disabled={!ready}
      aria-label={ready ? "Amen" : "Hold a moment"}
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
        Amen →
      </span>
    </button>
  );
}

export default function PrayerRequestDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/prayer-requests/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const search = useSearch();
  const queryClient = useQueryClient();

  const showRenewSlide = useMemo(() => {
    return new URLSearchParams(search).get("renew") === "1";
  }, [search]);

  const { data, isLoading, error } = useQuery<PrayerRequestDetail>({
    queryKey: [`/api/prayer-requests/by-id/${id}`],
    queryFn: () => apiRequest("GET", `/api/prayer-requests/by-id/${id}`) as Promise<PrayerRequestDetail>,
    enabled: Number.isFinite(id),
  });

  const [amened, setAmened] = useState(false);
  const amenMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayer-requests/${id}/amen`),
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
      setLocation("/prayer-list");
    },
  });
  const releaseMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/prayer-requests/${id}/release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${id}`] });
      setLocation("/prayer-list");
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
      {/* Always-visible close — fixed position so it never scrolls
          off, and high enough above any iOS notch / safe area that
          the user can always reach it. Routes back to /dashboard. */}
      <button
        type="button"
        onClick={() => setLocation("/dashboard")}
        aria-label="Close"
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 16,
          zIndex: 100,
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
            Loading…
          </p>
        )}

        {!isLoading && (error || !data) && (
          <p className="text-sm" style={{ color: "rgba(200,212,192,0.55)" }}>
            We couldn't load this prayer request.
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
                  alt={data.ownerName ?? "Prayer author"}
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
                  Prayer Request
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
                ✓ Amen sent
              </div>
            ) : (
              <AmenButton
                slideKey={data.id}
                onAdvance={() => { if (!amenMutation.isPending) amenMutation.mutate(); }}
              />
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
                {showRenewSlide ? "Your prayer is wrapping up" : "Your prayer request"}
              </p>
            </div>

            <p
              className="text-[22px] leading-[1.5] font-medium italic"
              style={{
                color: "#E8E4D8",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {data.body}
            </p>

            {/* Latest amen — pulses the freshest pray-er, the avatar
                the first/third-amen pushes are heralding. */}
            {data.amens.length > 0 && (() => {
              const latestAmen = data.amens[0];
              const latestAmenName = latestAmen.userName ?? "Someone";
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
                    Amen from {latestAmenName}
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
                {data.amenCountTotal === 1
                  ? "Prayed 1 time so far."
                  : `Prayed ${data.amenCountTotal} times so far.`}
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
                Your community has been notified. We'll let you know when the first amen lands.
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
                  {renewMutation.isPending ? "Renewing…" : "Renew for 7 days 🌿"}
                </button>
                <button
                  onClick={() => releaseMutation.mutate()}
                  disabled={renewMutation.isPending || releaseMutation.isPending}
                  className="text-[13px] transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  {releaseMutation.isPending ? "Closing…" : "Let it close"}
                </button>
                <button
                  onClick={() => setLocation("/pray-request/new?kind=request")}
                  className="text-[13px] transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Or share something new →
                </button>
              </div>
            )}

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
                    title={a.userName ?? "Someone"}
                  >
                    {a.userAvatarUrl ? (
                      <img
                        src={a.userAvatarUrl}
                        alt={a.userName ?? "Someone"}
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
                  {data.words.length === 1 ? "Word of comfort" : "Words of comfort"}
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
                      from {w.authorName}
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
            their amen rail both have the same exit. */}
        {data && (
          <button
            onClick={() => setLocation("/dashboard")}
            className="mt-6 px-6 py-3 rounded-full text-sm font-medium"
            style={{
              color: "#C8D4C0",
              background: "rgba(200,212,192,0.08)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
