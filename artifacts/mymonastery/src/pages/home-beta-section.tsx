/**
 * BETA home — a single Way of Love section page (/home-beta/:section).
 *
 * v1 (this slice): the shared shell — header (title + definition), the user's
 * rule-of-life commitment(s), a "mark complete" action, and a Materials rail
 * of practice-tagged podcasts (/api/podcasts/search?theme=). The next slice
 * enriches each section with its reused surfaces (Turn's confession/examen,
 * Learn & Pray's office + reflection + contemplation, Worship's events,
 * Bless's prayer list, Go's justice feeds, Rest's carve-out).
 */

import { useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import {
  SECTIONS,
  commitmentLines,
  type SectionKey,
  type WolSelections,
  type CompletionRow,
} from "./home-beta";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const CTA = "#2D5E3F";

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

type ShowHit = { slug: string; title: string; artist: string; artwork: string | null };

export default function HomeBetaSectionPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/home-beta/:section");
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const def = SECTIONS.find((s) => s.key === (params?.section as SectionKey));

  useEffect(() => {
    if (!authLoading && !user) { setLocation("/"); return; }
    if (!authLoading && !betaLoading && user && !rawIsBeta) { setLocation("/dashboard"); return; }
    if (!authLoading && user && !def) setLocation("/home-beta");
  }, [authLoading, betaLoading, user, rawIsBeta, def, setLocation]);

  const wolQ = useQuery<{ selections: WolSelections }>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol"),
    enabled: !!user && !!def,
    staleTime: 60_000,
  });
  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user && !!def,
    staleTime: 15_000,
  });
  const matsQ = useQuery<{ shows: ShowHit[] }>({
    queryKey: ["/api/podcasts/search", def?.theme],
    queryFn: () => apiRequest("GET", `/api/podcasts/search?theme=${encodeURIComponent(def!.theme)}`),
    enabled: !!user && !!def,
    staleTime: 30 * 60_000,
  });

  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);
  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));

  const mark = useMutation({
    mutationFn: (v: { section: SectionKey; localDate: string; weekStart: string }) =>
      apiRequest("POST", "/api/practice-completion", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/practice-completion"] }),
  });
  const unmark = useMutation({
    mutationFn: (v: { section: SectionKey; localDate: string }) =>
      apiRequest("DELETE", "/api/practice-completion", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/practice-completion"] }),
  });

  if (authLoading || !user || !def || (!betaLoading && !rawIsBeta)) return null;

  const periodDate = def.daily ? today : thisWeekStart;
  const done = rows.some((r) => r.section === def.key && r.localDate === periodDate);
  const lines = commitmentLines(def, wolQ.data?.selections ?? {});
  const shows = matsQ.data?.shows ?? [];

  const toggle = () => {
    if (done) unmark.mutate({ section: def.key, localDate: periodDate });
    else mark.mutate({ section: def.key, localDate: periodDate, weekStart: thisWeekStart });
  };

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />
      <header style={{ position: "relative", zIndex: 1, padding: "max(1.1rem, calc(env(safe-area-inset-top) + 0.5rem)) 18px 6px" }}>
        <button type="button" onClick={() => setLocation("/home-beta")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={16} /> {t("home_beta.back", { defaultValue: "Way of Love" })}
        </button>
      </header>

      <main style={{ position: "relative", zIndex: 1, flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", padding: "8px 20px 36px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 34 }}>{def.emoji}</div>
        <h1 style={{ color: WARM, fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: "8px 0 4px" }}>
          {t(`home_beta.section.${def.key}`, { defaultValue: def.title })}
        </h1>
        <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.5, margin: 0 }}>{def.definition}</p>

        {/* Commitment */}
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, margin: "24px 0 8px" }}>
          {t("home_beta.your_commitment", { defaultValue: "Your commitment" })}
        </p>
        {lines.length > 0 ? (
          <div style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((l, i) => (
              <p key={i} style={{ color: WARM, fontSize: 14.5, fontFamily: FONT, margin: 0, lineHeight: 1.45 }}>{l}</p>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setLocation("/rule-of-life")} style={{ background: CARD, border: `1px dashed ${CARD_B}`, borderRadius: 14, padding: "14px", color: "rgba(168,197,160,0.95)", fontFamily: FONT, fontSize: 14, cursor: "pointer", width: "100%", textAlign: "left" }}>
            {t("home_beta.set_practice", { defaultValue: "Set your {{title}} practice →", title: def.title })}
          </button>
        )}

        {/* Mark complete */}
        <button
          type="button"
          onClick={toggle}
          style={{
            marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 14, fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
            background: done ? "rgba(46,107,64,0.22)" : CTA,
            color: done ? SAGE : WARM,
            border: `1px solid ${done ? CARD_B : "rgba(168,197,160,0.4)"}`,
          }}
        >
          {done
            ? (def.daily ? t("home_beta.done_today_tap", { defaultValue: "✓ Done today — tap to undo" }) : t("home_beta.done_week_tap", { defaultValue: "✓ Done this week — tap to undo" }))
            : (def.daily ? t("home_beta.mark_today", { defaultValue: "Mark done today" }) : t("home_beta.mark_week", { defaultValue: "I did this this week" }))}
        </button>

        {/* Materials */}
        {shows.length > 0 && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, margin: "28px 0 10px" }}>
              {t("home_beta.materials", { defaultValue: "To go deeper" })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shows.slice(0, 6).map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                >
                  {s.artwork
                    ? <img src={s.artwork} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(46,107,64,0.3)", flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: WARM, fontSize: 14, fontWeight: 600, fontFamily: FONT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</p>
                    <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* The richer per-section surfaces (office, events, prayer list, …) land here next. */}
        <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, fontStyle: "italic", textAlign: "center", margin: "28px 0 0", lineHeight: 1.5 }}>
          {t("home_beta.more_coming", { defaultValue: "More for this practice is on the way." })}
        </p>
      </main>
    </div>
  );
}
