// Moderate compression for the bundled Co-Breathe photo library.
//
// Converts every JPG/PNG under mymonastery/src/assets/cobreathe to WebP at
// quality 80, KEEPING the original pixel dimensions (the images are only
// ~800–960px wide — already modest for a phone background, so downscaling would
// hurt, not help). WebP q80 is visually indistinguishable from the source here
// (soft nature photos) while shaving a meaningful chunk off the app binary.
//
// The asset globs already match `*.{jpg,jpeg,png,avif,webp}`, so swapping the
// extension needs no code change — we just write the .webp and delete the .jpg.
//
// Run:  node scripts/compress-cobreathe.mjs   (from artifacts/phoebe-mobile)
import sharp from "sharp";
import { readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../mymonastery/src/assets/cobreathe");
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

let before = 0, after = 0, n = 0;
for (const f of files) {
  const src = join(dir, f);
  const beforeSize = statSync(src).size;
  const buf = await sharp(src).webp({ quality: 80 }).toBuffer();
  const out = join(dir, basename(f, extname(f)) + ".webp");
  writeFileSync(out, buf);
  unlinkSync(src);
  before += beforeSize;
  after += buf.length;
  n++;
}

const mb = (b) => (b / 1048576).toFixed(1);
console.log(`Converted ${n} images: ${mb(before)}MB → ${mb(after)}MB (${Math.round((1 - after / before) * 100)}% smaller)`);
