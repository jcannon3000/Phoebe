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
