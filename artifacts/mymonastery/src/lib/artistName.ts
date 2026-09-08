// ── How an ACT artist's name is printed, in one place ────────────────────────
//
// Lifted out of pages/visio.tsx so the Rosary's mystery captions print names
// the same way Visio does. It carries a standing owner decision — "JESUS MAFA"
// is a SERIES, not a person, and must read as the Mafa community — and a copy
// of that rule in a second page is exactly how the two drift apart.

/** "1923-2002" → "1923–2002" (an en dash, not a hyphen). */
export function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}

/**
 * "Lippi, Filippino, -1504" → "Lippi, Filippino, d. 1504".
 *
 * ACT records an unknown birth year as a bare leading dash, which renders as a
 * dangling minus sign under the painting — it reads like a typo rather than
 * like "died 1504". Ranges that HAVE both years are left to tidyDate.
 *
 * And "JESUS MAFA" becomes "Mafa community, Cameroon" (owner): it is the Vie
 * de Jésus Mafa series, made with the Mafa community of northern Cameroon, and
 * printed under "Artist:" the raw value reads like someone's name. A DISPLAY
 * rename only — the catalogue value is untouched, so anything keying off the
 * series still works and the formal attribution still credits it as ACT does.
 */
export function tidyArtist(a: string): string {
  if (a.trim().toUpperCase() === "JESUS MAFA") return "Mafa community, Cameroon";
  return tidyDate(a.replace(/(^|[,\s])-\s*(\d{3,4})/g, "$1d. $2"));
}

/**
 * An ACT image URL that a browser will actually fetch.
 *
 * Ten of the works this app curates have SPACES in their filename —
 * ".../jpeg/Boy Jesus with the Teachers-Frank Wesley.jpg" — and a raw space in
 * an <img src> is not reliably encoded by every engine. On iOS it simply does
 * not load, which is how the Finding in the Temple showed up blank on a phone
 * while every reachability check passed: the checks used encodeURI and the
 * page did not.
 *
 * Guarded on whitespace so an already-encoded URL is never double-encoded
 * (encodeURI would turn its % into %25).
 */
export function safeArtUrl(url: string): string {
  return /\s/.test(url) ? encodeURI(url) : url;
}
