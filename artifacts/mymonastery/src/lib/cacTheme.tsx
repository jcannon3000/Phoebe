// ─── CAC visual theme — matches cac.org's own look ───────────────────────────
//
// The CAC Courses beta (pages/cac-courses.tsx, cac-show.tsx, cac-course.tsx)
// presents the Center for Action and Contemplation's own content, so it wears
// their brand rather than Phoebe's usual dark-green frosted-glass look: warm
// cream paper, a terracotta accent, and a serif display face — cf.
// cac.org's "Turning to the Mystics" show page (cream bg, rust "LISTEN ON
// YOUR PLATFORM" pill, serif heading, small-caps tracked labels).
//
// Phoebe's global header (Layout) stays dark green — that's shared app
// chrome, not something this one beta surface should override. CacFrame is
// the cream panel that sits below it, carrying everything CAC-branded.

import type { ReactNode } from "react";

export const CAC = {
  paper: "#F5EFE0",
  paperCard: "#FBF7ED",
  ink: "#2A241D",
  inkMuted: "#7A6D5C",
  rust: "#B3543A",
  rustDark: "#96432C",
  rustSoft: "rgba(179,84,58,0.10)",
  border: "rgba(42,36,29,0.14)",
  divider: "rgba(42,36,29,0.10)",
  serif: "Georgia, 'Times New Roman', serif",
  label: "'Space Grotesk', sans-serif",
} as const;

/** The cream panel every CAC Courses page renders its content inside. */
export function CacFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full rounded-3xl px-4 py-6 sm:px-8 sm:py-8"
      style={{ background: CAC.paper, border: `1px solid ${CAC.border}`, boxShadow: "0 20px 48px rgba(42,36,29,0.18)" }}
    >
      {children}
    </div>
  );
}

export function CacBetaPill() {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: CAC.rustSoft, color: CAC.rustDark, fontFamily: CAC.label }}
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
        background: solid ? CAC.rust : "transparent",
        color: solid ? "#FBF7ED" : CAC.rust,
        border: solid ? "none" : `1px solid ${CAC.rust}`,
        fontFamily: CAC.label,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
