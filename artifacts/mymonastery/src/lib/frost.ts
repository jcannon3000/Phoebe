import type { CSSProperties } from "react";

// Frosted-glass surface — the app's standard translucent card/pill/header look
// over a photo backdrop: a dark green-black tint + a backdrop blur, so the photo
// shows through (blurred). Spread into a style object: style={{ ...FROST, ... }}.
export const FROST: CSSProperties = {
  background: "rgba(9,26,16,0.3)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

// Just the blur — for surfaces whose background is dynamic (e.g. selected vs not);
// spread this and set `background` yourself: style={{ ...FROST_BLUR, background: x }}.
export const FROST_BLUR: CSSProperties = {
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

// A DARKER frosted surface — same blur, a deeper/more opaque tint. For chrome
// that should sit visually heavier than a card (the bottom nav bar, the
// daily-progress pill) so it reads as a solid frame over the photo.
export const FROST_DARK: CSSProperties = {
  background: "rgba(5,14,9,0.66)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};
