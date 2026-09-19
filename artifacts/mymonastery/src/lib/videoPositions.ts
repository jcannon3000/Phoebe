// ─── Where you got to in a video ────────────────────────────────────────────
//
// Owner, 2026-09-19: "Can it keep track of where I am in each session of the
// YouTube video?" A twenty-minute talk left half-watched used to start again
// from the top — the same loss the podcast player fixed years ago with
// phoebe:podcast:pos:*, and this is deliberately the same shape.
//
// PER VIDEO, not per page: the same lesson reached from the home, from Courses
// or from the catalogue is the same video, and someone who stopped nine
// minutes in means it wherever they come back from.
//
// DEVICE-LOCAL, like every other position in the app. It needs no account, so
// a signed-out guest keeps their place too; the cost is that it does not
// travel between devices. On iOS the video plays in the in-app reader, at
// withphoebe.app, so its positions are saved in the reader's own storage —
// which is where the video plays every time, so they are there on return (the
// app itself never plays it). See lib/courseRelay for what DOES have to travel.

const KEY = (videoId: string) => `phoebe:video:pos:${videoId}`;

/**
 * Under this, there is no place to keep: someone who watched eight seconds and
 * left has not started, and dropping them "back" there is noise. The podcast
 * player uses five; a video's opening titles ask for a little more.
 */
const FLOOR_S = 10;

/**
 * Within this of the end, the video is FINISHED and the next opening starts it
 * over. Without it, a talk watched to the last breath reopens two seconds from
 * the credits, which looks broken.
 */
const END_S = 20;

/** Where to resume this video, or 0 for the beginning. Never throws. */
export function readVideoPosition(videoId: string): number {
  if (!videoId) return 0;
  try {
    const n = Number(localStorage.getItem(KEY(videoId)));
    return Number.isFinite(n) && n >= FLOOR_S ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/**
 * Keep the place — given the player's own current time and duration.
 *
 * Duration may be 0 while the player is still working out what it has; a
 * position with nothing to measure "finished" against is still worth keeping,
 * so only the end test is skipped.
 */
export function saveVideoPosition(videoId: string, seconds: number, duration: number): void {
  if (!videoId || !Number.isFinite(seconds)) return;
  if (seconds < FLOOR_S) { clearVideoPosition(videoId); return; }
  if (duration > 0 && seconds >= duration - END_S) { clearVideoPosition(videoId); return; }
  try { localStorage.setItem(KEY(videoId), String(Math.floor(seconds))); } catch { /* private mode */ }
}

/** Forget it — the video ended, or was watched to within END_S of the end. */
export function clearVideoPosition(videoId: string): void {
  if (!videoId) return;
  try { localStorage.removeItem(KEY(videoId)); } catch { /* private mode */ }
}
