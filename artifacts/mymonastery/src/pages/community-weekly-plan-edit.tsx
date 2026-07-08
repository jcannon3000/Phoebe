/**
 * Community → Edit this week's plan (NOT YET PUBLIC — behind WEEKLY_PLAN_ENABLED).
 *
 * Admin/clergy composer: pick a kind (CAC newsletter, Co-Breathe, silence,
 * podcast, or a custom item), give it a title, and save. Saving replaces the
 * WHOLE week's checklist for this community (server: PUT is replace-all,
 * keeping completions for any item whose id survives).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.3)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Kind = "cac" | "cobreathe" | "silence" | "podcast" | "custom";
const KIND_PRESETS: Array<{ kind: Kind; emoji: string; label: string; defaultTitle: string }> = [
  { kind: "cac", emoji: "🌅", label: "CAC newsletter", defaultTitle: "Read one CAC Daily Meditation" },
  { kind: "cobreathe", emoji: "🌍", label: "Co-Breathe", defaultTitle: "Co-Breathe once" },
  { kind: "silence", emoji: "🕯️", label: "Silence", defaultTitle: "Sit in silence for 10 minutes" },
  { kind: "podcast", emoji: "🎙️", label: "Podcast", defaultTitle: "Listen to one podcast episode" },
  { kind: "custom", emoji: "🌿", label: "Custom", defaultTitle: "" },
];

type DraftItem = { id: number | null; kind: Kind; title: string; detail: string; target: number };
type ServerItem = { id: number; kind: string; title: string; detail: string | null; target: number };

function thisWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}

export default function CommunityWeeklyPlanEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const weekStart = useMemo(() => thisWeekStart(), []);

  useEffect(() => {
    if (!WEEKLY_PLAN_ENABLED) setLocation(`/communities/${slug}`, { replace: true });
  }, [slug, setLocation]);

  const { data, isLoading, isError } = useQuery<{ items: ServerItem[] }>({
    queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/weekly-plan?weekStart=${weekStart}`),
    enabled: WEEKLY_PLAN_ENABLED,
  });

  const [items, setItems] = useState<DraftItem[] | null>(null);
  // Seed the draft from the loaded week ONCE — after that, local edits win
  // (don't let a background refetch stomp what the admin is mid-typing).
  useEffect(() => {
    if (items === null && data?.items) {
      setItems(data.items.map((i) => ({ id: i.id, kind: (i.kind as Kind) ?? "custom", title: i.title, detail: i.detail ?? "", target: i.target })));
    }
  }, [data, items]);
  const draft = items ?? [];

  const addItem = (kind: Kind) => {
    const preset = KIND_PRESETS.find((p) => p.kind === kind)!;
    setItems([...(items ?? []), { id: null, kind, title: preset.defaultTitle, detail: "", target: 1 }]);
  };
  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems(draft.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    setItems(draft.filter((_, i) => i !== idx));
  };

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/groups/${slug}/weekly-plan`, {
      weekStart,
      items: draft.filter((it) => it.title.trim()).map((it) => ({
        id: it.id, kind: it.kind, title: it.title.trim(), detail: it.detail.trim() || undefined, target: it.target,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] });
      setLocation(`/communities/${slug}/weekly-plan`);
    },
  });

  if (!WEEKLY_PLAN_ENABLED) return null;

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

        {isError ? (
          <p className="text-[13px]" style={{ color: "#C47A65", fontFamily: FONT }}>You need to be a leader of this community to edit this.</p>
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
                          placeholder="What should they do?"
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

            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || draft.filter((it) => it.title.trim()).length === 0}
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
