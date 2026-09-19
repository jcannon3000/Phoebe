import { useLocation, useSearch } from "wouter";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { isInReaderWatch, YOUTUBE_ID } from "@/lib/videoEmbed";

// ── /video?v=<id>&title=…&from=… — one YouTube video, inside Phoebe ─────────
//
// Owner, 2026-09-18: "Can it open the YouTube links for hymns and such in app
// like we were building for other things?"
//
// The generic sibling of /ncmp/watch and /devotion/watch: a title and the
// shared player (components/YouTubePlayer), nothing else. Callers never link
// here directly: they go through lib/videoEmbed, because YouTube only starts
// on a page with a real http(s) ORIGIN:
//   - the web and the Android shell (https://localhost) embed right here;
//   - the iOS shell (capacitor://) gets Error 153, so the caller opens THIS
//     page at withphoebe.app in the in-app reader instead (openVideoInReader),
//     marked ?inapp=1, where the reader's own Done replaces our Back.
// See memory reference_video_embedding for the whole table.
//
// `v` is validated as a YouTube id (11 characters of [A-Za-z0-9_-]) so this
// page can never be handed an arbitrary embed. `from` is where Back returns
// (in-app paths only). `log=1` adds "Log this listening", for a caller that
// has already left the listening log a note (lib/pendingListen).

const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

export default function VideoWatchPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const raw = params.get("v") ?? "";
  const id = YOUTUBE_ID.test(raw) ? raw : null;
  const title = params.get("title");
  const fromRaw = params.get("from");
  const from = fromRaw && fromRaw.startsWith("/") && !fromRaw.startsWith("//") ? fromRaw : "/listening";
  const offerLog = params.get("log") === "1";
  const inReader = isInReaderWatch();

  return (
    <div
      style={{
        minHeight: "var(--app-dvh)",
        background: "#091A10",
        color: WARM,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
        }}
      >
        {inReader ? null : (
          <button
            type="button"
            onClick={() => setLocation(from)}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            ← Back
          </button>
        )}
      </header>

      <main style={{ flex: 1, padding: "8px 16px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        {title && (
          <h1
            style={{
              width: "100%", maxWidth: 560, alignSelf: "center", margin: 0,
              color: WARM, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic",
              fontWeight: 400, fontSize: 20, lineHeight: 1.35,
            }}
          >
            {title}
          </h1>
        )}
        {id ? (
          <div style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
            <YouTubePlayer videoId={id} autoplay onEnded={() => {}} />
          </div>
        ) : (
          <p style={{ color: FAINT, fontSize: 14, textAlign: "center", marginTop: 40 }}>
            This video could not be found.
          </p>
        )}
        {/* The way on, when there is one inside the app: the listening log,
            already filled by the caller (lib/pendingListen). In the reader the
            reader's Done returns to the app, which is already on the log. */}
        {!inReader && offerLog && (
          <button
            type="button"
            onClick={() => setLocation("/listening?log=1")}
            style={{
              alignSelf: "center", marginTop: 6,
              background: "rgba(46,107,64,0.42)", border: "1px solid rgba(143,175,150,0.45)",
              color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600,
              borderRadius: 999, padding: "11px 22px", cursor: "pointer",
            }}
          >
            Log this listening
          </button>
        )}
      </main>
    </div>
  );
}
