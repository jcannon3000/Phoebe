#!/usr/bin/env node
// One-shot placeholder app icon generator. Writes `assets/icon.png` at
// 1024×1024, which is what `npx @capacitor/assets generate` expects as
// its input. Design uses Phoebe's actual palette so the icon looks in
// family with the in-app UI, not like a default grey square. Swap in a
// professionally designed PNG when ready — the rest of the pipeline
// (assets/ → iOS AppIcon sets) stays the same.

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "..", "assets", "icon.png");

const svg = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#091A10"/>
  <circle cx="512" cy="512" r="320" fill="none" stroke="#2D5E3F" stroke-width="8" opacity="0.4"/>
  <path d="M 512 260 C 420 260, 380 340, 380 420 C 380 500, 440 560, 512 600 C 584 560, 644 500, 644 420 C 644 340, 604 260, 512 260 Z" fill="#8FAF96" opacity="0.95"/>
  <path d="M 512 320 C 460 320, 430 370, 430 420 C 430 470, 470 510, 512 540 C 554 510, 594 470, 594 420 C 594 370, 564 320, 512 320 Z" fill="#A8C5A0" opacity="0.7"/>
  <ellipse cx="430" cy="700" rx="60" ry="20" fill="#5C8A5F" opacity="0.8" transform="rotate(-35 430 700)"/>
  <ellipse cx="594" cy="700" rx="60" ry="20" fill="#5C8A5F" opacity="0.8" transform="rotate(35 594 700)"/>
  <rect x="504" y="600" width="16" height="120" fill="#2D5E3F" opacity="0.6" rx="8"/>
</svg>
`.trim();

await sharp(Buffer.from(svg)).png().toFile(outPath);
console.log("Wrote", outPath);
