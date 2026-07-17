import { useEffect, useRef } from "react";

// Renders an emoji glyph PIXEL-centered in a square box.
//
// Why this exists: an emoji's visible ink is not centered within its font box,
// and the offset is FONT-SPECIFIC — Apple Color Emoji (iOS/macOS Safari), Noto
// Color Emoji (Android/Chromium), and Segoe (Windows) each place the globe
// differently. So neither flex-centering a <span> (centers the line box) nor a
// hardcoded SVG <text> nudge can be right on every platform.
//
// Instead we render on a <canvas> and self-correct: draw the glyph, read back
// its ink bounding box, then redraw shifted so the ink centers on the box's
// centre. Because the measurement uses the SAME system font the page renders
// with, the result is centred on whatever platform it runs on.
export function CenteredGlobe({
  px,
  glyph,
  style,
}: {
  px: number;
  glyph: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const S = Math.max(1, Math.round(px * dpr));
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const fs = px * 0.5 * dpr; // same visual size as the old fontSize: box*0.5
    ctx.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Pass 1: draw at the geometric centre, then find the ink bounding box.
    ctx.clearRect(0, 0, S, S);
    ctx.fillText(glyph, S / 2, S / 2);
    let minX = S, minY = S, maxX = 0, maxY = 0, found = false;
    try {
      const d = ctx.getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          if (d[(y * S + x) * 4 + 3] > 16) {
            found = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    } catch {
      /* getImageData shouldn't taint (same-origin fillText); fall back to no shift */
    }

    // Pass 2: redraw shifted so the ink's centre lands on the box centre.
    ctx.clearRect(0, 0, S, S);
    const ox = found ? S / 2 - (minX + maxX) / 2 : 0;
    const oy = found ? S / 2 - (minY + maxY) / 2 : 0;
    ctx.fillText(glyph, S / 2 + ox, S / 2 + oy);
  }, [px, glyph]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ width: px, height: px, display: "block", ...style }}
    />
  );
}
