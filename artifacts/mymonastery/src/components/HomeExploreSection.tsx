// ── Home "Explore" section — both tickers, at the bottom ────────────────────
//
// Owner, 2026-09-19: "Let's leave the tickers on the home page, but at the
// bottom, call the section explore and have both tickers in the same
// section." · "add the newsletters/reflections as another row, have it be
// the second row". One heading (HomeLearnSection's recipe, as the tickers'
// own headings were), then practices, reflections and saints, each rendered
// bare so none brings its own heading.

import { HomePracticesTicker } from "@/components/HomePracticesTicker";
import { HomeSaintsTicker } from "@/components/HomeSaintsTicker";
import { HomeReflectionsTicker } from "@/components/HomeReflectionsTicker";

export function HomeExploreSection() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Explore</h3>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="flex flex-col gap-2.5">
        <HomePracticesTicker bare />
        <HomeReflectionsTicker />
        <HomeSaintsTicker bare />
      </div>
    </div>
  );
}
