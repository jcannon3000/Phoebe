/**
 * WHERE THE APP GOES WHEN THE IN-APP READER CLOSES.
 *
 * Owner, 2026-09-19, of the hymn player: "have a done on the right the done
 * proceeds in the slideshow to the closing prompt of taking a moment to bring
 * to god… and have it be logged".
 *
 * On the web and on Android the /video page is inside the app, so its own Done
 * simply navigates. On iOS the page runs in the in-app READER — a separate web
 * view, with its own storage, no sign-in and no bridge back — so nothing it
 * renders can move the app underneath it. What CAN move the app is the
 * reader's own Done: closing it fires `phoebe:browserfinished` in the app (see
 * native-shell's browserFinished listener).
 *
 * So the caller that opens the reader leaves a note here first, and the app
 * reads it when the reader closes. The note expires, because a reader closed
 * an hour later is a different intention; and it is taken once.
 */

const KEY = "phoebe:after-reader";
const GOOD_FOR_MS = 60 * 60_000;

type AfterReader = { to: string; at: number; logAs?: string; art?: string };

/**
 * ONLY THE SESSION THAT ARMED IT MAY FOLLOW IT. The note lives in
 * localStorage, because the reader's close arrives after a round trip through
 * the native shell — but a note left behind by an app that was force-quit
 * while the reader was up would otherwise be consumed by the next foreground
 * event, an hour later, from anywhere in the app: the dashboard would jump to
 * Audio Divina's closing prayer for no reason the person could see.
 */
let armed = false;

/**
 * Go here when the reader closes — an in-app path, checked on the way out.
 *
 * `logAs` is the track to write when that close is a DONE. It travels with the
 * note rather than being written as the reader opens, because the reader's bar
 * has two exits and Back must leave nothing behind (owner: Back is "to take
 * you to pick a different song"). Logging at open time meant a glance at the
 * wrong recording still counted as the practice kept for the day.
 */
export function setAfterReader(to: string, logAs?: string, art?: string): void {
  if (!to.startsWith("/") || to.startsWith("//")) return;
  armed = true;
  try { localStorage.setItem(KEY, JSON.stringify({ to, at: Date.now(), logAs, art } satisfies AfterReader)); } catch { /* private mode */ }
}

/** Read it and clear it — one hand-off, never twice. */
export function takeAfterReader(): { to: string; logAs?: string; art?: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    if (!armed) return null;
    armed = false;
    const v = JSON.parse(raw) as AfterReader;
    if (!v?.to || typeof v.at !== "number" || Date.now() - v.at > GOOD_FOR_MS) return null;
    if (!v.to.startsWith("/") || v.to.startsWith("//")) return null;
    return {
      to: v.to,
      logAs: typeof v.logAs === "string" ? v.logAs : undefined,
      art: typeof v.art === "string" && v.art.startsWith("https://") ? v.art : undefined,
    };
  } catch {
    return null;
  }
}

export function clearAfterReader(): void {
  armed = false;
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
