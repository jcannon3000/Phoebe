/**
 * Organizer dashboard — /gather/:id/manage. Auth-gated to the organizer. The
 * share link to send out, each option's count + who can make it, any
 * "suggest another time" notes, a one-tap nudge for non-responders, and
 * "confirm this time" (which notifies everyone and surfaces it as an event).
 */

import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Check } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type OptionAgg = { id: number; datetime: string; label: string | null; yes: string[]; maybe: string[]; no: string[] };
type ManageData = {
  gather: { id: number; title: string; note: string | null; place: string | null; status: string; shareToken: string; confirmedOptionId: number | null };
  shareUrl: string;
  options: OptionAgg[];
  responses: Array<{ name: string; email: string | null; suggestedTime: string | null }>;
  suggestedTimes: string[];
  inviteeCount: number;
  nonResponderCount: number;
};

function fmt(dt: string): string {
  try { return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(dt)); }
  catch { return dt; }
}

export default function GatherManagePage() {
  const [, params] = useRoute("/gather/:id/manage");
  const id = params?.id ?? "";
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState("");

  const q = useQuery<ManageData>({
    queryKey: ["/api/gather/manage", id],
    queryFn: () => apiRequest("GET", `/api/gather/${id}/manage`),
    enabled: !!id,
    staleTime: 10_000,
  });

  const confirmMut = useMutation({
    mutationFn: (optionId: number) => apiRequest("POST", `/api/gather/${id}/confirm`, { optionId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gather/manage", id] }); qc.invalidateQueries({ queryKey: ["/api/gather/mine/events"] }); },
  });
  const nudgeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/gather/${id}/nudge`, {}) as Promise<{ nudged: number }>,
    onSuccess: (r) => setNudgeMsg(t("gather.nudged", { defaultValue: "Reminded {{n}} people.", n: r?.nudged ?? 0 })),
  });

  async function copyLink(url: string) {
    try {
      const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
      if (nav.share) { await nav.share({ url, title: q.data?.gather.title }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  const shell = (children: React.ReactNode) => (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-28 px-4 sm:px-0">
        <Link href="/this-week" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
        </Link>
        {children}
      </div>
    </Layout>
  );

  if (q.isLoading) return shell(<p style={{ color: SAGE }}>{t("common.loading", { defaultValue: "Loading…" })}</p>);
  if (q.isError || !q.data) return shell(<p style={{ color: SAGE }}>{t("gather.not_found", { defaultValue: "This gathering isn't available." })}</p>);

  const { gather, shareUrl, options, suggestedTimes, nonResponderCount } = q.data;
  const open = gather.status === "open";
  const confirmedOpt = gather.confirmedOptionId ? options.find((o) => o.id === gather.confirmedOptionId) : null;

  return shell(
    <>
      <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>{gather.title}</h1>
      {gather.place && <p style={{ color: SAGE, fontSize: 14, margin: "0 0 2px" }}>📍 {gather.place}</p>}

      {confirmedOpt && (
        <div style={{ marginTop: 14, background: "rgba(46,107,64,0.24)", border: "1px solid rgba(168,197,160,0.5)", borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, margin: "0 0 3px" }}>{t("gather.confirmed", { defaultValue: "Confirmed" })}</p>
          <p style={{ color: WARM, fontSize: 17, fontWeight: 700, margin: 0 }}>🗓 {fmt(confirmedOpt.datetime)}</p>
        </div>
      )}

      {/* Share link */}
      <div style={{ marginTop: 16, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "14px 16px" }}>
        <p style={{ color: SAGE_DIM, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, margin: "0 0 8px" }}>{t("gather.share_label", { defaultValue: "Share this link" })}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <p style={{ flex: 1, minWidth: 0, color: SAGE, fontSize: 13, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shareUrl}</p>
          <button type="button" onClick={() => copyLink(shareUrl)} style={{ background: CTA, border: "none", color: WARM, borderRadius: 10, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? t("gather.copied", { defaultValue: "Copied!" }) : t("gather.share", { defaultValue: "Share" })}
          </button>
        </div>
      </div>

      {/* Options with counts + names */}
      <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, margin: "22px 0 10px" }}>{t("gather.responses", { defaultValue: "Responses" })}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {options.map((o) => {
          const isConfirmed = gather.confirmedOptionId === o.id;
          return (
            <div key={o.id} style={{ background: isConfirmed ? "rgba(46,107,64,0.22)" : CARD, border: `1px solid ${isConfirmed ? "rgba(168,197,160,0.5)" : CARD_B}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <p style={{ color: WARM, fontSize: 15, fontWeight: 600, margin: 0 }}>{o.label ? `${o.label} · ` : ""}{fmt(o.datetime)}</p>
                <span style={{ color: SAGE, fontSize: 13, whiteSpace: "nowrap" }}>✅ {o.yes.length} · 🤔 {o.maybe.length}</span>
              </div>
              {(o.yes.length > 0 || o.maybe.length > 0) && (
                <p style={{ color: SAGE_DIM, fontSize: 12.5, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {o.yes.length > 0 && <>{t("gather.avail.yes", { defaultValue: "Yes" })}: {o.yes.join(", ")}. </>}
                  {o.maybe.length > 0 && <>{t("gather.avail.maybe", { defaultValue: "Maybe" })}: {o.maybe.join(", ")}.</>}
                </p>
              )}
              {open && (
                <button type="button" onClick={() => confirmMut.mutate(o.id)} disabled={confirmMut.isPending}
                  style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: CTA, border: "none", color: WARM, borderRadius: 10, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                  <Check size={14} /> {t("gather.confirm_this", { defaultValue: "Confirm this time" })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {suggestedTimes.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, margin: "0 0 8px" }}>{t("gather.suggested_times", { defaultValue: "Suggested times" })}</p>
          {suggestedTimes.map((s, i) => (
            <p key={i} style={{ color: SAGE, fontSize: 13.5, margin: "0 0 4px", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "9px 12px" }}>💡 {s}</p>
          ))}
        </div>
      )}

      {open && nonResponderCount > 0 && (
        <button type="button" onClick={() => nudgeMut.mutate()} disabled={nudgeMut.isPending}
          style={{ width: "100%", marginTop: 20, background: "rgba(46,107,64,0.18)", border: `1px solid ${CARD_B}`, color: WARM, borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          {t("gather.nudge", { defaultValue: "Nudge {{n}} who haven't replied", n: nonResponderCount })}
        </button>
      )}
      {nudgeMsg && <p style={{ color: SAGE, fontSize: 13, textAlign: "center", margin: "10px 0 0" }}>{nudgeMsg}</p>}
    </>,
  );
}
