import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/AnimatedBackground";

// ── /journal — a private daily reflection journal ───────────────────────
//
// A daily-prayer option (also reachable from the chooser + the office
// settings default). The gradient backdrop matches the prayer slides; a
// rotating prompt sits above an open writing space. Saving stores the
// entry server-side (private to the author) and logs the time spent
// writing as a "journal" prayer-session so it counts toward prayer time.
// A "Past entries" view reads them back by date.
//
// Prompt: original, FDD-paired wording (we can't reproduce Forward Day by
// Day's own copyrighted prompt). It assumes the reader has already heard
// today's reflection — so no audio replay and no reproduced text here,
// just the invitation to respond.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const PROMPTS = [
  "After today's Forward Day by Day — what word or phrase stays with you, and what is it asking of you?",
  "Where did you notice God at work in your day?",
  "What in today's reading comforted you? What unsettled you?",
  "Name one thing you are carrying. What would it look like to hand it over?",
  "Who came to mind as you prayed today, and how might you reach them?",
  "What are you grateful for right now — and what are you longing for?",
  "If today's reading were a single invitation, what would it be?",
];
function promptForToday(): string {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return PROMPTS[dayOfYear % PROMPTS.length];
}

type JournalEntry = { id: number; prompt: string | null; body: string; createdAt: string };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function pillStyle(primary: boolean): CSSProperties {
  return {
    padding: "10px 18px", borderRadius: 999, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: primary ? "#2D5E3F" : "rgba(46,107,64,0.16)",
    color: primary ? WARM : "rgba(168,197,160,0.95)",
    border: `1px solid ${primary ? "rgba(168,197,160,0.4)" : "rgba(46,107,64,0.4)"}`,
  };
}

export default function JournalPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();

  useEffect(() => { if (!authLoading && !user) setLocation("/"); }, [user, authLoading, setLocation]);

  const [view, setView] = useState<"write" | "past">("write");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const prompt = useMemo(() => promptForToday(), []);
  // Time the page opened — credited as a "journal" prayer-session on save.
  const startedAtRef = useRef<Date>(new Date());

  const { data: pastData, isLoading: pastLoading } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ["/api/journal/mine"],
    queryFn: () => apiRequest("GET", "/api/journal/mine"),
    enabled: !!user && view === "past",
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: async (body: string) => {
      await apiRequest("POST", "/api/journal", { prompt, body });
      const startedAt = startedAtRef.current;
      const secs = Math.round((Date.now() - startedAt.getTime()) / 1000);
      if (secs >= 5) {
        apiRequest("POST", "/api/prayer-sessions", {
          surface: "journal",
          durationSeconds: secs,
          startedAt: startedAt.toISOString(),
          endedAt: new Date().toISOString(),
        }).catch(() => { /* best-effort */ });
      }
    },
    onSuccess: () => {
      setSaved(true);
      setDraft("");
      qc.invalidateQueries({ queryKey: ["/api/journal/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
    },
  });

  if (authLoading || !user) return null;

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />

      <header style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem)) 20px 8px" }}>
        <button type="button" onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <button type="button" onClick={() => { setView((v) => (v === "write" ? "past" : "write")); setSaved(false); }} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          {view === "write" ? t("journal.past_link", { defaultValue: "Past entries" }) : t("journal.write_link", { defaultValue: "Write" })}
        </button>
      </header>

      <main style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: 600, margin: "0 auto", padding: "8px 20px 32px", boxSizing: "border-box" }}>
        {view === "write" ? (
          saved ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
              <div style={{ fontSize: 40 }}>🕯️</div>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t("journal.saved_title", { defaultValue: "Saved to your journal." })}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => { setView("past"); setSaved(false); }} style={pillStyle(false)}>{t("journal.view_past", { defaultValue: "View past entries" })}</button>
                <button type="button" onClick={() => setLocation("/dashboard")} style={pillStyle(true)}>{t("common.done", { defaultValue: "Done" })}</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600, color: FAINT, margin: "8px 0 14px" }}>
                {t("journal.eyebrow", { defaultValue: "Journal" })}
              </p>
              <p style={{ fontSize: 19, lineHeight: 1.5, fontFamily: SERIF, fontStyle: "italic", color: WARM, margin: "0 0 18px" }}>
                {prompt}
              </p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("journal.placeholder", { defaultValue: "Write as much or as little as you like…" })}
                autoFocus
                style={{ flex: 1, minHeight: 220, width: "100%", boxSizing: "border-box", resize: "none", background: "rgba(15,40,24,0.5)", border: "1px solid rgba(46,107,64,0.3)", borderRadius: 16, padding: 16, color: WARM, fontFamily: SERIF, fontSize: 16, lineHeight: 1.6, outline: "none" }}
              />
              <button
                type="button"
                onClick={() => { const b = draft.trim(); if (b && !saveMut.isPending) saveMut.mutate(b); }}
                disabled={!draft.trim() || saveMut.isPending}
                style={{ marginTop: 16, padding: "13px 0", borderRadius: 14, background: "#2D5E3F", color: WARM, border: "none", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default", opacity: draft.trim() && !saveMut.isPending ? 1 : 0.4 }}
              >
                {saveMut.isPending ? t("journal.saving", { defaultValue: "Saving…" }) : t("journal.save", { defaultValue: "Save reflection" })}
              </button>
            </>
          )
        ) : pastLoading ? (
          <p style={{ color: FAINT, fontSize: 14, textAlign: "center", marginTop: 32 }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : (pastData?.entries ?? []).length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📓</div>
            <p style={{ color: SAGE, fontSize: 14, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
              {t("journal.empty", { defaultValue: "Your journal is empty. Write your first reflection." })}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            {(pastData?.entries ?? []).map((e) => (
              <div key={e.id} style={{ background: "rgba(15,40,24,0.5)", border: "1px solid rgba(46,107,64,0.28)", borderRadius: 14, padding: "14px 16px" }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: FAINT, margin: 0 }}>{fmtDate(e.createdAt)}</p>
                {e.prompt && (
                  <p style={{ fontSize: 13, color: SAGE, fontFamily: SERIF, fontStyle: "italic", margin: "6px 0 8px", lineHeight: 1.4 }}>{e.prompt}</p>
                )}
                <p style={{ fontSize: 15, color: WARM, fontFamily: SERIF, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{e.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
