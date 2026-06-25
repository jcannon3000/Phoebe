import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";

// ── /guided-meditations — Center for Spiritual Imagination ──────────────────
//
// A small library of guided meditations from the Center for Spiritual
// Imagination (soundcloud.com/centerforsi), played in-app via the SoundCloud
// widget. These map onto Phoebe's own practices — the Examen, contemplative
// sits, and walking prayer — but live together here as a quiet listening
// shelf. There is no podcast RSS feed for these (SoundCloud embeds only), so
// the page embeds the publisher's player directly.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// The curated tracks the publisher lists on spiritualimagination.org/audio —
// shown as a guide to what's in the player below.
const MEDITATIONS: Array<{ emoji: string; title: string; blurb: string }> = [
  { emoji: "🕯️", title: "Prayer of the Name", blurb: "A 30-minute guided meditation on the prayer of the name." },
  { emoji: "💗", title: "Heartful Meditation", blurb: "A 30-minute heart-centered contemplative sit." },
  { emoji: "🌗", title: "Nightly Examen Meditation", blurb: "A guided evening examen — review the day with God." },
  { emoji: "🌅", title: "Morning Walking Earth Meditation", blurb: "A 15-minute guided walking meditation for the morning." },
  { emoji: "☀️", title: "Midday Walking Earth Meditation", blurb: "A 15-minute guided walking meditation for midday." },
  { emoji: "🌙", title: "Evening Walking Earth Meditation", blurb: "A 15-minute guided walking meditation for the evening." },
];

// SoundCloud widget for the publisher's profile — plays their guided
// meditations in-app. Brand-green accent; no comments / reposts clutter.
const SOUNDCLOUD_SRC =
  "https://w.soundcloud.com/player/?url=" +
  encodeURIComponent("https://soundcloud.com/centerforsi") +
  "&color=%232e6b40&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false";

export default function GuidedMeditationsPage() {
  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 transition-opacity hover:opacity-80"
          style={{ color: SAGE, fontFamily: FONT, fontSize: 14, marginBottom: 14 }}
        >
          <ChevronLeft size={16} /> Back
        </Link>

        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
          Guided Meditations
        </h1>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: "0 0 22px" }}>
          A quiet shelf of guided sits from the{" "}
          <a
            href="https://www.spiritualimagination.org/audio/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#A8C5A0", textDecoration: "underline" }}
          >
            Center for Spiritual Imagination
          </a>
          . Press play below — an examen, two contemplative sits, and walking
          prayers for morning, midday, and evening.
        </p>

        {/* The in-app player */}
        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(46,107,64,0.3)",
            background: "rgba(9,26,16,0.42)",
            marginBottom: 26,
          }}
        >
          <iframe
            title="Center for Spiritual Imagination — guided meditations"
            width="100%"
            height={480}
            frameBorder="no"
            scrolling="no"
            allow="autoplay"
            src={SOUNDCLOUD_SRC}
            style={{ display: "block", border: "none" }}
          />
        </div>

        {/* What's inside — a guide to the tracks in the player */}
        <h2 style={{ color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700, margin: "0 0 12px", opacity: 0.9 }}>
          In this collection
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MEDITATIONS.map((m) => (
            <div
              key={m.title}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background: "rgba(46,107,64,0.10)",
                border: "1px solid rgba(200,212,192,0.13)",
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }} aria-hidden>
                {m.emoji}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600 }}>
                  {m.title}
                </span>
                <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>
                  {m.blurb}
                </span>
              </span>
            </div>
          ))}
        </div>

        <p style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.5, margin: "22px 0 0" }}>
          Audio © Center for Spiritual Imagination, hosted on SoundCloud and
          played here with their public player.
        </p>
      </div>
    </Layout>
  );
}
