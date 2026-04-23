import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Horizontal scroll strip with a dynamic edge-fade mask. At rest the
// left edge is solid (first pill is fully visible); once the user
// scrolls right, the left side fades too so there's a visual cue that
// content continues off-screen behind it. The right edge fades as long
// as content overflows.
//
// We update the mask as an inline style on scroll — cheaper than
// re-rendering — and re-measure on resize + content change so the
// mask behaves correctly when items are added/removed.
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

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setFadeLeft(el.scrollLeft > 4);
      setFadeRight(el.scrollLeft < maxScroll - 4);
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

  const leftStop = fadeLeft ? "12%" : "0%";
  const rightStop = fadeRight ? "88%" : "100%";
  const mask = `linear-gradient(to right, transparent 0%, black ${leftStop}, black ${rightStop}, transparent 100%)`;

  return (
    <div
      ref={outerRef}
      className={`overflow-x-auto no-scrollbar relative ${className ?? ""}`}
      style={{
        ...style,
        maskImage: mask,
        WebkitMaskImage: mask,
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
