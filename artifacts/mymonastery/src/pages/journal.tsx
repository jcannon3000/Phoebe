import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ── /journal — a private daily reflection journal ───────────────────────
//
// A daily-prayer option (also reachable from the chooser + the office
// settings default). Styled like Letters — cream paper, dark ink, a
// borderless writing surface — so journaling feels like the same quiet,
// hand-written rhythm as correspondence. There's no prompt: just an open
// page. Saving stores the entry server-side (private to the author) and
// logs the time spent writing as a "journal" prayer-session so it counts
// toward prayer time. A "Past entries" view reads them back by date.

// Letters paper palette.
const PAPER = "#F8F3EC";
const CARD = "#FBF8F2";
const DIVIDER = "#EDE6D9";
const INK = "#2C1810";
const MUTED = "#9a9390";
const SAGE = "#5C7A5F";
const SANS = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type JournalEntry = { id: number; prompt: string | null; body: string; createdAt: string };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
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
  // Time the page opened — credited as a "journal" prayer-session on save.
  const startedAtRef = useRef<Date>(new Date());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Paper theme — override the app's dark page background (and keep the
  // page scrollable) while journaling, then restore on leave. Mirrors
  // WriteLetter so the journal reads as the same "writing on paper".
  useEffect(() => {
    const root = document.getElementById("root");
    const prev = {
      root: root?.style.backgroundColor,
      body: document.body.style.backgroundColor,
      html: document.documentElement.style.backgroundColor,
      bodyOv: document.body.style.overflow,
      htmlOv: document.documentElement.style.overflow,
      bodyH: document.body.style.height,
      htmlH: document.documentElement.style.height,
    };
    if (root) root.style.backgroundColor = PAPER;
    document.body.style.backgroundColor = PAPER;
    document.documentElement.style.backgroundColor = PAPER;
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.height = "auto";
    return () => {
      if (root) root.style.backgroundColor = prev.root || "";
      document.body.style.backgroundColor = prev.body || "";
      document.documentElement.style.backgroundColor = prev.html || "";
      document.body.style.overflow = prev.bodyOv;
      document.documentElement.style.overflow = prev.htmlOv;
      document.body.style.height = prev.bodyH;
      document.documentElement.style.height = prev.htmlH;
    };
  }, []);

  // Auto-grow the writing surface in document flow (Letters-style) so it
  // reads as one continuous page rather than a scrolling box.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft, view, saved]);

  const { data: pastData, isLoading: pastLoading } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ["/api/journal/mine"],
    queryFn: () => apiRequest("GET", "/api/journal/mine"),
    enabled: !!user && view === "past",
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: async (body: string) => {
      await apiRequest("POST", "/api/journal", { body });
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
    <div style={{ background: PAPER, color: INK, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      {/* Minimal header — back / title / Past⇄Write — same rhythm as Letters. */}
      <div
        className="flex items-center justify-between"
        style={{ maxWidth: 720, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem)) 24px 10px" }}
      >
        <button type="button" onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: MUTED, fontSize: 16, cursor: "pointer", padding: 0 }}>
          ←
        </button>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{t("journal.eyebrow", { defaultValue: "Journal" })}</p>
        <button
          type="button"
          onClick={() => { setView((v) => (v === "write" ? "past" : "write")); setSaved(false); }}
          style={{ background: "none", border: "none", color: SAGE, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
        >
          {view === "write" ? t("journal.past_link", { defaultValue: "Past entries" }) : t("journal.write_link", { defaultValue: "Write" })}
        </button>
      </div>
      <div style={{ borderBottom: `1px solid ${DIVIDER}` }} />

      <main style={{ flex: 1, width: "100%", maxWidth: 720, margin: "0 auto", boxSizing: "border-box", padding: "22px 24px 40px" }}>
        {view === "write" ? (
          saved ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, padding: "72px 0" }}>
              <div style={{ fontSize: 36 }}>🕯️</div>
              <p style={{ fontSize: 17, fontWeight: 600, margin: 0, color: INK }}>{t("journal.saved_title", { defaultValue: "Saved to your journal." })}</p>
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => { setView("past"); setSaved(false); }}
                  style={{ padding: "10px 18px", borderRadius: 12, background: "transparent", border: "1px solid #C8BFB0", color: SAGE, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  {t("journal.view_past", { defaultValue: "View past entries" })}
                </button>
                <button
                  type="button"
                  onClick={() => setLocation("/dashboard")}
                  style={{ padding: "10px 18px", borderRadius: 12, background: SAGE, border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  {t("common.done", { defaultValue: "Done" })}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: MUTED, margin: "0 0 12px" }}>{fmtDate(new Date().toISOString())}</p>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("journal.placeholder", { defaultValue: "Write as much or as little as you like…" })}
                autoFocus
                rows={8}
                className="w-full resize-none focus:outline-none placeholder:italic block"
                style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", padding: 0, color: INK, caretColor: SAGE, fontFamily: SANS, fontSize: 18, lineHeight: 1.6, outline: "none", overflow: "hidden" }}
              />
              <button
                type="button"
                onClick={() => { const b = draft.trim(); if (b && !saveMut.isPending) saveMut.mutate(b); }}
                disabled={!draft.trim() || saveMut.isPending}
                className="disabled:opacity-40 transition-opacity"
                style={{ marginTop: 28, padding: "12px 24px", borderRadius: 12, background: SAGE, color: "#fff", border: "none", fontFamily: SANS, fontSize: 15, fontWeight: 600, cursor: draft.trim() ? "pointer" : "default" }}
              >
                {saveMut.isPending ? t("journal.saving", { defaultValue: "Saving…" }) : t("journal.save", { defaultValue: "Save reflection" })}
              </button>
              {/* Trailing runway so the writing line can scroll above the keyboard. */}
              <div aria-hidden style={{ height: "40vh" }} />
            </>
          )
        ) : pastLoading ? (
          <p style={{ color: MUTED, fontSize: 14, textAlign: "center", marginTop: 32 }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : (pastData?.entries ?? []).length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📓</div>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
              {t("journal.empty", { defaultValue: "Your journal is empty. Write your first reflection." })}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 2 }}>
            {(pastData?.entries ?? []).map((e) => (
              <div key={e.id} style={{ background: CARD, border: `1px solid ${DIVIDER}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 0 rgba(44,24,16,0.04)" }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: MUTED, margin: "0 0 8px" }}>{fmtDate(e.createdAt)}</p>
                <p style={{ fontSize: 16, color: INK, fontFamily: SERIF, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{e.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
