/**
 * AI-assisted routine interview — "tell Phoebe the rhythm you already keep."
 *
 * Owner: a questionnaire that is "not focused on suggesting a new prayer
 * routine, but would ask someone what their current routine is and ... program
 * that into Phoebe for them." So every word here is about RECORDING a practice,
 * never recommending one — /find-your-rhythm is the surface that suggests.
 *
 * Five phases, matching the flow the owner described:
 *   describe  → they write their practice in their own words
 *   thinking  → processing screen while the model reads it
 *   followups → the two questions it asked back
 *   thinking  → processing screen while it builds
 *   review    → the routine, in plain language, to accept or discard
 *
 * The model's spec is validated server-side (sanitizeSpec) before it ever gets
 * here and again on apply, so nothing on this page has to trust it.
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { adoptRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const CREAM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.35)";
const CTA = "#2D5E3F";

type Phase = "describe" | "thinking-followups" | "followups" | "thinking-build" | "review";

type Spec = Record<string, unknown>;
// Same shape the manual customizer's review rows use.
type SpecRow = { emoji: string; label: string; sub: string };


export default function RoutineInterviewPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const backdrop = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  const [phase, setPhase] = useState<Phase>("describe");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  // Owner: "have the follow up questions on two separate slides." One
  // question at a time reads as a conversation; both at once reads as a form.
  const [qIndex, setQIndex] = useState(0);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [summary, setSummary] = useState("");
  // Derived server-side FROM the sanitized spec — the authoritative account of
  // what saving will actually set. `summary` is the model's own prose, which is
  // nice framing but is not evidence of what it programmed.
  const [settings, setSettings] = useState<SpecRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Owner: "the page needs to scroll up when I'm on the second." Advancing a
  // slide keeps the window's scroll position, so a long first answer left the
  // next question rendered above the fold — it looked like nothing happened.
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* ignore */ }
  }, [phase, qIndex]);

  const errorText = (code: string): string => {
    switch (code) {
      case "ai_unconfigured":
        return "The assistant isn't switched on yet for this server.";
      case "ai_unreachable":
      case "ai_failed":
        return "Couldn't reach the assistant just now. Try again in a moment.";
      case "ai_bad_json":
      case "ai_bad_spec":
        return "The assistant's answer came back garbled. Try again — it usually works on a second pass.";
      case "too_short":
        return "Tell us a little more first — a sentence or two about your day.";
      default:
        return "Something went wrong. Try again in a moment.";
    }
  };

  const submitDescription = async () => {
    setError(null);
    setPhase("thinking-followups");
    try {
      const res = (await apiRequest("POST", "/api/routine-interview/followups", {
        description,
      })) as { questions?: string[] } | null;
      const qs = (res?.questions ?? []).filter((q) => typeof q === "string" && q.trim().length > 0);
      if (qs.length === 0) throw new Error("ai_bad_json");
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      setQIndex(0);
      setPhase("followups");
    } catch (e: any) {
      setError(errorText(e?.body?.error ?? e?.message ?? ""));
      setPhase("describe");
    }
  };

  const submitFollowups = async () => {
    setError(null);
    setPhase("thinking-build");
    try {
      const res = (await apiRequest("POST", "/api/routine-interview/build", {
        description,
        followups: questions.map((q, i) => ({ q, a: answers[i] ?? "" })),
      })) as { spec?: Spec; summary?: string; settings?: SpecRow[]; notes?: string[] } | null;
      if (!res?.spec) throw new Error("ai_bad_spec");
      setSpec(res.spec);
      setSummary(res.summary ?? "");
      setSettings(res.settings ?? []);
      setNotes(res.notes ?? []);
      setPhase("review");
    } catch (e: any) {
      setError(errorText(e?.body?.error ?? e?.message ?? ""));
      setPhase("followups");
    }
  };

  const applySpec = async () => {
    if (!spec || applying) return;
    setApplying(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/routine-interview/apply", { spec });
      // Mirror onto THIS device immediately — the home reads office levels and
      // slots straight from localStorage, so without this they'd land on the
      // old rhythm until the next sync. Same pattern routine-invite.tsx uses
      // after accepting a prescribed routine.
      try {
        const rc = (spec as { ruleConfig?: Record<string, string> }).ruleConfig;
        if (rc) adoptRoutineConfig(rc);
      } catch { /* non-fatal — the server already has it */ }
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/me/silence-ladder"] });
      setLocation("/daily-progress");
    } catch {
      setError("Couldn't save that routine just now. Try again.");
      setApplying(false);
    }
  };

  // Chromeless <Layout> drops the horizontal gutter its non-chromeless <main>
  // applies (px-4 sm:px-6 md:px-8), so this page owns its own — without it the
  // title and body ran flush to both screen edges on device.
  const wrap: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 18,
    padding: "8px 20px 40px", maxWidth: 560, margin: "0 auto", width: "100%",
    boxSizing: "border-box",
  };
  const card: React.CSSProperties = {
    background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: `1px solid ${CARD_B}`, borderRadius: 18, padding: 16,
  };
  const primaryBtn: React.CSSProperties = {
    background: CTA, color: CREAM, border: `1px solid ${CARD_B}`, borderRadius: 14,
    padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
    width: "100%",
  };
  const quietBtn: React.CSSProperties = {
    background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)",
    borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT,
    cursor: "pointer", width: "100%",
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
    color: SAGE, fontFamily: FONT, margin: 0, fontWeight: 600,
  };
  const h1: React.CSSProperties = {
    fontSize: "clamp(26px, 7vw, 32px)", fontWeight: 700, color: WARM,
    fontFamily: FONT, lineHeight: 1.2, margin: "8px 0 0", letterSpacing: "-0.02em",
  };

  // ── Processing screen ──────────────────────────────────────────────────────
  // Owner: "it shows a processing screen." Two model calls, two waits — the
  // label says which one so a long pause doesn't read as a hang.
  if (phase === "thinking-followups" || phase === "thinking-build") {
    const line = phase === "thinking-followups"
      ? "Reading what you wrote…"
      : "Shaping your rhythm in Phoebe…";
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/daily-progress")}>
        <div style={{ ...wrap, minHeight: "60dvh", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div
            aria-hidden
            style={{
              width: 46, height: 46, borderRadius: "50%",
              border: "2px solid rgba(143,175,150,0.25)", borderTopColor: SAGE,
              animation: "phoebe-spin 1s linear infinite",
            }}
          />
          <style>{"@keyframes phoebe-spin{to{transform:rotate(360deg)}}"}</style>
          <p style={{ ...eyebrow, marginTop: 4 }}>One moment</p>
          <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, margin: 0 }}>{line}</p>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, margin: 0, maxWidth: 380 }}>
            This usually takes a few seconds.
          </p>
        </div>
      </Layout>
    );
  }

  // ── 1. Describe ────────────────────────────────────────────────────────────
  if (phase === "describe") {
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/daily-progress")}>
        <div style={wrap}>
          <div>
            <p style={eyebrow}>Your rhythm 🌿</p>
            <h1 style={h1}>What does your daily routine look like?</h1>
            {/* Owner: the four things to cover belong in the LLM's prompt, not
                on screen as a checklist — "that's what we want to look for in
                the response." So this asks openly and the server prompt does
                the structuring. */}
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              Describe any daily practices you engage in, and any newsletters you
              may read.
            </p>
          </div>

          {/* No example placeholder (owner). A worked example in the box
              anchors people to its shape — they describe a day that resembles
              the sample rather than their own, which is the one thing this
              whole surface is trying not to do. */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            maxLength={4000}
            style={{
              ...card, width: "100%", boxSizing: "border-box", color: WARM,
              fontFamily: FONT, fontSize: 15, lineHeight: 1.6, outline: "none", resize: "vertical",
            }}
          />

          {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

          <button
            type="button"
            onClick={submitDescription}
            disabled={description.trim().length < 10}
            style={{ ...primaryBtn, opacity: description.trim().length < 10 ? 0.5 : 1 }}
          >
            Continue
          </button>
          <button type="button" onClick={() => setLocation("/rule-of-life")} style={quietBtn}>
            I'd rather set it up myself
          </button>
        </div>
      </Layout>
    );
  }

  // ── 2. Follow-ups — ONE question per slide ────────────────────────────────
  if (phase === "followups") {
    const q = questions[qIndex] ?? "";
    const isLast = qIndex >= questions.length - 1;
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/daily-progress")}>
        <div style={wrap}>
          <div>
            <p style={eyebrow}>
              {questions.length > 1 ? `Question ${qIndex + 1} of ${questions.length}` : "One question"} 🌿
            </p>
            <h1 style={h1}>Just to be sure</h1>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              "I don't" is a perfectly good answer.
            </p>
          </div>

          <p style={{ color: WARM, fontFamily: FONT, fontSize: 16.5, lineHeight: 1.5, margin: 0 }}>{q}</p>
          <textarea
            key={qIndex}
            value={answers[qIndex] ?? ""}
            onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === qIndex ? e.target.value : a)))}
            rows={4}
            maxLength={1000}
            placeholder="Your answer…"
            style={{
              ...card, width: "100%", boxSizing: "border-box", color: WARM,
              fontFamily: FONT, fontSize: 15, lineHeight: 1.6, outline: "none", resize: "vertical",
            }}
          />

          {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

          <button
            type="button"
            onClick={() => { if (isLast) { submitFollowups(); } else { setError(null); setQIndex((i) => i + 1); } }}
            style={primaryBtn}
          >
            {isLast ? "Build my rhythm" : "Continue"}
          </button>
          <button
            type="button"
            onClick={() => { setError(null); if (qIndex > 0) setQIndex((i) => i - 1); else setPhase("describe"); }}
            style={quietBtn}
          >
            Back
          </button>
        </div>
      </Layout>
    );
  }

  // ── 3. Review ──────────────────────────────────────────────────────────────
  return (
    <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/daily-progress")}>
      <div style={wrap}>
        <div>
          <p style={eyebrow}>Here it is 🌿</p>
          <h1 style={h1}>Your rhythm in Phoebe</h1>
        </div>

        {summary && (
          <div style={card}>
            <p style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>
              {summary}
            </p>
          </div>
        )}

        {/* The routine itself, rendered as the manual customizer's review rows
            (owner: "I want the routine to be shown like it would at the end of
            the manual flow") — same emoji / label / sub shape, so the two flows
            end on the same screen. Derived server-side FROM the sanitized spec,
            never from the model's prose: approving a description the model
            wrote about its own output gives no way to catch it describing one
            routine and programming another. */}
        {settings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settings.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                style={{
                  background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                  border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                  borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{r.label}</span>
                  <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{r.sub}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ ...card, background: "rgba(46,107,64,0.08)" }}>
            <p style={{ ...eyebrow, fontSize: 10, marginBottom: 8 }}>Where we had to choose</p>
            {notes.map((n, i) => (
              <p key={i} style={{ color: "rgba(200,212,192,0.85)", fontFamily: FONT, fontSize: 13.5, margin: "0 0 6px", lineHeight: 1.5 }}>
                · {n}
              </p>
            ))}
          </div>
        )}

        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          Saving this replaces your current routine. You can change any of it
          afterwards in Customize.
        </p>

        {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

        <button type="button" onClick={applySpec} disabled={applying} style={{ ...primaryBtn, opacity: applying ? 0.6 : 1 }}>
          {applying ? "Saving…" : "Save this as my rhythm"}
        </button>
        <button type="button" onClick={() => { setError(null); setPhase("followups"); }} style={quietBtn}>
          Not quite — go back
        </button>
      </div>
    </Layout>
  );
}
