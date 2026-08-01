// ─── CAC visual theme — cream + terracotta, full-bleed ───────────────────────
//
// The CAC Courses beta (pages/cac-courses.tsx, cac-show.tsx, cac-course.tsx)
// presents the Center for Action and Contemplation's own content, so it wears
// their brand rather than Phoebe's usual dark-green frosted-glass look: warm
// cream page, a terracotta accent, and a serif display face — cf. cac.org's
// "Turning to the Mystics" show page (cream bg, rust "LISTEN ON YOUR
// PLATFORM" pill, serif heading).
//
// Phoebe's global header (Layout) stays dark green — that's shared app
// chrome, not something this one beta surface should override. CacFrame is
// the cream field that fills the rest of the page below it, bleeding past
// Layout's normal content gutter so it reads as its own page rather than a
// card sitting on Phoebe's usual dark background.

import type { ReactNode } from "react";

export const CAC = {
  // Page background — cream, full-bleed.
  bg: "#F5EFE0",
  // Nested rows/cards read as "lifted" against the page.
  card: "#FBF7ED",
  cardHi: "#F6E4C4",
  ink: "#2A241D",
  inkMuted: "#7A6D5C",
  // Terracotta accent for buttons/progress/done states.
  gold: "#B3543A",
  goldDark: "#96432C",
  goldSoft: "rgba(179,84,58,0.10)",
  border: "rgba(42,36,29,0.14)",
  divider: "rgba(42,36,29,0.10)",
  serif: "Georgia, 'Times New Roman', serif",
  label: "'Space Grotesk', sans-serif",
} as const;

/** The cream field every CAC Courses page renders its content inside —
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
      style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}
    >
      Beta
    </span>
  );
}

/** The terracotta pill button — cac.org's "LISTEN ON YOUR PLATFORM" style. */
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
        background: solid ? CAC.gold : "transparent",
        color: solid ? CAC.card : CAC.gold,
        border: solid ? "none" : `1px solid ${CAC.gold}`,
        fontFamily: CAC.label,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
