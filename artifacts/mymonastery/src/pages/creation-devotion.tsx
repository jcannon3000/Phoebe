import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { OfficeViewer, type LiturgyMode } from "./bcp-daily-office";

// ── Season of Creation — a creation-focused Daily Devotion ───────────────────
//
// A short office built on the two-week creation Psalter and the creation-themed
// prayers of *Season of Creation: A Celebration Guide for Episcopal Parishes*
// (2025). Reuses the Daily Office slide viewer (OfficeViewer) via the
// "creation-morning" / "creation-evening" modes. Offered as an optional
// enrichment for personal prayer — especially Sep 1 (World Day of Prayer for
// the Care of Creation) → Oct 4 (St. Francis).

export default function CreationDevotionPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showMode, setShowMode] = useState<LiturgyMode | null>(null);
  const [cameFromPicker, setCameFromPicker] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Deep-link resume from /prayer-mode (?mode=creation-morning|creation-evening).
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    if (mode === "creation-morning" || mode === "creation-evening") {
      setShowMode(mode);
      if (search.get("picked") === "1") setCameFromPicker(true);
    }
  }, []);

  const pick = (m: LiturgyMode) => { setCameFromPicker(true); setShowMode(m); };

  if (isLoading || !user) return null;

  if (showMode === "creation-morning" || showMode === "creation-evening") {
    return <OfficeViewer mode={showMode} cameFromPicker={cameFromPicker} onBack={() => { setShowMode(null); setLocation("/dashboard"); }} />;
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isEvening = hour >= 14;

  const card = (m: LiturgyMode, emoji: string, title: string, active: boolean) => (
    <button
      onClick={() => pick(m)}
      className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
      style={{
        background: active ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
        border: `1px solid ${active ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
      }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{emoji}</span>
        <div className="flex-1">
          <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{title}</p>
          <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>The creation Psalter + prayers with creation</p>
          {active && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
        </div>
        <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
      </div>
    </button>
  );

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <Link href="/menu/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Season of Creation 🌿
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            A creation-focused devotion — a two-week cycle of the Psalms with prayers with creation
          </p>
        </div>

        <div className="space-y-3">
          {card("creation-morning", "🌅", "Morning", isMorning)}
          {card("creation-evening", "🌆", "Evening", isEvening)}
        </div>

        <div className="mt-8 rounded-xl px-5 py-4" style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(143,175,150,0.7)" }}>
            The psalms and creation prayers are drawn from <span style={{ fontStyle: "italic" }}>Season of Creation: A Celebration Guide for Episcopal Parishes</span> (2025). The offices themselves are the 1979 Book of Common Prayer. Offered for personal devotion, especially September 1 – October 4.
          </p>
        </div>
      </div>
    </Layout>
  );
}
