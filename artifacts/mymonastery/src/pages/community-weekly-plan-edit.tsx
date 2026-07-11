/**
 * Community → Edit this week's plan (NOT YET PUBLIC — behind WEEKLY_PLAN_ENABLED).
 *
 * Admin/clergy composer: pick a kind (CAC newsletter, Co-Breathe, silence,
 * podcast, or a custom item — plus the leader-AUTHORED kinds: a PDF reading,
 * a mini-slideshow, a podcast episode by link), give it a title, and save.
 * Saving replaces the WHOLE week's checklist for this community (server: PUT
 * is replace-all, keeping completions for any item whose id survives).
 *
 * Content strips:
 *   pdf     — attach → eager raw upload (progress %) → frosted chip
 *   deck    — "Edit slides" → full-screen SlideDeckEditor (≤7 slides)
 *   episode — paste a link → server resolve (Apple / RSS / MP3) → preview card
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";
import { SlideDeckEditor } from "@/components/SlideDeckEditor";
import {
  thisWeekStart,
  deckByline,
  type WeeklyDeckSlide,
  type WeeklyEpisodeSnapshot,
  type WeeklyItemPayload,
} from "@/lib/weeklyDeck";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.3)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const RED = "#C47A65";

type Kind = "cac" | "cobreathe" | "silence" | "podcast" | "custom" | "pdf" | "deck" | "episode";
const KIND_PRESETS: Array<{ kind: Kind; emoji: string; label: string; defaultTitle: string }> = [
  { kind: "cac", emoji: "🌅", label: "CAC newsletter", defaultTitle: "Read one CAC Daily Meditation" },
  { kind: "cobreathe", emoji: "🌍", label: "Co-Breathe", defaultTitle: "Co-Breathe once" },
  { kind: "silence", emoji: "🕯️", label: "Silence", defaultTitle: "Sit in silence for 10 minutes" },
  { kind: "podcast", emoji: "🎙️", label: "Podcast", defaultTitle: "Listen to one podcast episode" },
  { kind: "custom", emoji: "🌿", label: "Custom", defaultTitle: "" },
  // Leader-authored content kinds.
  { kind: "pdf", emoji: "📄", label: "Reading (PDF)", defaultTitle: "Read this week's handout" },
  { kind: "deck", emoji: "🎞️", label: "Slides", defaultTitle: "" },
  { kind: "episode", emoji: "🎧", label: "Episode", defaultTitle: "" },
];

type DraftItem = {
  id: number | null; kind: Kind; title: string; detail: string; target: number;
  payload: WeeklyItemPayload | null;
  // pdf strip state (device-only, not saved)
  uploading?: number | null; uploadError?: string | null;
  // episode strip state
  episodeUrl?: string; resolving?: boolean; resolveError?: string | null;
  episodeChoices?: WeeklyEpisodeSnapshot[] | null;
};
type ServerItem = { id: number; kind: string; title: string; detail: string | null; target: number; payload: WeeklyItemPayload | null };

const PDF_MAX = 8 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function CommunityWeeklyPlanEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const weekStart = useMemo(() => thisWeekStart(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPdfIdxRef = useRef<number | null>(null);
  const [editingDeckIdx, setEditingDeckIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!WEEKLY_PLAN_ENABLED) setLocation(`/communities/${slug}`, { replace: true });
  }, [slug, setLocation]);

  const { data, isLoading, isError } = useQuery<{ items: ServerItem[]; isAdmin?: boolean }>({
    queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/weekly-plan?weekStart=${weekStart}`),
    enabled: WEEKLY_PLAN_ENABLED,
  });
  const { data: groupData } = useQuery<{ group?: { name?: string } }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: WEEKLY_PLAN_ENABLED && !!slug,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (data && data.isAdmin === false) setLocation(`/communities/${slug}/weekly-plan`, { replace: true });
  }, [data, slug, setLocation]);

  const [items, setItems] = useState<DraftItem[] | null>(null);
  useEffect(() => {
    if (items === null && data?.items) {
      setItems(data.items.map((i) => ({
        id: i.id, kind: (i.kind as Kind) ?? "custom", title: i.title, detail: i.detail ?? "",
        target: i.target, payload: i.payload ?? null,
      })));
    }
  }, [data, items]);
  const draft = items ?? [];

  const addItem = (kind: Kind) => {
    const preset = KIND_PRESETS.find((p) => p.kind === kind)!;
    setItems([...(items ?? []), { id: null, kind, title: preset.defaultTitle, detail: "", target: 1, payload: null }]);
  };
  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((cur) => (cur ?? []).map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    setItems(draft.filter((_, i) => i !== idx));
  };

  // ── PDF upload — eager, raw body, with progress (XHR for the % events). ──
  const startPdfUpload = (idx: number, file: File) => {
    if (file.size > PDF_MAX) {
      updateItem(idx, { uploadError: "This PDF is over 8 MB. Try exporting it at a lower quality, or split it in two." });
      return;
    }
    updateItem(idx, { uploading: 0, uploadError: null });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/groups/${slug}/weekly-plan/pdf?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) updateItem(idx, { uploading: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText) as { pdfId: number; filename: string; byteSize: number; pageCount: number | null };
          updateItem(idx, {
            uploading: null,
            payload: { pdfId: r.pdfId, filename: r.filename, pageCount: r.pageCount, byteSize: r.byteSize },
          });
          return;
        } catch { /* fall through */ }
      }
      updateItem(idx, {
        uploading: null,
        uploadError: xhr.status === 415
          ? "That file isn't a PDF — Phoebe can only attach PDFs here."
          : "Couldn't upload — check your connection and try again. Your other edits are safe.",
      });
    };
    xhr.onerror = () => updateItem(idx, { uploading: null, uploadError: "Couldn't upload — check your connection and try again. Your other edits are safe." });
    xhr.send(file);
  };

  // ── Episode resolution. ───────────────────────────────────────────────────
  const resolveEpisode = async (idx: number, url: string) => {
    if (!url.trim()) return;
    updateItem(idx, { resolving: true, resolveError: null, episodeChoices: null });
    try {
      const r = await apiRequest("POST", `/api/groups/${slug}/weekly-plan/resolve-episode`, { url: url.trim() }) as
        { episode?: WeeklyEpisodeSnapshot; episodes?: WeeklyEpisodeSnapshot[] };
      if (r.episode) {
        setItems((cur) => (cur ?? []).map((it, i) => i === idx
          ? { ...it, resolving: false, payload: { episode: r.episode! }, title: it.title.trim() || `Listen: ${r.episode!.title}` }
          : it));
      } else if (r.episodes && r.episodes.length > 0) {
        updateItem(idx, { resolving: false, episodeChoices: r.episodes });
      } else {
        updateItem(idx, { resolving: false, resolveError: "Couldn't find an episode at that link." });
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      updateItem(idx, {
        resolving: false,
        resolveError: msg.includes("Spotify")
          ? msg
          : "Couldn't find an episode at that link. Phoebe can fetch Apple Podcasts episodes, RSS feeds, and direct MP3 links.",
      });
    }
  };

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/groups/${slug}/weekly-plan`, {
      weekStart,
      items: draft.filter((it) => it.title.trim()).map((it) => ({
        id: it.id, kind: it.kind, title: it.title.trim(), detail: it.detail.trim() || undefined, target: it.target,
        payload: it.payload ?? undefined,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] });
      setLocation(`/communities/${slug}/weekly-plan`);
    },
  });
  const saveFailed = save.isError;

  // Blockers named inline so the Save button can explain itself.
  const blocker = ((): string | null => {
    for (const it of draft) {
      if (!it.title.trim()) continue; // silently dropped, as before
      if (it.kind === "pdf" && !it.payload) return "Attach the PDF (or remove the reading) before saving.";
      if (it.kind === "deck" && (!it.payload || !("slides" in it.payload) || it.payload.slides.length === 0)) return "This slides item is empty — add at least one slide or remove it.";
      if (it.kind === "episode" && !it.payload) return "Fetch the episode before saving.";
      if (it.uploading != null) return "A PDF is still uploading…";
    }
    return null;
  })();

  if (!WEEKLY_PLAN_ENABLED) return null;

  // Full-screen slides editor.
  if (editingDeckIdx !== null && draft[editingDeckIdx]) {
    const it = draft[editingDeckIdx]!;
    const slides = it.payload && "slides" in it.payload ? it.payload.slides : [];
    return (
      <SlideDeckEditor
        title={it.title}
        groupName={groupData?.group?.name ?? null}
        initialSlides={slides}
        onDone={(next: WeeklyDeckSlide[]) => {
          updateItem(editingDeckIdx, { payload: next.length > 0 ? { slides: next } : null });
          setEditingDeckIdx(null);
        }}
      />
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <button onClick={() => setLocation(`/communities/${slug}/weekly-plan`)} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> This week's plan
        </button>
        <div className="mb-5">
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT }}>Plan this week</h1>
          <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>
            What should your community keep between Sundays? Pick a few practices — members will see this as a checklist.
          </p>
        </div>

        {/* Hidden file input shared by every pdf strip. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            const idx = pendingPdfIdxRef.current;
            e.target.value = "";
            if (file && idx !== null) startPdfUpload(idx, file);
            pendingPdfIdxRef.current = null;
          }}
        />

        {isError ? (
          <p className="text-[13px]" style={{ color: RED, fontFamily: FONT }}>You need to be a leader of this community to edit this.</p>
        ) : isLoading && items === null ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: CARD }} />)}</div>
        ) : (
          <>
            <div className="space-y-2 mb-5">
              {draft.map((it, idx) => {
                const preset = KIND_PRESETS.find((p) => p.kind === it.kind);
                return (
                  <div key={idx} className="rounded-2xl px-4 py-3.5" style={{ background: CARD, border: `1px solid ${CARD_B}` }}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg shrink-0 mt-0.5" aria-hidden>{preset?.emoji ?? "🌿"}</span>
                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          value={it.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                          placeholder={it.kind === "deck" ? "Name the slideshow" : it.kind === "episode" ? "Title (auto-fills from the episode)" : "What should they do?"}
                          className="w-full bg-transparent outline-none text-[14.5px] font-semibold"
                          style={{ color: WARM, fontFamily: FONT, border: "none" }}
                        />
                        <input
                          value={it.detail}
                          onChange={(e) => updateItem(idx, { detail: e.target.value })}
                          placeholder="Optional note (a link, a chapter, a reminder)"
                          className="w-full bg-transparent outline-none text-[12.5px]"
                          style={{ color: "rgba(200,212,192,0.75)", fontFamily: FONT, border: "none" }}
                        />

                        {/* ── PDF strip ── */}
                        {it.kind === "pdf" && (
                          <div>
                            {it.payload && "pdfId" in it.payload ? (
                              <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(46,107,64,0.18)", border: `1px solid ${CARD_B}` }}>
                                <span className="text-[12.5px]" style={{ color: WARM, fontFamily: FONT }}>
                                  {it.payload.filename}{it.payload.pageCount ? ` · ${it.payload.pageCount} pages` : ""} · {mb(it.payload.byteSize)}
                                </span>
                                <button type="button" onClick={() => updateItem(idx, { payload: null })} aria-label="Detach PDF" style={{ color: SAGE_DIM, background: "none", border: "none", cursor: "pointer" }}>✕</button>
                              </div>
                            ) : it.uploading != null ? (
                              <div className="rounded-xl px-3 py-2.5" style={{ border: `1px solid ${CARD_B}` }}>
                                <p className="text-[12px] mb-1.5" style={{ color: SAGE, fontFamily: FONT, margin: 0 }}>Uploading… {it.uploading}%</p>
                                <div style={{ height: 3, borderRadius: 2, background: "rgba(46,107,64,0.25)" }}>
                                  <div style={{ height: 3, borderRadius: 2, width: `${it.uploading}%`, background: "#6FAF85", transition: "width 0.2s" }} />
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { pendingPdfIdxRef.current = idx; fileInputRef.current?.click(); }}
                                className="w-full rounded-xl py-2.5 text-left px-3"
                                style={{ border: `1px dashed ${CARD_B}`, background: "transparent", cursor: "pointer" }}
                              >
                                <span className="text-[13px] font-semibold block" style={{ color: WARM, fontFamily: FONT }}>Attach a PDF</span>
                                <span className="text-[11px] block mt-0.5" style={{ color: SAGE_DIM, fontFamily: FONT }}>Up to 8 MB · study guides, orders of prayer, handouts</span>
                              </button>
                            )}
                            {it.uploadError && <p className="text-[12px] mt-1.5" style={{ color: RED, fontFamily: FONT }}>{it.uploadError}</p>}
                            {!it.payload && (
                              <p className="text-[10.5px] mt-1.5" style={{ color: SAGE_DIM, fontFamily: FONT }}>Only upload what your church has permission to share.</p>
                            )}
                          </div>
                        )}

                        {/* ── Slides strip ── */}
                        {it.kind === "deck" && (
                          <button
                            type="button"
                            onClick={() => setEditingDeckIdx(idx)}
                            className="rounded-xl py-2.5 px-3 text-[13px] font-semibold"
                            style={{ border: `1px dashed ${CARD_B}`, background: "transparent", color: WARM, fontFamily: FONT, cursor: "pointer" }}
                          >
                            {it.payload && "slides" in it.payload && it.payload.slides.length > 0
                              ? `Edit slides (${it.payload.slides.length}) — ${deckByline(it.payload.slides.length)}`
                              : "Edit slides"}
                          </button>
                        )}

                        {/* ── Episode strip ── */}
                        {it.kind === "episode" && (
                          <div>
                            {it.payload && "episode" in it.payload ? (
                              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(46,107,64,0.18)", border: `1px solid ${CARD_B}` }}>
                                {it.payload.episode.imageUrl && (
                                  <img src={it.payload.episode.imageUrl} alt="" className="rounded-lg shrink-0 object-cover" style={{ width: 44, height: 44 }} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>{it.payload.episode.title}</p>
                                  <p className="text-[11.5px] truncate" style={{ color: SAGE, fontFamily: FONT, margin: 0 }}>
                                    {[it.payload.episode.showTitle, it.payload.episode.durationSeconds ? `${Math.round(it.payload.episode.durationSeconds / 60)} min` : null].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <button type="button" onClick={() => updateItem(idx, { payload: null, episodeChoices: null })} aria-label="Clear episode" style={{ color: SAGE_DIM, background: "none", border: "none", cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <>
                                <div className="flex gap-2">
                                  <input
                                    value={it.episodeUrl ?? ""}
                                    onChange={(e) => updateItem(idx, { episodeUrl: e.target.value })}
                                    onPaste={(e) => {
                                      const text = e.clipboardData.getData("text");
                                      if (text) { updateItem(idx, { episodeUrl: text }); void resolveEpisode(idx, text); }
                                    }}
                                    placeholder="Paste an episode link — Apple Podcasts, an RSS feed, or an MP3"
                                    inputMode="url"
                                    className="flex-1 rounded-xl px-3 py-2 text-[13px] outline-none"
                                    style={{ background: "rgba(9,26,16,0.5)", border: `1px solid ${CARD_B}`, color: WARM, fontFamily: FONT }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void resolveEpisode(idx, it.episodeUrl ?? "")}
                                    disabled={!!it.resolving}
                                    className="rounded-xl px-3.5 text-[13px] font-semibold shrink-0 disabled:opacity-50"
                                    style={{ background: "rgba(46,107,64,0.3)", color: WARM, border: `1px solid ${CARD_B}`, fontFamily: FONT, cursor: "pointer" }}
                                  >
                                    {it.resolving ? "…" : "Fetch"}
                                  </button>
                                </div>
                                {it.resolving && <p className="text-[12px] mt-1.5" style={{ color: SAGE, fontFamily: FONT }}>Looking it up…</p>}
                                {it.resolveError && <p className="text-[12px] mt-1.5" style={{ color: RED, fontFamily: FONT }}>{it.resolveError}</p>}
                                {it.episodeChoices && it.episodeChoices.length > 0 && (
                                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${CARD_B}` }}>
                                    <p className="text-[11px] uppercase tracking-[0.14em] font-semibold px-3 pt-2 pb-1" style={{ color: SAGE_DIM, fontFamily: FONT, margin: 0 }}>Which episode?</p>
                                    {it.episodeChoices.map((ep, epIdx) => (
                                      <button
                                        key={epIdx}
                                        type="button"
                                        onClick={() => setItems((cur) => (cur ?? []).map((x, i) => i === idx
                                          ? { ...x, payload: { episode: ep }, episodeChoices: null, title: x.title.trim() || `Listen: ${ep.title}` }
                                          : x))}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                                        style={{ background: "transparent", border: "none", borderTop: epIdx === 0 ? "none" : "1px solid rgba(46,107,64,0.15)", cursor: "pointer" }}
                                      >
                                        {ep.imageUrl && <img src={ep.imageUrl} alt="" className="rounded shrink-0 object-cover" style={{ width: 32, height: 32 }} />}
                                        <span className="text-[12.5px] flex-1 min-w-0 truncate" style={{ color: WARM, fontFamily: FONT }}>{ep.title}</span>
                                        {ep.durationSeconds && <span className="text-[11px] shrink-0" style={{ color: SAGE_DIM, fontFamily: FONT }}>{Math.round(ep.durationSeconds / 60)} min</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className="shrink-0 text-[13px] px-1.5" style={{ color: SAGE_DIM }}>✕</button>
                    </div>
                  </div>
                );
              })}
              {draft.length === 0 && (
                <p className="text-[13px] text-center py-6" style={{ color: SAGE_DIM, fontFamily: FONT }}>Nothing yet — add a practice below.</p>
              )}
            </div>

            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: SAGE_DIM, fontFamily: FONT }}>Add a practice</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {KIND_PRESETS.map((p) => (
                <button
                  key={p.kind}
                  type="button"
                  onClick={() => addItem(p.kind)}
                  className="rounded-full text-[13px] font-medium px-3.5 py-2 transition-opacity active:scale-[0.97]"
                  style={{ background: "rgba(46,107,64,0.16)", color: WARM, border: `1px solid ${CARD_B}`, fontFamily: FONT }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>

            {saveFailed && (
              <p className="text-[12.5px] mb-2" style={{ color: RED, fontFamily: FONT }}>
                Couldn't save — check the items above and try again. Your edits are still here.
              </p>
            )}
            {blocker && (
              <p className="text-[12.5px] mb-2" style={{ color: SAGE, fontFamily: FONT }}>{blocker}</p>
            )}
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || blocker !== null || draft.filter((it) => it.title.trim()).length === 0}
              className="w-full rounded-2xl flex items-center justify-center gap-2 transition-opacity active:scale-[0.99] disabled:opacity-50"
              style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 15, padding: "14px 20px", border: "1px solid rgba(46,107,64,0.6)" }}
            >
              {save.isPending ? "Saving…" : "Save this week's plan"}
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
