/**
 * BlessSubScreen — the weekly "bless your community" intention cycle.
 *
 * Bless is a recurring weekly intention loop (almost a reminders app, but with
 * intention): SET a few concrete ways to serve → tick them off through the week
 * → an end-of-week REVIEW (check off, carry over or release) → SET next week.
 * Gracious throughout — invitations, not obligations.
 *
 * Self-contained (own queries + mutations + style tokens) so it drops into the
 * Bless section sub-screen with a one-line render. Marking the first intention
 * done in a week logs the Bless practice_completion → credits the weekly
 * section AND Turn (the consistency spine).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
// The "serif" token points at Space Grotesk too, so the italic prompt/intention
// lines render as oblique Space Grotesk (not Georgia) — one consistent typeface.
const SERIF = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const CTA = "#2D5E3F";
const DONE_BG = "rgba(46,107,64,0.55)";
const DONE_B = "rgba(168,197,160,0.8)";
const CHIP_OFF = "rgba(46,107,64,0.10)";
const CHIP_OFF_B = "rgba(46,107,64,0.30)";
const CHIP_ON = "rgba(46,107,64,0.45)";
const CHIP_ON_B = "rgba(168,197,160,0.6)";

type Intention = {
  id: number; weekStart: string; text: string; type: string | null;
  recipient: string | null; reminderTime: string | null; doneAt: string | null;
  carriedFrom: number | null;
};

const TYPES = [
  { key: "note", label: "Note", emoji: "✍️" },
  { key: "visit", label: "Visit", emoji: "🤝" },
  { key: "give", label: "Give", emoji: "🎁" },
  { key: "serve", label: "Serve", emoji: "🙌" },
  { key: "other", label: "Other", emoji: "🤍" },
] as const;

const SUGGESTIONS: Array<{ id: string; text: string; type: string }> = [
  { id: "note", text: "Write a note of encouragement", type: "note" },
  { id: "volunteer", text: "Volunteer somewhere this week", type: "serve" },
  { id: "check", text: "Check on someone who's struggling", type: "visit" },
  { id: "give", text: "Give to someone in need", type: "give" },
  { id: "meal", text: "Share a meal with someone", type: "visit" },
];

function addDaysYmd(weekStart: string, days: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y!, (m! - 1), d! + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export default function BlessSubScreen({
  weekStart,
  today,
}: {
  weekStart: string;
  today: string;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nextWeekStart = addDaysYmd(weekStart, 7);

  const blessQ = useQuery<{ intentions: Intention[]; reviewedAt: string | null }>({
    queryKey: ["/api/bless", weekStart],
    queryFn: () => apiRequest("GET", `/api/bless?weekStart=${weekStart}`),
    staleTime: 30_000,
  });
  const recipientsQ = useQuery<Array<{ recipientName: string | null; expired: boolean }>>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    staleTime: 60_000,
  });

  const intentions = blessQ.data?.intentions ?? [];
  const reviewedAt = blessQ.data?.reviewedAt ?? null;
  const recipients = (recipientsQ.data ?? [])
    .filter((r) => !r.expired && r.recipientName)
    .map((r) => r.recipientName as string)
    .slice(0, 6);
  const doneCount = intentions.filter((i) => i.doneAt).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/bless", weekStart] });
    qc.invalidateQueries({ queryKey: ["/api/practice-completion"] });
  };
  const addMut = useMutation({
    mutationFn: (v: { text: string; type?: string | null; recipient?: string | null; reminderTime?: string | null; weekStart: string; carriedFrom?: number }) =>
      apiRequest("POST", "/api/bless", v),
    onSuccess: invalidate,
  });
  const patchMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: number } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/bless/${id}`, patch),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/bless/${id}`),
    onSuccess: invalidate,
  });
  const reviewMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bless/review", { weekStart }),
    onSuccess: invalidate,
  });
  // Marking the first intention done this week credits Bless (and so Turn).
  const creditBless = () =>
    apiRequest("POST", "/api/practice-completion", { section: "bless", localDate: today, weekStart }).catch(() => {});

  // ── Add / edit form ──
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [fText, setFText] = useState("");
  const [fType, setFType] = useState<string | null>(null);
  const [fRecipient, setFRecipient] = useState("");
  const [fReminder, setFReminder] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const openAdd = (preset?: { text: string; type: string }) => {
    setEditId(null);
    setFText(preset?.text ?? "");
    setFType(preset?.type ?? null);
    setFRecipient("");
    setFReminder("");
    setAdding(true);
  };
  const openEdit = (i: Intention) => {
    setEditId(i.id);
    setFText(i.text);
    setFType(i.type);
    setFRecipient(i.recipient ?? "");
    setFReminder(i.reminderTime ?? "");
    setAdding(true);
  };
  const closeForm = () => { setAdding(false); setEditId(null); };
  const saveForm = () => {
    const text = fText.trim();
    if (!text) return;
    const fields = {
      text,
      type: fType,
      recipient: fRecipient.trim() || null,
      reminderTime: fReminder.trim() || null,
    };
    if (editId != null) patchMut.mutate({ id: editId, ...fields });
    else addMut.mutate({ ...fields, weekStart });
    closeForm();
  };

  const toggleDone = (i: Intention) => {
    const willBeDone = !i.doneAt;
    patchMut.mutate({ id: i.id, done: willBeDone });
    if (willBeDone) creditBless();
  };

  const carryOver = (i: Intention) => {
    addMut.mutate({ text: i.text, type: i.type, recipient: i.recipient, reminderTime: i.reminderTime, weekStart: nextWeekStart, carriedFrom: i.id });
  };

  // ── UI atoms ──
  const card = { background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px" };
  const typeMeta = (k: string | null) => TYPES.find((x) => x.key === k);

  const intentionCard = (i: Intention) => {
    const done = !!i.doneAt;
    const meta = typeMeta(i.type);
    return (
      <div key={i.id} style={{ ...card, display: "flex", alignItems: "flex-start", gap: 11, opacity: done ? 0.72 : 1 }}>
        <button
          type="button"
          aria-label={done ? "Mark not done" : "Mark done"}
          onClick={() => toggleDone(i)}
          style={{ flexShrink: 0, marginTop: 1, width: 24, height: 24, borderRadius: 999, cursor: "pointer", padding: 0, background: done ? DONE_BG : "transparent", border: `2px solid ${done ? DONE_B : "rgba(143,175,150,0.4)"}`, color: WARM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}
        >
          {done ? "✓" : ""}
        </button>
        <button type="button" onClick={() => openEdit(i)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
          <p style={{ color: WARM, fontSize: 14.5, fontFamily: FONT, margin: 0, lineHeight: 1.4, textDecoration: done ? "line-through" : "none" }}>
            {meta ? `${meta.emoji} ` : ""}{i.text}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: i.recipient || i.reminderTime ? 5 : 0 }}>
            {i.recipient && <span style={{ color: SAGE, fontSize: 12, fontFamily: FONT }}>for {i.recipient}</span>}
            {i.reminderTime && <span style={{ color: SAGE_DIM, fontSize: 11.5, fontFamily: FONT, border: `1px solid ${CARD_B}`, borderRadius: 999, padding: "1px 7px" }}>⏰ {i.reminderTime}</span>}
            {i.carriedFrom && <span style={{ color: SAGE_DIM, fontSize: 11, fontFamily: FONT }}>carried over</span>}
          </div>
        </button>
      </div>
    );
  };

  // ── Add/edit form ──
  if (adding) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: WARM, fontSize: 15, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
          {editId != null ? t("bless.edit", { defaultValue: "Edit this blessing" }) : t("bless.add", { defaultValue: "Add a blessing" })}
        </p>
        <textarea
          autoFocus
          value={fText}
          onChange={(e) => setFText(e.target.value)}
          placeholder={t("bless.placeholder", { defaultValue: "A concrete way to serve someone this week…" })}
          rows={2}
          style={{ background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`, borderRadius: 12, padding: "11px 13px", color: WARM, fontSize: 15, fontFamily: SERIF, lineHeight: 1.5, resize: "none", outline: "none" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {TYPES.map((x) => {
            const on = fType === x.key;
            return (
              <button key={x.key} type="button" onClick={() => setFType(on ? null : x.key)} style={{ background: on ? CHIP_ON : CHIP_OFF, border: `1px solid ${on ? CHIP_ON_B : CHIP_OFF_B}`, color: WARM, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontFamily: FONT, cursor: "pointer" }}>
                {x.emoji} {t(`bless.type.${x.key}`, { defaultValue: x.label })}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={fRecipient}
          onChange={(e) => setFRecipient(e.target.value)}
          placeholder={t("bless.recipient", { defaultValue: "For someone (optional)" })}
          style={{ background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`, borderRadius: 12, padding: "10px 13px", color: WARM, fontSize: 14, fontFamily: FONT, outline: "none" }}
        />
        {recipients.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recipients.map((name) => (
              <button key={name} type="button" onClick={() => setFRecipient(name)} style={{ background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`, color: SAGE, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontFamily: FONT, cursor: "pointer" }}>
                {name}
              </button>
            ))}
          </div>
        )}
        <input
          type="time"
          value={fReminder}
          onChange={(e) => setFReminder(e.target.value)}
          style={{ background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`, borderRadius: 12, padding: "10px 13px", color: WARM, fontSize: 14, fontFamily: FONT, outline: "none", width: "fit-content" }}
        />
        <div style={{ display: "flex", gap: 9, marginTop: 2 }}>
          <button type="button" onClick={saveForm} disabled={!fText.trim()} style={{ flex: 1, background: fText.trim() ? CTA : CHIP_OFF, border: "none", color: WARM, borderRadius: 12, padding: "11px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: fText.trim() ? "pointer" : "default" }}>
            {t("common.save", { defaultValue: "Save" })}
          </button>
          {editId != null && (
            <button type="button" onClick={() => { delMut.mutate(editId); closeForm(); }} style={{ background: "none", border: `1px solid ${CHIP_OFF_B}`, color: "#e08a8a", borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: FONT, cursor: "pointer" }}>
              {t("common.delete", { defaultValue: "Delete" })}
            </button>
          )}
          <button type="button" onClick={closeForm} style={{ background: "none", border: `1px solid ${CHIP_OFF_B}`, color: SAGE, borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: FONT, cursor: "pointer" }}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      </div>
    );
  }

  // ── End-of-week review ──
  if (reviewing) {
    const unfinished = intentions.filter((i) => !i.doneAt);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: WARM, fontSize: 16, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
          {t("bless.review_title", { defaultValue: "How did this week go?" })}
        </p>
        <p style={{ color: SAGE, fontSize: 13.5, fontFamily: SERIF, fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
          {t("bless.review_sub", { defaultValue: "Check off what you did. Carry over or release the rest — no guilt." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {intentions.map((i) => intentionCard(i))}
        </div>
        {unfinished.length > 0 && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, fontFamily: FONT, margin: 0 }}>
              {t("bless.carry_label", { defaultValue: "Carry into next week?" })}
            </p>
            {unfinished.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, color: WARM, fontSize: 13.5, fontFamily: FONT, minWidth: 0 }}>{i.text}</span>
                <button type="button" onClick={() => carryOver(i)} style={{ background: CHIP_ON, border: `1px solid ${CHIP_ON_B}`, color: WARM, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {t("bless.carry", { defaultValue: "Carry over" })}
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { reviewMut.mutate(); setReviewing(false); }} style={{ background: CTA, border: "none", color: WARM, borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          {t("bless.review_done", { defaultValue: "Done reviewing → set next week" })}
        </button>
        <button type="button" onClick={() => setReviewing(false)} style={{ background: "none", border: "none", color: SAGE, fontSize: 13.5, fontFamily: FONT, cursor: "pointer" }}>
          {t("common.back", { defaultValue: "Back" })}
        </button>
      </div>
    );
  }

  // ── Empty state ──
  if (intentions.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: WARM, fontSize: 18, fontWeight: 700, fontFamily: SERIF, fontStyle: "italic", margin: 0, lineHeight: 1.4 }}>
          {t("bless.prompt", { defaultValue: "How can you bless your community this week?" })}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => openAdd({ text: s.text, type: s.type })} style={{ background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`, color: WARM, borderRadius: 999, padding: "8px 13px", fontSize: 13, fontFamily: FONT, cursor: "pointer", textAlign: "left" }}>
              {t(`bless.suggest.${s.id}`, { defaultValue: s.text })}
            </button>
          ))}
        </div>
        {recipients.length > 0 && (
          <p style={{ color: SAGE, fontSize: 13, fontFamily: SERIF, fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
            {t("bless.recipient_hint", { defaultValue: "On your prayer list: {{names}} — send encouragement?", names: recipients.slice(0, 3).join(", ") })}
          </p>
        )}
        <button type="button" onClick={() => openAdd()} style={{ background: CTA, border: "none", color: WARM, borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          {t("bless.add", { defaultValue: "Add a blessing" })}
        </button>
      </div>
    );
  }

  // ── This week's checklist ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ color: SAGE, fontSize: 13, fontFamily: FONT, margin: 0 }}>
        {t("bless.progress", { defaultValue: "{{done}} of {{total}} this week", done: doneCount, total: intentions.length })}
      </p>
      {intentions.map((i) => intentionCard(i))}
      <button type="button" onClick={() => openAdd()} style={{ background: "none", border: `1px dashed ${CARD_B}`, color: SAGE, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, fontFamily: FONT, cursor: "pointer", textAlign: "left" }}>
        {t("bless.add_more", { defaultValue: "+ Add a blessing" })}
      </button>
      <button type="button" onClick={() => setReviewing(true)} style={{ background: reviewedAt ? CHIP_OFF : "rgba(46,107,64,0.18)", border: `1px solid ${CARD_B}`, color: SAGE, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontFamily: FONT, cursor: "pointer", marginTop: 4 }}>
        {reviewedAt
          ? t("bless.reviewed", { defaultValue: "✓ Reviewed this week — review again" })
          : t("bless.review_open", { defaultValue: "End-of-week review →" })}
      </button>
    </div>
  );
}
