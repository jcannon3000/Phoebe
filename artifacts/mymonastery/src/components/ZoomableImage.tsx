import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * AN IMAGE YOU CAN GET CLOSER TO.
 *
 * Owner: "we want people to be able to zoom in on the slides … zoom in on the
 * images." Visio Divina is a practice of LOOKING, and the works carry detail a
 * phone-sized frame swallows — a face at the edge of the crowd, what someone
 * is holding. Praying with a picture you cannot examine is the practice with
 * its subject at arm's length.
 *
 * Why a component rather than the browser's own pinch: the app's viewport is
 * `maximum-scale=1` (index.html), so page zoom is off everywhere — and turning
 * it on globally would let every screen in the app be pinched out of shape.
 * This zooms the PICTURE, inside its own frame, and leaves the page alone.
 *
 * Gestures: pinch with two fingers, double-tap to toggle 2.5×, drag to move
 * once zoomed, wheel/trackpad on a desktop. It resets whenever the image
 * changes, so the next work opens whole.
 *
 * THE DECK STILL OWNS THE PLAIN TAP. Visio's stage advances on a tap and pages
 * on a swipe (onTapNavigate / onTouchStart in visio.tsx), so a zoomable image
 * that swallowed every event would break the deck's own navigation. Events are
 * stopped ONLY once a gesture is really a zoom — two fingers down, or a drag
 * while zoomed in — and a single tap at 1× passes straight through.
 */
export default function ZoomableImage({
  src, alt, style, imgStyle, onLoad, onError, imgRef, maxScale = 4,
}: {
  src: string;
  alt: string;
  /** The frame. */
  style?: CSSProperties;
  /** The picture itself — the caller's sizing, shadow and fade. */
  imgStyle?: CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  imgRef?: (el: HTMLImageElement | null) => void;
  maxScale?: number;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [animating, setAnimating] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const gestured = useRef(false);
  const lastTap = useRef(0);

  // A new work opens whole — never at the last one's magnification.
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); }, [src]);

  const clampScale = (s: number) => Math.min(maxScale, Math.max(1, s));
  const settle = (s: number) => {
    setAnimating(true);
    setScale(s);
    if (s === 1) setPan({ x: 0, y: 0 });
    window.setTimeout(() => setAnimating(false), 200);
  };

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  return (
    <div
      // Lets the deck around this frame tell a tap on the PICTURE from a tap
      // on the stage: the first tap of a double-tap-to-zoom was paging the
      // deck (visio.tsx onTapNavigate) before the second one could zoom.
      data-zoomable=""
      style={{
        // The frame clips the magnified picture instead of letting it cover
        // the title and the prompt around it.
        overflow: "hidden",
        // Only claim the browser's own touch handling once there is something
        // to move; at 1× the deck's swipe must still reach the stage.
        touchAction: scale > 1 ? "none" : "manipulation",
        cursor: scale > 1 ? "grab" : "zoom-in",
        display: "flex", alignItems: "center", justifyContent: "center",
        ...style,
      }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          gestured.current = true;
          pinch.current = { dist: dist(), scale };
          e.stopPropagation();
        } else if (scale > 1) {
          drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2 && pinch.current) {
          const d = dist();
          if (d > 0 && pinch.current.dist > 0) setScale(clampScale(pinch.current.scale * (d / pinch.current.dist)));
          e.stopPropagation();
          return;
        }
        if (drag.current && scale > 1) {
          gestured.current = true;
          setPan({ x: drag.current.panX + (e.clientX - drag.current.x), y: drag.current.panY + (e.clientY - drag.current.y) });
          e.stopPropagation();
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        drag.current = null;
        // Pinched back out — sit the picture straight again.
        if (scale <= 1.02 && scale !== 1) settle(1);
        // DOUBLE TAP, the shortcut everyone tries first.
        const now = Date.now();
        if (!gestured.current && now - lastTap.current < 300) {
          settle(scale > 1 ? 1 : 2.5);
          lastTap.current = 0;
          e.stopPropagation();
        } else if (!gestured.current) {
          lastTap.current = now;
        }
      }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
      onClick={(e) => {
        // A tap that was really a zoom or a pan is not a tap for the deck.
        if (gestured.current || scale > 1) e.stopPropagation();
        gestured.current = false;
      }}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) < 1) return;
        gestured.current = true;
        e.stopPropagation();
        setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.12 : 0.89)));
      }}
      onDoubleClick={(e) => { e.stopPropagation(); settle(scale > 1 ? 1 : 2.5); }}
    >
      <img
        src={src}
        alt={alt}
        decoding="async"
        draggable={false}
        ref={imgRef}
        onLoad={onLoad}
        onError={onError}
        style={{
          ...imgStyle,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
          transformOrigin: "center center",
          transition: animating
            ? "transform 200ms ease-out, opacity 420ms ease-out"
            : (imgStyle?.transition ?? undefined),
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
      />
    </div>
  );
}
