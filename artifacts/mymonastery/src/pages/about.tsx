import { useState, type CSSProperties } from "react";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// The About page — a short description of Phoebe. English only by design.
// Public: a logged-out visitor (from the welcome screen's "About" pill) can
// read it too, so it renders in a lightweight standalone shell when there's no
// user, and inside the app Layout when signed in.

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

// A still leaf photo behind everything, same recipe as invite/invite-share
// (page backdrop pattern: absolute inset-0 + gradient wash, zIndex -1 inside
// an isolated stacking context — NEVER position:fixed, that flashes on iOS).
// Picked once per mount.
function useBgPhoto(): string | null {
  return useState(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null))[0];
}

// Frosted-glass card recipe shared by the slideshow card and the Privacy/
// Terms pills, so they read as panels floating over the photo rather than
// flat tinted boxes.
const FROST: CSSProperties = {
  backdropFilter: "blur(11px)",
  WebkitBackdropFilter: "blur(11px)",
};

export default function AboutPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const bgPhoto = useBgPhoto();

  if (isLoading) return null;

  const body = (
    <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <header className="mb-7">
          <p style={{ fontFamily: FONT, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7E9A85", margin: 0 }}>
            About
          </p>
          <h1 className="mt-1.5" style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "#F0EDE6" }}>
            Phoebe
          </h1>
          <button
            onClick={() => setLocation("/about-deck")}
            className="w-full transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{
              ...FROST,
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              borderRadius: 18,
              background: "rgba(45,94,63,0.28)",
              border: "1px solid rgba(143,175,150,0.35)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>🎞️</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: FONT, fontSize: 16, fontWeight: 700, color: "#F0EDE6" }}>
                View slideshow
              </span>
              <span style={{ display: "block", fontFamily: FONT, fontSize: 12.5, color: "#A8C5A0", marginTop: 2 }}>
                See Phoebe in ten slides
              </span>
            </span>
            <span aria-hidden style={{ fontSize: 18, color: "#A8C5A0" }}>→</span>
          </button>
        </header>

        <p style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 1.6, color: "#8FAF96", margin: "0 0 22px" }}>
          Phoebe is a project by Episcopal seminarians Anabelle Helsell and Jeremy Cannon, backed by a grant from the TryTank Research Institute at Virginia Theological Seminary.
        </p>

        <div className="space-y-4">
          <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.72, color: "#E4EADD" }}>
            Phoebe is an app for cultivating a daily practice of prayer. It brings together resources from across the Episcopal Church and beyond into one seamless routine — with the modern tools to help guide you through building it, and holding it.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            You can shape your own rhythm — from simply praying the Psalms to the full Daily Office — and pray it however meets you that day: from your own Book of Common Prayer, on the app, by audio, or alongside a cathedral broadcast. Whatever pieces your practice already has — the offices, a daily reflection, a few minutes of silence — Phoebe gathers them into one place. It keeps the depth of the tradition intact and simply changes how it reaches you, meeting you in the busy, dispersed life you actually live. It takes its name from the deacon Phoebe, who carried Paul’s letter to the Romans — entrusted to bring the word to where it needed to go.
          </p>
        </div>

        <div className="flex gap-3 mt-7">
          <button
            onClick={() => setLocation("/privacy")}
            className="transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{
              ...FROST,
              padding: "9px 18px",
              borderRadius: 999,
              background: "rgba(46,107,64,0.18)",
              border: "1px solid rgba(46,107,64,0.45)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setLocation("/terms")}
            className="transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{
              ...FROST,
              padding: "9px 18px",
              borderRadius: 999,
              background: "rgba(46,107,64,0.18)",
              border: "1px solid rgba(46,107,64,0.45)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Terms of Service
          </button>
        </div>
      </div>
  );

  // Signed in → the full app shell (Layout's own backdrop). Signed out → a
  // clean public page with its own photo + wash, same recipe as invite/
  // invite-share (isolation:isolate + absolute inset-0, zIndex -1 — NEVER
  // position:fixed, that flashes on iOS).
  if (user) return <Layout bgPhoto={bgPhoto} bgOpacity={0.22}>{body}</Layout>;
  return (
    <div
      className="relative min-h-screen"
      style={{ background: "#091A10", paddingTop: "var(--safe-top)", paddingBottom: "env(safe-area-inset-bottom, 0px)", isolation: "isolate" }}
    >
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            aria-hidden
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.22, zIndex: -1 }}
          />
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.6) 0%, rgba(8,22,15,0.8) 55%, rgba(8,22,15,0.92) 100%)" }}
          />
        </>
      )}
      <header className="px-6 pt-6 pb-2 max-w-2xl mx-auto">
        <Link href="/" className="text-sm font-medium" style={{ fontFamily: FONT, color: "#8FAF96" }}>
          ← Phoebe
        </Link>
      </header>
      <div className="px-6 pt-4">{body}</div>
    </div>
  );
}
