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

type AfterReader = { to: string; at: number };

/** Go here when the reader closes — an in-app path, checked on the way out. */
export function setAfterReader(to: string): void {
  if (!to.startsWith("/") || to.startsWith("//")) return;
  try { localStorage.setItem(KEY, JSON.stringify({ to, at: Date.now() } satisfies AfterReader)); } catch { /* private mode */ }
}

/** Read it and clear it — one hand-off, never twice. */
export function takeAfterReader(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const v = JSON.parse(raw) as AfterReader;
    if (!v?.to || typeof v.at !== "number" || Date.now() - v.at > GOOD_FOR_MS) return null;
    return v.to.startsWith("/") && !v.to.startsWith("//") ? v.to : null;
  } catch {
    return null;
  }
}

export function clearAfterReader(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
