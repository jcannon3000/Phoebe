/**
 * Weekly-plan PDF reader — /communities/:slug/weekly-plan/read/:itemId
 * (behind WEEKLY_PLAN_ENABLED). An office-dark reader for a leader-attached
 * PDF: pages rendered by pdf.js as vertically-scrolled canvases (iOS WebKit
 * only shows an <iframe>'d PDF's first page, so canvases from day one),
 * rendered lazily near the viewport. The fixed bottom pill — "Done reading" —
 * is enabled from the first moment (no scroll policing; that's homework, not
 * prayer) and completes the item.
 *
 * pdf.js is lazy-imported in THIS chunk only (~1 MB — it must never ride the
 * main bundle).
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";
import { thisWeekStart, type WeeklyItemPayload } from "@/lib/weeklyDeck";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ServerItem = { id: number; kind: string; title: string; payload: WeeklyItemPayload | null; done: boolean };

export default function CommunityWeeklyPlanReadPage() {
  const { slug, itemId } = useParams<{ slug: string; itemId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const weekStart = thisWeekStart();
  const backTo = `/communities/${slug}/weekly-plan`;

  useEffect(() => {
    if (!WEEKLY_PLAN_ENABLED) setLocation(`/communities/${slug}`, { replace: true });
  }, [slug, setLocation]);

  const { data } = useQuery<{ items: ServerItem[] }>({
    queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/weekly-plan?weekStart=${weekStart}`),
    enabled: WEEKLY_PLAN_ENABLED,
  });
  const item = data?.items.find((i) => i.id === Number(itemId) && i.kind === "pdf");
  const pdfId = item && item.payload && "pdfId" in item.payload ? item.payload.pdfId : null;

  const complete = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/weekly-plan/complete`, { itemId: Number(itemId), done: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/weekly-plan`, weekStart] });
      window.setTimeout(() => setLocation(backTo), 600);
    },
  });

  // ── pdf.js render — lazy pages near the viewport ────────────────────────
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const pdfUrl = pdfId != null ? `/api/groups/${slug}/weekly-plan/pdf/${pdfId}` : null;

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url: pdfUrl, withCredentials: true }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const holder = holderRef.current;
        if (!holder) return;
        holder.innerHTML = "";
        const rendered = new Set<number>();
        const canvases: HTMLCanvasElement[] = [];

        const renderPage = async (n: number, canvas: HTMLCanvasElement) => {
          if (rendered.has(n)) return;
          rendered.add(n);
          const page = await doc.getPage(n);
          const containerW = holder.clientWidth;
          const base = page.getViewport({ scale: 1 });
          const scale = (containerW / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        };

        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const n = Number((e.target as HTMLElement).dataset.page);
            void renderPage(n, e.target as HTMLCanvasElement);
            io.unobserve(e.target);
          }
        }, { rootMargin: "600px 0px" });

        for (let n = 1; n <= doc.numPages; n++) {
          const canvas = document.createElement("canvas");
          canvas.dataset.page = String(n);
          // Reserve rough height so the scrollbar doesn't jump as pages render.
          canvas.style.minHeight = "40vh";
          canvas.style.display = "block";
          canvas.style.background = "#FFFFFF";
          canvas.style.borderRadius = "12px";
          canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.4)";
          canvas.style.marginBottom = "16px";
          holder.appendChild(canvas);
          canvases.push(canvas);
          io.observe(canvas);
        }
        cleanup = () => { io.disconnect(); void doc.cleanup(); };
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [pdfUrl]);

  if (!WEEKLY_PLAN_ENABLED) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0C1F12", display: "flex", flexDirection: "column" }}>
      {/* Sticky top bar. */}
      <div className="flex items-center gap-2 px-4 shrink-0" style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))", paddingBottom: 10, borderBottom: "1px solid rgba(46,107,64,0.25)" }}>
        <button type="button" onClick={() => setLocation(backTo)} aria-label="Back" className="inline-flex items-center gap-1 text-[14px]" style={{ color: SAGE, fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}>
          <ChevronLeft size={16} />
        </button>
        <p className="text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>
          {item?.title ?? "Reading"}
        </p>
      </div>

      {/* Pages. */}
      <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: 120, WebkitOverflowScrolling: "touch" }}>
        {error ? (
          <div className="text-center pt-16">
            <p className="text-[14px] mb-4" style={{ color: SAGE, fontFamily: FONT }}>Couldn't display this PDF here.</p>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] underline" style={{ color: WARM, fontFamily: FONT }}>
                Open in browser
              </a>
            )}
          </div>
        ) : (
          <>
            <div ref={holderRef} className="max-w-2xl mx-auto" />
            {pageCount === null && (
              <p className="text-[13px] text-center pt-16" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Opening…</p>
            )}
            {pageCount !== null && pdfUrl && (
              <p className="text-center pb-4">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[12px]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                  Open in browser
                </a>
              </p>
            )}
          </>
        )}
      </div>

      {/* "Done reading" — enabled from the first moment (grace, not homework). */}
      <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}>
        <button
          type="button"
          onClick={() => complete.mutate()}
          disabled={complete.isPending || complete.isSuccess || !!item?.done}
          className="rounded-full py-3 px-10 transition-opacity active:scale-[0.99]"
          style={{
            background: complete.isSuccess || item?.done ? "rgba(143,175,150,0.85)" : "rgba(46,107,64,0.85)",
            backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
            border: "1px solid rgba(168,197,160,0.5)", color: complete.isSuccess || item?.done ? "#0C1F12" : WARM,
            fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          {complete.isSuccess || item?.done ? "✓ Kept" : complete.isPending ? "…" : "Done reading"}
        </button>
      </div>
    </div>
  );
}
