// PLACEHOLDER until scripts/fetch-hymn-texts.py runs (hymnary.org rate limit).
export type HymnText = { firstLine: string; credit: string; source: string | null; stanzas: string[]; refrain: string | null; from: string };
export function hymnTextFor(_key: string | null | undefined): HymnText | null { return null; }
