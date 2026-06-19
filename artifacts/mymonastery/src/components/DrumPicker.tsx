import { useState, useEffect, useRef, useCallback } from "react";

// ─── DrumPicker ───────────────────────────────────────────────────────────────
// iOS-alarm-style scroll-wheel ("roller") picker. Snap-scrolls to the nearest
// item; fades items above/below the centre. Works inside Capacitor WebView.
// Shared so the moments builder and the prayer-request duration step use the
// same control. (moment-new.tsx still carries its own inline copy; keep this in
// sync if that one changes.)
export function DrumPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: number; label: string }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const ITEM_H = 48;
  const VISIBLE = 5;
  const containerH = ITEM_H * VISIBLE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTid = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastIdxRef = useRef(-1);
  const [centerIdx, setCenterIdx] = useState(() =>
    Math.max(0, options.findIndex(o => o.value === value))
  );

  // Initialise scroll position on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, options.findIndex(o => o.value === value));
    el.scrollTop = idx * ITEM_H;
    lastIdxRef.current = idx;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scroll when value changes externally (e.g. default value set)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = options.findIndex(o => o.value === value);
    if (idx < 0) return;
    if (Math.abs(el.scrollTop - idx * ITEM_H) > ITEM_H * 0.6) {
      el.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
    }
  }, [value, options]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Live visual update — no React state batching delay
    const raw = el.scrollTop / ITEM_H;
    const nearest = Math.round(raw);
    const clamped = Math.max(0, Math.min(options.length - 1, nearest));
    setCenterIdx(clamped);
    // Debounce settle: snap precisely and notify parent
    clearTimeout(settleTid.current);
    settleTid.current = setTimeout(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      if (lastIdxRef.current !== clamped) {
        lastIdxRef.current = clamped;
        onChange(options[clamped].value);
      }
    }, 100);
  }, [options, onChange]);

  const scrollTo = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    setCenterIdx(i);
    lastIdxRef.current = i;
    onChange(options[i].value);
  };

  const BG = "#091A10";

  return (
    <div style={{ position: "relative", height: containerH, overflow: "hidden", userSelect: "none" }}>
      {/* Selection band */}
      <div style={{
        position: "absolute", top: ITEM_H * 2, left: 12, right: 12, height: ITEM_H,
        background: "rgba(46,107,64,0.20)",
        border: "1px solid rgba(46,107,64,0.50)",
        borderRadius: 12,
        pointerEvents: "none", zIndex: 1,
      }} />
      {/* Top fade */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 2 + 8,
        background: `linear-gradient(to bottom, ${BG} 20%, transparent)`,
        pointerEvents: "none", zIndex: 2,
      }} />
      {/* Bottom fade */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 2 + 8,
        background: `linear-gradient(to top, ${BG} 20%, transparent)`,
        pointerEvents: "none", zIndex: 2,
      }} />
      {/* Scroll drum */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          paddingTop: ITEM_H * 2,
          paddingBottom: ITEM_H * 2,
        } as React.CSSProperties}
      >
        {options.map((opt, i) => {
          const dist = Math.abs(i - centerIdx);
          return (
            <div
              key={opt.value}
              onClick={() => scrollTo(i)}
              style={{
                height: ITEM_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scrollSnapAlign: "center",
                fontSize: dist === 0 ? 22 : dist === 1 ? 17 : 14,
                fontWeight: dist === 0 ? 700 : 400,
                color: dist === 0
                  ? "#F0EDE6"
                  : dist === 1
                  ? "rgba(240,237,230,0.55)"
                  : "rgba(240,237,230,0.25)",
                fontFamily: "'Space Grotesk', sans-serif",
                cursor: "pointer",
                transition: "color 0.12s, font-size 0.12s",
                letterSpacing: dist === 0 ? "0.01em" : undefined,
              }}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
