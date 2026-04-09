import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { MorningPrayerSlideshow } from "@/components/MorningPrayer/MorningPrayerSlideshow";
import { Layout } from "@/components/layout";

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showMorning, setShowMorning] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  // Full-screen Morning Prayer slideshow
  if (showMorning) {
    return (
      <MorningPrayerSlideshow
        momentId={0}
        memberToken=""
        onBack={() => setShowMorning(false)}
      />
    );
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Daily Offices 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Morning Prayer and Evening Prayer for today
          </p>
        </div>

        <div className="space-y-3">
          {/* Morning Prayer */}
          <button
            onClick={() => setShowMorning(true)}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isMorning ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${isMorning ? "rgba(200,212,192,0.25)" : "rgba(200,212,192,0.12)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌅</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Morning Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                  Rite II · The Daily Office
                </p>
                {isMorning && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>
                    Available now
                  </p>
                )}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>

          {/* Evening Prayer */}
          <div
            className="w-full text-left p-5 rounded-2xl"
            style={{
              background: "rgba(46,107,64,0.06)",
              border: "1px solid rgba(200,212,192,0.1)",
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌙</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Evening Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                  Rite II · The Daily Office
                </p>
                <p className="text-xs mt-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                  Coming soon
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div
          className="mt-8 rounded-xl px-5 py-4 text-center"
          style={{ background: "rgba(200,212,192,0.04)", border: "1px dashed rgba(200,212,192,0.15)" }}
        >
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Want to pray the office daily with others?
          </p>
          <Link href="/moment/new" className="text-xs font-semibold mt-1 inline-block" style={{ color: "#6FAF85" }}>
            Start a Morning Prayer practice →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
