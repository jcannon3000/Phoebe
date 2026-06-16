/**
 * Respond to a gathering — /gather/:token. The novel screen: it works for
 * Phoebe members (identified by their session) AND for guests with no account
 * (name + optional email). Token-gated and standalone (no app chrome) so a
 * logged-out guest who taps a shared link can still mark their availability.
 *
 * Anyone can revisit and change their answer: the per-response edit token is
 * stored in localStorage (and accepted as ?rt= on the link), so the page
 * pre-fills the previous reply.
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const BG = "#091A10";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Avail = "yes" | "maybe" | "no";
type Option = { id: number; datetime: string; label: string | null; yesCount: number };
type GatherData = {
  gather: { id: number; title: string; note: string | null; place: string | null; status: string };
  organizerName: string;
  options: Option[];
  responseCount: number;
  confirmedOption: { id: number; datetime: string; label: string | null } | null;
  myResponse: { responseToken: string; guestName: string | null; suggestedTime: string | null; availability: Record<number, Avail>; isMember: boolean } | null;
};

function fmt(dt: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(dt));
  } catch { return dt; }
}
const rtKey = (token: string) => `gather:rt:${token}`;

const AVAILS: Array<{ v: Avail; label: string; on: string; onB: string }> = [
  { v: "yes", label: "Yes", on: "rgba(46,107,64,0.55)", onB: "rgba(168,197,160,0.8)" },
  { v: "maybe", label: "Maybe", on: "rgba(176,150,46,0.4)", onB: "rgba(212,190,120,0.7)" },
  { v: "no", label: "No", on: "rgba(120,60,60,0.35)", onB: "rgba(200,140,140,0.6)" },
];

export default function GatherRespondPage() {
  const [, params] = useRoute("/gather/:token");
  const token = params?.token ?? "";
  const { t } = useTranslation();
  const { user } = useAuth();

  // Edit token: URL ?rt= takes precedence, else the one we stored on a prior save.
  const urlRt = new URLSearchParams(window.location.search).get("rt");
  const [rt, setRt] = useState<string | null>(() => urlRt || localStorage.getItem(rtKey(token)) || null);

  const q = useQuery<GatherData>({
    queryKey: ["/api/gather/by-token", token, rt],
    queryFn: () => apiRequest("GET", `/api/gather/by-token/${token}${rt ? `?rt=${encodeURIComponent(rt)}` : ""}`),
    enabled: !!token,
    staleTime: 15_000,
  });

  const [avail, setAvail] = useState<Record<number, Avail>>({});
  const [suggested, setSuggested] = useState("");
  const [guestName, setGuestName] = useState("");
  // Pre-fill from the invite link's ?e= so the response is matched back to the
  // invite (and the guest isn't re-nudged). They can still edit or clear it.
  const [guestEmail, setGuestEmail] = useState(() => new URLSearchParams(window.location.search).get("e") ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Hydrate the form from a previous reply once data arrives.
  useEffect(() => {
    const mine = q.data?.myResponse;
    if (mine) {
      setAvail(mine.availability ?? {});
      setSuggested(mine.suggestedTime ?? "");
      if (mine.guestName) setGuestName(mine.guestName);
    }
  }, [q.data?.myResponse]);

  const data = q.data;
  const isMember = !!user;
  const setOpt = (optionId: number, v: Avail) => { setSaved(false); setAvail((a) => ({ ...a, [optionId]: a[optionId] === v ? a[optionId] : v })); };

  const canSave = useMemo(() => {
    if (data?.gather.status !== "open") return false;
    if (!isMember && !guestName.trim()) return false;
    return Object.keys(avail).length > 0 || suggested.trim().length > 0;
  }, [data, isMember, guestName, avail, suggested]);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest("POST", `/api/gather/${token}/respond`, {
        availability: avail,
        suggestedTime: suggested.trim() || undefined,
        guestName: isMember ? undefined : guestName.trim(),
        guestEmail: isMember ? undefined : (guestEmail.trim() || undefined),
        responseToken: rt || undefined,
      }) as { responseToken: string };
      if (res?.responseToken) {
        localStorage.setItem(rtKey(token), res.responseToken);
        setRt(res.responseToken);
      }
      setSaved(true);
      q.refetch();
    } catch {
      /* surfaced via the disabled→retry affordance */
    } finally {
      setSaving(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, padding: "max(20px, var(--safe-top)) 18px 40px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>{children}</div>
    </div>
  );

  if (q.isLoading) return shell(<p style={{ color: SAGE }}>{t("common.loading", { defaultValue: "Loading…" })}</p>);
  if (q.isError || !data) return shell(<p style={{ color: SAGE }}>{t("gather.not_found", { defaultValue: "This gathering link isn't valid." })}</p>);

  const { gather, organizerName, options, confirmedOption, responseCount } = data;
  const cancelled = gather.status === "cancelled";
  const confirmed = gather.status === "confirmed";

  return shell(
    <>
      <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, margin: "0 0 6px" }}>
        {t("gather.invited_by", { defaultValue: "{{name}} invited you", name: organizerName })}
      </p>
      <h1 style={{ color: WARM, fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>{gather.title}</h1>
      {gather.place && <p style={{ color: SAGE, fontSize: 14, margin: "0 0 2px" }}>📍 {gather.place}</p>}
      {gather.note && <p style={{ color: SAGE, fontSize: 14, margin: "6px 0 0", lineHeight: 1.5 }}>{gather.note}</p>}

      {cancelled && (
        <div style={{ marginTop: 22, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "16px 18px" }}>
          <p style={{ color: WARM, fontSize: 15, margin: 0 }}>{t("gather.cancelled", { defaultValue: "This gathering was cancelled." })}</p>
        </div>
      )}

      {confirmed && confirmedOption && (
        <div style={{ marginTop: 22, background: "rgba(46,107,64,0.24)", border: "1px solid rgba(168,197,160,0.5)", borderRadius: 14, padding: "16px 18px" }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, margin: "0 0 4px" }}>{t("gather.its_set", { defaultValue: "It's set" })}</p>
          <p style={{ color: WARM, fontSize: 18, fontWeight: 700, margin: 0 }}>🗓 {fmt(confirmedOption.datetime)}</p>
          {gather.place && <p style={{ color: SAGE, fontSize: 14, margin: "4px 0 0" }}>📍 {gather.place}</p>}
        </div>
      )}

      {!cancelled && !confirmed && (
        <>
          <p style={{ color: SAGE, fontSize: 13.5, margin: "22px 0 10px" }}>
            {t("gather.mark_prompt", { defaultValue: "Which times work for you?" })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {options.map((o) => (
              <div key={o.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <p style={{ color: WARM, fontSize: 15, fontWeight: 600, margin: 0 }}>{o.label ? `${o.label} · ` : ""}{fmt(o.datetime)}</p>
                  {o.yesCount > 0 && <span style={{ color: SAGE_DIM, fontSize: 12, whiteSpace: "nowrap" }}>{t("gather.n_yes", { defaultValue: "{{n}} can make it", n: o.yesCount })}</span>}
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                  {AVAILS.map((a) => {
                    const on = avail[o.id] === a.v;
                    return (
                      <button key={a.v} type="button" onClick={() => setOpt(o.id, a.v)}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
                          background: on ? a.on : "transparent", border: `1px solid ${on ? a.onB : "rgba(143,175,150,0.3)"}`, color: on ? WARM : SAGE }}>
                        {t(`gather.avail.${a.v}`, { defaultValue: a.label })}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: SAGE_DIM, fontSize: 12.5, margin: "18px 0 6px" }}>{t("gather.suggest_label", { defaultValue: "None of these? Suggest another time" })}</p>
          <input value={suggested} onChange={(e) => { setSaved(false); setSuggested(e.target.value); }}
            placeholder={t("gather.suggest_ph", { defaultValue: "e.g. Friday after 6pm" })}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.2)", border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "11px 13px", color: WARM, fontSize: 14.5, fontFamily: FONT, outline: "none" }} />

          {!isMember && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
              <input value={guestName} onChange={(e) => { setSaved(false); setGuestName(e.target.value); }}
                placeholder={t("gather.your_name", { defaultValue: "Your name" })}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.2)", border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "11px 13px", color: WARM, fontSize: 14.5, fontFamily: FONT, outline: "none" }} />
              <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} type="email"
                placeholder={t("gather.your_email", { defaultValue: "Email (optional — to get the final time)" })}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.2)", border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "11px 13px", color: WARM, fontSize: 14.5, fontFamily: FONT, outline: "none" }} />
            </div>
          )}

          <button type="button" onClick={save} disabled={!canSave || saving}
            style={{ width: "100%", marginTop: 18, background: canSave ? CTA : "rgba(46,107,64,0.25)", border: "none", color: WARM, borderRadius: 12, padding: "13px 16px", fontSize: 15.5, fontWeight: 600, fontFamily: FONT, cursor: canSave ? "pointer" : "default" }}>
            {saving ? t("common.saving", { defaultValue: "Saving…" }) : data.myResponse ? t("gather.update", { defaultValue: "Update my answer" }) : t("gather.send", { defaultValue: "Send my availability" })}
          </button>
          {saved && <p style={{ color: SAGE, fontSize: 13, textAlign: "center", margin: "10px 0 0" }}>{t("gather.saved", { defaultValue: "Saved — you can change this anytime from this link." })}</p>}
          {responseCount > 0 && <p style={{ color: SAGE_DIM, fontSize: 12, textAlign: "center", margin: "14px 0 0" }}>{t("gather.responses_so_far", { defaultValue: "{{n}} have responded so far", n: responseCount })}</p>}
        </>
      )}
    </>,
  );
}
