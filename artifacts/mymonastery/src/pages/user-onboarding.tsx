import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle, MapPin, Users, Camera } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { triggerAmenFeedback } from "@/lib/amenFeedback";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import { RequestWordField } from "@/components/RequestWordField";

// ─── Palette (matches church-deck exactly) ───────────────────────────────────
const C = {
  bg: "#091A10",
  card: "#0F2818",
  text: "#F0EDE6",
  sage: "#8FAF96",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Mock UI shell ────────────────────────────────────────────────────────────

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[320px] md:max-w-[380px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}

// ─── Mock screens ─────────────────────────────────────────────────────────────

function DashboardMock() {
  return (
    <MockPhone>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-base font-bold" style={{ color: C.text, fontFamily: C.font }}>Phoebe</h2>
        <div className="flex gap-1.5">
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>🕯️ Prayer List</span>
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>Menu</span>
        </div>
      </div>
      <p className="text-[8px] uppercase tracking-[0.15em] mb-1" style={{ color: "rgba(143,175,150,0.4)" }}>A place set apart for connection</p>
      <p className="text-[13px] font-semibold mb-3" style={{ color: C.text, fontFamily: C.font }}>Sunday, 12 April</p>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>This week</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div className="space-y-2">
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>📜 Lectio Divina</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Sarah, David +3</p>
            </div>
            <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Responses</span>
          </div>
        </div>
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>🙏🏽 Prayers for healing</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Margaret, Anna</p>
            </div>
            <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(46,107,64,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}>View</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>Prayer requests</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div className="rounded-xl px-3 py-2.5" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
        <p className="text-[10px] font-semibold mb-0.5" style={{ color: C.sage }}>Margaret W.</p>
        <p className="text-[11px] leading-snug" style={{ color: C.text }}>For my mother, who begins treatment this week.</p>
        <p className="text-[9px] mt-1" style={{ color: "rgba(143,175,150,0.35)" }}>🙏 4 praying</p>
      </div>
    </MockPhone>
  );
}

// Daily-rhythm mock: a still-frame of an actual prayer-request slide
// from the daily slideshow. Mirrors prayer-mode.tsx layout — pulsing
// author avatar, "Prayer Request" eyebrow, author name, italic Playfair
// body, dim "hold" Amen button, and the "1 of 3" progress beneath.
// Onboarding users see exactly what they'll be tapping through every
// day, instead of a notification card that only hints at the slideshow.
function DailyPushMock() {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] mx-auto w-full max-w-[320px] md:max-w-[380px] overflow-hidden relative"
      style={{
        background: "#0C1F12",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        margin: "0 auto",
        minHeight: 460,
      }}
    >
      {/* X exit button (top-right of the slide chrome) */}
      <div
        className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-base"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
        aria-hidden
      >
        ×
      </div>

      {/* Center stack — author avatar, eyebrow, name, body */}
      <div className="flex flex-col items-center justify-center text-center px-8 pt-16 pb-10">
        {/* Author avatar with the pulse ring (same vibe as the live
            .prayer-avatar-pulse class — using a static glow here so
            the still mock reads as if mid-pulse). */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-[14px] font-semibold mb-4"
          style={{
            background: "#1A4A2E",
            color: "#A8C5A0",
            border: "1.5px solid rgba(143,175,150,0.85)",
            boxShadow: "0 0 0 4px rgba(143,175,150,0.18)",
            fontFamily: C.font,
          }}
        >
          MW
        </div>
        <p
          className="text-[10px] font-semibold uppercase mb-2"
          style={{ color: "rgba(143,175,150,0.45)", letterSpacing: "0.18em", fontFamily: C.font }}
        >
          Prayer Request
        </p>
        <p className="text-[11px] mb-4" style={{ color: "#C8D4C0", fontFamily: C.font }}>
          Margaret W.
        </p>
        <p
          className="text-[15px] font-medium italic leading-relaxed max-w-[260px]"
          style={{ color: "#E8E4D8", fontFamily: "Georgia, serif" }}
        >
          For my mother, who begins treatment this week.
        </p>
      </div>

      {/* Amen button (dim "hold" state — the live UI shows the wash
          filling for ~7s before turning bright; static here) */}
      <div className="flex justify-center pb-2">
        <div
          className="px-7 py-2.5 rounded-full text-[12px] font-medium"
          style={{
            background: "rgba(46,107,64,0.18)",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "rgba(232,228,216,0.4)",
            fontFamily: C.font,
            minWidth: 120,
            textAlign: "center",
          }}
        >
          Amen →
        </div>
      </div>

      {/* Slide-progress label */}
      <p
        className="text-center text-[10px] pb-5"
        style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em", fontFamily: C.font }}
      >
        1 of 3
      </p>
    </div>
  );
}

function PrayerRequestsMock() {
  const requests = [
    { from: "Margaret W.", body: "For my mother, who begins treatment this week.", words: 4 },
    { from: "David R.", body: "Discernment about the new role.", words: 6 },
    { from: "Anonymous", body: "For peace in a difficult season.", words: 2 },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[14px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>Prayer Requests 🙏🏽</h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 text-[12px] px-3 py-2.5 rounded-xl" style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
          Share a prayer request... 🌿
        </div>
        <div className="px-3 py-2.5 rounded-xl text-[12px]" style={{ background: "#2D5E3F", color: C.text }}>🙏🏽</div>
      </div>
      <div>
        {requests.map((r, i) => (
          <div key={i} className="flex gap-0" style={{ borderBottom: i < 2 ? "1px solid rgba(200,212,192,0.12)" : "none" }}>
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 p-3 pl-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>From {r.from}</p>
                <p className="text-[12px] leading-relaxed" style={{ color: C.text, fontFamily: C.font }}>{r.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                <span className="text-[10px] tabular-nums">{r.words}</span>
                <MessageCircle size={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function BCPPrayerModeMock() {
  const categories = [
    { emoji: "⛪", name: "For the Church", count: 8, expanded: false },
    { emoji: "✝️", name: "For the Mission of the Church", count: 5, expanded: true, items: ["For the Spread of the Gospel", "For the Mission of the Church", "For Missionaries", "For our Enemies", "For Those Who Suffer for the Faith"] },
    { emoji: "🏛️", name: "For the Nation", count: 7, expanded: false },
  ];
  return (
    <MockPhone>
      <p className="text-[10px] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>← Book of Common Prayer</p>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>Intercessions 🙏🏽</h2>
      <p className="text-[9px] mb-2.5" style={{ color: C.sage }}>Prayers from the Book of Common Prayer</p>
      <div className="rounded-lg px-2.5 py-1.5 mb-2.5 text-[10px]" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)", color: "rgba(143,175,150,0.4)" }}>
        Search prayers...
      </div>
      <div className="space-y-1">
        {categories.map((cat, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: cat.expanded ? "rgba(46,107,64,0.2)" : "rgba(46,107,64,0.06)", border: `1px solid ${cat.expanded ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.12)"}` }}>
              <span className="text-[12px]">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold truncate" style={{ color: C.text, fontFamily: C.font }}>{cat.name}</p>
                {cat.count > 0 && <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{cat.count} prayers</p>}
              </div>
              <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>{cat.expanded ? "⌄" : "›"}</span>
            </div>
            {cat.expanded && cat.items && (
              <div className="ml-6 space-y-0">
                {cat.items.map((item, j) => (
                  <div key={j} className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: j < cat.items!.length - 1 ? "1px solid rgba(200,212,192,0.08)" : "none" }}>
                    <p className="text-[9px]" style={{ color: C.sage }}>{item}</p>
                    <span className="text-[8px]" style={{ color: "rgba(143,175,150,0.3)" }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function LectioMock() {
  const reflections = [
    { name: "Margaret", isYou: false, time: "Mon · 8am", text: "I keep returning to the moment they recognised him — and then he was gone." },
    { name: "You", isYou: true, time: "Today · 7am", text: "\"Hearts burning\" — the way ordinary moments can hold something we don't see until later." },
    { name: "David", isYou: false, time: "Wed · 6pm", text: "The road itself. They were walking away from Jerusalem. Yet he met them there." },
  ];
  return (
    <MockPhone>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>← Back</p>
        <div className="px-3 py-1 rounded-full text-[10px] font-semibold" style={{ background: "rgba(19,44,29,0.85)", border: "1px solid rgba(200,212,192,0.15)", color: C.text }}>Menu</div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2</p>
          <p className="text-[10px]" style={{ color: C.sage }}>Luke 24:13–35</p>
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.45)" }}>What others heard</p>
      <div className="space-y-2 mb-4">
        {reflections.map((r, i) => (
          <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: r.isYou ? "rgba(111,175,133,0.08)" : "#0F2818", border: `1px solid ${r.isYou ? "rgba(111,175,133,0.35)" : "rgba(200,212,192,0.15)"}` }}>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: r.isYou ? "#6FAF85" : C.sage }}>{r.name}</p>
              <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{r.time}</p>
            </div>
            <p className="text-[11px] leading-[1.55]" style={{ color: C.text, fontFamily: C.font }}>{r.text}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-full px-3 py-2" style={{ background: "rgba(19,44,29,0.92)", border: "1px solid rgba(200,212,192,0.15)" }}>
        <p className="text-[10px] font-semibold" style={{ color: C.text }}>Back</p>
        <p className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2 · Meditatio</p>
        <div className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Next stage</div>
      </div>
    </MockPhone>
  );
}

function GatheringsMock() {
  const groups = [
    { label: "Today", highlight: true, events: [{ time: "6:30 PM", title: "Wednesday Supper", location: "Parish Hall", people: "Margaret, David +4", kind: "ical" as const }] },
    { label: "Thursday", highlight: false, events: [{ time: "7:00 PM", title: "Lenten Study", location: "Library", people: "Anna, James +3", kind: "phoebe" as const }] },
    { label: "Saturday", highlight: false, events: [{ time: "8:00 AM", title: "Morning Prayer", location: "Chapel", people: "4 regulars", kind: "phoebe" as const }] },
  ];
  return (
    <MockPhone>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>Gatherings</h2>
      <div className="h-px mb-3" style={{ background: "rgba(200,212,192,0.1)" }} />
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: g.highlight ? "#6FAF85" : "rgba(200,212,192,0.45)" }}>{g.label}</p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.1)" }} />
            </div>
            <div className="space-y-1.5">
              {g.events.map((ev, ei) => (
                <div key={ei} className="relative flex rounded-xl overflow-hidden" style={{ background: ev.kind === "ical" ? "rgba(10,28,18,0.7)" : "#0F2818", border: `1px solid ${ev.kind === "ical" ? "rgba(74,158,132,0.2)" : "rgba(92,138,95,0.28)"}` }}>
                  <div className="w-0.5 shrink-0" style={{ background: ev.kind === "ical" ? "#4A9E84" : "#5C8A5F" }} />
                  <div className="flex-1 px-2.5 py-2">
                    <p className="text-[9px] font-semibold tabular-nums" style={{ color: "rgba(143,175,150,0.7)" }}>{ev.time}</p>
                    <p className="text-[11px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{ev.title}</p>
                    {ev.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.location}</span>
                      </div>
                    )}
                    {ev.people && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Users size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.people}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

// ─── Daily Office + Prayer Rhythm mocks (mirror church-deck) ────────────────
//
// Copied verbatim from artifacts/mymonastery/src/pages/church-deck.tsx
// so the onboarding slides about the offices match the about/marketing
// slideshow visually one-for-one. Same MockPhone wrapper, same C
// palette — both files share the design tokens.

/* ── The Daily Office — Evening Prayer psalm slide ── */
function DailyOfficeMock() {
  const verses = [
    { n: 121, line1: "I have done what is just and right;", line2: "do not deliver me to my oppressors." },
    { n: 122, line1: "Be surety for your servant's good;", line2: "let not the proud oppress me." },
    { n: 123, line1: "My eyes have failed from watching for your salvation", line2: "and for your righteous promise." },
    { n: 124, line1: "Deal with your servant according to your loving-kindness", line2: "and teach me your statutes." },
  ];
  const serif = "Georgia, 'Times New Roman', serif";
  return (
    <MockPhone>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>← Back</p>
        <div
          className="px-3 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "rgba(19,44,29,0.85)", border: "1px solid rgba(200,212,192,0.18)", color: C.text, fontFamily: C.font }}
        >
          Evening Prayer
        </div>
        <div className="w-[40px]" />
      </div>
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-3 text-center"
        style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}
      >
        Psalm 119:121&ndash;144
      </p>
      <div className="mb-4">
        {verses.map((v) => (
          <div key={v.n} className="mb-2.5">
            <div className="flex gap-2">
              <span
                className="text-[10px] leading-[1.55] shrink-0 pt-[1px]"
                style={{ color: C.sage, fontFamily: serif, fontVariantNumeric: "tabular-nums" }}
              >
                {v.n}
              </span>
              <div className="flex-1">
                <p className="text-[11px] leading-[1.55]" style={{ color: C.text, fontFamily: serif }}>
                  {v.line1} <span style={{ color: C.sage }}>*</span>
                </p>
                <p className="text-[11px] leading-[1.55] pl-3" style={{ color: C.text, fontFamily: serif }}>
                  {v.line2}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-3 text-center"
        style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
      >
        BCP p. 763
      </p>
      <div
        className="flex items-center justify-between rounded-full px-3 py-2"
        style={{ background: "rgba(19,44,29,0.92)", border: "1px solid rgba(200,212,192,0.15)" }}
      >
        <p className="text-[10px] font-semibold" style={{ color: "rgba(200,212,192,0.6)", fontFamily: C.font }}>Back</p>
        <p className="text-[9px] uppercase tracking-[0.22em]" style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}>8 · Psalm</p>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text, fontFamily: C.font }}
        >
          Next
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Prayer Rhythm — daily-habit "past 7 days" mock ── */
function PrayerRhythmMock() {
  const morning = [true, true, true, true, true, true, true];
  const evening = [true, true, true, true, true, false, true];
  const dayLetters = ["T", "F", "S", "S", "M", "T", "W"];
  return (
    <MockPhone>
      <div className="flex items-center justify-end mb-2">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "rgba(200,212,192,0.08)" }}
        >
          <span className="text-[10px]" style={{ color: "rgba(200,212,192,0.5)" }}>×</span>
        </div>
      </div>
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-1"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Today
      </p>
      <h2 className="text-[15px] font-semibold text-center mb-3" style={{ color: C.text, fontFamily: C.font }}>
        Your prayer rhythm
      </h2>
      <div
        className="rounded-xl px-3 py-2 mb-2 flex items-center gap-2"
        style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)" }}
      >
        <span className="text-[14px]">🌅</span>
        <p className="text-[12px] font-semibold flex-1" style={{ color: C.text, fontFamily: C.font }}>Morning</p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          Completed ✓
        </div>
      </div>
      <div
        className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
        style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)" }}
      >
        <span className="text-[14px]">🌙</span>
        <p className="text-[12px] font-semibold flex-1" style={{ color: C.text, fontFamily: C.font }}>Evening</p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          Completed ✓
        </div>
      </div>
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-2"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Past 7 Days
      </p>
      <div className="grid grid-cols-8 gap-1 mb-2 px-1">
        <div />
        {dayLetters.map((d, i) => (
          <p key={i} className="text-[9px] text-center" style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}>
            {d}
          </p>
        ))}
        <span className="text-[12px] text-center">🌅</span>
        {morning.map((done, i) => (
          <div key={`m${i}`} className="flex items-center justify-center">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: done ? "#7FA98A" : "transparent",
                border: done ? "none" : "1px solid rgba(127,169,138,0.3)",
              }}
            />
          </div>
        ))}
        <span className="text-[12px] text-center">🌙</span>
        {evening.map((done, i) => (
          <div key={`e${i}`} className="flex items-center justify-center">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: done ? "#9AA8D4" : "transparent",
                border: done ? "none" : "1px solid rgba(154,168,212,0.3)",
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-center mb-3" style={{ color: "rgba(200,212,192,0.55)", fontFamily: C.font }}>
        7 days of prayer this week
      </p>
    </MockPhone>
  );
}

// ─── Slide definitions ────────────────────────────────────────────────────────

type MockKey =
  | "community"
  | "prayer-requests"
  | "daily-push"
  | "bcp"
  | "lectio"
  | "gatherings"
  | "daily-office"
  | "prayer-rhythm";

type InfoSlide = {
  kind: "info";
  title: string;
  body: string;
  mock: MockKey | null;
  calm?: boolean; // extra breathing room (slide 8)
  footnote?: string;
};

// One prayer in the onboarding mini-slideshow. Carries every field the
// real prayer-mode SlideContent renders so the onboarding slide is
// visually + functionally identical: eyebrow, title, community pills,
// avatar stack with "N have prayed this week," BCP enrichment card,
// and (for requests) the word-of-comfort field.
type PrayerPayload =
  | {
      kind: "intercession";
      momentId: number;
      momentToken: string | null;
      myUserToken: string | null;
      // Big italic Georgia line on the slide (the intercession's
      // headline — intercessionTopic if set, otherwise the moment's
      // name).
      text: string;
      // Optional small italic subtitle under the headline (the moment's
      // intention if it differs from the headline). Hidden otherwise so
      // we don't duplicate the line.
      intention: string | null;
      // Custom prayer body — when the user authored their own text
      // OR when the BCP topic-title lookup misses. The BCP enrichment
      // card below renders this verbatim with a "FROM THE BOOK OF
      // COMMON PRAYER" caption when source === "bcp".
      fullText: string | null;
      source: "bcp" | "custom" | null;
      groups: Array<{ id: number; name: string; emoji: string | null }>;
      communityFaces: Array<{ name: string; email: string; avatarUrl: string | null }>;
      weekPrayCount: number;
    }
  | {
      kind: "request";
      requestId: number;
      text: string;
      authorName: string | null;
      authorAvatarUrl: string | null;
      // Pre-existing word-of-comfort if the viewer has already left
      // one (re-entering onboarding after a refresh, etc.).
      myWord: string | null;
    };

type Slide =
  | { kind: "welcome" }
  | { kind: "profile-picture" }
  | InfoSlide
  | { kind: "lets-pray" }
  | { kind: "prayer"; payload: PrayerPayload; isFirstPrayer: boolean }
  | { kind: "prayer-request" };

// The complete onboarding deck. Previously this was a "base deck"
// that had a community-intercession + 2 prayer-request slides spliced
// in at runtime from /api/moments + /api/prayer-requests; that
// "praying for people in your group" beat was removed per user
// direction. Now every user walks the same fixed deck: profile
// picture → Daily Office intro (mirrors church-deck) → daily-habit
// intro (mirrors church-deck) → safe-space → first prayer request.
const BASE_SLIDES: Slide[] = [
  { kind: "profile-picture" },
  // Daily Office — same copy + mock as the about/church-deck slide.
  {
    kind: "info",
    title: "The Daily Office",
    body: "Morning and Evening Prayer from the Book of Common Prayer — the psalms, the lessons, the canticles, and the collects, assembled for today and ready to pray. A daily reminder keeps the hour.",
    mock: "daily-office",
  },
  // Daily habit — same copy + mock as the about/church-deck slide.
  {
    kind: "info",
    title: "A daily habit, held together.",
    body: "For seventeen centuries, Christians have steadied their days by stopping to pray — morning and evening, in monasteries, in parishes, in kitchens. The Office has carried the faithful through plagues, exiles, and the long, ordinary middle.\n\nPhoebe helps your community keep that rhythm — together. A bell in the morning, a bell in the evening, a quiet record of who showed up.",
    mock: "prayer-rhythm",
  },
  {
    kind: "info",
    title: "Phoebe is a safe space.",
    body: "This is a place built on trust. If anyone ever makes you feel uncomfortable — in a prayer request, a letter, or anywhere in the app — you can mute them at any time. Muting is quiet and private. They won't be notified, and their content will no longer appear for you.\n\nYou are always in control of your experience here.",
    mock: null,
    calm: true,
    footnote: "To mute someone, visit their profile in the People tab and tap Mute.",
  },
  { kind: "prayer-request" },
];

const MOCK_COMPONENTS: Record<MockKey, () => React.ReactElement> = {
  "community": DashboardMock,
  "prayer-requests": PrayerRequestsMock,
  "daily-push": DailyPushMock,
  "bcp": BCPPrayerModeMock,
  "lectio": LectioMock,
  "gatherings": GatheringsMock,
  "daily-office": DailyOfficeMock,
  "prayer-rhythm": PrayerRhythmMock,
};

// ─── Slide renderers ──────────────────────────────────────────────────────────

function WelcomeSlide() {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-2">
      <motion.h1
        className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Welcome to Phoebe.
      </motion.h1>
      <motion.p
        className="text-lg md:text-xl font-light leading-relaxed"
        style={{ color: C.sage, fontFamily: C.font }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        A place set apart for connection between Sundays — through shared prayer, shared practice, and shared life.
      </motion.p>
    </div>
  );
}

function InfoSlideView({ slide }: { slide: InfoSlide }) {
  const Mock = slide.mock ? MOCK_COMPONENTS[slide.mock] : null;

  if (!Mock) {
    // Text-only layout (slides 7 & 8)
    return (
      <div className="max-w-2xl mx-auto w-full px-2">
        <h2
          className="text-2xl md:text-4xl font-semibold mb-5 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.title}
        </h2>
        <p
          className={`leading-relaxed font-light ${slide.calm ? "text-base md:text-lg" : "text-base md:text-xl"}`}
          style={{ color: C.sage, fontFamily: C.font, whiteSpace: "pre-line", lineHeight: slide.calm ? "1.85" : undefined }}
        >
          {slide.body}
        </p>
        {slide.footnote && (
          <p
            className="mt-8 text-sm"
            style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
          >
            {slide.footnote}
          </p>
        )}
      </div>
    );
  }

  // Left text + right mock layout
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-center w-full max-w-5xl mx-auto gap-8 md:gap-16 px-2">
      <div className="w-full md:max-w-md shrink-0">
        <h2
          className="text-2xl md:text-3xl font-semibold mb-4 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.title}
        </h2>
        <p
          className="text-sm md:text-base leading-relaxed font-light"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.body}
        </p>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="w-full md:w-auto flex justify-center shrink-0"
      >
        <Mock />
      </motion.div>
    </div>
  );
}

// ─── Let's pray intro slide ──────────────────────────────────────────────────
// Bridges from the "Phoebe is a safe space" beat into the actual prayer
// slideshow. Sets expectation: "you're about to pray through what your
// community is carrying right now, one prayer at a time." Plain Next
// advances — handled by the global nav bar (this slide is non-interactive).

function LetsPraySlide() {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-xl mx-auto px-2">
      <motion.div
        className="text-6xl mb-6"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        🙏🏽
      </motion.div>
      <motion.h2
        className="text-3xl md:text-5xl font-semibold mb-5 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45 }}
      >
        Let's pray.
      </motion.h2>
      <motion.p
        className="text-base md:text-lg font-light leading-relaxed"
        style={{ color: C.sage, fontFamily: C.font }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.45 }}
      >
        Here are the prayers your community is carrying right now. Take a moment with each one before you tap Amen.
      </motion.p>
    </div>
  );
}

// ─── Onboarding prayer slide (interactive) ───────────────────────────────────
// Mirrors the prayer-mode PrayerSlide visual vocabulary: eyebrow,
// optional author chip, italic Georgia body. The Amen button enforces
// the same 4-second pause-before-tap that the real slideshow uses, so
// the user learns the rhythm here. On the very first prayer slide,
// helper text fades in under the body to explain why the button is
// disabled at first — once they tap their first Amen the lesson is
// over and subsequent slides drop the helper.

function OnboardingAmenButton({ slideKey, onAdvance }: {
  slideKey: string | number;
  onAdvance: () => void;
}) {
  const HOLD_MS = 4000;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [slideKey]);

  return (
    <button
      onClick={() => {
        if (!ready) return;
        triggerAmenFeedback();
        onAdvance();
      }}
      disabled={!ready}
      aria-disabled={!ready}
      aria-label={ready ? "Amen" : "Hold a moment"}
      className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide active:scale-[0.98] relative overflow-hidden"
      style={{
        background: ready ? "#2D5E3F" : "rgba(46,107,64,0.18)",
        border: `1px solid ${ready ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
        color: "#F0EDE6",
        cursor: ready ? "pointer" : "default",
        minWidth: 140,
        transition: ready
          ? "background-color 360ms ease-out, border-color 360ms ease-out"
          : "none",
      }}
    >
      <span
        aria-hidden
        key={slideKey}
        className="absolute left-0 top-0 bottom-0 amen-progress-fill"
        style={{
          background: "rgba(46,107,64,0.45)",
          pointerEvents: "none",
          opacity: ready ? 0 : 1,
          transition: "opacity 360ms ease-out",
        }}
      />
      <span
        style={{
          position: "relative",
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(2px)",
          transition: "opacity 280ms ease-out, transform 280ms ease-out",
          display: "inline-block",
        }}
      >
        Amen →
      </span>
    </button>
  );
}

// Same character-length → font-size curve prayer-mode uses for BCP
// enrichment bodies so long prayers stay readable on phone screens.
function fitPrayerText(text: string | null | undefined): { size: number; leading: number } {
  const len = (text ?? "").length;
  if (len < 100)  return { size: 18, leading: 1.8 };
  if (len < 220)  return { size: 16, leading: 1.75 };
  if (len < 360)  return { size: 15, leading: 1.7 };
  if (len < 520)  return { size: 14, leading: 1.65 };
  if (len < 720)  return { size: 13, leading: 1.6 };
  return { size: 12, leading: 1.55 };
}

function OnboardingPrayerSlide({
  payload,
  isFirstPrayer,
  slideKey,
  onAdvance,
}: {
  payload: PrayerPayload;
  isFirstPrayer: boolean;
  slideKey: string | number;
  onAdvance: () => void;
}) {
  const queryClient = useQueryClient();
  const eyebrow = payload.kind === "intercession" ? "Community Intercession" : "Prayer Request";
  const authorInitials =
    payload.kind === "request" && payload.authorName
      ? payload.authorName.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("")
      : "";

  // BCP enrichment lookup — same fallback as prayer-mode. If the
  // intercession's title matches a known BCP_PRAYERS entry, render
  // that prayer's text in the sage card; otherwise fall back to the
  // custom fullText the moment was created with.
  const bcpPrayer =
    payload.kind === "intercession" ? findBcpPrayer(payload.text) : undefined;

  // Fire the amen POST when the user advances. Mirrors prayer-mode's
  // behaviour so onboarding amens count toward streaks and dedup the
  // dashboard slideshow (the same prayer won't appear again today).
  // Best-effort: failures swallow, never block the slide advance.
  function recordAmen() {
    if (payload.kind === "request") {
      const rid = payload.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
          queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${rid}`] });
        })
        .catch(() => { /* swallow */ });
      return;
    }
    // Intercession amen. Prefer the auto-enrolling /amen endpoint
    // (works even when the reconcile job hasn't wired a userToken
    // yet for this brand-new account); fall back to the legacy
    // token-in-URL post endpoint when we DO have a token.
    if (payload.momentToken) {
      const mt = payload.momentToken;
      const promise = payload.myUserToken
        ? apiRequest("POST", `/api/moment/${mt}/${payload.myUserToken}/post`, { isCheckin: true })
        : apiRequest("POST", `/api/moment/${mt}/amen`, {});
      promise
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/moments"] }))
        .catch(() => { /* swallow */ });
    }
  }

  function handleAdvance() {
    recordAmen();
    onAdvance();
  }

  return (
    <div className="flex flex-col items-center text-center max-w-xl mx-auto w-full px-2 gap-5">
      {/* Author block (requests only) — pulsing avatar + name above
          the body, mirroring prayer-mode. Anchors the slide to a
          specific person. */}
      {payload.kind === "request" && (payload.authorName || payload.authorAvatarUrl) && (
        <div className="flex flex-col items-center gap-3">
          {payload.authorAvatarUrl ? (
            <img
              src={payload.authorAvatarUrl}
              alt={payload.authorName ?? "Prayer author"}
              className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
              style={{ background: "#1A4A2E", color: "#A8C5A0" }}
            >
              {authorInitials}
            </div>
          )}
          {payload.authorName && (
            <p className="text-[14px]" style={{ color: "#C8D4C0", fontFamily: C.font }}>
              {payload.authorName}
            </p>
          )}
        </div>
      )}

      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {eyebrow}
      </p>

      {/* The headline — italic Georgia. For intercessions this is the
          topic ("For the Mission of the Church"). For requests this
          is the request body itself. */}
      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{
          color: "#E8E4D8",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        {payload.text}
      </p>

      {payload.kind === "intercession" && payload.intention && (
        <p className="text-sm italic" style={{ color: C.sage, marginTop: "-4px" }}>
          {payload.intention}
        </p>
      )}

      {/* Community pills (intercessions only) — one pill per linked
          community, primary + additionals. Non-tappable here, mirrors
          prayer-mode. */}
      {payload.kind === "intercession" && payload.groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {payload.groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(46,107,64,0.18)",
                color: "#A8C5A0",
                border: "1px solid rgba(46,107,64,0.32)",
                fontFamily: C.font,
              }}
            >
              {g.emoji && <span aria-hidden>{g.emoji}</span>}
              <span>{g.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Avatar stack + "N have prayed this week" — only when there's
          someone to surface. Onboarding-fresh users with empty rosters
          fall through to the soft "Your community is holding this." */}
      {payload.kind === "intercession" && (
        <>
          {payload.communityFaces.length > 0 && (
            <div className="flex items-center -space-x-2" style={{ marginTop: "-2px" }}>
              {payload.communityFaces.slice(0, 7).map((f) => (
                <div
                  key={f.email}
                  title={f.name}
                  className="rounded-full overflow-hidden shrink-0"
                  style={{
                    width: 30,
                    height: 30,
                    border: "2px solid #091A10",
                    background: "#1A4A2E",
                  }}
                >
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[11px] font-semibold"
                      style={{ color: "#A8C5A0" }}
                    >
                      {f.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] italic" style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}>
            {payload.weekPrayCount > 0
              ? payload.weekPrayCount === 1
                ? "1 person has prayed this this week."
                : `${payload.weekPrayCount} people have prayed this this week.`
              : "Your community is holding this."}
          </p>
        </>
      )}

      {/* BCP enrichment card — known BCP topic match. Same sage tinted
          surface + italic Space Grotesk body + "FROM THE BOOK OF
          COMMON PRAYER" caption as prayer-mode. */}
      {payload.kind === "intercession" && bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(bcpPrayer.text);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: C.font,
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {bcpPrayer.text}
              </p>
            );
          })()}
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
      )}

      {/* Custom-text fallback card — same look as the BCP card but
          renders the moment's authored fullText when no BCP match is
          found. Hidden when there's nothing custom to show. */}
      {payload.kind === "intercession" && !bcpPrayer && payload.fullText && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(payload.fullText);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: C.font,
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {payload.fullText}
              </p>
            );
          })()}
          {payload.source === "bcp" && (
            <p
              className="text-[9px] uppercase tracking-[0.14em] mt-3"
              style={{ color: "rgba(143,175,150,0.3)" }}
            >
              From the Book of Common Prayer
            </p>
          )}
        </div>
      )}

      {/* Word-of-comfort field (requests only) — same pill composer
          the real prayer-mode slide uses, lifted out into its own
          component. Submits to POST /prayer-requests/:id/word. */}
      {payload.kind === "request" && (
        <RequestWordField requestId={payload.requestId} initialWord={payload.myWord} />
      )}

      <OnboardingAmenButton slideKey={slideKey} onAdvance={handleAdvance} />

      {/* First-prayer helper. Explains why the button is disabled at
          first; the subsequent prayer slides drop the line once the
          user has learned the mechanic. */}
      {isFirstPrayer && (
        <p
          className="text-[12px] italic max-w-xs"
          style={{ color: "rgba(143,175,150,0.65)", fontFamily: C.font, marginTop: "-2px" }}
        >
          Wait four seconds before you tap Amen — a small pause to actually pray the prayer.
        </p>
      )}
    </div>
  );
}

// ─── Profile picture slide (interactive) ────────────────────────────────────
// One-shot prompt so the community roster, prayer-request bylines, and Circle
// all show a face instead of an initial. Upload is optional — users who skip
// (or existing accounts that already finished onboarding without one) can add
// a photo anytime from Settings → Account. Reused by the post-onboarding
// prompt overlay on the dashboard.

function ProfilePictureSlide({ onNext }: { onNext: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(user?.avatarUrl ?? null);
  // The inflight PATCH promise — the continue button awaits it so the
  // server-side save is guaranteed complete by the time we advance.
  // `null` means "nothing to wait on" (either no upload yet, or it
  // already resolved).
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    setSaveError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 512;
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setUploading(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setPreview(dataUrl);

        // Kick off the PATCH immediately so the save and the
        // "Continue" tap race; whichever happens second wins (the
        // continue handler awaits pendingSaveRef).
        pendingSaveRef.current = apiRequest("PATCH", "/api/auth/me/profile", { avatarUrl: dataUrl })
          .then(() => {
            queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) => {
              if (!prev) return prev;
              return { ...prev, avatarUrl: dataUrl };
            });
          })
          .catch((err) => {
            // Surface it so the user can retry — otherwise a stale
            // "Save & continue" button sits there doing nothing.
            setSaveError(err?.message ?? "Couldn't save your photo. Try again?");
            throw err;
          })
          .finally(() => {
            setUploading(false);
          });
      };
      img.onerror = () => { setUploading(false); setSaveError("Couldn't read that image."); };
      img.src = reader.result as string;
    };
    reader.onerror = () => { setUploading(false); setSaveError("Couldn't read that image."); };
    reader.readAsDataURL(file);
  }

  // Save & advance. Waits for any inflight PATCH to complete so we
  // never leave onboarding with a preview the server never received.
  // If the save already failed, don't advance — surface the error and
  // let the user try again (or skip).
  async function handleContinue() {
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current;
      } catch {
        // Error already surfaced via saveError — don't advance.
        return;
      }
    }
    onNext();
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-4 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Add your face.
      </h2>
      <p
        className="text-sm md:text-base leading-relaxed font-light mb-10"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        A photo helps the people praying with you feel like they're praying with <em>you</em>. It shows up on your prayer requests, in your community, and when someone holds you in prayer.
      </p>

      {/* Avatar + camera overlay */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="relative mb-4 transition-opacity active:opacity-80 disabled:opacity-60"
      >
        {preview ? (
          <img
            src={preview}
            alt="Your photo"
            className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover"
            style={{ border: "3px solid rgba(46,107,64,0.5)" }}
          />
        ) : (
          <div
            className="w-32 h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center text-5xl font-bold"
            style={{
              background: "#1A4A2E",
              color: "#A8C5A0",
              border: "3px solid rgba(46,107,64,0.35)",
              fontFamily: C.font,
            }}
          >
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
        <span
          className="absolute bottom-1 right-1 w-11 h-11 rounded-full flex items-center justify-center"
          style={{ background: "#2D5E3F", border: "3px solid #091A10" }}
        >
          {uploading ? (
            <span className="text-sm" style={{ color: C.text }}>…</span>
          ) : (
            <Camera size={18} style={{ color: C.text }} />
          )}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      <AnimatePresence mode="wait">
        {preview ? (
          <motion.button
            key="save"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleContinue}
            disabled={uploading}
            className="px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {uploading ? "Saving…" : "Save & continue →"}
          </motion.button>
        ) : (
          <motion.button
            key="choose"
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Upload a photo
          </motion.button>
        )}
      </AnimatePresence>

      {saveError && (
        <p className="text-xs mt-3" style={{ color: "#D98C4A", fontFamily: C.font }}>
          {saveError}
        </p>
      )}

      <p className="text-xs mt-3 mb-3" style={{ color: "rgba(143,175,150,0.4)", fontFamily: C.font }}>
        You can change this anytime in Settings.
      </p>

      <button
        onClick={onNext}
        className="text-sm transition-opacity hover:opacity-80"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Prayer request slide (interactive, final) ────────────────────────────────

function PrayerRequestSlide({ onComplete, preview = false }: { onComplete: () => void; preview?: boolean }) {
  const [text, setText] = useState("");
  const [submittedBody, setSubmittedBody] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = text.trim();
      if (!preview) {
        await apiRequest("POST", "/api/prayer-requests", { body });
      }
      // Capture the submitted text so the final beat can render it as
      // a card — the user wanted to see what they just shared, not a
      // generic "Welcome.", so the last slide reflects back the actual
      // prayer request as a card and then fades into the home screen.
      setSubmittedBody(body);
      setSubmitted(true);
      setDone(true);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  function handleSkip() {
    setDone(true);
  }

  // Final beat — show the user's own prayer request as a card (mirroring
  // the in-app prayer-request visual) with the "Your community will be
  // holding this" line underneath. After 2.6s the whole thing fades
  // into the home screen, where the dashboard's existing daily-prayer
  // invite popup picks up and offers the prayer slideshow. No tap
  // required: a single breath before landing.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onComplete(), 2600);
    return () => clearTimeout(t);
  }, [done, onComplete]);

  if (done) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center text-center max-w-lg mx-auto px-2 w-full"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0] }}
        transition={{ duration: 2.6, times: [0, 0.75, 1], ease: "easeOut" }}
      >
        {submittedBody ? (
          <>
            {/* The user's own prayer request, rendered as a card that
                matches the in-app prayer-request visual — sage accent
                bar + YOUR REQUEST eyebrow — so the final screen feels
                like they've already been dropped into the rhythm of
                the app. */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full relative flex rounded-xl overflow-hidden mb-6 text-left"
              style={{
                background: "rgba(143,175,150,0.12)",
                border: "1px solid rgba(46,107,64,0.3)",
              }}
            >
              <div className="w-1 flex-shrink-0" style={{ background: "#8FAF96" }} />
              <div className="flex-1 px-4 py-3">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Your request
                </p>
                <p
                  className="text-base leading-relaxed"
                  style={{ color: C.text, fontFamily: C.font }}
                >
                  {submittedBody}
                </p>
              </div>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="text-base md:text-lg font-light leading-relaxed"
              style={{ color: C.sage, fontFamily: C.font }}
            >
              Your community will be holding this. 🌿
            </motion.p>
          </>
        ) : (
          // Skip path — no request submitted, still give a soft final
          // beat before fading out.
          <motion.h1
            className="text-5xl md:text-7xl font-bold tracking-tight"
            style={{ color: C.text, fontFamily: C.font }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: [0, 1, 1],
              scale: [0.96, 1.02, 1],
            }}
            transition={{
              duration: 1.8,
              times: [0, 0.45, 1],
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            Welcome.
          </motion.h1>
        )}
      </motion.div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="text-5xl mb-6"
        >
          🌿
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-xl font-semibold mb-2"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Your community will hold this.
        </motion.p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-4 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Share your first prayer request.
      </h2>
      <p
        className="text-sm md:text-base leading-relaxed font-light mb-8"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        So others can start walking with you. It doesn't have to be big — nothing is too small to be held together.
      </p>

      {/* Match the in-app prayer-request card: sage-tinted surface
          with a 1px accent bar on the left, YOUR REQUEST eyebrow, and
          the compose textarea inside the card. The user flagged the
          earlier darker `rgba(46,107,64,0.15)` + shadow as reading
          like a well sunk into the page; bumped the tint up and
          dropped the shadow so the card reads as a gentle lift, and
          explicitly forced the textarea into a transparent/appearance-
          none style so Safari's default form-element background can't
          peek through as a darker inner rectangle. */}
      <div
        className="w-full relative flex rounded-xl overflow-hidden mb-4"
        style={{
          background: "rgba(143,175,150,0.12)",
          border: "1px solid rgba(46,107,64,0.3)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#8FAF96" }} />
        <div className="flex-1 px-4 py-3 text-left">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5"
            style={{ color: "rgba(143,175,150,0.7)" }}
          >
            Your request
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="What's going on in your week? 🌿"
            className="w-full text-sm resize-none outline-none"
            style={{
              background: "transparent",
              color: C.text,
              fontFamily: C.font,
              lineHeight: "1.5",
              WebkitAppearance: "none",
              appearance: "none",
              boxShadow: "none",
              border: "none",
            }}
          />
        </div>
      </div>

      {submitError && (
        <p className="text-xs text-center mb-3" style={{ color: "#F87171", fontFamily: C.font }}>
          {submitError}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!text.trim() || submitting}
        className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-40 mb-3"
        style={{ background: "#2D5E3F", color: C.text }}
      >
        {submitting ? "Sharing…" : "Share with my community 🙏🏽"}
      </button>

      <p className="text-xs mb-4" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
        You can also do this anytime from your prayer list.
      </p>

      <button
        onClick={handleSkip}
        className="text-sm transition-opacity hover:opacity-80"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UserOnboarding() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isPreview = params.get("preview") === "1";
  // Optional `?next=<path>` lands the user on a specific URL when
  // onboarding finishes instead of the default /dashboard. Used by the
  // community-invite signup flow so a newcomer gets the full product
  // tour first and is then dropped on their community with the
  // post-signup welcome overlay. Scoped to same-origin paths (must
  // start with "/") to block arbitrary-URL redirects.
  const rawNext = params.get("next");
  const nextDestination =
    rawNext && rawNext.startsWith("/") ? rawNext : "/dashboard";
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);

  // Guard: redirect away if not logged in or (already completed and not previewing)
  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && user?.onboardingCompleted && !isPreview) setLocation(nextDestination);
  }, [user, isLoading, isPreview, nextDestination, setLocation]);

  // Up to one community intercession + two prayer requests to weave
  // into the onboarding deck so the user gets a feel for the actual
  // rhythm before landing on the home screen. Both queries are paused
  // in preview mode (so the /beta preview doesn't yank real data) and
  // until we have a user. The endpoints return [] gracefully for users
  // with empty gardens, so a brand-new isolated account just sees the
  // base deck minus the prayer slideshow.
  // Both queries are tuned for onboarding's specific shape: fetch
  // once, then leave alone. The dashboard / prayer-list refetch
  // aggressively on focus, but mid-onboarding a refetch is poison —
  // if the SLIDES array grows or reorders while the user is partway
  // through, the current slide swaps content under them (visible as
  // a flash + reload). refetchOnWindowFocus + refetchOnMount = false
  // pin the data to whatever the first fetch returned for the
  // duration of this onboarding session.
  const { data: momentsResp } = useQuery<{ moments?: Array<{
    id: number;
    templateType?: string | null;
    intercessionTopic?: string | null;
    intercessionFullText?: string | null;
    intercessionSource?: string | null;
    intention?: string | null;
    name?: string | null;
    momentToken?: string | null;
    myUserToken?: string | null;
    weekPostCount?: number;
    group?: { id: number; name?: string | null; emoji?: string | null } | null;
    additionalGroups?: Array<{ id: number; name?: string | null; emoji?: string | null }>;
    members?: Array<{ name: string; email: string; avatarUrl?: string | null; prayedThisWeek?: boolean }>;
  }> }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user && !isPreview,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const { data: requestsResp } = useQuery<Array<{
    id: number;
    body: string;
    ownerId: number;
    ownerName: string | null;
    ownerAvatarUrl: string | null;
    isOwnRequest?: boolean;
    myWord?: string | null;
    myAmenedToday?: boolean;
  }>>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user && !isPreview,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Compose the dynamic prayer slides. One intercession (if any) + two
  // prayer requests from the viewer's garden (skipping the viewer's
  // own + anything they've already prayed today, so onboarding amens
  // recorded mid-session don't show again on the dashboard slideshow).
  // Order: intercession first (the community-wide carry), then the
  // two personal asks. Memoized so the SLIDES array stays referentially
  // stable across re-renders while the queries are paused/loading.
  const computedPrayerSlides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const intercession = (momentsResp?.moments ?? [])
      .find((m) => m.templateType === "intercession");
    if (intercession) {
      // Title — what shows as the big italic Georgia headline.
      // Prefer the curated intercessionTopic, fall back to the moment
      // name; either should always be present for a real intercession.
      const title =
        (intercession.intercessionTopic && intercession.intercessionTopic.trim())
          || (intercession.name && intercession.name.trim())
          || "";
      if (title.length > 0) {
        // Multi-community attribution: one pill per group, primary
        // first, then any additional groups linked via moment_groups.
        // De-duped by id (a primary that also appears in additionals
        // would otherwise render twice).
        const allGroups = [
          ...(intercession.group ? [intercession.group] : []),
          ...(intercession.additionalGroups ?? []),
        ];
        const seen = new Set<number>();
        const groups: Array<{ id: number; name: string; emoji: string | null }> = [];
        for (const g of allGroups) {
          if (seen.has(g.id)) continue;
          seen.add(g.id);
          groups.push({ id: g.id, name: g.name ?? "", emoji: g.emoji ?? null });
        }
        // Mirror the face-stack logic from prayer-mode: prefer members
        // who actually prayed in the last 7 days, cap at 7 faces, and
        // bias toward avatars when more than 7 are eligible.
        const MAX_FACES = 7;
        const hasPrayedFlag = (intercession.members ?? []).some(p => typeof p.prayedThisWeek === "boolean");
        const otherMembers = (intercession.members ?? []).filter(p => {
          if (p.email === user?.email) return false;
          if (!hasPrayedFlag) return true;
          return p.prayedThisWeek === true;
        });
        let communityFaces: Array<{ name: string; email: string; avatarUrl: string | null }> = [];
        if (otherMembers.length > 0) {
          if (otherMembers.length <= MAX_FACES) {
            communityFaces = otherMembers.map(p => ({
              name: p.name || p.email.split("@")[0],
              email: p.email,
              avatarUrl: p.avatarUrl ?? null,
            }));
          } else {
            const withAvatar = otherMembers.filter(p => !!p.avatarUrl);
            const withoutAvatar = otherMembers.filter(p => !p.avatarUrl);
            const picked = [
              ...withAvatar.slice(0, MAX_FACES),
              ...withoutAvatar.slice(0, Math.max(0, MAX_FACES - withAvatar.length)),
            ];
            communityFaces = picked.map(p => ({
              name: p.name || p.email.split("@")[0],
              email: p.email,
              avatarUrl: p.avatarUrl ?? null,
            }));
          }
        }
        // Suppress the intention subtitle when it's identical to the
        // title — avoids the "X / X" duplication on intercessions
        // whose intention IS the topic.
        const intentionSub =
          intercession.intention
          && intercession.intention.trim()
          && intercession.intention.trim() !== title
            ? intercession.intention.trim()
            : null;
        out.push({
          kind: "prayer",
          payload: {
            kind: "intercession",
            momentId: intercession.id,
            momentToken: intercession.momentToken ?? null,
            myUserToken: intercession.myUserToken ?? null,
            text: title,
            intention: intentionSub,
            fullText: intercession.intercessionFullText?.trim() || null,
            source: (intercession.intercessionSource as "bcp" | "custom" | null) ?? null,
            groups,
            communityFaces,
            weekPrayCount: intercession.weekPostCount ?? 0,
          },
          isFirstPrayer: true,
        });
      }
    }
    const requests = (requestsResp ?? [])
      .filter((r) => !r.isOwnRequest && !r.myAmenedToday)
      .slice(0, 2);
    for (const r of requests) {
      out.push({
        kind: "prayer",
        payload: {
          kind: "request",
          requestId: r.id,
          text: r.body,
          authorName: r.ownerName,
          authorAvatarUrl: r.ownerAvatarUrl,
          myWord: r.myWord ?? null,
        },
        isFirstPrayer: out.length === 0,
      });
    }
    return out;
  }, [momentsResp, requestsResp, user?.email]);

  // Freeze the prayer slideshow the moment we first compute a
  // non-empty array. After that we don't allow it to change for the
  // rest of the session, even if the underlying queries re-fetch or
  // a stale-cache write reorders the data. Without this freeze the
  // SLIDES array could grow under the user mid-onboarding, swapping
  // the slide they're currently looking at — the "flash + reload"
  // bug. Starts as null so we can tell "haven't captured yet" apart
  // from "captured an empty array (no prayer data exists)."
  const [frozenPrayerSlides, setFrozenPrayerSlides] = useState<Slide[] | null>(null);
  useEffect(() => {
    if (frozenPrayerSlides !== null) return;
    // Only freeze once both queries have actually returned. Until
    // then computedPrayerSlides is just [] from missing inputs, not
    // a real "this user has nothing" answer — freezing too early
    // would lock the slideshow at empty forever.
    if (!momentsResp || !requestsResp) return;
    setFrozenPrayerSlides(computedPrayerSlides);
    // If the user already raced past safe-space and landed on the
    // base-deck prayer-request slide before the freeze captured,
    // shift their index forward by the number of newly-inserted
    // slides (1 lets-pray + N prayer slides) so they stay on the
    // same slide. Without this, their slide silently swaps from
    // prayer-request to "Let's pray" — visually a flash + reload.
    if (computedPrayerSlides.length > 0) {
      setIndex((i) => {
        const lastBaseIdx = BASE_SLIDES.length - 1;
        if (i === lastBaseIdx) return i + 1 + computedPrayerSlides.length;
        return i;
      });
    }
  }, [frozenPrayerSlides, momentsResp, requestsResp, computedPrayerSlides]);

  // The deck is now fixed (no runtime splicing). The "praying for
  // people in your group" beat — community intercession + others'
  // prayer requests — was removed per user direction; the only slides
  // shown are profile-picture → daily-office → daily-habit →
  // safe-space → first-prayer-request. frozenPrayerSlides / the
  // moments + prayer-requests queries are kept above so the
  // existing index-shift logic doesn't break, but we never read
  // them here.
  void frozenPrayerSlides;
  // Offices-only signups (the Daily Office tier + public-feed sign-ups,
  // which are also offices-only) get a one-slide onboarding: just the
  // profile picture. The Daily Office intro / daily-habit / safe-space
  // / first-prayer-request slides are the full-app tour and would feel
  // like overhead for someone who came in to pray a single feed or the
  // office. Preview mode (admin /beta deck preview) always shows the
  // full deck so admins can review every slide.
  const officesOnlyOnboarding = !isPreview && user?.accessTier === "offices-only";
  const SLIDES = officesOnlyOnboarding
    ? BASE_SLIDES.filter((s) => s.kind === "profile-picture")
    : BASE_SLIDES;

  const completeOnboarding = useCallback(async () => {
    if (isPreview) {
      setLocation("/beta");
      return;
    }
    try {
      await apiRequest("PATCH", "/api/auth/me/onboarding");
      queryClient.setQueryData(["/api/auth/me"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        return { ...old, onboardingCompleted: true };
      });
    } catch {
      // Best-effort — navigate regardless
    }
    setLocation(nextDestination);
  }, [isPreview, nextDestination, queryClient, setLocation]);

  const next = useCallback(
    () => setIndex(i => Math.min(i + 1, SLIDES.length - 1)),
    [SLIDES.length],
  );
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // If the user is typing into an input/textarea/contentEditable on
      // an interactive slide (prayer-request compose, etc.), don't hijack
      // the keystroke for slide navigation. Previously spacebars in the
      // prayer-request textarea were being swallowed into `next()`.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!target?.isContentEditable;
      if (isEditable) return;

      if (e.key === "ArrowRight" || e.key === " ") {
        // Same rationale as the swipe handler: forward-nav must not
        // bypass the 4-second pause on a prayer slide.
        const currentSlide = SLIDES[Math.min(index, SLIDES.length - 1)];
        if (currentSlide?.kind === "prayer") { e.preventDefault(); return; }
        e.preventDefault(); next();
      }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") completeOnboarding();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, completeOnboarding, index, SLIDES]);

  // Touch/swipe support
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Forward-swipe on a prayer slide would bypass the 4-second
      // pause-before-Amen — the whole point of the slide. Block it
      // and let the AmenButton be the only path forward. Back-swipe
      // is still fine (reviewing a previous prayer doesn't violate
      // the pause).
      const currentSlide = SLIDES[Math.min(index, SLIDES.length - 1)];
      if (dx < 0) {
        if (currentSlide?.kind !== "prayer") next();
      } else {
        prev();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [next, prev, index, SLIDES]);

  if (isLoading || !user) return null;

  // Clamp the cursor if the SLIDES array shrinks under us (e.g. queries
  // resolved with no prayer data and we re-rendered with fewer slides).
  // Without this the user could be parked on an index that no longer
  // exists, blanking the page until they hit Back.
  const safeIndex = Math.min(index, SLIDES.length - 1);
  const slide = SLIDES[safeIndex];
  const isFirst = safeIndex === 0;
  const isInteractive =
    slide.kind === "prayer-request" ||
    slide.kind === "profile-picture" ||
    slide.kind === "prayer";

  function renderSlide() {
    switch (slide.kind) {
      case "welcome":
        return <WelcomeSlide />;
      case "profile-picture":
        // When the profile slide is the LAST slide (offices-only
        // one-slide deck), advancing past it finishes onboarding
        // rather than clamping in place — otherwise the user would
        // be stuck with nowhere to go.
        return (
          <ProfilePictureSlide
            onNext={safeIndex >= SLIDES.length - 1 ? completeOnboarding : next}
          />
        );
      case "info":
        return <InfoSlideView slide={slide} />;
      case "lets-pray":
        return <LetsPraySlide />;
      case "prayer":
        return (
          <OnboardingPrayerSlide
            payload={slide.payload}
            isFirstPrayer={slide.isFirstPrayer}
            slideKey={safeIndex}
            onAdvance={next}
          />
        );
      case "prayer-request":
        return <PrayerRequestSlide onComplete={completeOnboarding} preview={isPreview} />;
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={completeOnboarding}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          <span className="hidden md:inline">Close</span>
        </button>

        {/* Mobile: slim progress bar */}
        <div className="flex-1 h-0.5 rounded-full md:hidden" style={{ background: "rgba(200,212,192,0.15)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: C.sage }}
            animate={{ width: `${((safeIndex + 1) / SLIDES.length) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Desktop: dot row (clickable) */}
        <div className="hidden md:flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === safeIndex ? 20 : 6,
                height: 6,
                background: i <= safeIndex ? C.sage : "rgba(200,212,192,0.2)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <span className="text-xs tabular-nums shrink-0" style={{ color: C.sage, opacity: 0.6 }}>
          {safeIndex + 1} / {SLIDES.length}
        </span>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-16 py-8 md:py-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {renderSlide()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav — hidden on interactive slides (they manage their own CTAs) */}
      {!isInteractive && (
        <div
          className="flex items-center justify-between px-5 md:px-8 pb-5 md:pb-8 pt-6 relative z-10"
          style={{ background: "linear-gradient(to top, #091A10 60%, transparent)" }}
        >
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-0 disabled:pointer-events-none"
            style={{ color: C.sage }}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Next
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Back button only on interactive slides that aren't the first */}
      {isInteractive && !isFirst && (
        <div
          className="flex items-center px-5 md:px-8 pb-5 md:pb-8 pt-4 relative z-10"
          style={{ background: "linear-gradient(to top, #091A10 60%, transparent)" }}
        >
          <button
            onClick={prev}
            className="flex items-center gap-1.5 text-sm transition-opacity"
            style={{ color: C.sage }}
          >
            <ChevronLeft size={18} />
            Back
          </button>
        </div>
      )}
    </div>
  );
}
