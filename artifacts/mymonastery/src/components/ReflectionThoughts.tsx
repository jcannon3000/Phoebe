/**
 * ReflectionThoughts — the day-scoped "what others are saying" surface.
 *
 * Shared across the three daily reflections (CAC / Forward Day by Day / SSJE).
 * Given a `source` and a `day` (YYYY-MM-DD), it shows the thoughts other people
 * in the viewer's community wrote about THAT day's reflection, and lets the
 * viewer add their own.
 *
 *   GET  /api/reflections/:source/thoughts?ymd=YYYY-MM-DD
 *        → { thoughts: [{ id, text, createdAt, authorName, avatarUrl, isYou }] }
 *   POST /api/reflections/:source/thoughts  { day, text }
 *
 * All copy goes through i18n (reflection_thoughts.*). The body of each thought
 * uses the same Georgia-italic treatment as the CAC journal so a shared thought
 * reads like a quiet note rather than chat.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const CTA = "#2D5E3F";

export type ReflectionSource = "cac" | "fdd" | "ssje";

type Thought = {
  id: number;
  text: string;
  createdAt: string;
  authorName: string;
  avatarUrl: string | null;
  isYou: boolean;
};

function initials(name: string): string {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ url, name, size = 32 }: { url: string | null; name: string; size?: number }) {
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: 999, background: "#1A4A2E", color: "#A8C5A0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>{initials(name)}</div>;
}

// Locale-aware "5m ago" / "2h ago" / "3d ago", falling back to a date for
// anything older than a week. Uses the active i18n language so Spanish reads
// "hace 5 min" etc.
function useRelativeTime() {
  const { i18n } = useTranslation();
  return (iso: string): string => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diffSec = Math.round((then - Date.now()) / 1000);
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(i18n.language || "en", { numeric: "auto" });
    if (abs < 60) return rtf.format(Math.round(diffSec), "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), "day");
    return new Date(iso).toLocaleDateString(i18n.language || "en", { month: "short", day: "numeric" });
  };
}

export default function ReflectionThoughts({ source, day }: { source: ReflectionSource; day: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const relTime = useRelativeTime();
  const [draft, setDraft] = useState("");

  const queryKey = ["reflection-thoughts", source, day];

  const thoughtsQ = useQuery<{ thoughts: Thought[] }>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/reflections/${source}/thoughts?ymd=${day}`),
    staleTime: 30_000,
  });

  const post = useMutation({
    mutationFn: (text: string) => apiRequest("POST", `/api/reflections/${source}/thoughts`, { day, text }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey });
    },
  });

  const thoughts = thoughtsQ.data?.thoughts ?? [];
  const trimmed = draft.trim();
  const canSend = !!trimmed && !post.isPending;

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };

  return (
    <section style={{ fontFamily: FONT }}>
      <p style={{ ...eyebrow, margin: "0 0 4px" }}>{t("reflection_thoughts.heading")}</p>
      <p style={{ color: SAGE, fontSize: 13, fontFamily: FONT, margin: "0 0 12px", lineHeight: 1.4 }}>
        {t("reflection_thoughts.subhead")}
      </p>

      {/* Compose */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("reflection_thoughts.placeholder")}
        rows={3}
        maxLength={2000}
        style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", color: WARM, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5, resize: "vertical", outline: "none" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => { if (canSend) post.mutate(trimmed); }}
          style={{ padding: "9px 18px", borderRadius: 12, background: trimmed ? CTA : "rgba(46,107,64,0.25)", color: WARM, border: "1px solid rgba(168,197,160,0.35)", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: canSend ? "pointer" : "default", opacity: post.isPending ? 0.6 : 1 }}
        >
          {post.isPending ? t("reflection_thoughts.sharing") : t("reflection_thoughts.share")}
        </button>
      </div>
      {post.isError && (
        <p style={{ color: "#D98A8A", fontSize: 12.5, fontFamily: FONT, margin: "8px 0 0" }}>
          {t("reflection_thoughts.error")}
        </p>
      )}

      {/* List */}
      <div style={{ marginTop: 18 }}>
        {thoughtsQ.isLoading ? (
          <p style={{ color: SAGE_DIM, fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{t("reflection_thoughts.loading")}</p>
        ) : thoughts.length === 0 ? (
          <p style={{ color: SAGE_DIM, fontSize: 13.5, fontFamily: FONT, fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
            {t("reflection_thoughts.empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {thoughts.map((th) => (
              <div key={th.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12 }}>
                <Avatar url={th.avatarUrl} name={th.authorName} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, margin: "1px 0 4px" }}>
                    <span style={{ ...eyebrow, fontSize: 10 }}>
                      {th.isYou ? t("reflection_thoughts.you") : th.authorName}
                    </span>
                    <span style={{ color: SAGE_DIM, fontSize: 10.5, fontFamily: FONT, whiteSpace: "nowrap", flexShrink: 0 }}>{relTime(th.createdAt)}</span>
                  </div>
                  <p style={{ color: WARM, fontSize: 14.5, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0, overflowWrap: "anywhere" }}>{th.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
