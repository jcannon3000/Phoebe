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

// One photo per calendar day — stable through a whole office sit (and across a
// morning→evening pair on the same day), rotating gently day to day. Pass a date
// for testing; defaults to today.
export function earthPhotoForDay(date: Date = new Date()): string | null {
  if (EARTH_PHOTOS.length === 0) return null;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  return EARTH_PHOTOS[((dayOfYear % EARTH_PHOTOS.length) + EARTH_PHOTOS.length) % EARTH_PHOTOS.length];
}
