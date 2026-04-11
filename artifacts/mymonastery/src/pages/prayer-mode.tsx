import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";

const CLOSING_COLLECT =
  "Keep watch, dear Lord, with those who work, or watch, or weep this night, and give thine angels charge over those who sleep. Tend the sick, Lord Christ; give rest to the weary, bless the dying, soothe the suffering, pity the afflicted, shield the joyous; and all for thy love's sake.";

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
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
}

function SlideContent({ slide, onAdvance }: { slide: PrayerSlide; onAdvance: () => void }) {
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession" ? "Your Intercession" : "Prayer Request"}
      </p>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
      >
        {slide.text}
      </p>

      {slide.attribution && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      )}

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
    (m) => m.templateType === "intercession",
  );

  const slides: PrayerSlide[] = [
    ...intercessions.map((m) => ({
      kind: "intercession" as const,
      text: m.intercessionTopic || m.intention || m.name,
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
  const [phase, setPhase] = useState<"prayer" | "closing">("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests) {
      setPhase("closing");
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
    // — that's the whole point of the slideshow, so streaks and "last
    // prayed" timestamps register on the practices. We send `isCheckin: true`
    // (the field the backend actually reads; the old `loggingType: "checkin"`
    // was silently ignored), and we log every intercession with tokens,
    // not just ones whose window is currently "open". The post endpoint
    // de-dupes per day, so this is safe to call even if they already prayed.
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
    setVisible(false);
    setTimeout(() => setLocation("/dashboard"), 500);
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

        {phase === "closing" && (
          <div
            className="w-full flex flex-col items-center text-center gap-8"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.4s ease" }}
          >
            <p
              className="text-[15px] leading-[2] italic"
              style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
            >
              {CLOSING_COLLECT}
            </p>
            <p
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "rgba(143,175,150,0.32)" }}
            >
              From the Book of Common Prayer · Compline
            </p>
            <div className="h-px w-12" style={{ background: "rgba(200,212,192,0.15)" }} />
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
