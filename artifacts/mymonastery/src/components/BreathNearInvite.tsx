/**
 * BreathNearInvite — the soft, in-context pre-prompt for Cobreathe's "same air"
 * feature. Shown on the Cobreathe start screen (beta only) to someone who hasn't
 * opted in yet and hasn't been asked. It explains the WHY before any OS sheet:
 * accepting turns the pref on, persists it, then triggers the real location
 * request. One-shot — "Not now" (or accepting) means we never show it again.
 *
 * Mirrors PrayLocationInvite's consent pattern, inlined as a quiet card rather
 * than a global modal so it only ever appears right where breathing begins.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { getBreathBucket } from "@/lib/breathGeohash";

const FONT = "'Space Grotesk', system-ui, sans-serif";
const ASKED_KEY = "phoebe:breath-location-prompt-asked";

function alreadyAsked(): boolean {
  try { return localStorage.getItem(ASKED_KEY) === "1"; } catch { return false; }
}
function markAsked() {
  try { localStorage.setItem(ASKED_KEY, "1"); } catch { /* best effort */ }
}

export function BreathNearInvite() {
  const { user } = useAuth();
  const { isBeta } = useBetaStatus();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(() => alreadyAsked());

  // Only for beta users who haven't opted in and haven't been asked.
  if (!isBeta || !user || user.shareBreathLocation || hidden) return null;

  const dismiss = () => { markAsked(); setHidden(true); };
  const accept = () => {
    markAsked();
    setHidden(true);
    apiRequest("PATCH", "/api/auth/me/breath-location", { shareBreathLocation: true })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }))
      .catch(() => undefined);
    // Soft pre-prompt → real OS permission dialog (resolves + discards the fix).
    void getBreathBucket({ force: true });
  };

  return (
    <div
      className="rounded-2xl px-4 py-3.5 mt-4"
      style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(111,175,133,0.3)", fontFamily: FONT }}
    >
      <p style={{ fontSize: 15, fontWeight: 700, color: "#F0EDE6", margin: "0 0 4px" }}>Feel who's near 🌍</p>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "#8FAF96", margin: "0 0 12px" }}>
        Turn on location to see when you're sharing the same air as others close by. It's used only while you breathe, then forgotten — never your exact spot.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={accept}
          className="rounded-full px-4 py-2 transition-opacity active:scale-[0.97]"
          style={{ background: "rgba(46,107,64,0.9)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT, fontSize: 13, fontWeight: 700 }}
        >
          Show me who's near
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full px-4 py-2"
          style={{ background: "transparent", color: "rgba(143,175,150,0.8)", border: "none", fontFamily: FONT, fontSize: 13, fontWeight: 600 }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
