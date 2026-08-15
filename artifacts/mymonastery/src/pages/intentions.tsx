import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { markIntentionPrayedToday } from "@/lib/intentionsPrayed";
import { getPrayerListSlot, setPrayerListSlot, type PrayerListSlot } from "@/lib/prayerListSlot";
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
  // Owner: "make community list an option for morning and evening slots...
  // if they prayed their community prayers but have not prayed their
  // morning or evening, fill in the dot in the weekly based on where they
  // prayed the prayer list." Neither = the list stays a standalone card,
  // doesn't satisfy either side (the default).
  const [prayerListSlot, setPrayerListSlotState] = useState<PrayerListSlot>(getPrayerListSlot);
  const pickSlot = (slot: PrayerListSlot) => { setPrayerListSlotState(slot); setPrayerListSlot(slot); };
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

  // ── Pray-through — this list only, not the community slideshow ──────────
  // A quiet, private walkthrough of just what's on THIS list — never routed
  // through /prayer-mode (that's the community/office flow; it doesn't belong
  // here for an account just praying their own list). The ?pray=1 deep link
  // (daily-progress card, home card) opens straight into it.
  const startedPraying = (() => {
    try { return new URLSearchParams(window.location.search).get("pray") === "1"; } catch { return false; }
  })();
  const [praying, setPraying] = useState(false);
  useEffect(() => {
    if (startedPraying) setPraying(true);
  }, [startedPraying]);
  const finishPraying = () => {
    markPracticeDoneToday("prayer-list");
    setPraying(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("pray");
      window.history.replaceState({}, "", url.toString());
    } catch { /* ignore */ }
  };

  if (praying) {
    return (
      <PrayThrough
        intentions={active}
        bgPhoto={bgPhoto}
        onClose={() => setPraying(false)}
        onFinish={finishPraying}
      />
    );
  }

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

        {active.length > 0 && (
          <button type="button" onClick={() => setPraying(true)}
            className="w-full rounded-2xl mb-6 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: `rgba(${RGB},0.85)`, color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 16, padding: "15px 24px" }}>
            {t("intentions.pray_through", { defaultValue: "Pray through your list" })} <span aria-hidden>→</span>
          </button>
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

// ── Pray-through slideshow — one intention at a time, quiet + dark ─────────
function PrayThrough({ intentions, bgPhoto, onClose, onFinish }: {
  intentions: Intention[]; bgPhoto: string | null; onClose: () => void; onFinish: () => void;
}) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const total = intentions.length;
  const it = intentions[i];
  // Marks THIS slide's intention prayed for today the moment the viewer
  // steps past it — the routine card's "X out of Y" count reads this, not
  // just the whole-list finish flag below.
  const next = () => {
    if (it) markIntentionPrayedToday(it.id);
    if (i >= total - 1) { onFinish(); return; }
    setI((n) => n + 1);
  };
  const back = () => { if (i <= 0) { onClose(); return; } setI((n) => n - 1); };

  if (!it) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0C1F12", overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      {bgPhoto && (
        <div style={{ position: "absolute", inset: 0, zIndex: -1 }}>
          <img src={bgPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.32 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,31,18,0.55) 0%, rgba(12,31,18,0.35) 40%, rgba(12,31,18,0.92) 100%)" }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "max(1rem, env(safe-area-inset-top)) 1.25rem 0" }}>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", color: WARM, fontSize: 18 }}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 28px" }}>
        <p style={{ color: `rgba(${RGB},0.95)`, fontFamily: FONT, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 18 }}>
          {t("intentions.holding", { defaultValue: "Holding in prayer" })}
        </p>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(26px, 6vw, 38px)", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", maxWidth: 520, wordBreak: "break-word" }}>
          {headline(it)}
        </p>
        {subline(it) && (
          <p style={{ color: "#C8D4C0", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 18, lineHeight: 1.5, marginTop: 18, maxWidth: 440, wordBreak: "break-word" }}>
            {subline(it)}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem max(1.5rem, env(safe-area-inset-bottom))", gap: 12 }}>
        <button type="button" onClick={back} style={{ color: SAGE, fontFamily: FONT, fontSize: 14, background: "none", padding: "8px 4px" }}>
          {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT, fontSize: 12, letterSpacing: "0.12em" }}>{i + 1} / {total}</span>
        <AmenButton slideKey={it.id} onAdvance={next} isLast={i >= total - 1} />
      </div>
    </div>
  );
}

// Same 3-second pause-before-Amen used by the community slideshow
// (prayer-mode.tsx's AmenButton) — a dim progress wash fills over 3s,
// then the button brightens and "Amen →" fades in. Reused here so
// praying through your own list has the same unhurried feel instead
// of a bare Next button you could rip through instantly. Keyed by
// slideKey so the hold resets cleanly on every slide.
const AMEN_HOLD_MS = 3000;
function AmenButton({ slideKey, onAdvance, isLast }: {
  slideKey: string | number;
  onAdvance: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => {
      setReady(true);
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* non-fatal */ }
    }, AMEN_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [slideKey]);

  return (
    <button
      type="button"
      onClick={() => {
        if (!ready) return;
        try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
        onAdvance();
      }}
      disabled={!ready}
      aria-label="Amen"
      className="active:scale-[0.98] relative overflow-hidden"
      style={{
        background: ready ? `rgba(${RGB},0.85)` : `rgba(${RGB},0.18)`,
        border: `1px solid rgba(${RGB},${ready ? 0.7 : 0.3})`,
        color: WARM,
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: 600,
        borderRadius: 999,
        padding: "11px 26px",
        minWidth: 140,
        cursor: ready ? "pointer" : "default",
        transition: ready ? "background-color 360ms ease-out, border-color 360ms ease-out" : "none",
      }}
    >
      <span
        aria-hidden
        key={slideKey}
        className="absolute left-0 top-0 bottom-0 amen-progress-fill"
        style={{ background: `rgba(${RGB},0.45)`, pointerEvents: "none", opacity: ready ? 0 : 1, transition: "opacity 360ms ease-out" }}
      />
      <span style={{ position: "relative", opacity: ready ? 1 : 0, transform: ready ? "translateY(0)" : "translateY(2px)", transition: "opacity 280ms ease-out, transform 280ms ease-out", display: "inline-block" }}>
        {isLast ? t("common.done", { defaultValue: "Done" }) : "Amen →"}
      </span>
    </button>
  );
}
