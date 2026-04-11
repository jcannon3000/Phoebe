import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { MorningPrayerSlideshow } from "@/components/MorningPrayer/MorningPrayerSlideshow";
import { Layout } from "@/components/layout";
import type { Slide } from "@/components/MorningPrayer/types";
import { SlideView } from "@/components/MorningPrayer/Slide";
import { ProgressBar } from "@/components/MorningPrayer/ProgressBar";
import { useSlideshow } from "@/components/MorningPrayer/useSlideshow";

// ── Standalone Evening Prayer Viewer ─────────────────────────────────────────

const SOIL_EP = "#1A1C2E";
const CREAM_EP = "#E8E4D8";

function EveningPrayerViewer({ onBack }: { onBack: () => void }) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollableSet = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/office/evening");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const fetched: Slide[] = data.slides ?? [];
        setSlides(fetched);
        const set = new Set<number>();
        fetched.forEach((s, i) => { if (s.isScrollable) set.add(i); });
        scrollableSet.current = set;
      } catch (err) {
        if (!cancelled) setError("Evening Prayer is not available right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const {
    currentIndex, direction, scrollBlocked, contentRef,
    handleClick, handleTouchStart, handleTouchEnd, handleTouchMove, handleScroll,
  } = useSlideshow({ total: slides.length, scrollableSlides: scrollableSet.current });

  if (loading) {
    const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return (
      <div style={{ minHeight: "100vh", background: SOIL_EP, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <style>{`@keyframes ep-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
        <div style={{ fontSize: 48, animation: "ep-pulse 2s ease-in-out infinite" }}>🌙</div>
        <p style={{ fontSize: 18, color: "#8B9DC3", fontStyle: "italic", fontFamily: "Georgia, serif", textAlign: "center" }}>
          Preparing today's office... 🌿
        </p>
        <p style={{ fontSize: 14, color: "#6B7A9D", fontFamily: "Space Grotesk, sans-serif" }}>
          Evening Prayer · {today}
        </p>
      </div>
    );
  }

  if (error || slides.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: SOIL_EP, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 18, color: CREAM_EP, fontFamily: "Space Grotesk, sans-serif" }}>
          {error ?? "Evening Prayer is not available right now."}
        </p>
        <button onClick={onBack} style={{ fontSize: 15, color: "#8B9DC3", fontFamily: "Space Grotesk, sans-serif", background: "none", border: "none", cursor: "pointer" }}>
          ← Back to Daily Offices
        </button>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];
  const isForward = direction === "forward";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: SOIL_EP, overflow: "hidden", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <ProgressBar current={currentIndex} total={slides.length} currentType={currentSlide.type} />

      {currentSlide.type !== "opening" && currentSlide.type !== "closing" && (
        <div style={{ position: "fixed", top: 12, right: 16, fontSize: 12, color: "rgba(139,157,195,0.4)", fontFamily: "Space Grotesk, sans-serif", zIndex: 90, pointerEvents: "none" }}>
          {currentIndex + 1} of {slides.length}
        </div>
      )}

      <style>{`
        .ep-slide-enter-forward { animation: ep-enter-forward 300ms ease forwards; }
        .ep-slide-enter-back { animation: ep-enter-back 300ms ease forwards; }
        @keyframes ep-enter-forward { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes ep-enter-back { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>

      <div
        key={currentSlide.id}
        className={direction ? (isForward ? "ep-slide-enter-forward" : "ep-slide-enter-back") : undefined}
        style={{ width: "100%", height: "100%" }}
      >
        <SlideView
          ref={contentRef}
          slide={currentSlide}
          scrollBlocked={scrollBlocked}
          onScroll={handleScroll}
          presenceData={[]}
          hasLogged={false}
          onLog={() => {}}
          onBack={onBack}
          momentId={0}
          memberToken=""
          theme="evening"
        />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showOffice, setShowOffice] = useState<"morning" | "evening" | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  if (showOffice === "morning") {
    return (
      <MorningPrayerSlideshow
        momentId={0}
        memberToken=""
        onBack={() => setShowOffice(null)}
      />
    );
  }

  if (showOffice === "evening") {
    return <EveningPrayerViewer onBack={() => setShowOffice(null)} />;
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isEvening = hour >= 14;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Daily Offices 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Morning Prayer and Evening Prayer for today
          </p>
        </div>

        <div className="space-y-3">
          {/* Morning Prayer */}
          <button
            onClick={() => setShowOffice("morning")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isMorning ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${isMorning ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌅</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Morning Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isMorning && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>

          {/* Evening Prayer */}
          <button
            onClick={() => setShowOffice("evening")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isEvening ? "rgba(26,28,46,0.4)" : "rgba(26,28,46,0.15)",
              border: `1px solid ${isEvening ? "rgba(139,157,195,0.25)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌙</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Evening Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isEvening && <p className="text-xs mt-1.5 font-medium" style={{ color: "#8B9DC3" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Want to pray the office daily with others?
          </p>
          <Link href="/moment/new" className="text-xs font-semibold mt-1 inline-block" style={{ color: "#6FAF85" }}>
            Start a Daily Office practice →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
