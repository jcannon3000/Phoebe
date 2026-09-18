import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

// ── PillTicker — a row of pills that rolls past on its own ──────────────────
//
// The home's pill row from the spring, back (owner, 2026-09-16: "the origonal
// Phoebe months ago would use pills for navigating to other pages" … "i want
// them to roll through on a ticker"). Same pills as that row — text-xs
// semibold, a 1px border, its eight greens in turn — at its pace.
//
// WHAT'S DIFFERENT FROM THE APRIL ROW (git show f53db9ae:…/dashboard.tsx):
// - The lap is MEASURED. April slid two copies to -50% of the track, but the
//   8px gap between the copies made half the track 4px short of one copy, so
//   the row jumped 4px every lap. Here each copy ends in its own gap and the
//   animation travels exactly one copy's width.
// - It holds still under a finger. A tap lands on the pill it started on
//   (a moving row can slide the next pill under a slow tap), a sideways drag
//   pulls the row by hand, and it rolls on a moment after letting go. A mouse
//   resting on it holds it too, and so does keyboard focus.
// - Reduce Motion keeps it still. It can still be dragged.
// - It stops while it's off screen.
//
// It moves by a Web Animations transform, never by re-rendering: nothing in a
// pill changes as it travels, so there's no text to repaint on a moving layer
// (reference_card_spacing_exact).

export interface TickerPill {
  key: string;
  emoji: string;
  label: string;
  onSelect: () => void;
}

const FONT = "'Space Grotesk', sans-serif";
/** px a second — the April row's pace (its 20s lap over about 800px). */
const SPEED = 40;
/** px between pills, and after the last pill of each copy. */
const GAP = 8;
/** px a pointer travels before it's a drag rather than a tap (ScrollStrip's). */
const DRAG_SLOP = 6;
/** How long the row waits after a finger lifts before rolling on. */
const RESUME_MS = 1600;
const FADE = "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";
// The April row's greens, in its order.
const TONES = [
  { fg: "#5C8A5F", bg: "rgba(92,138,95,0.14)", border: "rgba(92,138,95,0.28)" },
  { fg: "#6B9E6E", bg: "rgba(107,158,110,0.14)", border: "rgba(107,158,110,0.28)" },
  { fg: "#7AAF7D", bg: "rgba(122,175,125,0.14)", border: "rgba(122,175,125,0.28)" },
  { fg: "#8FAF96", bg: "rgba(143,175,150,0.14)", border: "rgba(143,175,150,0.28)" },
  { fg: "#6FAF85", bg: "rgba(111,175,133,0.12)", border: "rgba(111,175,133,0.25)" },
  { fg: "#7A9E7D", bg: "rgba(122,158,125,0.14)", border: "rgba(122,158,125,0.28)" },
  { fg: "#89A88C", bg: "rgba(137,168,140,0.14)", border: "rgba(137,168,140,0.28)" },
  { fg: "#A8C5A0", bg: "rgba(168,197,160,0.12)", border: "rgba(168,197,160,0.28)" },
] as const;

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function PillTicker({ pills, label }: { pills: TickerPill[]; label?: string }) {
  const clipRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  /** One copy's width in px — the distance of a lap. */
  const lapRef = useRef(0);
  const [copies, setCopies] = useState(2);
  // Everything that can hold the row still. It rolls only when none does.
  const holds = useRef({ hover: false, press: false, focus: false, offscreen: false, still: false });
  const resumeTimer = useRef<number | undefined>(undefined);
  const drag = useRef({ id: -1, x: 0, at: 0, moved: 0 });

  const lapMs = () => (lapRef.current / SPEED) * 1000;
  const position = () => Number(animRef.current?.currentTime ?? 0);
  const seek = (ms: number) => {
    const a = animRef.current;
    if (a && lapMs() > 0) a.currentTime = mod(ms, lapMs());
  };
  const settle = () => {
    const a = animRef.current;
    if (!a) return;
    const h = holds.current;
    if (h.hover || h.press || h.focus || h.offscreen || h.still) {
      if (a.playState !== "paused") a.pause();
    } else if (a.playState !== "running") {
      a.play();
    }
  };

  // Which pills, not which closures: a parent that rebuilds its list on every
  // render must not restart the row.
  const signature = pills.map((p) => `${p.key}|${p.label}`).join(",");

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!clip || !track || !first || typeof track.animate !== "function") return;
    let anim: Animation | null = null;
    const build = () => {
      // Fractional on purpose: a lap rounded to a whole pixel would jump by
      // the rounding every time it came round.
      const lap = first.getBoundingClientRect().width;
      if (!(lap > 0)) return;
      // Enough copies that the row never shows its end, however wide.
      const need = Math.max(2, Math.ceil(clip.clientWidth / lap) + 1);
      if (need !== copies) {
        setCopies(need);
        return;
      }
      if (anim && lap === lapRef.current) return;
      // A width can change under a running row (Space Grotesk arriving after
      // first paint); keep its place as a share of the lap.
      const share = anim && lapMs() > 0 ? mod(Number(anim.currentTime ?? 0), lapMs()) / lapMs() : 0;
      anim?.cancel();
      lapRef.current = lap;
      anim = track.animate(
        [{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-lap}px,0,0)` }],
        { duration: lapMs(), iterations: Infinity, easing: "linear" },
      );
      anim.currentTime = share * lapMs();
      animRef.current = anim;
      settle();
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(first);
    ro.observe(clip);
    return () => {
      ro.disconnect();
      anim?.cancel();
      if (animRef.current === anim) animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, copies]);

  useEffect(() => {
    const clip = clipRef.current;
    if (!clip || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      holds.current.offscreen = !entry?.isIntersecting;
      settle();
    });
    io.observe(clip);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!mq) return;
    const apply = () => {
      holds.current.still = mq.matches;
      settle();
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    window.clearTimeout(resumeTimer.current);
    drag.current = { id: e.pointerId, x: e.clientX, at: position(), moved: 0 };
    holds.current.press = true;
    settle();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved <= DRAG_SLOP) return;
    // Keep the drag when the finger leaves the row. A pointer the browser no
    // longer counts as active throws here, and a throw would end the drag.
    const clip = clipRef.current;
    try {
      if (clip && !clip.hasPointerCapture(e.pointerId)) clip.setPointerCapture(e.pointerId);
    } catch { /* drag without capture */ }
    // Dragging right pulls the row back: earlier in the lap.
    seek(d.at - (dx / SPEED) * 1000);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    d.id = -1;
    const release = () => {
      holds.current.press = false;
      settle();
    };
    // A mouse lets go at once (resting on the row still holds it); a finger
    // gets a moment, so the row doesn't pull away from where it was left.
    if (e.pointerType === "mouse") release();
    else resumeTimer.current = window.setTimeout(release, RESUME_MS);
  };
  const onPointerEnter = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    holds.current.hover = true;
    settle();
  };
  const onPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    holds.current.hover = false;
    settle();
  };
  // A drag that ends over a pill is not a tap on it.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (drag.current.moved > DRAG_SLOP) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  // A trackpad's sideways swipe moves the row like a drag.
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    seek(position() + (e.deltaX / SPEED) * 1000);
  };
  // Tabbing to a pill rolls the row to it. The clip never scrolls: a browser
  // scrolling it to reveal a focused pill would shift every copy.
  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    holds.current.focus = true;
    settle();
    const pill = e.target as HTMLElement;
    if (pill.offsetParent === trackRef.current) seek(((pill.offsetLeft - 24) / SPEED) * 1000);
    if (clipRef.current) clipRef.current.scrollLeft = 0;
  };
  const onBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (clipRef.current?.contains(e.relatedTarget as Node | null)) return;
    holds.current.focus = false;
    settle();
  };
  const onScroll = (e: ReactUIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
  };

  if (pills.length === 0) return null;

  return (
    <div
      ref={clipRef}
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClickCapture={onClickCapture}
      onWheel={onWheel}
      onFocus={onFocus}
      onBlur={onBlur}
      onScroll={onScroll}
      style={{
        overflow: "hidden",
        // Room for a pill's focus ring above and below; whole pixels.
        paddingBlock: 2,
        maskImage: FADE,
        WebkitMaskImage: FADE,
        // Up and down still scroll the page; sideways is the row's.
        touchAction: "pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* position: relative makes the track each pill's offsetParent, which
          is what focus reads a pill's place in the lap from. */}
      <div ref={trackRef} style={{ position: "relative", display: "flex", width: "max-content" }}>
        {Array.from({ length: copies }, (_, copy) => (
          // Copies after the first are for the eye: a screen reader and the
          // Tab key meet each practice once. They still take a tap.
          <div key={copy} aria-hidden={copy > 0 || undefined} style={{ display: "flex", flexShrink: 0, gap: GAP, paddingRight: GAP }}>
            {pills.map((p, i) => {
              const tone = TONES[i % TONES.length]!;
              return (
                <button
                  key={p.key}
                  type="button"
                  tabIndex={copy > 0 ? -1 : undefined}
                  onClick={p.onSelect}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, fontFamily: FONT, WebkitTouchCallout: "none" }}
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
