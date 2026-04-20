import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import type { MyActivePrayerFor } from "@/components/pray-for-them";

// Scale the big prayer-text block by character length so long prayers
// (like the BCP collects) stay on one screen without scrolling, and short
// ones still feel like liturgy.
function fitPrayerText(text: string | null | undefined): { size: number; leading: number } {
  const len = (text ?? "").length;
  if (len < 100)  return { size: 18, leading: 1.8 };
  if (len < 220)  return { size: 16, leading: 1.75 };
  if (len < 360)  return { size: 15, leading: 1.7 };
  if (len < 520)  return { size: 14, leading: 1.65 };
  if (len < 720)  return { size: 13, leading: 1.6 };
  return { size: 12, leading: 1.55 };
}

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
  intercessionSource?: string | null;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
};

interface PrayerRequest {
  id: number;
  body: string;
  ownerName: string | null;
  isAnswered: boolean;
  isOwnRequest?: boolean;
  closedAt?: string | null;
}

interface PrayerSlide {
  kind: "intercession" | "request" | "prayer-for" | "prayer-for-expired" | "ask-request" | "circle-intention";
  text: string;
  attribution: string;
  fullText?: string | null;
  intention?: string | null;
  // prayer-for specific
  prayerForId?: number;
  recipientName?: string;
  recipientAvatarUrl?: string | null;
  dayLabel?: string;
  // circle-intention specific — included so the slide can link back to the
  // community, and so we can attribute the shared nature of the prayer in
  // the subtitle.
  groupName?: string;
  groupEmoji?: string | null;
  groupSlug?: string;
}

// One row from GET /api/groups/me/circle-intentions. Flattened across every
// prayer circle the user belongs to; non-archived only; falls back to the
// legacy single `groups.intention` for circles without migrated rows yet.
interface CircleIntention {
  id: number;
  title: string;
  description: string | null;
  groupId: number;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
}

function SlideContent({
  slide,
  onAdvance,
  onRenew,
  onEnd,
  onAskSubmit,
  askSubmitting,
}: {
  slide: PrayerSlide;
  onAdvance: () => void;
  onRenew: (id: number, days: 3 | 7) => void;
  onEnd: (id: number) => void;
  onAskSubmit: (body: string) => void;
  askSubmitting: boolean;
}) {
  const [askBody, setAskBody] = useState("");
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  // ── "How can the community pray for you?" — final slide when the viewer
  // has no active prayer request. A gentle ask, skippable.
  if (slide.kind === "ask-request") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Before we close
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          How can the community pray for you?
        </p>
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          A short note; your garden will hold it for 3 days.
        </p>

        <textarea
          value={askBody}
          onChange={(e) => setAskBody(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="What's on your heart?"
          className="w-full rounded-2xl px-5 py-4 text-[15px] outline-none resize-none"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "#F0EDE6",
            fontFamily: "Playfair Display, Georgia, serif",
            fontStyle: "italic",
            lineHeight: 1.65,
          }}
        />

        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <button
            onClick={() => askBody.trim() && onAskSubmit(askBody.trim())}
            disabled={askBody.trim().length === 0 || askSubmitting}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {askSubmitting ? "Sharing…" : "Share with my garden →"}
          </button>
          <button
            onClick={onAdvance}
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Expired-prayer renewal prompt — shown instead of a normal slide ──────
  if (slide.kind === "prayer-for-expired" && slide.prayerForId != null) {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Prayer ended
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Your prayer for {slide.recipientName} has ended.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => onRenew(slide.prayerForId!, 7)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Pray for another 7 days
          </button>
          <button
            onClick={() => onEnd(slide.prayerForId!)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#8FAF96",
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Active "prayer for someone" slide ───────────────────────────────────
  if (slide.kind === "prayer-for") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Praying for
        </p>
        {slide.recipientAvatarUrl ? (
          <img
            src={slide.recipientAvatarUrl}
            alt={slide.recipientName}
            className="w-16 h-16 rounded-full object-cover"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold"
            style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            {(slide.recipientName ?? "")
              .split(" ")
              .slice(0, 2)
              .map(w => w[0]?.toUpperCase() ?? "")
              .join("")}
          </div>
        )}
        <p
          className="text-[22px] leading-[1.4] font-medium"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          {slide.recipientName}
        </p>

        {slide.fullText && (
          <div
            className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.15)",
            }}
          >
            {(() => {
              const fit = fitPrayerText(slide.fullText);
              return (
                <p
                  className="italic whitespace-pre-wrap"
                  style={{
                    color: "#C8D4C0",
                    fontFamily: "Playfair Display, Georgia, serif",
                    fontSize: `${fit.size}px`,
                    lineHeight: fit.leading,
                  }}
                >
                  {slide.fullText}
                </p>
              );
            })()}
          </div>
        )}

        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Hold {slide.recipientName?.split(" ")[0]} in prayer today.
        </p>

        {slide.dayLabel && (
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.35)" }}>
            {slide.dayLabel}
          </p>
        )}

        <button
          onClick={onAdvance}
          className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
          style={{
            background: "rgba(46,107,64,0.28)",
            border: "1px solid rgba(46,107,64,0.5)",
            color: "#C8D4C0",
          }}
        >
          Amen →
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession"
          ? "Community Intercession"
          : slide.kind === "circle-intention"
            ? "Circle Intention"
            : "Prayer Request"}
      </p>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
      >
        {slide.text}
      </p>

      {slide.intention && (
        <p
          className="text-sm italic"
          style={{ color: "#8FAF96", marginTop: "-4px" }}
        >
          {slide.intention}
        </p>
      )}

      {slide.attribution && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      )}

      {slide.kind === "intercession" && (
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          Your community is holding this.
        </p>
      )}

      {/* Circle intention — attribute to the circle by name. Different voice
          from a solo intercession: this is the shared prayer of the whole
          circle, held together. */}
      {slide.kind === "circle-intention" && slide.groupName && (
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          {slide.groupEmoji ? `${slide.groupEmoji} ` : ""}The {slide.groupName} circle is praying this together.
        </p>
      )}

      {/* BCP enrichment — show the formal prayer text from the Book of Common Prayer */}
      {bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(bcpPrayer.text);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {bcpPrayer.text}
              </p>
            );
          })()}
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
      )}

      {/* Custom intercession — show the user's own prayer text */}
      {!bcpPrayer && slide.fullText && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(slide.fullText);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {slide.fullText}
              </p>
            );
          })()}
        </div>
      )}

      <button
        onClick={onAdvance}
        className="mt-4 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
        style={{
          background: "rgba(46,107,64,0.28)",
          border: "1px solid rgba(46,107,64,0.5)",
          color: "#C8D4C0",
        }}
      >
        Amen →
      </button>
    </div>
  );
}

export default function PrayerModePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: momentsData } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: prayerRequests = [] } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });

  const { data: myPrayersFor = [] } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });

  // Every active intention from every prayer circle this user belongs to.
  // Surfaced as its own slide-kind so members carry the circle's shared
  // intentions alongside their own intercessions and others' requests.
  const { data: circleIntentionsData } = useQuery<{ intentions: CircleIntention[] }>({
    queryKey: ["/api/groups/me/circle-intentions"],
    queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
    enabled: !!user,
  });

  const renewMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: 3 | 7 }) =>
      apiRequest("POST", `/api/prayers-for/${id}/renew`, { durationDays: days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });
  const endMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayers-for/${id}/end`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });

  // Creating a prayer request from the final slide ("How can the community
  // pray for you?"). On success we advance past the ask slide — the
  // slideshow then ends naturally.
  const createRequestMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: 3 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] }),
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Include every active intercession the user participates in, regardless
  // of the current window state. The slideshow is a "today's prayer list"
  // experience — a daily intercession is prayable all day, not only during
  // its 2-hour bloom window.
  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession",
  );

  // Split "pray for someone" records: active ones get normal slides, expired
  // ones get a renewal prompt at the end of the run.
  const activePrayersFor = myPrayersFor.filter(p => !p.expired);
  const expiredPrayersFor = myPrayersFor.filter(p => p.expired);

  const slides: PrayerSlide[] = [
    ...intercessions.map((m) => {
      const title = m.intercessionTopic || m.name;
      // For custom intercessions the user-entered `intention` often duplicates
      // `name` / `intercessionTopic` — hide it when it's the same text.
      const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
      const intentionSub =
        m.intention && norm(m.intention) !== norm(title) ? m.intention : null;
      // Prefer the group name over listing individual members when the practice
      // is attached to a group.
      const attributionLabel = m.group?.name
        ? m.group.name
        : m.members
            .filter((p) => p.email !== user?.email)
            .map((p) => p.name || p.email.split("@")[0])
            .slice(0, 3)
            .join(", ");
      return {
        kind: "intercession" as const,
        text: title,
        intention: intentionSub,
        fullText: m.intercessionFullText?.trim() || null,
        attribution: attributionLabel ? `with ${attributionLabel}` : "",
      };
    }),
    // Circle intentions — one slide per active intention in every prayer
    // circle the viewer belongs to. Placed right after intercessions because
    // they read in the same voice (the thing being prayed) and before
    // prayer requests so shared communal intentions come before individual
    // asks. Falls back silently to [] if the endpoint is missing or empty.
    ...((circleIntentionsData?.intentions ?? []).map((intn): PrayerSlide => ({
      kind: "circle-intention",
      text: intn.title,
      attribution: "",
      intention: intn.description,
      groupName: intn.groupName,
      groupEmoji: intn.groupEmoji,
      groupSlug: intn.groupSlug,
    }))),
    // Other people's prayer requests come before the user's own private
    // prayers-for — hearing others first, then turning inward. We
    // deliberately exclude the viewer's own requests; they don't need to
    // be shown their own ask as a slide to pray for.
    ...prayerRequests
      .filter((r) => !r.isAnswered && !r.isOwnRequest)
      .map((r): PrayerSlide => ({
        kind: "request",
        text: r.body,
        attribution: r.ownerName ? `from ${r.ownerName}` : "from someone",
      })),
    ...activePrayersFor.map((p): PrayerSlide => {
      // Calendar-day diff so a prayer started yesterday evening reads "Day 2"
      // this morning rather than still "Day 1".
      const started = new Date(p.startedAt);
      const nowD = new Date();
      const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
      const startedStart = new Date(started.getFullYear(), started.getMonth(), started.getDate());
      const daysElapsed = Math.round((todayStart.getTime() - startedStart.getTime()) / 86400000);
      const day = Math.max(1, Math.min(p.durationDays, daysElapsed + 1));
      return {
        kind: "prayer-for",
        text: p.recipientName,
        attribution: "",
        fullText: p.prayerText,
        prayerForId: p.id,
        recipientName: p.recipientName,
        recipientAvatarUrl: p.recipientAvatarUrl,
        dayLabel: `Day ${day} of ${p.durationDays}`,
      };
    }),
    // Renewal prompts come last so the user prays through everything first.
    ...expiredPrayersFor.map((p): PrayerSlide => ({
      kind: "prayer-for-expired",
      text: p.recipientName,
      attribution: "",
      prayerForId: p.id,
      recipientName: p.recipientName,
      recipientAvatarUrl: p.recipientAvatarUrl,
    })),
  ];

  // Final "ask" slide — if the viewer has no active prayer request of their
  // own, we gently ask what the community can pray for on the way out.
  // Skippable.
  const hasActiveOwnRequest = prayerRequests.some(
    (r) => r.isOwnRequest === true && !r.isAnswered && !r.closedAt,
  );
  if (!hasActiveOwnRequest) {
    slides.push({
      kind: "ask-request",
      text: "",
      attribution: "",
    });
  }

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prayer" | "closing">("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests && myPrayersFor) {
      setPhase("closing");
    }
  }, [slides.length, momentsData, prayerRequests, myPrayersFor]);

  // Fade in on mount; prevent body scroll; match Safari chrome to slide bg
  // so the top status-bar area and the bottom home-indicator area both
  // paint `#0C1F12` instead of flashing the app's default green/black.
  useEffect(() => {
    const SLIDE_BG = "#0C1F12";
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlBg = html.style.backgroundColor;
    body.style.overflow = "hidden";
    body.style.backgroundColor = SLIDE_BG;
    html.style.backgroundColor = SLIDE_BG;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content") ?? "#091A10";
    meta?.setAttribute("content", SLIDE_BG);
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
      clearTimeout(t);
    };
  }, []);

  const advance = () => {
    setSlideVisible(false);
    setTimeout(() => {
      if (index < slides.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setPhase("closing");
      }
      setSlideVisible(true);
    }, 220);
  };

  const handleDone = async () => {
    // Log a check-in for every intercession the user has just prayed through
    const toLog = intercessions.filter(
      (m) => m.momentToken && m.myUserToken,
    );
    await Promise.allSettled(
      toLog.map((m) =>
        apiRequest("POST", `/api/moment/${m.momentToken}/${m.myUserToken}/post`, {
          isCheckin: true,
        }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });

    // Fade out then navigate
    setSlideVisible(false);
    setTimeout(() => {
      setVisible(false);
      setTimeout(() => setLocation("/prayer-list"), 500);
    }, 300);
  };

  if (authLoading || !user) return null;

  const slide = slides[index];

  return (
    <div
      style={{
        background: "#0C1F12",
        minHeight: "100dvh",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        position: "relative",
      }}
    >
      {/* Exit button */}
      <button
        onClick={() => setLocation("/prayer-list")}
        aria-label="Exit prayer mode"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Content — flex column centered vertically */}
      <div
        className="flex flex-col items-center text-center px-6 py-10 w-full"
        style={{ maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center" }}
      >
        {phase === "prayer" && slide && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.22s ease" }}
          >
            <SlideContent
              slide={slide}
              onAdvance={advance}
              onRenew={(id, days) => {
                renewMutation.mutate({ id, days });
                advance();
              }}
              onEnd={(id) => {
                endMutation.mutate(id);
                advance();
              }}
              onAskSubmit={(body) => {
                createRequestMutation.mutate(body, { onSuccess: () => advance() });
              }}
              askSubmitting={createRequestMutation.isPending}
            />
          </div>
        )}

        {phase === "closing" && (
          <div
            className="w-full flex flex-col items-center text-center gap-8"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.4s ease" }}
          >
            <p
              className="text-base leading-relaxed"
              style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              You have carried what your community is carrying. 🌿
            </p>
            <button
              onClick={handleDone}
              className="mt-2 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Progress */}
      {phase === "prayer" && slides.length > 0 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}>
            {index + 1} of {slides.length}
          </p>
        </div>
      )}
    </div>
  );
}
