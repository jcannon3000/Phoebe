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
  { rgb: "46,107,64", alpha: 0.26, size: "82vmax", top: "-24%", left: "-20%", n: 1, dur: "58s" },
  { rgb: "22,74,48", alpha: 0.3, size: "70vmax", top: "28%", left: "38%", n: 2, dur: "70s" },
  { rgb: "60,116,80", alpha: 0.16, size: "62vmax", top: "60%", left: "-12%", n: 3, dur: "64s" },
];

const PRONOUNCED: Blob[] = [
  { rgb: "58,132,80", alpha: 0.78, size: "80vmax", top: "-22%", left: "-18%", n: 1, dur: "24s" },
  { rgb: "14,62,40", alpha: 0.82, size: "68vmax", top: "26%", left: "36%", n: 2, dur: "30s" },
  { rgb: "94,160,114", alpha: 0.62, size: "64vmax", top: "58%", left: "-12%", n: 3, dur: "27s" },
];

const KEYFRAMES = `
@keyframes phoebe-bg-subtle-1 { 0% { transform: translate(-4%, -3%) scale(1); } 50% { transform: translate(4%, 4%) scale(1.08); } 100% { transform: translate(-4%, -3%) scale(1); } }
@keyframes phoebe-bg-subtle-2 { 0% { transform: translate(3%, 2%) scale(1.05); } 50% { transform: translate(-5%, -4%) scale(0.95); } 100% { transform: translate(3%, 2%) scale(1.05); } }
@keyframes phoebe-bg-subtle-3 { 0% { transform: translate(2%, -4%) scale(0.97); } 50% { transform: translate(-3%, 5%) scale(1.07); } 100% { transform: translate(2%, -4%) scale(0.97); } }
@keyframes phoebe-bg-pronounced-1 { 0% { transform: translate(-14%, -11%) scale(1); } 50% { transform: translate(17%, 15%) scale(1.36); } 100% { transform: translate(-14%, -11%) scale(1); } }
@keyframes phoebe-bg-pronounced-2 { 0% { transform: translate(12%, 9%) scale(1.2); } 50% { transform: translate(-19%, -15%) scale(0.72); } 100% { transform: translate(12%, 9%) scale(1.2); } }
@keyframes phoebe-bg-pronounced-3 { 0% { transform: translate(10%, -15%) scale(0.84); } 50% { transform: translate(-14%, 17%) scale(1.32); } 100% { transform: translate(10%, -15%) scale(0.84); } }
@media (prefers-reduced-motion: reduce) { .phoebe-bg-blob { animation: none !important; } }
`;

export function AnimatedBackground({ base, variant = "subtle", fadeTop = false }: { base: string; variant?: Variant; fadeTop?: boolean }) {
  const blobs = variant === "pronounced" ? PRONOUNCED : SUBTLE;
  // When fadeTop is set, mask the layer out across the top so the blobs'
  // gradient ends below the top header instead of crowding it: fully
  // transparent through the header band (safe-area + ~88px), then fading
  // in to full below it. base === the surface bg, so the masked-out band
  // just shows the same color.
  const topMask =
    "linear-gradient(to bottom, transparent 0, transparent calc(env(safe-area-inset-top, 0px) + 88px), #000 calc(env(safe-area-inset-top, 0px) + 220px))";
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
        ...(fadeTop ? { maskImage: topMask, WebkitMaskImage: topMask } : {}),
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
