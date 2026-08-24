/**
 * Swapping a canticle (or the invitatory) mid-office.
 *
 * Owner: "on the canticle title page, there could be a pill that says choose
 * different canticle, which brings a dropdown similar to the table of
 * contents … they click one, come back to that title slide with the title
 * changed, and the next slide is the different canticle." And: "we want it
 * possible for the invitatory too."
 *
 * The office DISPLAYER needs no rebuilding for this. Every slide the
 * assemblers emit already carries the identity that makes a swap findable:
 * canticle slides carry `metadata.canticleKey`, and every invitatory slide
 * carries `metadata.invitatory: true`. Both runs are contiguous, so a swap is
 * a splice — which bcp-daily-office.tsx already does in four other places
 * (the prayer-list slide, the prompts slide, the salutation, the confession
 * invitation).
 *
 * What DID need building is this: the replacement slides have to be built the
 * same way the appointed ones were, or a swapped canticle would render subtly
 * differently from one the lectionary chose — different chunking, a missing
 * emoji, a title card that doesn't match. So the server builds them, using
 * the same splitCanticleIntoChunks + the same 4-verses-per-chunk cadence the
 * assemblers use, and the client only splices.
 *
 * INVITATORY SCOPE. Owner: "for the invitatory you don't need to change the
 * antiphon or the Gloria." That is also the liturgically correct scope — BCP
 * p. 80 offers "one of the Invitatory Psalms, Venite or Jubilate", and those
 * two take the SAME seasonal antiphon and the same Gloria. (Pascha Nostrum is
 * a seasonal substitution for Eastertide, not a reader's choice, and it takes
 * neither — which is exactly why it is not offered here.) So an invitatory
 * swap replaces only the title slide and the verse chunks, and the antiphon /
 * Gloria slides around them are left untouched.
 */

import { eq, inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { EP_BCP_TEXTS } from "../data/bcpEveningPrayerTexts";
import { splitCanticleIntoChunks } from "./psalmRange";
import type { Slide, SlideType } from "./assembleMorningPrayer";

/** Verses per body slide — matches pushCanticle / the invitatory in the assemblers. */
const VERSES_PER_CHUNK = 4;

/**
 * The Rite II canticles, 8–21. Numbers 1–7 are the Rite I settings and are
 * deliberately absent: Phoebe's offices are Rite II throughout, and offering
 * a Rite I canticle inside a Rite II office would be a category error, not a
 * choice.
 *
 * Text lives in two places for historical reasons — most in the bcp_texts
 * table (seeded), 15 and 17 only in the Evening Prayer module's embedded
 * constants — so resolveCanticleText below reads both. The catalogue itself
 * is here so the picker doesn't have to hit the database to render a list.
 */
export const CANTICLE_CATALOG: Array<{ key: string; label: string; latin: string; ref: string }> = [
  { key: "canticle_8",  label: "The Song of Moses",            latin: "Cantemus Domino",      ref: "BCP p. 85" },
  { key: "canticle_9",  label: "The First Song of Isaiah",     latin: "Ecce, Deus",           ref: "BCP p. 86" },
  { key: "canticle_10", label: "The Second Song of Isaiah",    latin: "Quærite Dominum",      ref: "BCP p. 86" },
  { key: "canticle_11", label: "The Third Song of Isaiah",     latin: "Surge, illuminare",    ref: "BCP p. 87" },
  { key: "canticle_12", label: "A Song of Creation",           latin: "Benedicite",           ref: "BCP p. 88" },
  { key: "canticle_13", label: "A Song of Praise",             latin: "Benedictus es",        ref: "BCP p. 90" },
  { key: "canticle_14", label: "A Song of Penitence",          latin: "Kyrie Pantokrator",    ref: "BCP p. 90" },
  { key: "canticle_15", label: "The Song of Mary",             latin: "Magnificat",           ref: "BCP p. 91" },
  { key: "canticle_16", label: "The Song of Zechariah",        latin: "Benedictus",           ref: "BCP p. 92" },
  { key: "canticle_17", label: "The Song of Simeon",           latin: "Nunc dimittis",        ref: "BCP p. 93" },
  { key: "canticle_18", label: "A Song to the Lamb",           latin: "Dignus es",            ref: "BCP p. 93" },
  { key: "canticle_19", label: "The Song of the Redeemed",     latin: "Magna et mirabilia",   ref: "BCP p. 94" },
  { key: "canticle_20", label: "Glory to God",                 latin: "Gloria in excelsis",   ref: "BCP p. 94" },
  { key: "canticle_21", label: "You are God",                  latin: "Te Deum laudamus",     ref: "BCP p. 95" },
];

/** Venite / Jubilate only — see the INVITATORY SCOPE note in the file header. */
export const INVITATORY_CATALOG: Array<{ key: string; label: string; latin: string; ref: string }> = [
  { key: "venite",   label: "Psalm 95",  latin: "Venite",   ref: "BCP p. 82" },
  { key: "jubilate", label: "Psalm 100", latin: "Jubilate", ref: "BCP p. 82" },
];

const CANTICLE_EMOJI: Record<string, string> = {
  canticle_8: "🌊", canticle_9: "💧", canticle_10: "🔍", canticle_11: "✨",
  canticle_12: "🌍", canticle_13: "🙌", canticle_14: "🕊️", canticle_15: "🌟",
  canticle_16: "🌅", canticle_17: "🕯️", canticle_18: "🐑", canticle_19: "👑",
  canticle_20: "🎶", canticle_21: "📜",
};

function mk(id: string, type: SlideType, emoji: string, eyebrow: string, content: string, overrides: Partial<Slide> = {}): Slide {
  return {
    id, type, emoji, eyebrow, title: null, content,
    isCallAndResponse: false, callAndResponseLines: null,
    bcpReference: null, isScrollable: false, scrollHint: null, metadata: {},
    ...overrides,
  };
}

/** Text + title for a canticle: bcp_texts first, the EP module's embedded
 *  constants as the fallback (15 and 17 live only there). */
async function resolveCanticleText(key: string): Promise<{ content: string; title: string | null; ref: string | null } | null> {
  const rows = await db.select().from(bcpTextsTable).where(eq(bcpTextsTable.textKey, key)).limit(1);
  const row = rows[0];
  if (row?.content) return { content: row.content, title: row.title ?? null, ref: row.bcpReference ?? null };
  const ep = (EP_BCP_TEXTS as Record<string, { content: string; title?: string | null; bcpReference?: string | null }>)[key];
  if (ep?.content) return { content: ep.content, title: ep.title ?? null, ref: ep.bcpReference ?? null };
  return null;
}

/**
 * The replacement slides for a canticle — a title card then the body,
 * chunked exactly as pushCanticle does it (single slide at ≤4 verses, verse
 * chunks beyond that), and tagged with the new canticleKey so the NEXT swap
 * can find this run in turn.
 */
export async function buildCanticleRun(key: string, idPrefix: string): Promise<Slide[] | null> {
  const meta = CANTICLE_CATALOG.find((c) => c.key === key);
  if (!meta) return null;
  const text = await resolveCanticleText(key);
  if (!text) return null;

  const num = key.replace("canticle_", "");
  const headline = `Canticle ${num}`;
  const title = text.title ?? `${headline} — ${meta.label}`;
  const eyebrow = `CANTICLE · ${(text.title ?? meta.label).toUpperCase()}`;
  const emoji = CANTICLE_EMOJI[key] ?? "🌟";
  const ref = text.ref ?? meta.ref;
  let n = 0;
  const id = () => `${idPrefix}-${n++}`;

  const slides: Slide[] = [
    mk(id(), "canticle_title", emoji, eyebrow, "", {
      title, bcpReference: ref,
      metadata: { canticleKey: key, canticleHeadline: headline },
    }),
  ];
  const { verses, chunks } = splitCanticleIntoChunks(text.content, VERSES_PER_CHUNK);
  if (verses <= VERSES_PER_CHUNK) {
    slides.push(mk(id(), "canticle", emoji, eyebrow, text.content, { title, bcpReference: ref, metadata: { canticleKey: key } }));
    return slides;
  }
  chunks.forEach((chunk, i) => {
    slides.push(mk(id(), "canticle", emoji, eyebrow, chunk, {
      title, bcpReference: ref,
      metadata: { canticleKey: key, canticleChunkIndex: i, canticleChunkTotal: chunks.length },
    }));
  });
  return slides;
}

/**
 * The replacement slides for the invitatory — the title card and the verse
 * chunks ONLY. The antiphon and Gloria slides that bracket them are left in
 * place by the caller; see the INVITATORY SCOPE note in the file header for
 * why that's both what was asked for and liturgically correct.
 */
export async function buildInvitatoryRun(key: string, idPrefix: string): Promise<Slide[] | null> {
  const meta = INVITATORY_CATALOG.find((c) => c.key === key);
  if (!meta) return null;
  const rows = await db.select().from(bcpTextsTable).where(inArray(bcpTextsTable.textKey, [key]));
  const content = rows[0]?.content;
  if (!content) return null;

  const eyebrow = meta.label.toUpperCase();
  let n = 0;
  const id = () => `${idPrefix}-${n++}`;
  const slides: Slide[] = [
    mk(id(), "psalm_title", "🎶", eyebrow, "", {
      bcpReference: meta.ref,
      metadata: { invitatory: true, invitPsalmKey: key, psalmHeadline: meta.latin },
    }),
  ];
  const { chunks } = splitCanticleIntoChunks(content, VERSES_PER_CHUNK);
  chunks.forEach((chunk, i) => {
    slides.push(mk(id(), "invitatory_psalm", "🎶", eyebrow, chunk, {
      bcpReference: meta.ref,
      metadata: {
        invitatory: true, invitPsalmKey: key, psalmHeadline: meta.latin,
        invitatoryChunkIndex: i, invitatoryChunkTotal: chunks.length,
      },
    }));
  });
  return slides;
}
