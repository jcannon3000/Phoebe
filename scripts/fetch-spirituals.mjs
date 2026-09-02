#!/usr/bin/env node
/**
 * Harvest "Slave Songs of the United States" (Allen, Ware & Garrison, 1867)
 * into artifacts/mymonastery/src/lib/spiritualsCatalogue.ts.
 *
 * Owner: "make a library of all the negro spirituals … we want the text of
 * each like they are canticles so we could use them … and include metadata."
 *
 * The book is the first published collection of African-American sacred song —
 * 136 songs transcribed from formerly enslaved singers, most of them at Port
 * Royal during the Civil War. Published 1867, so public domain.
 *
 * SOURCE: the University of North Carolina's Documenting the American South
 * transcription, not the raw page scans. The Internet Archive OCR of the same
 * book renders titles as "THE GBAYEYAKB" and interleaves the hyphen-split
 * syllables printed under the staves; DocSouth is proofread and marks each
 * song with <DIV3 TYPE="song">, so the structure survives.
 *
 * WHAT "LIKE CANTICLES" MEANS HERE. The book prints a song the way a singer
 * who already knows it needs it: the refrain and first verse under the
 * engraved staff, then later verses abbreviated to their opening words —
 * "Roll, Jordan, &c." A canticle has to be readable straight down the page by
 * someone who has never heard it. So each verse is expanded: where a verse
 * trails off into "&c.", the cue is matched against the opening stanza and the
 * refrain is written out in full. Expansion is conservative — it happens only
 * on an unambiguous cue match, `printedAs` always keeps the book's own line,
 * and `expanded` says which verses were touched.
 *
 * Run:  node scripts/fetch-spirituals.mjs
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SRC = "https://docsouth.unc.edu/church/allen/allen.html";
const IMG_BASE = "https://docsouth.unc.edu/church/allen/";
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../artifacts/mymonastery/src/lib/spiritualsCatalogue.ts",
);

/** The book's own four parts, keyed by song number (from its table of contents). */
const PARTS = [
  [1, 82, "I", "South-Eastern Slave States", "South Carolina, Georgia, and the Sea Islands"],
  [83, 102, "II", "Northern Seaboard Slave States", "Delaware, Maryland, Virginia, and North Carolina"],
  [103, 111, "III", "Inland Slave States", "Tennessee, Arkansas, and the Mississippi River"],
  [112, 136, "IV", "Gulf States", "Florida and Louisiana; miscellaneous"],
];

/**
 * The songs that are NOT spirituals.
 *
 * There is no structural way to find these. The editors say so themselves:
 * "We had hoped to obtain enough secular songs to make a division by
 * themselves; there are, however, so few of these that it has been decided to
 * intersperse them with the spirituals under their respective States." So they
 * are scattered through all four parts, and a number range cannot catch them —
 * an earlier version of this file assumed one and appointed a Mississippi
 * steamboat song as a day's prayer.
 *
 * Each exclusion below rests on evidence, not on the song feeling secular:
 *   82   a rowing song ("Heave away"), sung at the oar
 *   86   the editors' headnote calls it a corn-song
 *   87   likewise a corn-song, sung at the shucking
 *   109  a play song
 *   110  a patrol song
 *   111  headnote: "the strange barbaric songs that one hears upon the
 *        Western steamboats"
 *   130-136  the Louisiana Creole set, secular throughout
 */
const SECULAR = new Set([82, 86, 87, 109, 110, 111, 130, 131, 132, 133, 134, 135, 136]);

/**
 * Songs dropped from the catalogue entirely — not carried, not shown, not
 * appointable. Owner's decision, 2026-09-01.
 *
 * No. 110 is a patrol song whose 1867 title is a racial slur. Flagging it
 * secular kept it out of the practice but still printed it in the admin
 * library; the owner asked for it gone. It is excluded here at the source, so
 * no surface can render it and no regeneration quietly brings it back.
 * Removing it leaves a deliberate gap in the numbering — the book's numbers are
 * kept as printed, so 109 is followed by 111.
 */
const DROPPED = new Set([110]);

/**
 * Songs carrying no obviously religious word, which are therefore worth a
 * human eye before they are appointed as a day's prayer — flagged, NOT
 * excluded. A word test cannot do this job: it reads "Many Thousand Go" and
 * "Sinner Won't Die No More" as irreligious, and No. 58 has no such word in it
 * at all while its headnote calls it a shout, which is sacred. The flag exists
 * so the admin library can show the owner what to look at; the judgement is
 * theirs, not this script's.
 */
const REVIEW = new Set([58, 61, 64, 106, 116, 120, 121]);

const decode = (s) =>
  s
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ({ eacute: "é", egrave: "è", agrave: "à",
      ccedil: "ç", ocirc: "ô", ecirc: "ê", acirc: "â", ugrave: "ù", icirc: "î",
      uuml: "ü", apos: "'", mdash: "—", ndash: "–" }[n] ?? m));

/** HTML fragment -> text. `breaks` keeps <br> as newlines (lyrics need them). */
function clean(frag, breaks = false) {
  let t = frag
    .replace(/<a href="#note\d+">[\s\S]*?<\/a>/gi, "")  // footnote markers
    .replace(/<sup>[\s\S]*?<\/sup>/gi, "");
  if (breaks) t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|blockquote|div3?)>/gi, "\n");
  t = decode(t.replace(/<[^>]+>/g, " ")).replace(/ /g, " ");
  if (!breaks) return t.replace(/\s+/g, " ").trim();
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    // A song that runs over a page break has the running head dropped into it.
    .filter((l) => l && !/^Page\s+[0-9ivxl]+$/i.test(l))
    .join("\n");
}

/** Titles and initials whose trailing period does NOT close a field. The table
 *  of contents reads "Col. Higginson's regiment. Lt.-Col. Trowbridge", so a
 *  naive split on "." truncates that place to "Col". */
const ABBREV = /(?:^|[\s.-])(?:mr|mrs|ms|miss|rev|dr|col|lt|capt|gen|maj|prof|st|hon|jr|sr|mc[a-z]+|[a-z])$/i;

/** "<place>. <contributor>" -> ["<place>", "<contributor>"], abbreviation-safe. */
function splitFields(tail) {
  const out = [];
  let buf = "";
  for (const tok of tail.split(/(?<=\.)\s+/)) {
    buf = buf ? `${buf} ${tok}` : tok;
    if (!buf.endsWith(".") || ABBREV.test(buf.replace(/\.$/, ""))) continue;
    out.push(buf.replace(/\.$/, "").trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.replace(/\.$/, "").trim());
  return out.filter(Boolean);
}

const partFor = (n) => {
  const p = PARTS.find(([lo, hi]) => n >= lo && n <= hi);
  return p ? { part: p[2], region: p[3], regionIncludes: p[4] } : { part: null, region: null, regionIncludes: null };
};

/**
 * Turn the printed lyric into canticle stanzas.
 *
 * The book's conventions, all of which have to be undone:
 *  - the first block is bracketed [..] — that is the portion printed under the
 *    engraved staff, normally refrain + first verse;
 *  - verse numbers appear as "2." or bare "2";
 *  - a verse that reuses the refrain is cut short with "&c." after a cue word.
 */
function toStanzas(lyrics) {
  const blocks = lyrics.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const stanzas = [];
  for (const [i, raw] of blocks.entries()) {
    const sung = raw.includes("[");
    const body = raw.replace(/[[\]]/g, "").trim();
    if (!body) continue;
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    // A leading verse number belongs to the stanza, not to its first line.
    let number = null;
    const m = lines[0]?.match(/^(\d{1,3})[.)]?\s+(.*)$/);
    if (m) { number = +m[1]; lines[0] = m[2]; }
    else if (i === 0) number = 1;
    stanzas.push({
      number,
      lines: lines.filter(Boolean),
      printedAs: lines.filter(Boolean).slice(),
      sung,
      resumesRefrain: hasEtc(lines[lines.length - 1] ?? ""),
      expanded: false,
    });
  }
  return stanzas;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

/** The book's "and so on" markers: "&c.", "etc.", "etc,", "etc.;", "etcetera". */
const ETC = /\s*[,;]?\s*(?:&c|etc|etcetera)\b[.,;:]*\s*$/i;
const hasEtc = (line) => ETC.test(line ?? "");

/**
 * Restore a line the book cut short.
 *
 * A verse ending "For Jesus come, &c." or "My Lord, etc." is telling a singer
 * who already knows the song to sing the rest of a line printed earlier. The
 * cue is the FRONT of that earlier line, so the job is to find the line it
 * points at and write it out whole.
 *
 * The cue is matched as a SUFFIX of the shortened line, longest first, because
 * the pointer is often only the tail of it: "What shall I do for a hiding
 * place? And a heav'n, &c." cues on "And a heav'n", not on the whole line, and
 * the words before the cue are kept. Matching is over EVERY stanza — these
 * cues frequently point at a middle verse rather than the opening one.
 *
 * Deliberately completes the LINE ONLY, never the rest of the stanza it found.
 * Running on to the end of the matched stanza sounds plausible and is wrong:
 * it silently imports lines the verse never had.
 *
 * Returns the completed line(s) as an array, or null when nothing matches
 * confidently — in which case the book's own abbreviated line stands.
 */
function completeCuedLine(line, stanzas, own) {
  const cueText = line.replace(ETC, "").replace(/[,;:.\s]+$/, "").trim();
  if (!cueText) return null;
  const words = cueText.split(/\s+/);

  for (let k = words.length; k >= 1; k--) {
    const suffix = words.slice(words.length - k).join(" ");
    const nSuffix = norm(suffix.replace(/^["'“]+/, ""));
    if (nSuffix.length < 3) continue;

    for (const st of stanzas) {
      for (const cand of st.lines) {
        if (st === own && cand === line) continue;       // not itself
        if (hasEtc(cand)) continue;                       // not another stub
        if (/\.\s*\.\s*\./.test(cand)) continue;          // printer's ellipsis
        const nCand = norm(cand);
        if (!nCand.startsWith(nSuffix)) continue;
        const prefix = words.slice(0, words.length - k).join(" ");

        // The cue is the FRONT of a longer line: finish that line.
        if (nCand.length > nSuffix.length) {
          return [prefix ? `${prefix} ${cand}` : cand];
        }

        // The cue IS the whole line — so it names a refrain, and what was cut
        // is the lines that FOLLOW it. Only taken from the opening stanza,
        // where this book prints its refrains under the staff, and stopped at
        // another stub; anywhere else this would import lines the verse never
        // had. Nothing to add means nothing gained, so the stub stands.
        if (st !== stanzas[0]) continue;
        const rest = [];
        for (const nxt of st.lines.slice(st.lines.indexOf(cand) + 1)) {
          if (hasEtc(nxt) || /\.\s*\.\s*\./.test(nxt)) break;
          rest.push(nxt);
        }
        if (!rest.length) continue;
        return [prefix ? `${prefix} ${cand}` : cand, ...rest];
      }
    }
  }
  return null;
}
/** Give a substituted line the punctuation the frame's line carried. */
const repunct = (line, like) =>
  line.replace(/[,;:.!?]+$/, "") + (like.match(/[,;:.!?]+$/)?.[0] ?? "");

/**
 * Write the song out in full.
 *
 * The book prints later verses the way a singer who knows the tune needs
 * them — only the words that change — in two shorthands, both undone here:
 *
 *   "&c."  the verse trails off after a cue word. The cue names a line of the
 *          opening stanza; the refrain is that line through the end of it.
 *
 *   a bare changing line, where the opening stanza's own frame shows where it
 *          goes: "No more peck o' corn for me, / No more, no more; / No more
 *          peck o' corn for me, / Many tousand go." repeats its first line, so
 *          "No more driver's lash for me" refills both those slots and the
 *          fixed lines stand.
 *
 * Both are conservative on purpose. The frame is only refilled when the
 * opening stanza demonstrably repeats a line (28 of the 136 songs), because
 * 352 later stanzas are shorter than their opening one and most are simply
 * short verses — refilling those would be inventing text, not restoring it.
 * `printedAs` always keeps the book's own lines and `expanded` marks what moved.
 */
function expandAbbreviations(stanzas) {
  const opening = stanzas[0];
  if (!opening || stanzas.length < 2) return { stanzas, refrain: null };
  const template = opening.lines;
  const slots = template
    .map((l, i) => (norm(l) === norm(template[0]) ? i : -1))
    .filter((i) => i >= 0);

  const refrain = null;

  // PASS 1 — write out every abbreviated line, wherever it sits.
  //
  // These cues are NOT only at the end of a verse: "My Lord, etc." is the
  // SECOND line of its stanza in no. 129 and the FIRST in no. 95. An earlier
  // version looked at the last line alone and so never even examined 33 of
  // them, including all eleven in no. 129. Walk every line of every stanza,
  // the opening one included.
  for (const st of stanzas) {
    for (let i = 0; i < st.lines.length; i++) {
      if (!hasEtc(st.lines[i])) continue;
      const full = completeCuedLine(st.lines[i], stanzas, st);
      if (!full) continue;
      st.lines.splice(i, 1, ...full);
      i += full.length - 1;                 // don't re-scan what we just wrote
      st.expanded = true;
    }
  }

  // PASS 2 — verses printed as only their changing line, refilled from the
  // opening stanza's frame. Runs after pass 1 so the frame is already whole.
  for (const st of stanzas.slice(1)) {
    if (st.lines.some(hasEtc)) continue;

    if (slots.length >= 2 && st.lines.length < template.length && st.lines.length <= slots.length) {
      const filled = template.slice();
      slots.forEach((slot, i) => {
        filled[slot] = repunct(st.lines[Math.min(i, st.lines.length - 1)], template[slot]);
      });
      st.lines = filled;
      st.expanded = true;
    }
  }
  return { stanzas, refrain };
}

const esc = (s) => JSON.stringify(s);

async function main() {
  // Cached so re-runs while tuning the parse don't hammer a university server.
  // Delete scripts/.cache/allen.html to re-fetch.
  const cacheDir = resolve(dirname(fileURLToPath(import.meta.url)), ".cache");
  const cached = resolve(cacheDir, "allen.html");
  let html;
  if (existsSync(cached) && !process.env.REFETCH) {
    html = readFileSync(cached, "utf8");
    process.stdout.write(`using cached source (${html.length} bytes)\n`);
  } else {
    process.stdout.write(`fetching ${SRC}\n`);
    const res = await fetch(SRC, { headers: { "user-agent": "phoebe-spirituals-harvest" } });
    if (!res.ok) throw new Error(`source returned ${res.status}`);
    html = await res.text();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cached, html, "utf8");
    process.stdout.write(`  ${html.length} bytes\n`);
  }

  // ---- table of contents: place collected + who wrote it down, per song ----
  const tocStart = html.indexOf("PART I.");
  const tocEnd = html.indexOf("Page xliii", tocStart);
  const toc = clean(html.slice(tocStart, tocEnd > 0 ? tocEnd : tocStart + 25000));
  const prov = new Map();
  const tocRe = /(?:^|\s)(\d{1,3})\s+([^.]+?)\.\s+(.*?)\s*\.?\s*\.\s*\.\s*\.\s*\.\s*(\d{1,3})(?=\s|$)/g;
  for (let m; (m = tocRe.exec(toc)); ) {
    const n = +m[1];
    if (n < 1 || n > 136 || prov.has(n)) continue;
    const bits = splitFields(m[3].trim());
    prov.set(n, {
      collectedAt: bits[0] ?? null,
      contributor: bits.length > 1 ? bits.slice(1).join(". ") : null,
      bookPage: +m[4],
    });
  }
  process.stdout.write(`  table of contents: ${prov.size} songs\n`);

  // ---- the songs ----
  const chunks = html.slice(html.indexOf('<DIV3 TYPE="song">')).split('<DIV3 TYPE="song">').slice(1);
  const songs = [];
  let last = 0;
  for (const chunk of chunks) {
    const hm = chunk.match(/<H3 align="center">([\s\S]*?)<\/H3>/i);
    if (!hm) continue;
    const heading = clean(hm[1]);
    const nm = heading.match(/^(\d{1,3})\.\s*(.*)$/);
    const number = nm ? +nm[1] : last + 1;
    let title = (nm ? nm[2] : heading).trim().replace(/\.$/, "").trim();
    last = number;
    // Titles are engraved in caps; render them as a reader expects.
    title = title
      .toLowerCase()
      // Word starts only. An apostrophe and a hyphen are NOT word starts here:
      // treating them as such produced "I Can'T Stay Behind", "Jacob'S Ladder"
      // and "Satan's Camp a-Fire" across 21 of the titles, because this book is
      // full of elisions ("o'er", "don't") and dialect compounds ("a-fire",
      // "to-night") where the letter after the mark continues the same word.
      .replace(/(^|[\s("“])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase())
      .replace(/\bI'M\b/gi, "I'm").replace(/\bDe\b/g, "de").replace(/\b(A|An|The|And|Of|On|In|To|My|Is|For)\b/g,
        (w, _x, i) => (i === 0 ? w : w.toLowerCase()))
      .replace(/^(.)/, (c) => c.toUpperCase());

    const lyrics = (() => {
      const seen = [];
      const re = /<blockquote>([\s\S]*?)<\/blockquote>/gi;
      for (let m; (m = re.exec(chunk)); ) { const t = clean(m[1], true); if (t) seen.push(t); }
      // blockquotes nest; drop any capture wholly contained in another.
      return seen.filter((t, i) => !seen.some((o, j) => j !== i && o.includes(t) && o !== t))
        .filter((t, i, a) => a.indexOf(t) === i).join("\n\n");
    })();

    const glosses = [...chunk.matchAll(/<FONT color="#721c24"[^>]*>([\s\S]*?)<\/FONT>/gi)]
      .map((m) => clean(m[1]).replace(/^[*+^\s]+/, "").trim()).filter(Boolean);

    const commentary = [...chunk.matchAll(/<P>([\s\S]*?)<\/P>/gi)]
      .map((m) => clean(m[1])).filter((t) => t.startsWith("[") && t.length > 20)
      .map((t) => t.replace(/^\[|\]$/g, "").trim()).join(" ") || null;

    // Dropped at the source: nothing downstream can render what is never emitted.
    if (DROPPED.has(number)) continue;

    const img = chunk.match(/<IMG SRC="(ss[^"]+)"/i);
    const { stanzas, refrain } = expandAbbreviations(toStanzas(lyrics));
    const p = prov.get(number) ?? {};

    songs.push({
      number, title, ...partFor(number),
      collectedAt: p.collectedAt ?? null,
      contributor: p.contributor ?? null,
      bookPage: p.bookPage ?? null,
      sacred: !SECULAR.has(number),
      reviewNeeded: REVIEW.has(number),
      sheetMusic: img ? IMG_BASE + img[1] : null,
      refrain, stanzas, glosses, commentary,
    });
  }
  songs.sort((a, b) => a.number - b.number);

  // ---- emit ----
  const body = songs.map((s) => `  {
    number: ${s.number},
    title: ${esc(s.title)},
    part: ${esc(s.part)},
    region: ${esc(s.region)},
    regionIncludes: ${esc(s.regionIncludes)},
    collectedAt: ${s.collectedAt ? esc(s.collectedAt) : "null"},
    contributor: ${s.contributor ? esc(s.contributor) : "null"},
    bookPage: ${s.bookPage ?? "null"},
    sacred: ${s.sacred},
    reviewNeeded: ${s.reviewNeeded},
    sheetMusic: ${s.sheetMusic ? esc(s.sheetMusic) : "null"},
    refrain: ${s.refrain ? `[${s.refrain.map(esc).join(", ")}]` : "null"},
    stanzas: [${s.stanzas.map((st) => `
      { number: ${st.number ?? "null"}, sung: ${st.sung}, expanded: ${st.expanded}, lines: [${st.lines.map(esc).join(", ")}], printedAs: [${st.printedAs.map(esc).join(", ")}] },`).join("")}
    ],
    glosses: [${s.glosses.map(esc).join(", ")}],
    commentary: ${s.commentary ? esc(s.commentary) : "null"},
  },`).join("\n");

  const out = `/**
 * Slave Songs of the United States — Allen, Ware & Garrison, 1867.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-spirituals.mjs
 *
 * The first published collection of African-American sacred song: ${songs.length}
 * songs written down from formerly enslaved singers, most of them at Port
 * Royal, South Carolina during the Civil War. Public domain (1867). The text
 * is UNC's Documenting the American South transcription of the book.
 *
 * The songs are carried as CANTICLES — numbered stanzas of whole lines, with
 * the refrain written out wherever the book abbreviated it to "&c." so a
 * reader who does not already know the tune can pray it straight down. Each
 * stanza keeps the book's own lines in \`printedAs\`, and \`expanded\` marks the
 * ones where the refrain was restored.
 *
 * A note on the words. The collectors were white abolitionists writing in
 * 1867, and they rendered Gullah and African-American speech in the eye-
 * dialect of their day; the spelling is theirs, not the singers'. \`glosses\`
 * carries their own footnoted translations. The text is kept verbatim because
 * it is a primary source; anything user-facing should say whose transcription
 * it is.
 */

export type SpiritualStanza = {
  /** Verse number as printed, where the book numbered it. */
  number: number | null;
  /** Printed under the engraved staff — the portion actually set to music. */
  sung: boolean;
  /** True when a "&c." was resolved back into the full refrain. */
  expanded: boolean;
  lines: string[];
  /** The book's own lines, before the refrain was written out. */
  printedAs: string[];
};

export type Spiritual = {
  /** The book's song number, 1-${songs.length}. */
  number: number;
  title: string;
  /** Which of the book's four regional parts. */
  part: string | null;
  region: string | null;
  regionIncludes: string | null;
  /** Where it was collected, per the table of contents. */
  collectedAt: string | null;
  /** Who wrote it down (often initials: C. P. W. is Charles Pickard Ware). */
  contributor: string | null;
  bookPage: number | null;
  /** False for songs there is evidence are NOT spirituals — rowing, corn,
   *  play, patrol and steamboat songs, and the Creole set. Only these are kept
   *  out of the daily lectionary. */
  sacred: boolean;
  /** Sacred by default, but carrying no obviously religious word — worth the
   *  owner's eye before it is appointed as a day's prayer. Advisory only. */
  reviewNeeded: boolean;
  /** The engraved music for this song, scanned. */
  sheetMusic: string | null;
  refrain: string[] | null;
  stanzas: SpiritualStanza[];
  /** The collectors' own footnotes — mostly translations of a word. */
  glosses: string[];
  /** The editors' headnote: where the song travelled, how it was sung. */
  commentary: string | null;
};

export const SPIRITUALS_SOURCE = {
  title: "Slave Songs of the United States",
  editors: "William Francis Allen, Charles Pickard Ware & Lucy McKim Garrison",
  year: 1867,
  publisher: "A. Simpson & Co., New York",
  transcription: "Documenting the American South, University of North Carolina at Chapel Hill",
  url: "https://docsouth.unc.edu/church/allen/allen.html",
  rights: "Public domain (published 1867).",
} as const;

export const SPIRITUALS: Spiritual[] = [
${body}
];

/** Lookup by the book's song number. */
export const spiritualByNumber = (n: number): Spiritual | undefined =>
  SPIRITUALS.find((s) => s.number === n);

/** The full text of a song, ready to render as a canticle. */
export function spiritualText(s: Spiritual): string {
  return s.stanzas
    .map((st) => (st.number ? \`\${st.number}. \` : "") + st.lines.join("\\n"))
    .join("\\n\\n");
}
`;

  writeFileSync(OUT, out, "utf8");

  const stanzaCount = songs.reduce((n, s) => n + s.stanzas.length, 0);
  const expanded = songs.reduce((n, s) => n + s.stanzas.filter((x) => x.expanded).length, 0);
  process.stdout.write(
    `\nwrote ${OUT}\n` +
    `  songs        ${songs.length}\n` +
    `  stanzas      ${stanzaCount} (${expanded} refrains written out)\n` +
    `  with refrain ${songs.filter((s) => s.refrain).length}\n` +
    `  place known  ${songs.filter((s) => s.collectedAt).length}\n` +
    `  contributor  ${songs.filter((s) => s.contributor).length}\n` +
    `  commentary   ${songs.filter((s) => s.commentary).length}\n` +
    `  glosses      ${songs.filter((s) => s.glosses.length).length}\n` +
    `  sacred       ${songs.filter((s) => s.sacred).length}\n`,
  );
}

main().catch((e) => { process.stderr.write(`FAILED: ${e.message}\n`); process.exit(1); });
