import type { CSSProperties } from "react";

/**
 * A FROSTED CARD WHOSE BORDER ADDS NO FRACTION (owner, 2026-09-14, after the
 * home cards were made exact: "extensively audit other surfaces for issues you
 * fixed on the home screen", "i see the shift up even on the practices page").
 *
 * index.css gives every frosted box with an inline border a 1.5px border
 * ("A 1.5px HAIRLINE ON EVERY BORDERED CARD"), and WebKit rounds a border to
 * whole device pixels at layout time — 1.333px on a 3× phone. That fraction
 * lands in every card's height, so a stack of them is a device pixel off here
 * and there (the home cards measured 226–229 device px apart where 228 was
 * due). The home's PracticeCard fixed it, and this is the same construction
 * for any card:
 *
 *   - the box keeps a 1px TRANSPARENT border (whole at every density) and
 *     carries no backdrop-filter of its own, so the global rules skip it;
 *   - the frost is an aria-hidden child, inset 2px so its layer can't round
 *     out over the stroke;
 *   - the visible 1.5px stroke is a ring drawn ABOVE the frost, over the
 *     border box, on its own layer (a composited frost can out-paint a plain
 *     sibling whatever the z-order says).
 *
 * Put frostBox() on the card and <FrostLayers> inside it. The card's text and
 * controls paint between the two. See reference_card_spacing_exact.
 */
export function frostBox(background: string): CSSProperties {
  return {
    position: "relative",
    isolation: "isolate",
    background,
    backgroundClip: "padding-box",
    border: "1px solid transparent",
  };
}

export function FrostLayers({ border, blur = 11.34 }: { border: string; blur?: number }) {
  const filter = `blur(${blur}px)`;
  return (
    <>
      <span
        aria-hidden
        style={{
          position: "absolute", inset: 2, zIndex: -1, pointerEvents: "none", borderRadius: "inherit",
          WebkitMaskImage: "-webkit-radial-gradient(white, black)",
          backdropFilter: filter, WebkitBackdropFilter: filter,
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute", inset: -1, zIndex: 1, pointerEvents: "none", borderRadius: "inherit",
          border: `1.5px solid ${border}`,
          willChange: "opacity",
        }}
      />
    </>
  );
}
