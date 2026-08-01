// ─── CAC demo theme — Phoebe's own frosted-leaf UI ────────────────────────────
//
// Owner (2026-08-01): drop the CAC cream/terracotta reskin — the CAC demo
// pages (cac-home.tsx, cac-courses.tsx, cac-show.tsx, cac-course.tsx,
// cac-reflection.tsx) now wear Phoebe's actual visual identity instead of
// pretending to be a CAC-branded surface: dark frosted-glass cards over a
// leaf photo backdrop, Space Grotesk type — the same look as
// CoursePage.tsx / way-of-love-course.tsx. Token names are kept as-is
// (CAC.ink, CAC.gold, …) so every page that already imports them didn't
// need a rename, just new values.

import { useMemo, type ReactNode } from "react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

export const CAC = {
  card: "rgba(9,26,16,0.46)",
  cardHi: "rgba(18,45,28,0.55)",
  ink: "#F0EDE6",
  inkMuted: "#8FAF96",
  // Accent — Phoebe's green, standing in for the old terracotta everywhere
  // a "gold/accent" token was used (progress fill, done checkmarks, links).
  gold: "#5FBF7F",
  goldDark: "#2D5E3F",
  goldSoft: "rgba(46,107,64,0.16)",
  border: "rgba(46,107,64,0.38)",
  divider: "rgba(200,212,192,0.12)",
  // Titles now use Phoebe's own display face (Space Grotesk, bold) instead
  // of the CAC-editorial serif; kept as `serif` to avoid renaming every
  // call site — value is the only thing that changed.
  serif: "'Space Grotesk', sans-serif",
  label: "'Space Grotesk', sans-serif",
} as const;

/** A random leaf-photo backdrop for the CAC demo pages, matching the rest of
 *  Phoebe's course/practice surfaces. Memoized per mount. */
export function useCacLeafBg(): string | null {
  return useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
}

/** No longer a full-bleed cream field — just passes children through. Kept
 *  so every page that already wraps its content in <CacFrame> didn't need
 *  restructuring; the actual backdrop now comes from Layout's bgPhoto. */
export function CacFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function CacBetaPill() {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: CAC.goldSoft, color: CAC.gold, fontFamily: CAC.label }}
    >
      Beta
    </span>
  );
}

const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

/** Phoebe's green pill button, matching CoursePage.tsx / way-of-love-course.tsx. */
export function CacButton({
  children,
  onClick,
  disabled,
  variant = "solid",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
  type?: "button" | "submit";
}) {
  const solid = variant === "solid";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-2xl px-5 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{
        background: solid ? "#2D5E3F" : "rgba(46,107,64,0.12)",
        color: solid ? CAC.ink : CAC.inkMuted,
        border: solid ? "none" : `1px solid ${CAC.border}`,
        fontFamily: CAC.label,
        cursor: disabled ? "default" : "pointer",
        ...(solid ? {} : FROST),
      }}
    >
      {children}
    </button>
  );
}
