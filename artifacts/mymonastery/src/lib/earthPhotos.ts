// The bundled "life on earth" landscape library — the same photos the Cobreathe
// breath rotates through, glob-imported once here so other surfaces (the Daily
// Office slideshow) can rest on the same imagery without re-globbing.
//
// Each is a calm landscape; callers lay a strong dark wash over them so prayer
// text stays legible.
export const EARTH_PHOTOS = Object.values(
  import.meta.glob("@/assets/cobreathe/*.{jpg,jpeg,png,avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
) as string[];

// A separate LEAVES library — closer, gentler foliage. Used as the background on
// the reading/journaling surfaces (prayer requests, Audio Divina) and the Daily
// Office slideshow. NOT used in Contemplation or Co-Breathe (those keep the wider
// landscapes). Falls back to the landscapes if the leaves set is somehow empty.
export const LEAF_PHOTOS = (() => {
  const leaves = Object.values(
    import.meta.glob("@/assets/leaves/*.{jpg,jpeg,png,avif,webp}", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ) as string[];
  return leaves.length > 0 ? leaves : EARTH_PHOTOS;
})();

// THE splash / loading photo — one fixed banana-leaf macro (owner's pick), used
// for the app-open splash and the office's held-breath load screen. Deliberately
// NOT random: it's the first thing the app shows, so it should be the same
// every launch, and a single known URL is what lets us preload it (see
// preloadSplashPhoto below) instead of racing a random pick against first paint.
export const SPLASH_PHOTO: string = (() => {
  const match = LEAF_PHOTOS.find((url) => url.includes("ryunosuke-kikuno-4Rrb8pmQ09w"));
  return match ?? LEAF_PHOTOS[0] ?? EARTH_PHOTOS[0] ?? "";
})();

// Warm the browser/WebView cache for the splash photo AND the app icon it's
// shown under, as early as the module graph loads — so the splash paints
// both immediately instead of the photo appearing first and the icon
// popping in a beat later once its own request finishes (the native
// WebView doesn't always honor index.html's <link rel=preload> hints the
// way a desktop browser's preload scanner does, so this JS-level warm-up is
// the belt to that belt-and-suspenders). Idempotent and best-effort — a
// failed decode just means the <img> loads normally.
export function preloadSplashPhoto(): void {
  if (typeof document === "undefined") return;
  for (const src of [SPLASH_PHOTO, "/phoebe-app-icon.png"]) {
    if (!src) continue;
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    } catch { /* non-fatal */ }
  }
}

// The Home Screen subset — used ONLY on the home + daily-progress (a curated set,
// per the Pictures/Leaves/Home Screen folder). The general LEAF_PHOTOS glob above is
// `@/assets/leaves/*` (non-recursive), so it does NOT include this `home/` subfolder.
export const HOME_LEAF_PHOTOS = (() => {
  const home = Object.values(
    import.meta.glob("@/assets/leaves/home/*.{jpg,jpeg,png,avif,webp}", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ) as string[];
  return home.length > 0 ? home : LEAF_PHOTOS;
})();

// The WATER library — calm ocean / river / rain imagery for the office
// backdrop chooser's "Water" option (paired with a blue-shaded UI theme). Its
// own bundled set under assets/water; falls back to the leaves if empty.
export const WATER_PHOTOS = (() => {
  const water = Object.values(
    import.meta.glob("@/assets/water/*.{jpg,jpeg,png,avif,webp}", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ) as string[];
  return water.length > 0 ? water : LEAF_PHOTOS;
})();

// The ANIMAL photos within the landscape library (matched by their unsplash
// basename — stable across vite's content-hash suffix). Derived from the
// owner's curated Pictures/Animals folder. PLANET_PHOTOS below is the
// landscape set WITHOUT them — "the planet pictures, but not the animals"
// (the office backdrop chooser's Planet option).
const ANIMAL_PHOTO_IDS = [
  "alli-elder-zX6X-6AUYhk", "annie-spratt-zoYsDbUC05o", "benaja-germann-xuq2Q3SPI-g",
  "darien-attridge-byZUF1EMG9I", "david-clode--m9AEfF-u-s", "dick-hoogerdijk-D2Nx305s3lQ",
  "doug-bagg-I6Qh6UAYazg", "edrick-krozendijk-25JxltstHSc", "janosch-diggelmann-axc38tRdjWI",
  "jay-wennington-s-fD5Tpew2k", "joaquin-arenas-gpteT8d_XvE", "jonah-brown-ftyPhU-_hBY",
  "luka-vilfan-tHxE679NPqE", "malivez-0UUoz7ZBdtY", "mario-scheibl-ZPCppeCA6x8",
  "mauro-lima-eRzd4WEJitU", "nicolas-dc-DfPgOyU_VUE", "nir-himi-Imx5vhZVvgM",
  "peter-thomas--O88zet1ZKc", "peter-thomas-ZSs1gspOSTc", "slava-auchynnikau-78qSZ56GqJM",
  "smithsonian-f_fv4_u0EAY", "smithsonian-wqoTh96twsc", "tim-mossholder-8pvuxTJRgEg",
  "valentin-vEqnu8hJkPM", "will-rust-ERm7haDBW8k",
];
export const PLANET_PHOTOS = (() => {
  const planets = EARTH_PHOTOS.filter((url) => !ANIMAL_PHOTO_IDS.some((id) => url.includes(id)));
  return planets.length > 0 ? planets : EARTH_PHOTOS;
})();

// One photo per calendar day — stable through a whole office sit (and across a
// morning→evening pair on the same day), rotating gently day to day. Pass a date
// for testing; defaults to today.
export function earthPhotoForDay(date: Date = new Date()): string | null {
  if (EARTH_PHOTOS.length === 0) return null;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  return EARTH_PHOTOS[((dayOfYear % EARTH_PHOTOS.length) + EARTH_PHOTOS.length) % EARTH_PHOTOS.length];
}
