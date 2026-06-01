/**
 * Organize a gathering — /gather/new. A member proposes a title, a few time
 * options, an optional place/note, and (optionally) invites people they pray
 * for (push + nudge targets). On create we go to the manage dashboard, which
 * holds the share link to send to everyone else.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type OptionRow = { datetime: string; label: string };
type PrayerPerson = { recipientUserId: number | null; recipientName: string | null; expired: boolean };

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.2)", border: `1px solid ${CARD_B}`,
  borderRadius: 10, padding: "11px 13px", color: WARM, fontSize: 14.5, fontFamily: FONT, outline: "none",
};

export default function GatherNewPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([{ datetime: "", label: "" }, { datetime: "", label: "" }]);
  const [invited, setInvited] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const peopleQ = useQuery<PrayerPerson[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    staleTime: 60_000,
  });
  const people = useMemo(() => {
    const seen = new Set<number>();
    return (peopleQ.data ?? [])
      .filter((p) => p.recipientUserId !== null && p.recipientName && !p.expired)
      .filter((p) => { if (seen.has(p.recipientUserId!)) return false; seen.add(p.recipientUserId!); return true; });
  }, [peopleQ.data]);

  const validOptions = options.filter((o) => o.datetime.trim());
  const canSave = title.trim().length > 0 && validOptions.length >= 2;

  const setOpt = (i: number, patch: Partial<OptionRow>) => setOptions((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const addOpt = () => setOptions((os) => [...os, { datetime: "", label: "" }]);
  const removeOpt = (i: number) => setOptions((os) => (os.length <= 2 ? os : os.filter((_, j) => j !== i)));

  async function create() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/gather", {
        title: title.trim(),
        note: note.trim() || undefined,
        place: place.trim() || undefined,
        options: validOptions.map((o) => ({ datetime: new Date(o.datetime).toISOString(), label: o.label.trim() || undefined })),
        inviteeUserIds: [...invited],
      }) as { id: number; shareToken: string };
      setLocation(`/gather/${res.id}/manage`);
    } catch {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-28 px-4 sm:px-0">
        <Link href="/this-week" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
        </Link>
        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          {t("gather.new_title", { defaultValue: "Organize a gathering" })} 🤝
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("gather.new_sub", { defaultValue: "Propose a few times, share the link, and converge on one." })}
        </p>

        <label style={{ color: SAGE_DIM, fontSize: 12.5, marginBottom: 5 }}>{t("gather.f_title", { defaultValue: "What's the gathering?" })}</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("gather.f_title_ph", { defaultValue: "e.g. Lunch, Bible study, a walk" })} style={inputStyle} />

        <label style={{ color: SAGE_DIM, fontSize: 12.5, margin: "16px 0 5px" }}>{t("gather.f_times", { defaultValue: "Proposed times (pick at least 2)" })}</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="datetime-local" value={o.datetime} onChange={(e) => setOpt(i, { datetime: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOpt(i)} aria-label={t("common.remove", { defaultValue: "Remove" })}
                  style={{ background: "none", border: `1px solid ${CARD_B}`, color: SAGE, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontFamily: FONT }}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addOpt} style={{ alignSelf: "flex-start", marginTop: 8, background: "none", border: `1px dashed ${CARD_B}`, color: SAGE, borderRadius: 10, padding: "9px 14px", fontSize: 13.5, fontFamily: FONT, cursor: "pointer" }}>
          {t("gather.add_time", { defaultValue: "+ Add another time" })}
        </button>

        <label style={{ color: SAGE_DIM, fontSize: 12.5, margin: "16px 0 5px" }}>{t("gather.f_place", { defaultValue: "Place (optional)" })}</label>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("gather.f_place_ph", { defaultValue: "e.g. The café on Main" })} style={inputStyle} />

        <label style={{ color: SAGE_DIM, fontSize: 12.5, margin: "16px 0 5px" }}>{t("gather.f_note", { defaultValue: "Note (optional)" })}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("gather.f_note_ph", { defaultValue: "Anything to add…" })} style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }} />

        {people.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <label style={{ color: SAGE_DIM, fontSize: 12.5 }}>{t("gather.f_invite", { defaultValue: "Invite people (they'll get a notification)" })}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {people.map((p) => {
                const id = p.recipientUserId!;
                const on = invited.has(id);
                return (
                  <button key={id} type="button" onClick={() => setInvited((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                    style={{ background: on ? "rgba(46,107,64,0.45)" : CARD, border: `1px solid ${on ? "rgba(168,197,160,0.7)" : CARD_B}`, color: on ? WARM : SAGE, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontFamily: FONT, cursor: "pointer" }}>
                    {on ? "✓ " : ""}{p.recipientName}
                  </button>
                );
              })}
            </div>
            <p style={{ color: SAGE_DIM, fontSize: 11.5, margin: "8px 0 0" }}>{t("gather.f_invite_note", { defaultValue: "You can also just share the link with anyone — they don't need an account." })}</p>
          </div>
        )}

        <button type="button" onClick={create} disabled={!canSave || saving}
          style={{ width: "100%", marginTop: 24, background: canSave ? CTA : "rgba(46,107,64,0.25)", border: "none", color: WARM, borderRadius: 12, padding: "14px 16px", fontSize: 15.5, fontWeight: 600, fontFamily: FONT, cursor: canSave ? "pointer" : "default" }}>
          {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("gather.create", { defaultValue: "Create & get the share link" })}
        </button>
      </div>
    </Layout>
  );
}
