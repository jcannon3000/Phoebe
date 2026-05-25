// A subtle, low-energy "lava lamp" backdrop — a few soft radial blobs of
// different greens that drift slowly behind the content.
//
// Why it's cheap on battery: each blob is blurred *once* (a static radial
// gradient) and then animated with `transform` only, so the browser
// rasterizes it into a GPU layer and merely re-composites each frame —
// no per-frame repaint or re-blur. Continuous motion still keeps the GPU
// lightly awake, so the whole thing freezes under prefers-reduced-motion
// (handled in index.css) and pauses when the page is hidden (browsers do
// this automatically for CSS animations).
//
// Placement: rendered at z-index:-1 inside a surface whose root is a
// stacking context (position + isolation). It paints above the root's own
// background but below every piece of content, so callers never need to
// bump their content's z-index.

const BLOBS: {
  rgb: string;
  alpha: number;
  size: string;
  top: string;
  left: string;
  anim: string;
  dur: string;
}[] = [
  { rgb: "58,132,80", alpha: 0.78, size: "80vmax", top: "-22%", left: "-18%", anim: "phoebe-bg-drift-1", dur: "24s" },
  { rgb: "14,62,40", alpha: 0.82, size: "68vmax", top: "26%", left: "36%", anim: "phoebe-bg-drift-2", dur: "30s" },
  { rgb: "94,160,114", alpha: 0.62, size: "64vmax", top: "58%", left: "-12%", anim: "phoebe-bg-drift-3", dur: "27s" },
];

export function AnimatedBackground({ base }: { base: string }) {
  return (
    <div aria-hidden className="phoebe-animated-bg" style={{ background: base }}>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="phoebe-animated-bg__blob"
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            background: `radial-gradient(circle at center, rgba(${b.rgb},${b.alpha}) 0%, rgba(${b.rgb},0) 70%)`,
            animation: `${b.anim} ${b.dur} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
