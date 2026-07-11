// Office DISPLAY preferences — how the office slideshow looks on THIS device:
// the text size and the backdrop (leaves / planet / plain). Deliberately
// device-local (not in ROUTINE_KEYS): font size is per-screen ergonomics, not
// routine structure, so it shouldn't ride rule syncs or prescribed rules.
// The office settings sheet writes these; the deck re-reads on the event.

export const OFFICE_DISPLAY_EVENT = "phoebe:office-display-changed";

export type OfficeBackdrop = "leaves" | "planet" | "plain";
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

// The stepped text sizes (A− / A+). 1 = today's size.
export const OFFICE_FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;

export function getOfficeBackdrop(): OfficeBackdrop {
  try {
    const raw = localStorage.getItem(BACKDROP_KEY);
    if (raw === "planet" || raw === "plain" || raw === "leaves") return raw;
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
