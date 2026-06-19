import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { completeSpotifyAuth } from "@/lib/spotify";

// Spotify PKCE callback. Spotify redirects here with ?code&state after the user
// authorizes; we exchange the code for tokens and bounce back to Listening.
// Web/PWA only — the iOS app authorizes through the native plugin instead.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

export default function SpotifyCallbackPage() {
  const [, navigate] = useLocation();
  const [msg, setMsg] = useState("Connecting to Spotify…");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      let ok = false;
      if (params.get("error")) {
        setMsg("Spotify connection was cancelled.");
      } else {
        ok = await completeSpotifyAuth(params).catch(() => false);
        setMsg(ok ? "Connected. Taking you back…" : "Couldn't connect to Spotify.");
      }
      window.setTimeout(() => navigate("/listening"), ok ? 900 : 1800);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full min-h-[50vh] flex flex-col items-center justify-center text-center">
        <div className="text-3xl mb-4">♪</div>
        <p className="text-[15px]" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{msg}</p>
        <button
          onClick={() => navigate("/listening")}
          className="mt-6 text-[13px]"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          Back to Listening
        </button>
      </div>
    </Layout>
  );
}
