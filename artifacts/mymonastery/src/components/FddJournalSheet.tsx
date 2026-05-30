/**
 * FddJournalSheet — a quick reflection-journal popup for the daily-reflection
 * slide (Forward Day by Day et al.) shown on the office-finish walk.
 *
 * Opens over the office without leaving it: a text field to write today's
 * reflection (saved through the existing /api/journal endpoints, and credited
 * as a "journal" prayer-session just like the Journal page), then "Save &
 * continue" to keep going in the office — or a switch to read past
 * reflections. It reads/writes the SAME journal store as pages/journal.tsx,
 * so this is one unified reflection log, not a parallel one.
 *
 * Self-contained (its own style tokens) so it drops into prayer-mode with a
 * one-line render.
 */

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

type JournalEntry = { id: number; prompt: string | null; body: string; createdAt: string };

const BG = "#0C1F12";
const CARD = "#12281A";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.7)";
const CTA = "#2D5E3F";
const BORDER = "rgba(46,107,64,0.4)";
const FONT = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, serif";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function FddJournalSheet({
  promptTag,
  onClose,
  onSaved,
}: {
  /** Snapshotted with the entry so it stays legible in the log (e.g. the source name). */
  promptTag: string;
  /** Dismiss without saving — back to the reflection slide. */
  onClose: () => void;
  /** Saved successfully — close + advance the office ("keep going"). */
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"write" | "past">("write");
  const [text, setText] = useState("");
  const startedAt = useRef<Date>(new Date());

  const past = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ["/api/journal/mine"],
    queryFn: () => apiRequest("GET", "/api/journal/mine"),
    enabled: mode === "past",
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      await apiRequest("POST", "/api/journal", { prompt: promptTag, body });
      // Credit the writing as a "journal" prayer-session, same as the Journal
      // page — best-effort, never blocks the save.
      const secs = Math.round((Date.now() - startedAt.current.getTime()) / 1000);
      if (secs >= 5) {
        apiRequest("POST", "/api/prayer-sessions", {
          surface: "journal",
          durationSeconds: secs,
          startedAt: startedAt.current.toISOString(),
          endedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
      setText("");
      onSaved();
    },
  });

  const canSave = text.trim().length > 0 && !save.isPending;
  const entries = past.data?.entries ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "86vh",
          background: BG,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: `1px solid ${BORDER}`,
          borderBottom: "none",
          display: "flex",
          flexDirection: "column",
          padding: "14px 18px max(18px, env(safe-area-inset-bottom))",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Grabber */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(143,175,150,0.3)", margin: "0 auto 14px", flexShrink: 0 }} />

        {mode === "write" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: SAGE_DIM, fontFamily: FONT }}>
                {t("fdd_journal.title", { defaultValue: "Reflection journal" })}
              </span>
              <button type="button" onClick={() => setMode("past")} style={{ background: "none", border: "none", color: SAGE, fontSize: 13, fontFamily: FONT, cursor: "pointer", padding: 0 }}>
                {t("fdd_journal.see_past", { defaultValue: "Past reflections →" })}
              </button>
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("fdd_journal.placeholder", { defaultValue: "What stayed with you from today's reflection?" })}
              style={{
                width: "100%",
                minHeight: 150,
                resize: "none",
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                padding: "14px 16px",
                color: CREAM,
                fontSize: 16,
                lineHeight: 1.55,
                fontFamily: SERIF,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: "0 0 auto", background: "none", border: `1px solid rgba(143,175,150,0.25)`, color: SAGE, borderRadius: 999, padding: "12px 20px", fontSize: 15, fontFamily: FONT, cursor: "pointer" }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!canSave}
                style={{ flex: 1, background: canSave ? CTA : "rgba(46,107,64,0.3)", border: "none", color: CREAM, borderRadius: 999, padding: "12px 20px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: canSave ? "pointer" : "default", opacity: save.isPending ? 0.7 : 1 }}
              >
                {save.isPending ? t("fdd_journal.saving", { defaultValue: "Saving…" }) : t("fdd_journal.save", { defaultValue: "Save & continue →" })}
              </button>
            </div>
            {save.isError && (
              <p style={{ color: "#e08a8a", fontSize: 12.5, fontFamily: FONT, margin: "8px 2px 0" }}>
                {t("fdd_journal.error", { defaultValue: "Couldn't save. Try again." })}
              </p>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button type="button" onClick={() => setMode("write")} style={{ background: "none", border: "none", color: SAGE, fontSize: 13, fontFamily: FONT, cursor: "pointer", padding: 0 }}>
                {t("fdd_journal.back_write", { defaultValue: "← Write" })}
              </button>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: SAGE_DIM, fontFamily: FONT }}>
                {t("fdd_journal.past_title", { defaultValue: "Past reflections" })}
              </span>
              <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, fontFamily: FONT, cursor: "pointer", padding: 0 }}>
                {t("common.done", { defaultValue: "Done" })}
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {past.isLoading ? (
                <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: FONT, textAlign: "center", padding: "24px 0" }}>
                  {t("fdd_journal.loading", { defaultValue: "Loading…" })}
                </p>
              ) : entries.length === 0 ? (
                <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: SERIF, fontStyle: "italic", textAlign: "center", padding: "24px 12px", lineHeight: 1.5 }}>
                  {t("fdd_journal.empty", { defaultValue: "No reflections yet. Your first one starts today." })}
                </p>
              ) : (
                entries.map((e) => (
                  <div key={e.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
                    <p style={{ color: SAGE, fontSize: 11.5, fontFamily: FONT, letterSpacing: "0.04em", margin: "0 0 6px" }}>{fmtDate(e.createdAt)}</p>
                    {e.prompt && (
                      <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: SERIF, fontStyle: "italic", margin: "0 0 6px", lineHeight: 1.4 }}>{e.prompt}</p>
                    )}
                    <p style={{ color: CREAM, fontSize: 14.5, fontFamily: SERIF, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{e.body}</p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
