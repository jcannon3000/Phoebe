// ── Breathing Together's tones, with the screen off ─────────────────────────
//
// Owner, 2026-09-29: "we want the sounds to play even if your … screen is off"
// and "we want a sound on the out too now".
//
// CobreatheBreath rings each breath from its animation loop, and iOS stops
// that loop the moment the screen goes dark. So on the iPhone the page hands
// the whole set to PhoebeAudio.scheduleBreath up front, and the native side
// lays every in- and out-breath tone (and the closing tone) on the audio
// clock, the way the sit's closing bell is laid down. The page then stays
// quiet for the breaths it handed over, so nothing sounds twice.
//
// Older app builds without the method, and the web, keep the page's own
// tones: `canScheduleNativeBreath()` is false there.

type ScheduleBreath = (o: {
  firstInMs: number;
  inhaleMs: number;
  cycleMs: number;
  fromBreath: number;
  count: number;
  closingTone: boolean;
  closingAfter?: number;
}) => Promise<{ scheduled?: number; deferred?: boolean }>;

type PhoebeAudioBreath = {
  scheduleBreath?: ScheduleBreath;
  cancelBreath?: () => Promise<unknown>;
};

function plugin(): PhoebeAudioBreath | null {
  try {
    return (window as unknown as {
      Capacitor?: { Plugins?: { PhoebeAudio?: PhoebeAudioBreath } };
    }).Capacitor?.Plugins?.PhoebeAudio ?? null;
  } catch {
    return null;
  }
}

export function canScheduleNativeBreath(): boolean {
  return typeof plugin()?.scheduleBreath === "function";
}

/**
 * Lay down breaths `fromBreath` … `fromBreath + count - 1`, the first
 * in-breath `firstInMs` from now. Resolves true when the native side took
 * them (so the page should stay quiet for those breaths), false otherwise.
 */
export async function scheduleNativeBreath(o: {
  firstInMs: number;
  inhaleMs: number;
  cycleMs: number;
  fromBreath: number;
  count: number;
  /** Breaths after `fromBreath` at which the set ends (the closing tone). */
  closingAfter?: number;
}): Promise<boolean> {
  const fn = plugin()?.scheduleBreath;
  if (!fn) return false;
  try {
    const r = await fn({ ...o, closingTone: true });
    return !r?.deferred && (r?.scheduled ?? 0) > 0;
  } catch {
    return false;
  }
}

export function cancelNativeBreath(): void {
  try { void plugin()?.cancelBreath?.().catch(() => { /* nothing armed */ }); } catch { /* web */ }
}
