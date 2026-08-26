import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { markIntentionPrayedToday } from "@/lib/intentionsPrayed";
import { BCP_PRAYERS } from "@/lib/bcp-prayers";

// ── Personal prayer list ("intentions") ───────────────────────────────────
// A private list of the people / things you're holding in prayer. Add free
// text or a person; pray through them in a quiet slideshow (counts as the
// daily "Prayer List" practice). No community-sharing here — prayer requests
// are off for everyone, so this list is private only, no exceptions.
//
// Modelled on Gratitude (private log) + the Psalms reader (the slideshow).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const FROST = { background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;
// The prayer-list accent — a soft sky/dove blue, distinct from gratitude's
// green and the community prayer-list's warmer tones.
const RGB = "96,140,180";

type Intention = {
  id: number;
  kind: "text" | "person";
  personName: string;
  body: string;
  answered: boolean;
  answeredAt: string | null;
  shared: boolean;
  sharedRequestId: number | null;
  createdAt: string;
  // Walked past in PrayThrough today — owner: "I prayed one of my prayers
  // and it didn't check it off when I came back." Only populated when the
  // list is fetched with ?ymd= (see the query below).
  prayedToday: boolean;
};

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// The line we pray for an intention.
function headline(it: Intention): string {
  return it.kind === "person" ? (it.personName || "Someone") : (it.body || "");
}
function subline(it: Intention): string {
  return it.kind === "person" ? it.body : "";
}
// BCP prayers kept on the list are standard prayers, not personal intentions —
// they can't be shared with the community. We tag them by matching the stored
// body against the BCP intercession titles (English + Spanish).
const BCP_TITLES: Set<string> = (() => {
  const s = new Set<string>();
  for (const p of BCP_PRAYERS) { s.add(p.title); if (p.titleEs) s.add(p.titleEs); }
  return s;
})();
function isBcpIntention(it: Intention): boolean {
  return it.kind === "text" && BCP_TITLES.has((it.body ?? "").trim());
}
// "Added today" / "1 day on your list" / "N days on your list".
function daysOnList(createdAt: string): string {
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Added today";
  if (days === 1) return "1 day on your list";
  return `${days} days on your list`;
}
export default function IntentionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const todayYmd = useMemo(todayLocalISO, []);
  const { data } = useQuery<{ intentions: Intention[] }>({
    queryKey: ["/api/prayer-intentions", todayYmd],
    queryFn: () => apiRequest("GET", `/api/prayer-intentions?ymd=${todayYmd}`) as Promise<{ intentions: Intention[] }>,
  });
  const intentions = data?.intentions ?? [];
  const active = intentions.filter((i) => !i.answered);
  const answered = intentions.filter((i) => i.answered);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/prayer-intentions"] });

  // ── Add composer ─────────────────────────────────────────────────────────
  // One field, private only — no community-sharing here (prayer requests are
  // off for everyone). Existing person items still display and edit.
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const addMut = useMutation({
    mutationFn: (payload: { kind: string; body?: string; personName?: string }) =>
      apiRequest("POST", "/api/prayer-intentions", payload) as Promise<{ intention: Intention }>,
  });
  const canAdd = text.trim().length > 0;
  const submitAdd = async () => {
    if (!canAdd || submitting) return;
    setSubmitting(true);
    try {
      await addMut.mutateAsync({ kind: "text", body: text });
      setText("");
    } catch { /* creating the intention failed */ }
    finally { setSubmitting(false); invalidate(); }
  };

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/prayer-intentions/${id}`, body),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-intentions/${id}`),
    onSuccess: invalidate,
  });

  // ── Inline edit ──────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const startEdit = (it: Intention) => { setEditingId(it.id); setEditName(it.personName); setEditBody(it.body); };
  const saveEdit = (it: Intention) => {
    patchMut.mutate(it.kind === "person"
      ? { id: it.id, personName: editName, body: editBody }
      : { id: it.id, body: editBody });
    setEditingId(null);
  };

  return (
    <Layout bgPhoto={bgPhoto}>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-6">
          <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0" style={{ background: `rgba(${RGB},0.18)`, border: `1px solid rgba(${RGB},0.35)` }}>🕊️</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{t("intentions.title", { defaultValue: "My Prayer List" })}</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>{t("intentions.subtitle", { defaultValue: "The people and things you're holding in prayer" })}</p>
          </div>
        </div>

        {/* Owner: "I don't ever want to see this ui" (the old bare
            "Holding in prayer" slideshow) — "both should show up in the
            slideshows," unified into the same prayer-mode deck as
            community prayers. This links out there instead of opening
            PrayThrough locally. */}
        {active.length > 0 && (
          <Link href="/prayer-mode?reset=1" className="block mb-6">
            <div
              className="w-full rounded-2xl flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: `rgba(${RGB},0.85)`, color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 16, padding: "15px 24px" }}
            >
              {t("intentions.pray_through", { defaultValue: "Pray through your list" })} <span aria-hidden>→</span>
            </div>
          </Link>
        )}

        {/* Add composer */}
        <div className="rounded-2xl p-4 mb-6" style={{ ...FROST, border: `1px solid rgba(${RGB},0.25)` }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t("intentions.text_ph", { defaultValue: "What are you praying for?" })}
            rows={3}
            className="w-full rounded-xl px-3.5 py-2.5 text-[15px] outline-none resize-none"
            style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.25)` }} />
          <button type="button" onClick={submitAdd} disabled={!canAdd || submitting}
            className="w-full rounded-full mt-3 text-[14px] font-semibold py-2.5 transition-opacity active:scale-[0.98]"
            style={{ background: canAdd ? `rgba(${RGB},0.85)` : "rgba(255,255,255,0.08)", color: canAdd ? WARM : "rgba(240,237,230,0.4)", fontFamily: FONT, cursor: canAdd ? "pointer" : "default" }}>
            {t("intentions.add", { defaultValue: "Add to my list" })}
          </button>
        </div>

        {/* Active list */}
        {active.length > 0 && (
          <div className="space-y-2 mb-6">
            {active.map((it) => {
              // Standard prayer-card shell (green accent + frosted), matching the
              // community cards on /prayer-list. BCP prayers (matched by title)
              // can't be shared — they're standard prayers, not personal asks.
              const bcp = isBcpIntention(it);
              return (
              <div key={it.id} className="relative flex rounded-xl overflow-hidden" style={{ background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.8)" }} />
                <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
                {editingId === it.id ? (
                  <div>
                    {it.kind === "person" && (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-2 text-[15px] outline-none"
                        style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.25)` }} />
                    )}
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} className="w-full rounded-lg px-3 py-2 text-[15px] outline-none resize-none"
                      style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.25)` }} />
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => saveEdit(it)} className="text-[12px] font-semibold px-4 py-1.5 rounded-full" style={{ background: `rgba(${RGB},0.85)`, color: WARM, fontFamily: FONT }}>{t("common.save", { defaultValue: "Save" })}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[12px] px-4 py-1.5 rounded-full" style={{ color: SAGE, fontFamily: FONT, border: "1px solid rgba(143,175,150,0.3)" }}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span aria-hidden className="text-base flex-shrink-0 mt-0.5">🙏</span>
                      <div className="flex-1 min-w-0">
                        {it.prayedToday && (
                          <p className="text-[11px] font-semibold mb-0.5" style={{ color: "rgba(110,180,130,0.9)", fontFamily: FONT }}>
                            ✓ {t("intentions.prayed_today", { defaultValue: "Prayed today" })}
                          </p>
                        )}
                        {bcp && (
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                            {t("intentions.bcp_label", { defaultValue: "Book of Common Prayer" })}
                          </p>
                        )}
                        <p className="text-sm leading-snug" style={{ color: "#F0EDE6", fontFamily: FONT, wordBreak: "break-word" }}>{headline(it)}</p>
                        {subline(it) && <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "#8FAF96", fontFamily: FONT, wordBreak: "break-word" }}>{subline(it)}</p>}
                        <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
                          {daysOnList(it.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      <RowBtn label={t("common.edit", { defaultValue: "Edit" })} emoji="✎" onClick={() => startEdit(it)} />
                      <RowBtn label={t("common.delete", { defaultValue: "Delete" })} emoji="🗑" onClick={() => delMut.mutate(it.id)} />
                    </div>
                  </>
                )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {active.length === 0 && (
          <p className="text-[14px] text-center mb-6 px-6" style={{ color: SAGE, fontFamily: FONT }}>
            {t("intentions.empty", { defaultValue: "Add the people and things you want to keep in prayer. They stay private until you choose to share." })}
          </p>
        )}

        {/* Answered (folded) */}
        {answered.length > 0 && (
          <>
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
              {t("intentions.answered_heading", { defaultValue: "Answered" })}
            </p>
            <div className="space-y-2 mb-6">
              {answered.map((it) => (
                <div key={it.id} className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ ...FROST, border: "1px solid rgba(46,107,64,0.18)", opacity: 0.75 }}>
                  <span aria-hidden className="text-[13px] flex-shrink-0" style={{ color: "rgba(110,180,130,0.9)" }}>✓</span>
                  <p className="flex-1 min-w-0 text-[14px] leading-snug" style={{ color: "#D8E0D2", fontFamily: FONT, textDecoration: "line-through", wordBreak: "break-word" }}>{headline(it)}</p>
                  <button type="button" onClick={() => patchMut.mutate({ id: it.id, answered: false })} className="text-[11px] flex-shrink-0" style={{ color: SAGE, fontFamily: FONT }}>{t("intentions.restore", { defaultValue: "Restore" })}</button>
                  <button type="button" onClick={() => delMut.mutate(it.id)} className="text-[11px] flex-shrink-0" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>🗑</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function RowBtn({ label, emoji, onClick }: { label: string; emoji: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-opacity active:scale-[0.97]"
      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,237,230,0.85)", fontFamily: FONT, border: "1px solid rgba(255,255,255,0.1)" }}>
      <span aria-hidden style={{ marginRight: 4 }}>{emoji}</span>{label}
    </button>
  );
}

