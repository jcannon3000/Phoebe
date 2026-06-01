/**
 * Videos — the app's video library. Collects the "Traveling the Way of Love"
 * documentary series (The Episcopal Church) into one place, reachable from the
 * drawer menu. Each card plays its Wistia episode inline on tap; only one
 * player mounts at a time so the page stays light.
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { WAY_OF_LOVE_VIDEOS, SERIES_TITLE, SERIES_SOURCE, wistiaEmbedUrl, fetchWistiaThumbnail } from "@/lib/wayOfLoveVideos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD_B = "rgba(46,107,64,0.28)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function VideosPage() {
  const { t } = useTranslation();
  // Only one player mounts at a time — tapping a new card swaps it in.
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Real poster images fetched from Wistia (best-effort). Until they land — or
  // if the fetch fails — cards fall back to the emoji placeholder.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        WAY_OF_LOVE_VIDEOS.map(async (v) => [v.id, await fetchWistiaThumbnail(v.id)] as const),
      );
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const [id, url] of entries) if (url) map[id] = url;
      setThumbs(map);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          {t("videos.title", { defaultValue: "Videos" })} 🎬
        </h1>
        <p className="text-sm mb-1" style={{ color: SAGE }}>
          {t("videos.subtitle", { defaultValue: SERIES_TITLE })}
        </p>
        <p className="text-[12px] mb-6" style={{ color: SAGE_DIM, fontFamily: FONT }}>
          {t("videos.source", { defaultValue: `A documentary series produced by ${SERIES_SOURCE}.` })}
        </p>

        <div className="flex flex-col gap-5">
          {WAY_OF_LOVE_VIDEOS.map((v) => {
            const playing = playingId === v.id;
            return (
              <div key={v.id}>
                <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 16, overflow: "hidden", border: `1px solid ${CARD_B}`, background: "#000" }}>
                  {playing ? (
                    <iframe
                      src={wistiaEmbedUrl(v.id, true)}
                      title={v.title}
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlayingId(v.id)}
                      aria-label={t("videos.play", { defaultValue: "Play {{title}}", title: v.title })}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", border: "none", background: "radial-gradient(circle at 50% 38%, rgba(46,107,64,0.5), rgba(18,26,20,0.94))" }}
                    >
                      {thumbs[v.id] ? (
                        <>
                          <img
                            src={thumbs[v.id]}
                            alt=""
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          {/* slight darken so the play button stays legible over the photo */}
                          <span aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(18,26,20,0.30)" }} />
                        </>
                      ) : (
                        <span style={{ fontSize: 38 }} aria-hidden>{v.emoji}</span>
                      )}
                      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 999, background: "rgba(240,237,230,0.16)", border: "1px solid rgba(240,237,230,0.4)" }}>
                        <Play size={22} fill={WARM} color={WARM} style={{ marginLeft: 3 }} />
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  {v.label && (
                    <span style={{ color: SAGE_DIM, fontSize: 11, fontWeight: 700, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>{v.label}</span>
                  )}
                  <p className="min-w-0 truncate" style={{ color: WARM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT, margin: 0 }}>{v.title}</p>
                </div>
                <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "2px 0 0" }}>{v.blurb}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
