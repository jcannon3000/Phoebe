import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";

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
};

interface PrayerRequest {
  id: number;
  body: string;
  ownerName: string | null;
  isAnswered: boolean;
}

interface PrayerSlide {
  kind: "intercession" | "request";
  text: string;
  attribution: string;
  fullText?: string | null;
  intention?: string | null;
}

interface GratitudeResponse {
  id: number;
  text: string;
  createdAt: string;
  authorName: string;
  authorEmail: string;
  avatarUrl?: string | null;
  isNew: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatGratitudeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 2) return "1 hour ago";
    if (diffHr < 12) return `${diffHr} hours ago`;

    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return "this morning";

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (isYesterday) return `yesterday at ${time}`;
    return `${d.toLocaleDateString("en-US", { weekday: "short" })} at ${time}`;
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  { bg: "rgba(46,107,64,0.15)", text: "#4a6e50" },
  { bg: "rgba(193,127,36,0.15)", text: "#8a5a18" },
  { bg: "rgba(212,137,106,0.15)", text: "#9a5a3a" },
  { bg: "rgba(100,140,180,0.15)", text: "#5a7a9a" },
  { bg: "rgba(160,120,180,0.15)", text: "#7a5a8a" },
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Prayer Slide Content ────────────────────────────────────────────────────

function SlideContent({ slide, onAdvance }: { slide: PrayerSlide; onAdvance: () => void }) {
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession" ? "Community Intercession" : "Prayer Request"}
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

      {/* BCP enrichment — show the formal prayer text from the Book of Common Prayer */}
      {bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          <p
            className="text-[13px] leading-[1.85] italic"
            style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
          >
            {bcpPrayer.text}
          </p>
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
          className="w-full rounded-2xl px-6 py-5 text-left mt-1"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          <p
            className="text-[13px] leading-[1.85] italic"
            style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
          >
            {slide.fullText}
          </p>
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

// ── Gratitude Input Slide ───────────────────────────────────────────────────

function GratitudeInputSlide({
  onSubmit,
  onSkip,
}: {
  onSubmit: (text: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const meetsMin = wordCount >= 5;
  const atLimit = wordCount >= 50;
  const overLimit = wordCount > 50;

  const handleSubmit = async () => {
    if (!meetsMin || overLimit || submitting) return;
    setSubmitting(true);
    onSubmit(text.trim());
  };

  return (
    <div className="w-full flex flex-col items-center text-center gap-6">
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        Gratitude
      </p>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
      >
        What are you grateful for today?
      </p>

      <p className="text-sm" style={{ color: "#8FAF96", marginTop: "-8px" }}>
        Share something with your garden.
      </p>

      {/* Text input area */}
      <div className="w-full relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Today I'm grateful for..."
          rows={4}
          className="w-full resize-none rounded-2xl px-5 py-4 text-[15px] leading-relaxed focus:outline-none"
          style={{
            background: "rgba(46,107,64,0.10)",
            border: `1px solid ${text.length > 0 ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            transition: "border-color 0.2s ease",
          }}
        />
        {/* Word count indicator */}
        <p
          className="text-[13px] text-right mt-2"
          style={{
            color: overLimit
              ? "#D9B44A"
              : meetsMin
                ? "rgba(143,175,150,0.45)"
                : "rgba(143,175,150,0.35)",
            transition: "color 0.2s ease",
          }}
        >
          {!meetsMin
            ? `${wordCount}/5 words minimum`
            : atLimit
              ? `${wordCount}/50 words`
              : `${wordCount} words`}
        </p>
      </div>

      {/* Share button */}
      <button
        onClick={handleSubmit}
        disabled={!meetsMin || overLimit || submitting}
        className="px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-all active:scale-[0.98]"
        style={{
          background: meetsMin && !overLimit ? "#2D5E3F" : "rgba(46,107,64,0.18)",
          color: meetsMin && !overLimit ? "#F0EDE6" : "rgba(200,212,192,0.35)",
          cursor: meetsMin && !overLimit ? "pointer" : "default",
          transition: "background 0.3s ease, color 0.3s ease",
        }}
      >
        {submitting ? "Sharing..." : "Share"}
      </button>

      {/* Skip option */}
      <button
        onClick={onSkip}
        className="text-sm transition-opacity hover:opacity-70"
        style={{ color: "rgba(143,175,150,0.35)" }}
      >
        Skip for today
      </button>
    </div>
  );
}

// ── Gratitude Response Card ─────────────────────────────────────────────────

function GratitudeCard({
  authorName,
  avatarUrl,
  text,
  createdAt,
  isNew,
}: {
  authorName: string;
  avatarUrl?: string | null;
  text: string;
  createdAt: string;
  isNew: boolean;
}) {
  const color = colorForName(authorName);
  const timeLabel = formatGratitudeTime(createdAt);

  return (
    <div className="relative flex gap-3">
      {/* New indicator dot */}
      {isNew && (
        <div
          className="absolute -left-4 top-5 w-2 h-2 rounded-full"
          style={{ background: "#C25B4E" }}
        />
      )}

      {/* Avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={authorName}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
          style={{ border: "1px solid rgba(46,107,64,0.3)" }}
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "#1A4A2E", color: "#A8C5A0" }}
        >
          <span className="text-[10px] font-bold">
            {getInitials(authorName)}
          </span>
        </div>
      )}

      {/* Card */}
      <div
        className="flex-1 rounded-xl"
        style={{
          background: "#0F2818",
          border: "1px solid rgba(200,212,192,0.15)",
          padding: "14px 16px",
        }}
      >
        <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 4 }}>
          <p
            style={{
              color: "#8FAF96",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {authorName.split(" ")[0]}
          </p>
          {timeLabel && (
            <p
              style={{
                color: "rgba(143,175,150,0.55)",
                fontSize: 10,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                margin: 0,
              }}
            >
              {timeLabel}
            </p>
          )}
        </div>
        <p
          style={{
            color: "#F0EDE6",
            fontSize: 15,
            lineHeight: 1.65,
            fontFamily: "'Space Grotesk', sans-serif",
            whiteSpace: "pre-wrap",
            margin: 0,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

// ── Gratitude Responses Slide ───────────────────────────────────────────────

function GratitudeResponsesSlide({
  responses,
  totalCount,
  onDone,
  onMarkSeen,
}: {
  responses: GratitudeResponse[];
  totalCount: number;
  onDone: () => void;
  onMarkSeen: (ids: number[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());

  // Mark responses as seen as user scrolls
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newSeen: number[] = [];
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute("data-gratitude-id"));
            if (id && !seenIds.has(id)) {
              newSeen.push(id);
            }
          }
        });
        if (newSeen.length > 0) {
          setSeenIds((prev) => {
            const next = new Set(prev);
            newSeen.forEach((id) => next.add(id));
            return next;
          });
          onMarkSeen(newSeen);
        }
      },
      { root: el, threshold: 0.5 },
    );

    const cards = el.querySelectorAll("[data-gratitude-id]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [responses, seenIds, onMarkSeen]);

  const hasResponses = responses.length > 0;

  return (
    <div className="w-full flex flex-col items-center gap-6" style={{ maxHeight: "100dvh" }}>
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        From Your Garden
      </p>

      <p
        className="text-[18px] leading-[1.5] font-medium"
        style={{ color: "#E8E4D8", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {hasResponses ? "What your garden is grateful for" : ""}
      </p>

      {hasResponses ? (
        <div
          ref={scrollRef}
          className="w-full space-y-3 overflow-y-auto pl-5 pr-1"
          style={{ maxHeight: "calc(100dvh - 320px)" }}
        >
          {responses.map((r) => (
            <div key={r.id} data-gratitude-id={r.id}>
              <GratitudeCard
                authorName={r.authorName}
                avatarUrl={r.avatarUrl}
                text={r.text}
                createdAt={r.createdAt}
                isNew={r.isNew && !seenIds.has(r.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm" style={{ color: "#8FAF96", lineHeight: 1.6 }}>
            No new responses since your last prayer.
          </p>
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.4)" }}>
            {totalCount > 0
              ? `${totalCount} gratitude${totalCount === 1 ? "" : "s"} shared so far. Check back after your garden prays today.`
              : "Check back after your garden prays today."}
          </p>
        </div>
      )}

      <button
        onClick={onDone}
        className="mt-4 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        Done
      </button>
    </div>
  );
}

// ── Main Prayer Mode Page ───────────────────────────────────────────────────

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

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession" && m.windowOpen,
  );

  const slides: PrayerSlide[] = [
    ...intercessions.map((m) => ({
      kind: "intercession" as const,
      text: m.intercessionTopic || m.name,
      intention: m.intention || null,
      fullText: m.intercessionFullText?.trim() || null,
      attribution: m.members
        .filter((p) => p.email !== user?.email)
        .map((p) => p.name || p.email.split("@")[0])
        .slice(0, 3)
        .join(", "),
    })).map((s) => ({ ...s, attribution: s.attribution ? `with ${s.attribution}` : "" })),
    ...prayerRequests
      .filter((r) => !r.isAnswered)
      .map((r) => ({
        kind: "request" as const,
        text: r.body,
        attribution: r.ownerName ? `from ${r.ownerName}` : "from someone",
      })),
  ];

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<
    "prayer" | "gratitude-input" | "gratitude-responses" | "closing"
  >("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);

  // Gratitude data
  const [gratitudeResponses, setGratitudeResponses] = useState<GratitudeResponse[]>([]);
  const [gratitudeTotalCount, setGratitudeTotalCount] = useState(0);
  const [responsesLoaded, setResponsesLoaded] = useState(false);
  const [sharedToday, setSharedToday] = useState(false);

  // Fetch gratitude responses and check if already shared today.
  // Returns true if the user already shared today (skip input).
  const fetchGratitudeResponses = async (): Promise<boolean> => {
    try {
      const data = await apiRequest("GET", "/api/gratitude/responses");
      setGratitudeResponses(data.responses ?? []);
      setGratitudeTotalCount(data.totalCount ?? 0);
      setSharedToday(data.sharedToday ?? false);
      setResponsesLoaded(true);
      return data.sharedToday ?? false;
    } catch {
      setGratitudeResponses([]);
      setGratitudeTotalCount(0);
      setResponsesLoaded(true);
      return false;
    }
  };

  // Submit gratitude
  const submitGratitude = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", "/api/gratitude", { text });
      // Refresh responses after submitting so the responses slide is ready
      await fetchGratitudeResponses();
    },
    onSuccess: () => {
      transitionTo("gratitude-responses");
    },
    onError: (err) => {
      console.error("Gratitude submit failed:", err);
      // Still move forward — don't strand the user on the input slide
      setResponsesLoaded(true);
      transitionTo("gratitude-responses");
    },
  });

  // Mark seen
  const markSeen = useMutation({
    mutationFn: (responseIds: number[]) =>
      apiRequest("POST", "/api/gratitude/seen", { responseIds }),
  });

  // Complete prayer session (update last_prayer_at)
  const completePrayer = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gratitude/complete-prayer"),
  });

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests) {
      fetchGratitudeResponses().then((alreadyShared) => {
        setPhase(alreadyShared ? "gratitude-responses" : "gratitude-input");
      });
    }
  }, [slides.length, momentsData, prayerRequests]);

  // Fade in on mount; prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, []);

  const transitionTo = (nextPhase: typeof phase) => {
    setSlideVisible(false);
    setTimeout(() => {
      setPhase(nextPhase);
      setSlideVisible(true);
    }, 220);
  };

  const advance = () => {
    setSlideVisible(false);
    setTimeout(() => {
      if (index < slides.length - 1) {
        setIndex((i) => i + 1);
      } else {
        // Prayer slides done → enter gratitude flow
        // Skip input if already shared today
        fetchGratitudeResponses().then((alreadyShared) => {
          setPhase(alreadyShared ? "gratitude-responses" : "gratitude-input");
        });
      }
      setSlideVisible(true);
    }, 220);
  };

  const handleGratitudeSubmit = (text: string) => {
    submitGratitude.mutate(text);
  };

  const handleGratitudeSkip = () => {
    transitionTo("gratitude-responses");
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

    // Update last_prayer_at for gratitude response filtering
    completePrayer.mutate();

    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });

    // Fade out then navigate
    setVisible(false);
    setTimeout(() => setLocation("/prayer-list"), 500);
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
        onClick={() => {
          completePrayer.mutate();
          setLocation("/prayer-list");
        }}
        aria-label="Exit prayer mode"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Content — flex column centered vertically in the full viewport height */}
      <div
        className="flex flex-col items-center text-center px-8 py-20 w-full"
        style={{ maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center" }}
      >
        {phase === "prayer" && slide && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.22s ease" }}
          >
            <SlideContent slide={slide} onAdvance={advance} />
          </div>
        )}

        {phase === "gratitude-input" && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.3s ease" }}
          >
            <GratitudeInputSlide
              onSubmit={handleGratitudeSubmit}
              onSkip={handleGratitudeSkip}
            />
          </div>
        )}

        {phase === "gratitude-responses" && responsesLoaded && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.3s ease" }}
          >
            <GratitudeResponsesSlide
              responses={gratitudeResponses}
              totalCount={gratitudeTotalCount}
              onDone={handleDone}
              onMarkSeen={(ids) => markSeen.mutate(ids)}
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
