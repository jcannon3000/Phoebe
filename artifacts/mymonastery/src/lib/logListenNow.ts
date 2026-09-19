import { apiRequest, ApiError } from "@/lib/queryClient";
import { enqueueWrite } from "@/lib/writeOutbox";
import { listeningHistory, saveListeningEntry } from "@/lib/listeningLog";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { clearPendingListen } from "@/lib/pendingListen";

/**
 * LOG A LISTEN WITHOUT THE LOG PAGE (owner, 2026-09-18, on a hymn played
 * through YouTube: "it can just log it it doesn't need to go to the log page").
 *
 * What Audio Divina's player does when you tap "Log this listening"
 * (listening.tsx, logNowPlaying): the server row, the practice kept for today,
 * and the local entry the Lately row reads. Phoebe played it, so it was
 * streamed. Once a day per title: a second tap, or a second play of the same
 * hymn, is not a second listening.
 *
 * Offline it waits in the outbox, as the log page's own writes do; with no
 * account there is no row to write, so nothing is queued (the practice is
 * still marked locally, as everywhere else).
 *
 * Returns false when this title was already logged today.
 */
export function logListenNow(what: string, artworkUrl?: string): boolean {
  const title = what.trim().slice(0, 200);
  if (!title) return false;
  const day = new Date().toLocaleDateString("en-CA");
  const already = listeningHistory().some((e) => e.ymd === day && e.what.trim().toLowerCase() === title.toLowerCase());
  clearPendingListen();
  if (already) return false;
  const body = { day, medium: "streaming", what: title, artworkUrl, shared: false };
  void apiRequest("POST", "/api/listening", body).catch((err: unknown) => {
    if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) {
      enqueueWrite(`listening:${day}:${title}`, "POST", "/api/listening", body);
    }
  });
  markPracticeDoneToday("listening");
  saveListeningEntry({ minutes: 0, songs: 1, medium: "streaming", what: title, artworkUrl });
  return true;
}

/** Already logged today? For a page that shows "Logged" rather than a button. */
export function listenLoggedToday(what: string): boolean {
  const title = what.trim().toLowerCase();
  if (!title) return false;
  const day = new Date().toLocaleDateString("en-CA");
  return listeningHistory().some((e) => e.ymd === day && e.what.trim().toLowerCase() === title);
}
