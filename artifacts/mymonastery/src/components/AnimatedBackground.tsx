// Subtle "lava lamp" backdrop — a few soft radial green blobs that drift
// slowly behind the content. Currently used only by the contemplation
// timer.
//
// Cheap on battery: each blob is blurred once and animated with transform
// only, so the browser rasterizes it into a GPU layer and just re-
// composites each frame — no per-frame repaint or re-blur. Freezes under
// prefers-reduced-motion. Self-contained (keyframes inline) so it touches
// no global CSS; sits at z-index:-1 behind the content.

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

const KEYFRAMES = `
@keyframes phoebe-bg-drift-1 { 0% { transform: translate(-14%, -11%) scale(1); } 50% { transform: translate(17%, 15%) scale(1.36); } 100% { transform: translate(-14%, -11%) scale(1); } }
@keyframes phoebe-bg-drift-2 { 0% { transform: translate(12%, 9%) scale(1.2); } 50% { transform: translate(-19%, -15%) scale(0.72); } 100% { transform: translate(12%, 9%) scale(1.2); } }
@keyframes phoebe-bg-drift-3 { 0% { transform: translate(10%, -15%) scale(0.84); } 50% { transform: translate(-14%, 17%) scale(1.32); } 100% { transform: translate(10%, -15%) scale(0.84); } }
@media (prefers-reduced-motion: reduce) { .phoebe-bg-blob { animation: none !important; } }
`;

export function AnimatedBackground({ base }: { base: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: -1,
        overflow: "hidden",
        pointerEvents: "none",
        background: base,
      }}
    >
      <style>{KEYFRAMES}</style>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="phoebe-bg-blob"
          style={{
            position: "absolute",
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            borderRadius: "50%",
            filter: "blur(64px)",
            willChange: "transform",
            background: `radial-gradient(circle at center, rgba(${b.rgb},${b.alpha}) 0%, rgba(${b.rgb},0) 70%)`,
            animation: `${b.anim} ${b.dur} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
