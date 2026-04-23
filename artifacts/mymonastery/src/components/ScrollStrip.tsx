import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

// Horizontal scroll strip with a dynamic edge-fade mask. At rest the
// left edge is solid (first pill is fully visible); once the user
// scrolls right, the left side fades too so there's a visual cue that
// content continues off-screen behind it. The right edge fades as long
// as there's content off-screen to the right.
//
// Why a custom component (rather than plain `overflow-x-auto`):
// 1. Safari desktop won't horizontally scroll on mouse drag by default —
//    only trackpad/touch. We add pointer drag-to-scroll so a mouse user
//    can grab the strip and pull it sideways.
// 2. When an ancestor is a click target (e.g. a card wrapper), a tap
//    that starts a drag should NOT fire the ancestor's onClick. We
//    stop click propagation if the pointer moved horizontally more
//    than a threshold between down and up.
// 3. We only apply the CSS mask when the content overflows. Masks on
//    a statically-fitting row can tint the last pill for no reason,
//    and we've seen cases where a mask interfered with scroll event
//    dispatch on older Safari.
export function ScrollStrip({
  children,
  className,
  style,
  contentClassName,
  contentStyle,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Track whether a drag is in progress so we can both scroll on
  // pointer move and suppress the click that would otherwise bubble
  // up to a card wrapper at drag-end.
  const dragState = useRef<{
    active: boolean;
    startX: number;
    startScroll: number;
    moved: number;
  }>({ active: false, startX: 0, startScroll: 0, moved: 0 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const hasOverflow = maxScroll > 4;
      setOverflows(hasOverflow);
      setFadeLeft(hasOverflow && el.scrollLeft > 4);
      setFadeRight(hasOverflow && el.scrollLeft < maxScroll - 4);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [children]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only hijack the primary pointer. Let native behavior (trackpad
    // momentum, touch) run otherwise — we're only adding mouse drag.
    if (e.pointerType === "touch") return;
    const el = outerRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: 0,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s.active) return;
    const el = outerRef.current;
    if (!el) return;
    const dx = e.clientX - s.startX;
    s.moved = Math.max(s.moved, Math.abs(dx));
    el.scrollLeft = s.startScroll - dx;
  };

  const onPointerUp = () => {
    // Leave `moved` in place for one tick so the click handler below
    // can read it. `active` going false stops further drag.
    dragState.current.active = false;
  };

  const onClickCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    // If the user dragged more than 6px, swallow the click so an
    // ancestor card wrapper doesn't interpret the drag as a tap.
    if (dragState.current.moved > 6) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const mask = overflows
    ? `linear-gradient(to right, transparent 0%, black ${fadeLeft ? "12%" : "0%"}, black ${fadeRight ? "88%" : "100%"}, transparent 100%)`
    : undefined;

  return (
    <div
      ref={outerRef}
      className={`overflow-x-auto no-scrollbar relative ${className ?? ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      style={{
        ...style,
        maskImage: mask,
        WebkitMaskImage: mask,
        // Tell iOS Safari this axis is ours — keeps the gesture from
        // getting stolen by a parent that's listening for vertical
        // scroll (the main page is scrolling vertically).
        touchAction: "pan-x",
        WebkitOverflowScrolling: "touch",
        cursor: overflows ? "grab" : undefined,
      }}
    >
      <div
        className={contentClassName}
        style={{
          display: "flex",
          width: "max-content",
          paddingRight: 40,
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
