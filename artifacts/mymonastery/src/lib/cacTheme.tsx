// ─── CAC visual theme — burnt orange, full-bleed ─────────────────────────────
//
// The CAC Courses beta (pages/cac-courses.tsx, cac-show.tsx, cac-course.tsx)
// presents the Center for Action and Contemplation's own content, so it wears
// a CAC-adjacent identity rather than Phoebe's usual dark-green frosted-glass
// look: a burnt-orange page (not just an accent), cream text, and a serif
// display face for headings.
//
// Phoebe's global header (Layout) stays dark green — that's shared app
// chrome, not something this one beta surface should override. CacFrame is
// the burnt-orange field that fills the rest of the page below it, bleeding
// past Layout's normal content gutter so it reads as its own page rather
// than a card sitting on Phoebe's usual background.

import type { ReactNode } from "react";

export const CAC = {
  // Page background — burnt orange, full-bleed.
  bg: "#B04A22",
  // Nested rows/cards read as "lifted" against the page.
  card: "#C4602F",
  cardHi: "#CE6C3A",
  ink: "#FBF3E4",
  inkMuted: "rgba(251,243,228,0.74)",
  // A warm gold accent for progress/done states — distinct from the base
  // orange so completion actually reads as a highlight, not just more orange.
  gold: "#F2C078",
  goldDark: "#8A5A16",
  goldSoft: "rgba(242,192,120,0.22)",
  border: "rgba(251,243,228,0.22)",
  divider: "rgba(251,243,228,0.16)",
  serif: "Georgia, 'Times New Roman', serif",
  label: "'Space Grotesk', sans-serif",
} as const;

/** The burnt-orange field every CAC Courses page renders its content inside —
 *  bleeds past Layout's normal content gutter (negative margins) so it fills
 *  the page edge-to-edge rather than sitting as an inset card. */
export function CacFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex-1 -mx-4 -mt-2 flex flex-col px-4 pb-16 pt-6 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8"
      style={{ background: CAC.bg, minHeight: "70vh" }}
    >
      {children}
    </div>
  );
}

export function CacBetaPill() {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: "rgba(251,243,228,0.16)", color: CAC.gold, fontFamily: CAC.label }}
    >
      Beta
    </span>
  );
}

/** The pill button — cream on burnt orange (inverted so it stands out
 *  against the now-orange page, rather than cac.org's rust-on-cream). */
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
      className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{
        background: solid ? CAC.ink : "transparent",
        color: solid ? CAC.bg : CAC.ink,
        border: solid ? "none" : `1px solid ${CAC.ink}`,
        fontFamily: CAC.label,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
