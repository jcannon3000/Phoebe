/**
 * Community → This week's plan (NOT YET PUBLIC — behind WEEKLY_PLAN_ENABLED).
 *
 * A church programs a short checklist of practices to keep between Sundays
 * (read one CAC meditation, Co-Breathe once, sit in silence for 10 minutes,
 * listen to a podcast episode). Members see the week's items here and tap
 * them done. Leaders reach the composer (community-weekly-plan-edit.tsx) via
 * the "Edit this week's plan" pill, shown only to admins.
 */
import { useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useEffect } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Item = {
  id: number;
  kind: string;
  title: string;
  detail: string | null;
  target: number;
  done: boolean;
  doneCount: number;
};

const KIND_EMOJI: Record<string, string> = {
  cac: "🌅",
  cobreathe: "🌍",
  silence: "🕯️",
  podcast: "🎙️",
  custom: "🌿",
};

// This week's Sunday, local calendar day (YYYY-MM-DD) — same convention the
// server stores week_start as.
function thisWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}

export default function CommunityWeeklyPlanPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const weekStart = useMemo(() => thisWeekStart(), []);

  useEffect(() => {
    if (!WEEKLY_PLAN_ENABLED) setLocation(`/communities/${slug}`, { replace: true });
  }, [slug, setLocation]);

  const { data, isLoading, isError } = useQuery<{ items: Item[]; isAdmin: boolean }>({
    queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/weekly-plan?weekStart=${weekStart}`),
    enabled: WEEKLY_PLAN_ENABLED,
  });

  const toggle = useMutation({
    mutationFn: ({ itemId, done }: { itemId: number; done: boolean }) =>
      apiRequest("POST", `/api/groups/${slug}/weekly-plan/complete`, { itemId, done }),
    // Optimistic — the tap should feel instant, same as any other checklist in the app.
    onMutate: async ({ itemId, done }) => {
      await qc.cancelQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] });
      const prev = qc.getQueryData<{ items: Item[]; isAdmin: boolean }>([`/api/groups/${slug}/weekly-plan`, weekStart]);
      if (prev) {
        qc.setQueryData([`/api/groups/${slug}/weekly-plan`, weekStart], {
          ...prev,
          items: prev.items.map((i) => i.id === itemId ? { ...i, done, doneCount: i.doneCount + (done ? 1 : -1) } : i),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData([`/api/groups/${slug}/weekly-plan`, weekStart], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] }),
  });

  if (!WEEKLY_PLAN_ENABLED) return null;

  const items = data?.items ?? [];
  const doneN = items.filter((i) => i.done).length;

  return (
    <Layout bgPhoto={leafBg}>
      <div className="max-w-2xl mx-auto w-full pb-20">
        <button onClick={() => setLocation(`/communities/${slug}`)} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> Community
        </button>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>📋</span>
              <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT }}>This week's plan</h1>
            </div>
            <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>
              {items.length > 0 ? `${doneN} of ${items.length} kept this week` : "What your community is holding together, Sunday to Sunday."}
            </p>
          </div>
          {data?.isAdmin && (
            <Link href={`/communities/${slug}/weekly-plan/edit`} className="shrink-0 rounded-full text-[12px] font-semibold px-3 py-2"
              style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}>
              Edit
            </Link>
          )}
        </div>

        {isError ? (
          <p className="text-[13px]" style={{ color: "#C47A65", fontFamily: FONT }}>You need to be a member of this community to see this.</p>
        ) : isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(9,26,16,0.42)" }} />)}</div>
        ) : items.length === 0 ? (
          <p className="text-[14px] leading-relaxed mt-8 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
            {data?.isAdmin ? "Nothing planned yet — tap Edit to add this week's practices." : "Your leaders haven't planned this week yet."}
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle.mutate({ itemId: item.id, done: !item.done })}
              className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-2 text-left transition-opacity active:scale-[0.99]"
              style={{
                background: item.done ? "rgba(46,107,64,0.16)" : "rgba(9,26,16,0.42)",
                backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                border: `1px solid ${item.done ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.3)"}`,
              }}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: item.done ? "rgba(46,107,64,0.9)" : "rgba(46,107,64,0.15)", border: `1px solid ${item.done ? "rgba(46,107,64,0.9)" : "rgba(143,175,150,0.3)"}` }}
              >
                {item.done ? <Check size={15} color={WARM} /> : <span aria-hidden style={{ fontSize: 13 }}>{KIND_EMOJI[item.kind] ?? "🌿"}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-semibold" style={{ color: item.done ? "rgba(220,232,214,0.75)" : WARM, fontFamily: FONT, textDecoration: item.done ? "line-through" : "none", textDecorationColor: "rgba(220,232,214,0.4)" }}>
                  {item.title}
                </p>
                {item.detail?.trim() && (
                  <p className="text-[12px] mt-0.5" style={{ color: "rgba(143,175,150,0.65)", fontFamily: FONT }}>{item.detail.trim()}</p>
                )}
              </div>
              {item.doneCount > 0 && (
                <span className="text-[11px] shrink-0" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                  {item.doneCount} kept
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </Layout>
  );
}
