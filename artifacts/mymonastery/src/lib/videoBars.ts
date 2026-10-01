/**
 * HOW WIDE IS THE PICTURE INSIDE A YOUTUBE VIDEO?
 *
 * Owner, 2026-10-01, looking at a hymn whose recording is an audio upload with
 * a square album sleeve: "when there is a video with black padding, could we
 * ajust the padding" · "could reframe the youtube player to not have the black
 * bars and that would make the square bigger?"
 *
 * YouTube's player is always 16:9. A square sleeve inside it is drawn at
 * nine-sixteenths of the width with black down both sides — on a phone that is
 * a tall black band holding a small picture. Nothing in the IFrame API reports
 * the content's own shape, so we measure it: the video's THUMBNAIL is the same
 * framing with the same bars baked in, i.ytimg serves it with
 * `access-control-allow-origin: *`, and a canvas can therefore read it.
 *
 * What comes back is the content's aspect ratio (width ÷ height), for the
 * player to use as its own; 16:9 video measures 16/9 and nothing changes.
 *
 * Measured once per video and remembered, because this is a property of the
 * upload and not of the device. A failure of any kind — offline, a thumbnail
 * that 404s, a canvas a browser won't let us read — returns null, which means
 * "leave the player alone", never an error anyone sees.
 */

const KEY = "phoebe:video-aspect:v1";
/** 16:9, the shape of the player itself. */
const FULL = 16 / 9;
/** Below this the measurement is noise: a 1-2% edge is JPEG, not a bar. */
const MIN_BAR_FRACTION = 0.04;
/**
 * Never crop past this. A portrait upload would otherwise turn the player into
 * a column taller than the screen; a sleeve is square, and square is the shape
 * this exists for.
 */
const NARROWEST = 1;

type Cache = Record<string, number>;

function readCache(): Cache {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Cache; } catch { return {}; }
}
function remember(videoId: string, aspect: number): void {
  try {
    const all = readCache();
    all[videoId] = aspect;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private mode — measure again next time */ }
}

/** The thumbnails that are themselves 16:9, best first. */
function thumbUrls(videoId: string): string[] {
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // A thumbnail that doesn't exist (maxres is absent on older uploads) comes
    // back as a 120x90 grey placeholder rather than an error on some paths, so
    // the caller checks the size too.
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The width of the bar on each side, as a fraction of the whole.
 *
 * NOT A TEST FOR BLACK. The player draws real black down the sides, but the
 * THUMBNAIL of the same upload is often filled with flat grey instead (this is
 * what made the first version measure "no bars" on a hymn that plainly had
 * them). What both have in common is that a bar is FEATURELESS: every pixel
 * down the column is the same value, and the same value as the edge. So the
 * test is uniformity, which holds whatever colour YouTube chose.
 *
 * Both sides are measured and the SMALLER is used: an off-centre picture, or a
 * flat edge inside the artwork itself, must never crop away real content.
 */
function barFraction(img: HTMLImageElement): number | null {
  const W = 160, H = 90;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, W, H).data; } catch { return null; }

  /** One column's mean luminance (0-255) and how much it varies down the column. */
  const column = (x: number): { mean: number; spread: number } => {
    let sum = 0;
    const v: number[] = [];
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      v.push(l); sum += l;
    }
    const mean = sum / H;
    let d = 0;
    for (const l of v) d += (l - mean) ** 2;
    return { mean, spread: Math.sqrt(d / H) };
  };
  /** Flat down its length, and the same shade as the edge it started from. */
  const FLAT = 3, SAME = 6;
  const run = (from: number, step: number): number => {
    const edge = column(from);
    // An edge that is already busy means there is no bar on this side.
    if (edge.spread > FLAT) return 0;
    let n = 0;
    for (let i = 0; i < W / 2; i++) {
      const c = column(from + i * step);
      if (c.spread > FLAT || Math.abs(c.mean - edge.mean) > SAME) break;
      n++;
    }
    return n;
  };
  return Math.min(run(0, 1), run(W - 1, -1)) / W;
}

/**
 * The content's aspect ratio, or null to leave the player at 16:9.
 *
 * Note what is NOT done here: no fetch of our own, no proxy, no API key. One
 * image the browser would happily cache anyway, read on a canvas.
 */
export async function measureVideoAspect(videoId: string): Promise<number | null> {
  if (typeof document === "undefined" || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const cached = readCache()[videoId];
  if (typeof cached === "number" && cached > 0) return cached === FULL ? null : cached;

  for (const url of thumbUrls(videoId)) {
    const img = await loadImage(url);
    // YouTube's placeholder for a missing size is 120x90; a real 16:9 thumb is
    // at least 320 wide. Anything smaller tells us nothing about the framing.
    if (!img || img.naturalWidth < 320) continue;
    const bar = barFraction(img);
    if (bar === null) return null;
    if (bar < MIN_BAR_FRACTION) { remember(videoId, FULL); return null; }
    const aspect = Math.max(NARROWEST, FULL * (1 - 2 * bar));
    remember(videoId, aspect);
    return aspect >= FULL ? null : aspect;
  }
  return null;
}
