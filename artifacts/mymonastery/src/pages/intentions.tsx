import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";

// ── Personal prayer list ("intentions") ───────────────────────────────────
// A private list of the people / things you're holding in prayer. Add free
// text or a person; pray through them in a quiet slideshow (counts as the daily
// "Prayer List" practice); and — optionally — post one to your community or
// your circle so others can pray along (reusing the prayer-request infra).
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
};
type Group = { id: number; name: string; slug: string; emoji?: string | null };

// The line we pray / share for an intention.
function headline(it: Intention): string {
  return it.kind === "person" ? (it.personName || "Someone") : (it.body || "");
}
function subline(it: Intention): string {
  return it.kind === "person" ? it.body : "";
}
function shareBody(it: Intention): string {
  if (it.kind === "person") {
    const base = `Praying for ${it.personName || "someone dear to me"}`;
    return it.body ? `${base} — ${it.body}` : base;
  }
  return it.body;
}

export default function IntentionsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data } = useQuery<{ intentions: Intention[] }>({
    queryKey: ["/api/prayer-intentions"],
    queryFn: () => apiRequest("GET", "/api/prayer-intentions") as Promise<{ intentions: Intention[] }>,
  });
  const intentions = data?.intentions ?? [];
  const active = intentions.filter((i) => !i.answered);
  const answered = intentions.filter((i) => i.answered);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/prayer-intentions"] });

  // ── Add composer ─────────────────────────────────────────────────────────
  const [addKind, setAddKind] = useState<"text" | "person">("text");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const addMut = useMutation({
    mutationFn: (payload: { kind: string; body?: string; personName?: string }) =>
      apiRequest("POST", "/api/prayer-intentions", payload),
    onSuccess: () => { setText(""); setName(""); setNote(""); invalidate(); },
  });
  const canAdd = addKind === "text" ? text.trim().length > 0 : name.trim().length > 0;
  const submitAdd = () => {
    if (!canAdd || addMut.isPending) return;
    addMut.mutate(addKind === "text"
      ? { kind: "text", body: text }
      : { kind: "person", personName: name, body: note });
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

  // ── Share sheet ──────────────────────────────────────────────────────────
  const [shareFor, setShareFor] = useState<Intention | null>(null);

  // ── Pray-through slideshow ───────────────────────────────────────────────
  const startedPraying = (() => {
    try { return new URLSearchParams(window.location.search).get("pray") === "1"; } catch { return false; }
  })();
  const [praying, setPraying] = useState(startedPraying);
  // Only show the slideshow when there's something to pray through — opening
  // ?pray=1 on an empty list just lands on the manage view to add items.
  if (praying && active.length > 0) {
    return (
      <PrayThrough
        intentions={active}
        bgPhoto={bgPhoto}
        onClose={() => { setPraying(false); setLocation("/intentions"); }}
        onFinish={() => { markPracticeDoneToday("prayer-list"); setPraying(false); setLocation("/dashboard"); }}
      />
    );
  }

  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex-1 rounded-full text-[13px] font-semibold py-2 transition-opacity active:scale-[0.98]"
      style={{ fontFamily: FONT, color: on ? WARM : SAGE, background: on ? `rgba(${RGB},0.32)` : "transparent", border: `1px solid rgba(${RGB},${on ? 0.5 : 0.22})` }}>
      {label}
    </button>
  );

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
          <div className="flex gap-2 mb-3">
            {pill(t("intentions.an_intention", { defaultValue: "An intention" }), addKind === "text", () => setAddKind("text"))}
            {pill(t("intentions.a_person", { defaultValue: "A person" }), addKind === "person", () => setAddKind("person"))}
          </div>
          {addKind === "person" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("intentions.name_ph", { defaultValue: "Their name" })}
              className="w-full rounded-xl px-3.5 py-2.5 mb-2 text-[15px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.25)` }} />
          )}
          <textarea value={addKind === "person" ? note : text} onChange={(e) => (addKind === "person" ? setNote : setText)(e.target.value)}
            placeholder={addKind === "person" ? t("intentions.note_ph", { defaultValue: "What are you praying for them? (optional)" }) : t("intentions.text_ph", { defaultValue: "What are you praying for?" })}
            rows={addKind === "person" ? 2 : 3}
            className="w-full rounded-xl px-3.5 py-2.5 text-[15px] outline-none resize-none"
            style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: `1px solid rgba(${RGB},0.25)` }} />
          <button type="button" onClick={submitAdd} disabled={!canAdd || addMut.isPending}
            className="w-full rounded-full mt-3 text-[14px] font-semibold py-2.5 transition-opacity active:scale-[0.98]"
            style={{ background: canAdd ? `rgba(${RGB},0.85)` : "rgba(255,255,255,0.08)", color: canAdd ? WARM : "rgba(240,237,230,0.4)", fontFamily: FONT, cursor: canAdd ? "pointer" : "default" }}>
            {t("intentions.add", { defaultValue: "Add to my list" })}
          </button>
        </div>

        {/* Active list */}
        {active.length > 0 && (
          <div className="space-y-2 mb-6">
            {active.map((it) => (
              <div key={it.id} className="rounded-2xl px-4 py-3" style={{ ...FROST, border: `1px solid rgba(${RGB},0.2)` }}>
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
                    <div className="flex items-start gap-2">
                      <span aria-hidden className="text-[15px] flex-shrink-0 mt-0.5">{it.kind === "person" ? "🙏" : "•"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium leading-snug" style={{ color: WARM, fontFamily: FONT, wordBreak: "break-word" }}>{headline(it)}</p>
                        {subline(it) && <p className="text-[13px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT, wordBreak: "break-word" }}>{subline(it)}</p>}
                        {it.shared && <p className="text-[11px] mt-1" style={{ color: `rgba(${RGB},0.95)`, fontFamily: FONT }}>✓ {t("intentions.shared", { defaultValue: "Shared — others are praying along" })}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      <RowBtn label={t("intentions.share", { defaultValue: "Share" })} emoji="📣" onClick={() => setShareFor(it)} />
                      <RowBtn label={t("intentions.answered", { defaultValue: "Answered" })} emoji="✓" onClick={() => patchMut.mutate({ id: it.id, answered: true })} />
                      <RowBtn label={t("common.edit", { defaultValue: "Edit" })} emoji="✎" onClick={() => startEdit(it)} />
                      <RowBtn label={t("common.delete", { defaultValue: "Delete" })} emoji="🗑" onClick={() => delMut.mutate(it.id)} />
                    </div>
                  </>
                )}
              </div>
            ))}
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

      {shareFor && (
        <ShareSheet
          intention={shareFor}
          onClose={() => setShareFor(null)}
          onShared={(reqId) => { patchMut.mutate({ id: shareFor.id, shared: true, sharedRequestId: reqId ?? null }); setShareFor(null); }}
        />
      )}
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

// ── Share sheet — post the intention to a community or your circle ─────────
function ShareSheet({ intention, onClose, onShared }: { intention: Intention; onClose: () => void; onShared: (reqId: number | null) => void }) {
  const { t } = useTranslation();
  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups") as Promise<{ groups: Group[] }>,
  });
  const groups = groupsData?.groups ?? [];
  const body = shareBody(intention);
  const [busy, setBusy] = useState(false);

  const requestIdFrom = (r: unknown): number | null => {
    const o = r as { id?: number; request?: { id?: number } } | null;
    return o?.request?.id ?? o?.id ?? null;
  };
  const shareTo = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { onShared(requestIdFrom(await fn())); }
    catch { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ background: "#0F2417", border: `1px solid rgba(${RGB},0.3)` }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.2)" }} />
        <p className="text-[16px] font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>{t("intentions.share_title", { defaultValue: "Ask others to pray along" })}</p>
        <p className="text-[13px] mb-4" style={{ color: SAGE, fontFamily: FONT }}>{t("intentions.share_sub", { defaultValue: "We'll post this so they can pray with you:" })}</p>
        <div className="rounded-xl px-3.5 py-3 mb-4" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid rgba(${RGB},0.2)` }}>
          <p className="text-[14px] italic" style={{ color: "#E8E4D8", fontFamily: "Georgia, serif" }}>{body}</p>
        </div>
        <div className="space-y-2">
          {groups.map((g) => (
            <button key={g.id} type="button" disabled={busy} onClick={() => shareTo(() => apiRequest("POST", `/api/groups/${g.slug}/prayer-requests`, { body, isAnonymous: false }))}
              className="w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-opacity active:scale-[0.99]"
              style={{ background: `rgba(${RGB},0.16)`, border: `1px solid rgba(${RGB},0.3)` }}>
              <span aria-hidden className="text-xl flex-shrink-0">{g.emoji || "🏘️"}</span>
              <span className="flex-1 min-w-0 text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{g.name}</span>
              <span aria-hidden style={{ color: `rgba(${RGB},0.7)` }}>›</span>
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => shareTo(() => apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: 7 }))}
            className="w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-opacity active:scale-[0.99]"
            style={{ background: `rgba(${RGB},0.16)`, border: `1px solid rgba(${RGB},0.3)` }}>
            <span aria-hidden className="text-xl flex-shrink-0">🤲</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{t("intentions.share_circle", { defaultValue: "My circle" })}</span>
              <span className="block text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>{t("intentions.share_circle_sub", { defaultValue: "The people who pray for you" })}</span>
            </span>
            <span aria-hidden style={{ color: `rgba(${RGB},0.7)` }}>›</span>
          </button>
        </div>
        <button type="button" onClick={onClose} className="w-full text-center text-[13px] mt-4 py-2" style={{ color: SAGE, fontFamily: FONT }}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
      </div>
    </div>
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
  const next = () => { if (i >= total - 1) { onFinish(); return; } setI((n) => n + 1); };
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
        <button type="button" onClick={next} className="active:scale-[0.97]" style={{ background: `rgba(${RGB},0.85)`, color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600, borderRadius: 999, padding: "11px 26px" }}>
          {i >= total - 1 ? t("common.done", { defaultValue: "Done" }) : t("common.next", { defaultValue: "Next" })} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
