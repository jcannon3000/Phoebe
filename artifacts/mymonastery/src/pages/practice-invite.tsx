/**
 * /practice/:key — a shareable invitation to ONE practice.
 *
 * Owner: "a way that I could send a link and it would implement a practice
 * into someone's routine if they accepted it — a splash, and then they say
 * accept — and specifically the Dean's Commentary."
 *
 * The single-practice cousin of /routine/:token: that link carries a whole
 * rule; this one carries one practice, so it needs no token — the URL names
 * the practice (withphoebe.app/practice/vts) and the catalogue below is the
 * allowlist of what a link may add. Accepting performs EXACTLY the write the
 * customizer's own Add flow performs for the same practice, so a practice
 * arriving by link is indistinguishable from one added by hand: same card,
 * same slot, same place at the end of the routine order until the person
 * drags it where they want it.
 *
 * Nothing is written before Accept. A link must never install anything by
 * being opened — the splash is the whole point ("versus a splash, and then
 * they say accept").
 */
import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { readCachedHomeLayout, saveHomeLayout, type HomeLayout } from "@/lib/homeLayoutCache";
import { setPracticeSlot, type SlottedPractice } from "@/lib/customAnchors";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

/**
 * What a link may add. Two shapes, both mirroring the customizer's Add flow:
 * a REFLECTION unhides its daily card; a PRACTICE unhides its card and sets
 * its slot to anytime. Keys outside this list render a quiet not-found — a
 * URL is user input, and an unlisted key must not reach a write.
 */
const INVITABLE: Record<string, {
  emoji: string;
  name: string;
  by: string;
  blurb: string;
  kind: "reflection" | "practice";
  cardKey: string;
}> = {
  vts: {
    emoji: "🦩",
    name: "VTS Dean's Commentary",
    by: "Virginia Theological Seminary",
    blurb: "A few minutes each weekday with the Dean's word — read the day's commentary, and it counts in your daily rhythm.",
    kind: "reflection", cardKey: "vts",
  },
  cac: { emoji: "📖", name: "CAC Daily Meditation", by: "Center for Action and Contemplation", blurb: "Richard Rohr's daily meditation — a short reflection to carry through the day.", kind: "reflection", cardKey: "cac" },
  fdd: { emoji: "📖", name: "Forward Day by Day", by: "Forward Movement", blurb: "The classic daily devotion — a few minutes with the day's word.", kind: "reflection", cardKey: "fdd" },
  ssje: { emoji: "✍🏽", name: "Brother, Give Us a Word", by: "Society of Saint John the Evangelist", blurb: "A single word from the brothers to sit with each day.", kind: "reflection", cardKey: "ssje" },
  visio: { emoji: "🖼️", name: "Visio Divina", by: "Praying with art", blurb: "The day's artwork, matched to the lectionary — look slowly, and lift what rises.", kind: "practice", cardKey: "visio" },
  listening: { emoji: "🎵", name: "Audio Divina", by: "Praying with music", blurb: "Once a day, connect with God through a song that is meaningful to you.", kind: "practice", cardKey: "listening" },
  walk: { emoji: "🚶", name: "Contemplative Walk", by: "Praying on foot", blurb: "A walk as prayer — unhurried, attentive, outdoors.", kind: "practice", cardKey: "walk" },
  examen: { emoji: "🌗", name: "The Examen", by: "In the school of Ignatius", blurb: "Review the day with God, and notice where grace was.", kind: "practice", cardKey: "examen" },
  cobreathe: { emoji: "🌍", name: "Creation Prayer", by: "Breathing with creation", blurb: "A short breathing prayer alongside God's creation.", kind: "practice", cardKey: "cobreathe" },
};

export default function PracticeInvitePage() {
  const { key } = useParams<{ key: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const practice = key ? INVITABLE[key] ?? null : null;
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const accept = () => {
    if (!practice || accepted) return;
    // Signed-out web (guest build off): an account is what makes the add
    // durable — same rule the routine link keeps.
    if (!user && !PHOEBE_GUEST_ENABLED) {
      setLocation(`/signin?mode=signup&redirect=${encodeURIComponent(`/practice/${key}`)}`);
      return;
    }
    // The same write the customizer's Add flow performs: unhide the card in
    // the CURRENT layout (server copy first, local cache as fallback) — and
    // for a practice, open its slot. saveHomeLayout is the durable writer
    // (this repo's standing rule for layout writes).
    const hl = (user?.homeLayout as HomeLayout | undefined) ?? readCachedHomeLayout() ?? { order: [], hidden: [] };
    const order = [...hl.order];
    if (!order.includes(practice.cardKey)) order.push(practice.cardKey);
    const hidden = hl.hidden.filter((k) => k !== practice.cardKey);
    void saveHomeLayout({ order, hidden });
    if (practice.kind === "practice") setPracticeSlot(practice.cardKey as SlottedPractice, "anytime");
    qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    setAccepted(true);
  };

  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(46,107,64,0.4)", borderRadius: 20, padding: 22,
  };

  return (
    <div style={{ minHeight: "100dvh", position: "relative", isolation: "isolate", background: "#091A10", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {leaf && <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.22, zIndex: -1 }} />}
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.6) 0%, rgba(8,22,15,0.85) 100%)" }} />
      <div style={{ width: "100%", maxWidth: 420 }}>
        {!practice ? (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 700, margin: 0 }}>This invitation isn't one we recognize.</p>
            <button type="button" onClick={() => setLocation("/dashboard")} style={{ marginTop: 16, background: "rgba(46,107,64,0.85)", color: WARM, border: "none", borderRadius: 999, padding: "12px 26px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
              Go home
            </button>
          </div>
        ) : accepted ? (
          <div style={{ ...card, textAlign: "center" }}>
            <span aria-hidden style={{ fontSize: 40 }}>{practice.emoji}</span>
            <p style={{ color: WARM, fontFamily: FONT, fontSize: 19, fontWeight: 700, margin: "12px 0 6px" }}>
              {practice.name} is in your rhythm
            </p>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: 0 }}>
              Its card is on your home now. Drag it wherever it belongs in your day.
            </p>
            <button type="button" onClick={() => setLocation("/dashboard")} style={{ marginTop: 18, width: "100%", background: "rgba(46,107,64,0.85)", color: WARM, border: "none", borderRadius: 999, padding: "14px 26px", fontSize: 15.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
              See it on your home →
            </button>
          </div>
        ) : (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 14px" }}>
              An invitation to a practice
            </p>
            <span aria-hidden style={{ fontSize: 44 }}>{practice.emoji}</span>
            <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 24, fontWeight: 700, lineHeight: 1.25, margin: "12px 0 2px" }}>{practice.name}</h1>
            <p style={{ color: "rgba(143,175,150,0.8)", fontFamily: FONT, fontSize: 12.5, margin: "0 0 12px" }}>{practice.by}</p>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{practice.blurb}</p>
            <button type="button" onClick={accept} style={{ marginTop: 20, width: "100%", background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 999, padding: "14px 26px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
              Add it to my rhythm
            </button>
            <button type="button" onClick={() => setLocation("/dashboard")} style={{ marginTop: 10, background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 13.5, fontFamily: FONT, cursor: "pointer", padding: "8px 12px" }}>
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
