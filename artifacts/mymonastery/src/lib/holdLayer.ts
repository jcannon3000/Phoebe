/**
 * Keep an animated card on its compositing layer after it lands.
 *
 * Owner: "the borders shimmy up a little bit at the end of the animation — it
 * would be best if they just held still."
 *
 * They are not moving; they are being re-drawn. While `y` animates, the card
 * sits on its own GPU layer and is positioned at fractional pixels. The moment
 * it reaches 0 the transform stops being a transform, the layer is thrown away,
 * and the card re-rasterises snapped to whole pixels. A hairline border
 * straddling a half pixel lands a fraction higher than it just was, and the eye
 * reads that as a twitch.
 *
 * Appending translateZ(0) keeps a 3D transform on the element for good: no
 * layer to discard, nothing to re-rasterise, and the last frame of the
 * animation is drawn identically to the resting state.
 *
 * ONE definition, imported by every cascade, because four copies of the same
 * three-line helper is how half the home ends up fixed and half does not —
 * which is exactly the shape of this app's recurring drift bug.
 *
 * Pass it as `transformTemplate` on any motion element that animates `y`.
 */
export const holdLayer = (_: unknown, generated: string): string =>
  `${generated} translateZ(0)`;
