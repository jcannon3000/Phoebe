/**
 * Rite I / Rite II — the scaffolding, ahead of the content.
 *
 * Owner: "could we create a Rite I / Rite II option for the settings of the
 * office that comes down? That would take switching out all the text."
 *
 * It would, and that is the whole cost. As of this commit there is ZERO Rite I
 * text in the system: a full Rite I office needs roughly 150 rows that don't
 * exist (95 Collects of the Day, 27 opening sentences, 11 antiphons, the seven
 * Rite I canticles — which aren't seeded at all, only 8–21 are — and ~10
 * invariant prayers). The 1979 BCP shares ONE psalter between the rites, so
 * the 150 psalms need nothing, which is the one big bucket that comes free.
 *
 * ── Why this file is only a resolver ──
 *
 * The mechanism for "swap out all the text" already existed before this: the
 * assemblers thread a `locale` and route every text lookup through their own
 * localized(), which consults a per-key override map. Rite is the same shape,
 * so this adds a resolver rather than a parallel pipeline.
 *
 * ── The fallback is the important part ──
 *
 * riteKeyCandidates() returns the Rite I key FIRST and the Rite II key SECOND,
 * and callers take the first that resolves. That is what makes the content
 * shippable one category at a time: seed `confession_text_rite1` and the
 * confession turns traditional while everything else stays Rite II, with no
 * broken slide and no code change in between. Without the fallback, Rite I
 * would be all-or-nothing across ~150 rows before it could ship at all.
 *
 * ── Deliberately NOT exposed yet ──
 *
 * No UI reaches this. A "Rite I" switch that rendered 95% Rite II text would
 * be worse than no switch — someone choosing Rite I wants thee and thou, and
 * contemporary language under a traditional label is a broken promise in a way
 * a missing feature is not. Turn it on when enough content exists; see
 * RITE_I_ENABLED below for the single gate.
 */

export type Rite = "I" | "II";

/**
 * Is Rite I offered to readers at all?
 *
 * The ONE gate. While false, `parseRite` coerces every request back to Rite II,
 * so the parameter is inert end to end no matter what a client sends — the
 * plumbing can land and be reviewed without any risk of a half-translated
 * office reaching someone. Flip to true once the text exists.
 */
export const RITE_I_ENABLED = false;

/** Suffix convention for a Rite I variant of an existing text key. */
export const RITE1_SUFFIX = "_rite1";

/**
 * The keys to try, in order, for one logical text under a given rite.
 *
 * Rite II is always the last candidate, so an unseeded Rite I text degrades to
 * the contemporary wording rather than to a missing-text placeholder.
 */
export function riteKeyCandidates(key: string, rite: Rite): string[] {
  return rite === "I" ? [`${key}${RITE1_SUFFIX}`, key] : [key];
}

/**
 * Every key an assembler should FETCH to serve `keys` under `rite` — the Rite I
 * variants alongside the Rite II originals, so one query covers both and the
 * fallback above can resolve without a second round trip.
 */
export function expandKeysForRite(keys: string[], rite: Rite): string[] {
  if (rite !== "I") return keys;
  return [...new Set(keys.flatMap((k) => riteKeyCandidates(k, rite)))];
}

/**
 * Parse a `?rite=` query value. Anything unrecognised — and everything at all
 * while RITE_I_ENABLED is false — is Rite II, which is the safe default: an
 * office in the wrong rite is a worse failure than one that ignored a param.
 */
export function parseRite(raw: unknown): Rite {
  if (!RITE_I_ENABLED) return "II";
  return raw === "I" || raw === "i" || raw === "1" || raw === 1 ? "I" : "II";
}
