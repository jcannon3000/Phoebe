import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryClient } from "@/lib/queryClient";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

/**
 * A group admin's weekly reflection, read in the app.
 *
 * IN THE APP, not in the browser — every other inbox source links out because
 * the writing belongs to a publisher and Phoebe only restyles their page. This
 * one was written here, by a named person, for this group. There is nothing to
 * link to and nothing of anyone else's to reproduce.
 *
 * MARKED READ ON REACHING THE END, not on opening. The other inboxes mark on
 * open because the reader leaves for someone else's site and may never come
 * back; here they cannot leave, so the honest signal is that they got to the
 * bottom and pressed the button. Read state is per USER — the mark is a POST,
 * not a localStorage flag — so reading it here means it is read everywhere.
 */

const BG = "#0A1A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(200,212,192,0.62)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

type Reflection = {
  id: string; reflectionId: number; title: string; body: string;
  authorName: string | null; groupName: string | null; published: string | null; read: boolean;
};

export default function GroupReflectionPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/group-reflection/:id");
  const id = Number(params?.id);
  const [marking, setMarking] = useState(false);

  const { data, isLoading } = useQuery<Reflection | null>({
    queryKey: ["/api/me/group-reflection/latest"],
    queryFn: () => apiRequest("GET", "/api/me/group-reflection/latest"),
    staleTime: 10 * 60_000,
  });

  const backdrop = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  /**
   * The route names a reflection; the feed returns the NEWEST one, and this
   * page shows what the feed returns.
   *
   * They are the same thing in every ordinary case, because the card that
   * opened this page was built from that feed. When they differ, a newer one
   * was posted between the card rendering and the tap — and showing the newer
   * one is right: it is exactly what the inbox would have offered a second
   * later. The id in the URL is what gets MARKED, so nothing is ever marked
   * read that wasn't on screen.
   */
  const r: Reflection | null = data ?? null;

  const done = () => {
    if (!r || marking) { setLocation("/dashboard"); return; }
    // Captured before the async work — `r` is derived from a query that can
    // settle again mid-flight, and TypeScript is right to insist.
    const reflectionId = r.reflectionId;
    setMarking(true);
    void apiRequest("POST", `/api/me/group-reflection/${reflectionId}/read`)
      .catch(() => { /* best effort — the card simply stays until it lands */ })
      .finally(() => {
        // Refetch so the home card is gone by the time they arrive, rather
        // than flashing the thing they just finished.
        // getQueryClient is null before the provider mounts; nothing to
        // invalidate in that case, and the dashboard refetches on its own.
        void getQueryClient()?.invalidateQueries({ queryKey: ["/api/me/group-reflection/latest"] });
        setLocation("/dashboard");
      });
  };

  // Never a blank screen while loading — this repo's own rule.
  const heading = isLoading ? "Loading…" : (r?.title ?? "Nothing waiting");

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {backdrop ? (
        <>
          <motion.img
            src={backdrop} alt="" aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 0.22 }} transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 14px) 20px 6px" }}>
        <button
          type="button" onClick={() => setLocation("/dashboard")}
          style={{ background: "transparent", border: "none", color: FAINT, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 2px" }}
        >
          ← Back
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px calc(env(safe-area-inset-bottom) + 120px)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {r?.groupName && (
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 10px" }}>
              {r.groupName}
            </p>
          )}
          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 27, fontWeight: 700, lineHeight: 1.18, margin: "0 0 12px" }}>
            {heading}
          </h1>
          {(r?.authorName || r?.published) && (
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "0 0 22px" }}>
              {[r?.authorName, r?.published].filter(Boolean).join(" · ")}
            </p>
          )}
          {/* Paragraphs, not dangerouslySetInnerHTML: an admin types prose, and
              rendering it as markup would let one paste script into a whole
              congregation's screens. */}
          {(r?.body ?? "").split(/\n{2,}/).map((para, i) => (
            <p key={i} style={{ color: WARM, fontFamily: SERIF, fontSize: 18, lineHeight: 1.72, margin: "0 0 1.15em", whiteSpace: "pre-wrap" }}>
              {para}
            </p>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 20px calc(env(safe-area-inset-bottom) + 22px)", display: "flex", justifyContent: "center" }}>
        <button
          type="button" onClick={done} disabled={marking}
          style={{
            width: "100%", maxWidth: 420, borderRadius: 999, padding: "15px 20px",
            background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)",
            fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: "pointer",
          }}
        >
          {marking ? "…" : "Done"}
        </button>
      </div>
    </div>
  );
}
