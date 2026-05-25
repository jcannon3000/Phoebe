// Subtle "lava lamp" backdrop — a few soft radial green blobs that drift
// slowly behind the content. Two intensities: "subtle" (home + slides)
// and "pronounced" (the contemplation timer).
//
// Cheap on battery: each blob is blurred once and animated with transform
// only, so the browser rasterizes it into a GPU layer and just re-
// composites each frame — no per-frame repaint or re-blur. Freezes under
// prefers-reduced-motion. Self-contained (keyframes inline) so it touches
// no global CSS; sits at z-index:-1 behind the content (the host gives
// itself a stacking context so content paints above without z-index).

type Variant = "subtle" | "pronounced";

type Blob = {
  rgb: string;
  alpha: number;
  size: string;
  top: string;
  left: string;
  n: 1 | 2 | 3;
  dur: string;
};

const SUBTLE: Blob[] = [
  { rgb: "46,107,64", alpha: 0.5, size: "78vmax", top: "-22%", left: "-18%", n: 1, dur: "38s" },
  { rgb: "20,72,46", alpha: 0.55, size: "66vmax", top: "26%", left: "36%", n: 2, dur: "47s" },
  { rgb: "64,122,86", alpha: 0.34, size: "60vmax", top: "58%", left: "-12%", n: 3, dur: "43s" },
];

const PRONOUNCED: Blob[] = [
  { rgb: "58,132,80", alpha: 0.78, size: "80vmax", top: "-22%", left: "-18%", n: 1, dur: "24s" },
  { rgb: "14,62,40", alpha: 0.82, size: "68vmax", top: "26%", left: "36%", n: 2, dur: "30s" },
  { rgb: "94,160,114", alpha: 0.62, size: "64vmax", top: "58%", left: "-12%", n: 3, dur: "27s" },
];

const KEYFRAMES = `
@keyframes phoebe-bg-subtle-1 { 0% { transform: translate(-6%, -5%) scale(1); } 50% { transform: translate(8%, 7%) scale(1.18); } 100% { transform: translate(-6%, -5%) scale(1); } }
@keyframes phoebe-bg-subtle-2 { 0% { transform: translate(5%, 4%) scale(1.08); } 50% { transform: translate(-9%, -7%) scale(0.88); } 100% { transform: translate(5%, 4%) scale(1.08); } }
@keyframes phoebe-bg-subtle-3 { 0% { transform: translate(4%, -7%) scale(0.96); } 50% { transform: translate(-6%, 9%) scale(1.16); } 100% { transform: translate(4%, -7%) scale(0.96); } }
@keyframes phoebe-bg-pronounced-1 { 0% { transform: translate(-14%, -11%) scale(1); } 50% { transform: translate(17%, 15%) scale(1.36); } 100% { transform: translate(-14%, -11%) scale(1); } }
@keyframes phoebe-bg-pronounced-2 { 0% { transform: translate(12%, 9%) scale(1.2); } 50% { transform: translate(-19%, -15%) scale(0.72); } 100% { transform: translate(12%, 9%) scale(1.2); } }
@keyframes phoebe-bg-pronounced-3 { 0% { transform: translate(10%, -15%) scale(0.84); } 50% { transform: translate(-14%, 17%) scale(1.32); } 100% { transform: translate(10%, -15%) scale(0.84); } }
@media (prefers-reduced-motion: reduce) { .phoebe-bg-blob { animation: none !important; } }
`;

export function AnimatedBackground({ base, variant = "subtle" }: { base: string; variant?: Variant }) {
  const blobs = variant === "pronounced" ? PRONOUNCED : SUBTLE;
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
      {blobs.map((b, i) => (
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
            animation: `phoebe-bg-${variant}-${b.n} ${b.dur} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
