import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { OfficeViewer, type LiturgyMode } from "./bcp-daily-office";

// ── Daily Devotions picker ──────────────────────────────────────────────────
//
// The 1979 BCP Daily Devotions for Individuals and Families (pp.
// 137–140) are the abbreviated forms of the offices intended for
// personal or family use. Phoebe surfaces two of the four — In the
// Morning and In the Early Evening — and reuses the Daily Office's
// slide viewer (OfficeViewer) for the actual liturgy. The picker UI
// mirrors bcp-daily-office.tsx's layout so the surface feels familiar
// next to the full Office.

export default function BcpDailyDevotionPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showMode, setShowMode] = useState<LiturgyMode | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Auto-resume the devotion viewer when /prayer-mode hands the
  // user back here with ?mode=morning-devotion|early-evening-devotion.
  // The URL is cleaned up inside the viewer once it reads its
  // ?slide=N param, so a later X-out + re-entry doesn't re-resume.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    if (mode === "morning-devotion" || mode === "early-evening-devotion") {
      setShowMode(mode);
    }
  }, []);

  if (isLoading || !user) return null;

  if (showMode === "morning-devotion" || showMode === "early-evening-devotion") {
    return <OfficeViewer mode={showMode} onBack={() => setShowMode(null)} />;
  }

  // Highlight the time-appropriate card. Same threshold as the Daily
  // Office picker — anything before 14:00 reads as morning, anything
  // after as evening — so the two pages feel coherent.
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
            Daily Devotions 🌿
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            A short prayer at the beginning and close of the day
          </p>
        </div>

        <div className="space-y-3">
          {/* In the Morning */}
          <button
            onClick={() => setShowMode("morning-devotion")}
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
                  In the Morning
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                  A short devotion · BCP p. 137
                </p>
                {isMorning && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>

          {/* In the Early Evening */}
          <button
            onClick={() => setShowMode("early-evening-devotion")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isEvening ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${isEvening ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌆</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  In the Early Evening
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                  A short devotion · BCP p. 139
                </p>
                {isEvening && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Want the full liturgy?
          </p>
          <Link href="/bcp/daily-office" className="text-xs font-semibold mt-1 inline-block" style={{ color: "#6FAF85" }}>
            Open the Daily Office →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
