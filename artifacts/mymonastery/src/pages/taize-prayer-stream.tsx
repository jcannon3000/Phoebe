// ─── /taize-prayer — the community's own prayer, streamed ───────────────────
//
// Owner, 2026-09-19: "At the bottom of practices could we have Taize prayers
// which would love there daily stream" · "Have it in course leaf backround
// style". So: their prayer, in the course page's clothes — the leaf ground
// with the fade into the native bar, and the video edge to edge.
//
// NOT DAILY, and this page does not say it is. Their channel streams the
// Saturday evening prayer from the church at Taizé, week by week (see
// api-server routes/taize-prayer, which checked the feed and found nothing
// else), so the page names the prayer it is actually showing and the line
// underneath says when they pray. If one is on air, that is what opens.
//
// FOUR TAIZÉ THINGS now, and the owner named this one so each is distinct:
// "Taizé meditation" (the weekly reflection to read), "Taizé Daily Prayer"
// (Brother Matthew's written prayer, in the reader), "Taizé Songs" (in Audio
// Divina), and this — "Taizé Saturday Prayer", the community praying aloud.
//
// THE DESCRIPTION IS OURS. Their feed carries a media:description on every
// entry and every one of them is EMPTY (checked across the fifteen entries it
// holds), so there is nothing of theirs to prefer; the two sentences under the
// player are written here, and the stream's own title and date sit above them.

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { ReaderShell } from "@/components/CoursePage";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { apiRequest } from "@/lib/queryClient";
import { canEmbedVideoHere, isInReaderWatch, openVideoInReader, youtubePoster } from "@/lib/videoEmbed";
import { openExternal } from "@/lib/openExternal";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const DIM = "rgba(200,212,192,0.62)";

type TaizePrayerMeta = {
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  live: boolean;
};

/**
 * THEIR OWN TITLE, TIDIED — "Evening prayer, Saturday 19.09.2026" and "Evening
 * prayer | Saturday 05.09.2026" are the same thing written two ways, and the
 * date in it is theirs (dd.mm.yyyy), not a machine's. We keep what they called
 * it and show the date in the reader's own language underneath.
 */
function prayerLines(meta: TaizePrayerMeta | undefined): { name: string; when: string } {
  if (!meta) return { name: "", when: "Finding their most recent prayer…" };
  if (meta.live) return { name: meta.title?.trim() || "Evening prayer", when: "Praying now, live from the church" };
  const name = (meta.title ?? "").replace(/\s*[|,]\s*/g, " · ").trim() || "Evening prayer";
  const when = meta.publishedAt
    ? new Date(meta.publishedAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";
  return { name, when };
}

export default function TaizePrayerStreamPage() {
  const [, setLocation] = useLocation();
  const inReader = isInReaderWatch();
  const leafBg = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  const { data: meta, isLoading } = useQuery<TaizePrayerMeta>({
    queryKey: ["/api/taize/prayer"],
    queryFn: () => apiRequest("GET", "/api/taize/prayer"),
    // Half an hour, matching the server's own hold on a resolved prayer.
    staleTime: 30 * 60_000,
  });

  const videoId = meta?.videoId ?? null;
  const inlineVideo = canEmbedVideoHere();
  const { name, when } = prayerLines(meta);

  /** Where YouTube will not embed (the iOS shell): this same page, in the
   *  reader, where the origin is real. Called straight from the tap so the
   *  gesture still counts (see openExternal). */
  const watch = () => {
    if (!openVideoInReader()) openExternal(meta?.url ?? "https://www.youtube.com/@taize/streams");
  };

  const body = (
    <div className="mx-auto w-full max-w-2xl">
      <div className="px-4 pt-2">
        {!inReader && (
          <button
            type="button"
            onClick={() => setLocation("/menu/practices")}
            className="mb-3 text-[13px]"
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, padding: 0, cursor: "pointer" }}
          >
            ← Practices
          </button>
        )}
        <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>Taizé Saturday Prayer</h1>
        <p className="mt-0.5 text-sm" style={{ color: SAGE, fontFamily: FONT }}>
          The Taizé Community · their own stream
        </p>
      </div>

      {/* Edge to edge and square-cornered, like a course lesson. */}
      <div className="video-bleed mt-4">
        {inlineVideo && videoId ? (
          <YouTubePlayer videoId={videoId} autoplay={false} onEnded={() => { /* nothing follows it */ }} frame="bleed" />
        ) : (
          <button
            type="button"
            onClick={watch}
            className="block w-full text-left"
            style={{ background: "#000", border: "none", padding: 0, cursor: "pointer" }}
            aria-label="Watch the prayer"
          >
            <span className="relative block w-full" style={{ aspectRatio: "16 / 9" }}>
              {videoId && (
                <img src={youtubePoster(videoId)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.72 }} />
              )}
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#2D5E3F", color: WARM, fontSize: 20 }}>▶</span>
              </span>
            </span>
          </button>
        )}
      </div>

      {/* UNDER THE VIDEO (owner, 2026-09-19: "Have a discription under the
          video") — which prayer this is first, then what it is. */}
      <div className="px-4 pb-10 pt-4">
        {(name || when) && (
          <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>
            {isLoading ? "Finding their most recent prayer…" : name}
          </p>
        )}
        {when && !isLoading && (
          <p className="mt-0.5 text-[13px]" style={{ color: SAGE, fontFamily: FONT }}>
            {meta?.live ? when : `Streamed ${when}`}
          </p>
        )}
        {/* WHAT IT ACTUALLY IS. The owner asked for "their daily stream"; their
            channel streams the Saturday evening prayer, so the page says that
            rather than promising a prayer that will not be there tomorrow. */}
        <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: DIM, fontFamily: FONT }}>
          The brothers and the thousands who visit them pray together three times a day in the
          Church of Reconciliation at Taizé — long silences, a reading, and the short sung
          phrases the community is known for. Their Saturday evening prayer is streamed, and
          the most recent one is here to pray along with.
        </p>
        <p className="mt-3 text-[12px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
          Streamed by the Taizé Community. Phoebe only shows it here.
        </p>
      </div>
    </div>
  );

  return inReader ? <ReaderShell photo={leafBg}>{body}</ReaderShell> : <Layout bgPhoto={leafBg}>{body}</Layout>;
}
