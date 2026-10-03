import type { HTMLAttributes, ReactNode } from "react";

/**
 * THE HOME'S BIG CARD, BUILT THE ONE SAFE WAY.
 *
 * Every hero on the home used to be its own copy of the same shell: the tint,
 * the backdrop blur, the rounded overflow clip AND a 1px border, all on ONE
 * element. On WebKit that box repaints its own antialiased edge whenever the
 * blur layer is resampled — so the outline came in crisp while the entrance
 * was still compositing and then lost most of its top and bottom the instant
 * the layer was dropped. Measured on the owner's phone, 2026-09-11: the office
 * hero's stroke went from four device rows to ONE on the frame the cascade
 * landed, while every cascade card below it — which had already been rebuilt
 * this way — held its four.
 *
 * So the three jobs are three elements, and they can no longer fight:
 *   · the CARD owns the tint and the rounded clip, with a TRANSPARENT border
 *     of the ring's width so the layout is unchanged and the tint (clipped to
 *     the padding box) stops where the ring begins;
 *   · the FROST owns the blur, inset far enough inside that however WebKit
 *     rounds its layer bounds it can never reach the edge;
 *   · the RING is a SIBLING of the card, not a child — outside the clip, above
 *     the frost, on its own layer. Nothing the card does can shave it.
 *
 * Mirrors DailyProgressBody's cards exactly; see reference_card_border_no_blur.
 * If you are about to give a card a 1px border and a backdrop blur on the same
 * element, use this instead.
 */
const HERO_TINT = "rgba(9,26,16, 0.297)";
const HERO_RING = "rgba(200,212,192,0.30)";
const HERO_RING_PX = "1.5px";

export function HeroCardShell({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  /** Layout + interaction classes only — a "Later" card's `opacity-60` belongs
   *  here, on the WRAPPER, so the ring fades with the card. */
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`relative ${className}`}>
      <div
        data-phoebe-hero=""
        className="relative flex rounded-3xl overflow-hidden"
        style={{
          background: HERO_TINT,
          backgroundClip: "padding-box",
          border: `${HERO_RING_PX} solid transparent`,
          isolation: "isolate",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 2, zIndex: -1, pointerEvents: "none", borderRadius: "inherit",
            WebkitMaskImage: "-webkit-radial-gradient(white, black)",
            backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          }}
        />
        {children}
        {/* PHOEBE ON THE RIGHT OF EVERY HERO (owner, 2026-10-02: "roll out the Phoebe
            heros"). One place, so all six hero cards and the office hero get her.
            Her feet are level with the bottom of the button - bottom: 20 is the
            content's own padding - so the card is no taller than its text and button and
            there is no space under the CTA; cut at the waist in the source art, so the
            bottom of her fades out. The content keeps clear of her through the
            [data-phoebe-hero] rule in index.css. */}
        <img
          src="/brand/phoebe-character-420.png"
          alt=""
          aria-hidden
          width={96}
          style={{
            position: "absolute", right: 14, bottom: 20, width: 96, height: "auto", pointerEvents: "none", zIndex: 0,
            WebkitMaskImage: "linear-gradient(to bottom, #000 70%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, #000 70%, transparent 100%)",
          }}
        />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          borderRadius: "1.5rem", border: `${HERO_RING_PX} solid ${HERO_RING}`,
          // Its own layer for life: a composited backdrop-filter can out-paint
          // a plain sibling whatever the z-order says.
          willChange: "opacity",
        }}
      />
    </div>
  );
}
