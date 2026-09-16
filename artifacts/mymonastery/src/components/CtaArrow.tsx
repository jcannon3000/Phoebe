import { isAndroidDevice } from "@/lib/isNativeShell";

/**
 * The "→" a CTA pill ends with — on iOS and the web. On Android the pill
 * says the word alone (owner, 2026-09-16: "take out the arrows on cta pills
 * on android"). The leading space travels with the arrow, so write
 * `{label}<CtaArrow />` with no space of your own and a pill without an
 * arrow keeps no trailing gap. Every pill CTA renders its arrow through
 * this — the home cards, the dashboard's own cards, the welcome card — so
 * the platform rule lives in one place.
 */
export function CtaArrow({ className }: { className?: string }) {
  if (isAndroidDevice()) return null;
  return <> <span aria-hidden className={className}>→</span></>;
}
