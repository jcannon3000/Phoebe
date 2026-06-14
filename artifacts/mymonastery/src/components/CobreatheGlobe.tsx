import { useEffect, useState } from "react";

// The same spinning world that used to live on the breathing screen — 🌍 → 🌎
// → 🌏, one face per second, anchored to the wall clock so every Cobreathe
// surface turns in unison. Now used as the icon on Cobreathe cards and pills
// instead of inside the breath itself.
const GLOBES = ["🌍", "🌎", "🌏"] as const;

const faceForNow = () => Math.floor(Date.now() / 1000) % GLOBES.length;

export function CobreatheGlobe({
  size = 18,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [i, setI] = useState(faceForNow);

  useEffect(() => {
    // Re-sync to the wall clock each tick so a tab that slept doesn't drift.
    const id = setInterval(() => setI(faceForNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        display: "inline-block",
        // Subtle pop so it reads as an icon, not body text.
        filter: "drop-shadow(0 1px 2px rgba(8,30,18,0.25))",
        ...style,
      }}
    >
      {GLOBES[i]}
    </span>
  );
}
