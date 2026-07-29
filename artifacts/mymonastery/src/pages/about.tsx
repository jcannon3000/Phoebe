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
          <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.72, color: "#E4EADD", fontStyle: "italic" }}>
            Phoebe is an app that helps churches move from distributing spiritual content to cultivating shared spiritual practice — and creating the opportunity for belonging in the process.
          </p>

          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            For many Christians today, the problem is not a lack of resources about prayer. There are countless books, podcasts, devotionals, Bible apps, and studies. What is missing for many people is a way to sustain the daily habit itself.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            The Prophet Daniel met resistance to praying three times a day in his own turbulent time. The causes look different for us, but we face resistance all the same: the pace of modern life, crowded schedules, endless distractions, and the fragmentation of our attention. Many people genuinely want to pray. They simply struggle to return to it day after day.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Sociologists describe part of this experience as social acceleration: the sense that life is moving faster even as more demands are placed upon us. Churches often respond to spiritual hunger by offering more — another program, another gathering, another evening on the calendar. But for people already living with exhaustion and divided attention, adding more activity can deepen the very conditions that make sustained formation difficult.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Phoebe begins with a different question: how might the Church help people sustain a daily practice of prayer within the realities of their lives, while giving them something meaningful to gather around when their schedules allow?
          </p>

          <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: "#F0EDE6", margin: "22px 0 2px" }}>
            Cultivating a Daily Habit
          </h2>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Phoebe makes it easier to build and sustain a daily rhythm of prayer. Drawing on principles used by habit-forming apps such as Duolingo, it guides each person through a customizable routine rather than presenting prayer as a library of resources to browse.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Each practice is presented one step at a time, always showing what comes next and allowing the user to mark it complete — not to reward streaks or punish inconsistency, but to reduce friction and make it easier to return the following day.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Rather than asking people to attend another event or work through another curriculum, Phoebe carries prayer into the ordinary spaces of daily life: the morning commute, a lunch break, or the quiet before bed. It does not remove the pressures of modern life, but it helps people establish a steady practice in the midst of them.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            The framework is built around Bishop Michael Curry's Way of Love, offering an accessible rule of life that serves as an entry point into the lifelong process of becoming more like Jesus.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            The app carries part of that process. It helps hold the intention to pray from one day to the next. Across the history of the Church, communities have also helped sustain people in their walk with God.
          </p>

          <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: "#F0EDE6", margin: "22px 0 2px" }}>
            Walking Together
          </h2>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            When Jesus invited his disciples to take up his yoke, he was drawing on the rabbinic practice of apprenticeship: learning a way of life by walking alongside a teacher.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Phoebe gives churches a way to sustain that process within the conditions of modern life. In the past, formation was often held by everyone gathering at the same time each week. But work, family, school, and shifting schedules now make that rhythm harder to maintain. Phoebe allows the process to continue between gatherings, with each person practicing within the realities of their own life while knowing that others are moving in the same direction.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            The app does not attempt to replace in-person community or recreate it online. Instead, it holds the shared rhythm while people are apart, so that when they do gather, they are returning to a journey already underway.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Members of a group using Phoebe may be at very different stages. Some may be establishing a regular prayer life for the first time. Others may have prayed the Daily Office for years. What holds them together is not following the same routine or being at the same point, but moving in the same direction — toward becoming more like Jesus.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Groups can gather whenever it best fits their context to reflect on what God is doing, encourage one another, and deepen relationships. In an age when schedules rarely align for a weekly Bible study or small group, the gathering becomes one moment within a longer process of formation already unfolding throughout the week — not the only thing keeping that process alive.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Rather than ending when a retreat, course, or parish event is over, Phoebe carries its intention into the ordinary days that follow. The app supports the daily practice; the gathering gives people an opportunity to reflect on that practice, support one another, and discern where God is leading them.
          </p>

          <blockquote
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.72,
              color: "#C8D4C0",
              margin: "22px 0",
              padding: "2px 0 2px 18px",
              borderLeft: "2px solid rgba(143,175,150,0.4)",
            }}
          >
            "And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together, as some are in the habit of doing, but encouraging one another — and all the more as you see the Day approaching."
            <span style={{ display: "block", fontStyle: "normal", fontFamily: FONT, fontSize: 12.5, color: "#7E9A85", marginTop: 8 }}>
              Hebrews 10
            </span>
          </blockquote>

          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            Young adults are hungry for meaningful connection, but simply gathering people in the same room is not enough to create it. Leaders can use Phoebe to create the conditions for belonging as people enter a meaningful process together — cultivating a habit of prayer in their own lives, supporting one another when they gather, and walking together in the life of discipleship.
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
