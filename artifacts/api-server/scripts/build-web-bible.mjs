/**
 * Build src/data/web.json — the World English Bible (WEB), public domain,
 * in the SAME shape and with the SAME 66 book names + order as the existing
 * data/rsv.json (ASV) so scriptureService's parser/lookup needs no changes.
 *
 * Source: getbible.net v2 (https://api.getbible.net/v2/web/<n>.json), one
 * request per book (1=Genesis … 66=Revelation, standard Protestant order).
 *
 * One-time / occasional build step — run with:  node scripts/build-web-bible.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

// The canonical book names + order we must reproduce (from the ASV file).
const rsv = JSON.parse(readFileSync(join(dataDir, "rsv.json"), "utf-8"));
const NAMES = rsv.books.map((b) => b.name); // length 66, index 0 = Genesis

async function fetchBook(n, attempt = 1) {
  const url = `https://api.getbible.net/v2/web/${n}.json`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "phoebe-bible-build" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchBook(n, attempt + 1);
    }
    throw new Error(`book ${n}: ${err.message}`);
  }
}

const books = [];
for (let n = 1; n <= 66; n++) {
  const raw = await fetchBook(n);
  // getbible: { name, chapters: [{ chapter, verses: [{ chapter, verse, text }] }] }
  const chapters = (raw.chapters ?? []).map((ch) => ({
    chapter: ch.chapter,
    verses: (ch.verses ?? []).map((v) => ({
      verse: v.verse,
      // Collapse internal whitespace/newlines; WEB sometimes wraps lines.
      text: String(v.text ?? "").replace(/\s+/g, " ").trim(),
    })),
  }));
  const verseCount = chapters.reduce((s, c) => s + c.verses.length, 0);
  books.push({ name: NAMES[n - 1], chapters });
  console.log(
    `  ${String(n).padStart(2)} ${NAMES[n - 1].padEnd(18)} getbible="${raw.name}"  ${chapters.length} ch / ${verseCount} vv`,
  );
}

const out = { translation: "WEB: World English Bible (public domain)", books };
const target = join(dataDir, "web.json");
writeFileSync(target, JSON.stringify(out));
const totalVerses = books.reduce((s, b) => s + b.chapters.reduce((t, c) => t + c.verses.length, 0), 0);
console.log(`\n[web-bible] wrote ${target}`);
console.log(`[web-bible]   ${books.length} books, ${totalVerses} verses`);
