// ── Coming back to the home quietly ─────────────────────────────────────────
//
// Owner, 2026-09-18: "when i open pray as you go or the lectio one, there are
// haptics like the home screen is loading in the backround / there should just
// be a smooth swell".
//
// They are right about the cause as well as the feel. Both audio practices are
// pass-through pages: they fetch the day's session, hand it to the player, and
// land on the home so the music keeps playing under the mini bar. The home
// then does what it always does on mount — ticks a haptic under each card as
// the list cascades in (DailyProgressBody). Arriving that way, with audio
// already playing and no intention of reading the home at all, that run of
// ticks feels exactly like something loading in the background.
//
// So a hand-off says so, once, and the home answers with a single smooth swell
// instead of the cascade. It is the same distinction the app already makes
// elsewhere: a cascade belongs to arriving AT the home; a swell belongs to
// being handed back TO it.
//
// sessionStorage, not a module variable, because the flag has to survive the
// navigation between two lazily-loaded routes. Read-once by design — a second
// visit to the home in the same session is an ordinary arrival.

const KEY = "phoebe:handoff-quiet";

/** Say that the next home render is a hand-off, not an arrival. */
export function markQuietHandoff(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode: it just ticks as usual */ }
}

/** True once, for the render that follows a hand-off. Clears itself. */
export function consumeQuietHandoff(): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== "1") return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * One gentle swell — the native Core-Haptics ramp the breath uses, not a
 * discrete tap. Falls back to a single light impact where smoothSwell isn't
 * there (web, older shells), and to silence where nothing is.
 */
export function handoffSwell(): void {
  try {
    const audio = (window as unknown as {
      Capacitor?: { Plugins?: { PhoebeAudio?: { smoothSwell?: (o: { durationMs: number; peak: number; sharpness: number }) => Promise<unknown> } } };
    }).Capacitor?.Plugins?.PhoebeAudio;
    if (audio?.smoothSwell) {
      // Longer and softer than a breath's swell: this is a settling, not a beat.
      const r = audio.smoothSwell({ durationMs: 320, peak: 0.38, sharpness: 0.3 });
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
      return;
    }
  } catch { /* fall through */ }
  try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* web — silent */ }
}
