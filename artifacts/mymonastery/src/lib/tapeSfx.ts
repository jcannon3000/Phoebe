/**
 * tapeSfx — real Walkman button clicks (recorded on a physical tape player),
 * used as the voice recorder/player's tactile "tape" sounds. Tiny mp3s, lazily
 * loaded and reused, played at a soft volume. Best-effort: never throws, never
 * blocks. The mapping (which click → which action) is by acoustic character;
 * swap the imports below to re-assign.
 */
import recordUrl from "@/assets/sfx/record.mp3"; // heavy ka-chunk
import stopUrl from "@/assets/sfx/stop.mp3";     // crisp click
import playUrl from "@/assets/sfx/play.mp3";      // clean click
import pauseUrl from "@/assets/sfx/pause.mp3";    // softer click
import sendUrl from "@/assets/sfx/send.mp3";      // satisfying clunk

export type TapeClick = "record" | "stop" | "play" | "pause" | "send";

const URLS: Record<TapeClick, string> = { record: recordUrl, stop: stopUrl, play: playUrl, pause: pauseUrl, send: sendUrl };
const pool: Partial<Record<TapeClick, HTMLAudioElement>> = {};

export function tapeClick(which: TapeClick): void {
  try {
    let a = pool[which];
    if (!a) { a = new Audio(URLS[which]); a.volume = 0.5; a.preload = "auto"; pool[which] = a; }
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch { /* ignore */ }
}
