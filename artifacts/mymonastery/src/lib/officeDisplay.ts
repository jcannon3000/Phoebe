// Office DISPLAY preferences — how the office slideshow looks on THIS device:
// the text size and the backdrop (leaves / planet / plain). Deliberately
// device-local (not in ROUTINE_KEYS): font size is per-screen ergonomics, not
// routine structure, so it shouldn't ride rule syncs or prescribed rules.
// The office settings sheet writes these; the deck re-reads on the event.

import type { CSSProperties } from "react";

export const OFFICE_DISPLAY_EVENT = "phoebe:office-display-changed";

export type OfficeBackdrop = "leaves" | "planet" | "plain" | "paper";
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

/** The style spread every deck root applies: the chosen typeface always, and
 *  the Paper variable set when that backdrop is chosen. */
export function officeThemeStyle(backdrop: OfficeBackdrop, font: OfficeFont): CSSProperties {
  const style: Record<string, string> = { "--office-font": OFFICE_FONT_FAMILIES[font] };
  if (backdrop === "paper") Object.assign(style, PAPER_THEME_VARS);
  return style as CSSProperties;
}

// The stepped text sizes (A− / A+). 1 = today's size.
export const OFFICE_FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;

export function getOfficeBackdrop(): OfficeBackdrop {
  try {
    const raw = localStorage.getItem(BACKDROP_KEY);
    if (raw === "planet" || raw === "plain" || raw === "leaves" || raw === "paper") return raw;
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
