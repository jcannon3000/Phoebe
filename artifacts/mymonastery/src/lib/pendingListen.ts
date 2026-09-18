// ── The song you just went off to play ──────────────────────────────────────
//
// Owner, 2026-09-18: "when they pick a hymn, regardless of the platform, if it
// opens the other app, when they come back to phoebe, it should have that hymn
// ready to be logged … like auto filled on the log page".
//
// Tapping play in the hymns catalogue hands the track to Spotify, Apple Music
// or YouTube — which means leaving Phoebe. Coming back and being asked "what
// did you listen to?" with an empty field is asking someone to retype what the
// app just handed over. So the catalogue leaves a note here, and Audio Divina's
// log reads it.
//
// Deliberately NOT the same thing as the listening log: this is an intention,
// not a record. Nothing is counted, nothing syncs, and it is cleared the moment
// it is used or the day turns. Someone who plays a hymn and never opens Audio
// Divina has logged nothing, which is correct — they were listening, not
// journalling.
//
// Scoped to the local DAY, matching how the log itself is keyed (listeningLog's
// `ymd`). A hymn played last night should not fill in this morning's entry: by
// then it is a different day's practice, and a wrong prefill is worse than an
// empty field because it will be logged without being read.

export type PendingListen = {
  /** What to put in the log's "what" field, already formatted for reading. */
  what: string;
  /** Cover art, when the surface had one. The hymns catalogue does not. */
  artworkUrl?: string;
  /** Local YYYY-MM-DD it was started on. */
  ymd: string;
};

const KEY = "phoebe:pending-listen";

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Remember what was just sent off to play. */
export function setPendingListen(p: { what: string; artworkUrl?: string }): void {
  const what = p.what.trim().slice(0, 200);
  if (!what) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      what,
      ...(p.artworkUrl ? { artworkUrl: p.artworkUrl } : {}),
      ymd: todayYmd(),
    } satisfies PendingListen));
  } catch { /* private mode: the field just stays empty, as it used to */ }
}

/**
 * Read it and clear it — one prefill, never twice. Returns null when there is
 * nothing waiting, or when it was left on an earlier day.
 */
export function takePendingListen(): PendingListen | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const p = JSON.parse(raw) as PendingListen;
    if (!p?.what || p.ymd !== todayYmd()) return null;
    return p;
  } catch {
    return null;
  }
}

/** Drop it without using it (e.g. the person logged something else). */
export function clearPendingListen(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
