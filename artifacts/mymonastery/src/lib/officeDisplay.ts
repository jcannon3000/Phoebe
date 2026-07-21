// Office DISPLAY preferences — how the office slideshow looks on THIS device:
// the text size and the backdrop (leaves / planet / plain). Deliberately
// device-local (not in ROUTINE_KEYS): font size is per-screen ergonomics, not
// routine structure, so it shouldn't ride rule syncs or prescribed rules.
// The office settings sheet writes these; the deck re-reads on the event.

import type { CSSProperties } from "react";

export const OFFICE_DISPLAY_EVENT = "phoebe:office-display-changed";

export type OfficeBackdrop = "leaves" | "planet" | "plain" | "paper" | "water";
const BACKDROP_KEY = "phoebe:office-backdrop";
const FONT_KEY = "phoebe:office-font-scale";
const PRAYING_MODE_KEY = "phoebe:office-praying-mode";

// How the office is prayed on THIS device: alone (today's clean, label-less
// reading) or together (the corporate form — Officiant / People rubrics on
// the dialogues, plus the responses the BCP appoints for group use, like the
// salutation before the Lord's Prayer). Device-local on purpose: a phone or
// screen used at a gathering flips to communal without touching the rule.
export type OfficePrayingMode = "individual" | "communal";

export function getOfficePrayingMode(): OfficePrayingMode {
  try {
    if (localStorage.getItem(PRAYING_MODE_KEY) === "communal") return "communal";
  } catch { /* private mode */ }
  return "individual";
}

export function setOfficePrayingMode(m: OfficePrayingMode): void {
  try {
    localStorage.setItem(PRAYING_MODE_KEY, m);
    window.dispatchEvent(new Event(OFFICE_DISPLAY_EVENT));
  } catch { /* non-fatal */ }
}

// ── Typeface (the ⚙ sheet's "Type" row) ─────────────────────────────────────
// The decks' text renders in var(--office-font, …) after the theme sweep, so
// switching here re-types every slide live.
export type OfficeFont = "grotesk" | "georgia" | "arial";
const FONT_FAMILY_KEY = "phoebe:office-font-family";
export const OFFICE_FONT_FAMILIES: Record<OfficeFont, string> = {
  grotesk: "'Space Grotesk', system-ui, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  arial: "Arial, Helvetica, sans-serif",
};

export function getOfficeFont(): OfficeFont {
  try {
    const raw = localStorage.getItem(FONT_FAMILY_KEY);
    if (raw === "georgia" || raw === "arial" || raw === "grotesk") return raw;
  } catch { /* private mode */ }
  return "grotesk";
}

export function setOfficeFont(f: OfficeFont): void {
  try {
    localStorage.setItem(FONT_FAMILY_KEY, f);
    window.dispatchEvent(new Event(OFFICE_DISPLAY_EVENT));
  } catch { /* non-fatal */ }
}

// ── Paper (light) theme ──────────────────────────────────────────────────────
// The decks' colors are CSS custom properties with DARK fallbacks
// (`var(--oh-ink, #F0EDE6)`, `rgba(var(--ot-sage, 143,175,150), 0.55)`), so
// the dark theme costs nothing and Paper is just this variable set applied on
// the deck root: a warm letter-paper ground with near-black ink, secondary
// text in faded warm umber, and the green accents deepened for a light page.
const PAPER_THEME_VARS: Record<string, string> = {
  // Solid color tokens (hex fallbacks in the decks).
  "--oh-ink": "#221E15",   // primary text — soft black ink
  "--oh-ink2": "#2A251A",  // secondary body text
  "--oh-sage": "#6E6450",  // muted labels (was sage green)
  "--oh-fern": "#5C6A52",  // soft green-gray text
  "--oh-green": "#3E7A56", // green accent text
  "--oh-pale": "#4A5442",
  "--oh-mist": "#55503F",
  "--oh-cream": "#5C4426", // the brown "physical book" accents
  "--oh-cta": "#2D5E3F",   // primary buttons keep their green
  "--oh-bg": "#F3ECDC",    // the paper itself
  "--oh-bg2": "#F3ECDC",
  "--oh-closing": "#EDE4D0",
  // RGB triplets (consumed as rgba(var(--ot-x, R,G,B), alpha)).
  "--ot-green": "58,94,64",
  "--ot-sage": "110,100,74",
  "--ot-deep": "236,228,210",   // frosted card grounds → lighter paper
  "--ot-mist": "82,74,56",
  "--ot-fern": "96,88,64",
  "--ot-wash": "243,236,221",   // photo washes / text shadows → vanish into the page
  "--ot-wash2": "243,236,221",
  "--ot-wash3": "243,236,221",
  "--ot-shadow": "243,236,221",
  "--ot-card": "233,224,204",
  "--ot-card2": "233,224,204",
  "--ot-pale": "88,80,60",
  "--ot-ink3": "32,29,22",
  "--ot-mint": "74,84,66",
  "--ot-brown": "122,88,52",
  "--ot-violet": "94,70,140",
};

// ── Water (blue) theme ───────────────────────────────────────────────────────
// A DARK ocean theme paired with the Water backdrop photos: the same token set
// as Paper, but blue-shaded — the deck's green fallbacks are hue-rotated toward
// blue at matching lightness, so grounds, the photo wash, frosted cards, and the
// accents all read blue instead of green while keeping the calm dark feel.
const WATER_THEME_VARS: Record<string, string> = {
  // Solid color tokens (deck hex fallbacks were green; these are the blue analogs).
  "--oh-ink": "#EDF2F6",   // primary text — cool near-white (was #F0EDE6)
  "--oh-ink2": "#DBE5EE",  // secondary body text
  "--oh-sage": "#8FADC8",  // muted labels — blue-gray (was sage green)
  "--oh-fern": "#A0C1DA",  // soft blue text
  "--oh-green": "#6FA8D6", // accent text — blue (was green)
  "--oh-pale": "#C6DCEC",
  "--oh-mist": "#C2D5E6",
  "--oh-cream": "#D9E0E8", // the "physical book" accents → cool driftwood
  "--oh-cta": "#2C5C82",   // primary buttons → ocean blue (was green)
  "--oh-bg": "#0A1826",    // the ground behind the photos — deep ocean
  "--oh-bg2": "#081320",
  "--oh-closing": "#0A1826",
  // RGB triplets (consumed as rgba(var(--ot-x, R,G,B), alpha)).
  "--ot-green": "46,100,150",   // accent → ocean blue (was 46,107,64)
  "--ot-sage": "143,172,200",
  "--ot-deep": "10,24,42",      // frosted card grounds → dark blue
  "--ot-mist": "194,212,230",
  "--ot-fern": "160,190,215",
  "--ot-wash": "8,20,38",       // photo washes / text shadows → dark blue
  "--ot-wash2": "8,16,32",
  "--ot-wash3": "6,14,28",
  "--ot-shadow": "8,24,44",
  "--ot-card": "16,34,54",
  "--ot-card2": "20,42,66",
  "--ot-pale": "178,206,228",
  "--ot-ink3": "236,240,246",
  "--ot-mint": "192,220,238",
  "--ot-brown": "138,150,168",  // warm book accent → cool slate
  "--ot-violet": "110,110,190", // → cool indigo
};

/** The style spread every deck root applies: the chosen typeface always, and
 *  the Paper (light) / Water (blue) variable set when that backdrop is chosen. */
export function officeThemeStyle(backdrop: OfficeBackdrop, font: OfficeFont): CSSProperties {
  const style: Record<string, string> = { "--office-font": OFFICE_FONT_FAMILIES[font] };
  if (backdrop === "paper") Object.assign(style, PAPER_THEME_VARS);
  else if (backdrop === "water") Object.assign(style, WATER_THEME_VARS);
  return style as CSSProperties;
}

// The literal color the browser toolbar / native status bar should paint for a
// backdrop — the `--oh-bg` ground behind the photos. MUST be a literal hex, not
// a `var(--oh-bg, …)` string: browsers do NOT resolve CSS variables inside a
// `<meta name="theme-color">`, so a var() there is ignored and the toolbar keeps
// the app's default green. Callers set the meta (+ native bar) to this while a
// themed deck is mounted, then restore on exit.
export function themeColorForBackdrop(backdrop: OfficeBackdrop): string {
  if (backdrop === "paper") return PAPER_THEME_VARS["--oh-bg"] ?? "#F3ECDC";
  if (backdrop === "water") return WATER_THEME_VARS["--oh-bg"] ?? "#0A1826";
  return "#102816"; // the app's default deep green (matches index.html)
}

// The stepped text sizes (A− / A+). 1 = today's size.
export const OFFICE_FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;

export function getOfficeBackdrop(): OfficeBackdrop {
  try {
    const raw = localStorage.getItem(BACKDROP_KEY);
    if (raw === "planet" || raw === "plain" || raw === "leaves" || raw === "paper" || raw === "water") return raw;
  } catch { /* private mode */ }
  return "leaves";
}

export function setOfficeBackdrop(b: OfficeBackdrop): void {
  try {
    localStorage.setItem(BACKDROP_KEY, b);
    window.dispatchEvent(new Event(OFFICE_DISPLAY_EVENT));
  } catch { /* non-fatal */ }
}

export function getOfficeFontScale(): number {
  try {
    const n = parseFloat(localStorage.getItem(FONT_KEY) ?? "");
    if (Number.isFinite(n) && n >= 0.7 && n <= 1.6) return n;
  } catch { /* private mode */ }
  return 1;
}

export function setOfficeFontScale(scale: number): void {
  try {
    const clamped = Math.max(0.7, Math.min(1.6, scale));
    localStorage.setItem(FONT_KEY, String(clamped));
    window.dispatchEvent(new Event(OFFICE_DISPLAY_EVENT));
  } catch { /* non-fatal */ }
}
