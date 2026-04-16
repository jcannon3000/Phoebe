import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
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
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
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
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
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
    ...prayerRequests
      .filter((r) => !r.isAnswered)
      .map((r) => ({
        kind: "request" as const,
        text: r.body,
        attribution: r.ownerName ? `from ${r.ownerName}` : "from someone",
      })),
  ];

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prayer" | "closing">("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests) {
      setPhase("closing");
    }
  }, [slides.length, momentsData, prayerRequests]);

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
            <SlideContent slide={slide} onAdvance={advance} />
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
