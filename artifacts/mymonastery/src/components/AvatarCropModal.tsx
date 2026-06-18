/**
 * AvatarCropModal — drag-to-pan + zoom crop for profile pictures. Given a
 * source image (data URL), the user repositions and scales it inside a circular
 * frame; on "Use photo" we render the visible square to a 512×512 canvas and
 * hand back a JPEG data URL. No external dependency — pointer events + canvas.
 *
 * Used by every avatar surface (settings, onboarding, home) so uploading AND
 * re-editing a profile picture share the same crop step.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

const VIEW = 280;   // on-screen crop frame (px)
const OUT = 512;    // exported avatar size (px)
const FONT = "'Space Grotesk', sans-serif";

export function AvatarCropModal({
  src,
  onCancel,
  onConfirm,
  busy = false,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  busy?: boolean;
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  // The image actually displayed/exported. Defaults to the source, but an
  // oversized photo is downscaled first so a huge file can't spike memory
  // (we only ever export a 512px crop anyway).
  const [workingSrc, setWorkingSrc] = useState(src);

  // Natural dimensions drive the cover-fit base scale. Cap very large sources
  // to MAX_DIM on the longest side before cropping.
  useEffect(() => {
    const MAX_DIM = 2400;
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.width, img.height);
      if (longest > MAX_DIM) {
        const k = MAX_DIM / longest;
        const w = Math.round(img.width * k);
        const h = Math.round(img.height * k);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setWorkingSrc(canvas.toDataURL("image/jpeg", 0.9));
          setNat({ w, h });
          return;
        }
      }
      setWorkingSrc(src);
      setNat({ w: img.width, h: img.height });
    };
    img.src = src;
  }, [src]);

  const baseScale = nat ? VIEW / Math.min(nat.w, nat.h) : 1;
  const scale = baseScale * zoom;
  const dw = nat ? nat.w * scale : VIEW;
  const dh = nat ? nat.h * scale : VIEW;

  // Keep the image covering the frame: pan is clamped to the overscan.
  const clamp = useCallback((x: number, y: number) => {
    const maxX = Math.max(0, (dw - VIEW) / 2);
    const maxY = Math.max(0, (dh - VIEW) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [dw, dh]);

  // Re-clamp whenever zoom changes (a zoom-out can push the image off-frame).
  useEffect(() => { setPan((p) => clamp(p.x, p.y)); }, [zoom, clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setPan(clamp(drag.current.panX + dx, drag.current.panY + dy));
  };
  const onPointerUp = () => { drag.current = null; };

  const handleConfirm = () => {
    if (!nat) return;
    const left = VIEW / 2 - dw / 2 + pan.x;
    const top = VIEW / 2 - dh / 2 + pan.y;
    // Map the frame back into source pixels and draw to the output canvas.
    const sx = -left / scale;
    const sy = -top / scale;
    const sSize = VIEW / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
      onConfirm(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = workingSrc;
  };

  const left = VIEW / 2 - dw / 2 + pan.x;
  const top = VIEW / 2 - dh / 2 + pan.y;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-5" style={{ background: "rgba(4,10,7,0.86)", backdropFilter: "blur(4px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-3xl px-6 pt-6 pb-5"
        style={{ background: "#0E2016", border: "1px solid rgba(46,107,64,0.4)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
      >
        <p className="text-center text-[15px] font-semibold mb-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>Adjust your photo</p>
        <p className="text-center text-[12.5px] mb-4" style={{ color: "#8FAF96" }}>Drag to move · pinch the slider to zoom</p>

        {/* Crop frame */}
        <div
          className="relative mx-auto rounded-full overflow-hidden touch-none select-none"
          style={{ width: VIEW, height: VIEW, cursor: drag.current ? "grabbing" : "grab", background: "#06120B", border: "2px solid rgba(111,175,133,0.5)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {nat && (
            <img
              src={workingSrc}
              alt="Crop preview"
              draggable={false}
              style={{ position: "absolute", left, top, width: dw, height: dh, maxWidth: "none" }}
            />
          )}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-3 mt-4 mb-5">
          <span style={{ color: "#8FAF96", fontSize: 16 }}>−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 accent-[#6FAF85]"
            aria-label="Zoom"
            // Without this, dragging the range on iOS is hijacked as a page
            // pan/zoom gesture (the screen appeared to "minimize"). Lock the
            // touch action so the slider owns the gesture.
            style={{ touchAction: "none" }}
          />
          <span style={{ color: "#8FAF96", fontSize: 20 }}>＋</span>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-full py-2.5 text-[14px] font-semibold active:scale-[0.99] disabled:opacity-50"
            style={{ background: "rgba(143,175,150,0.12)", color: "#C8D4C0", border: "1px solid rgba(143,175,150,0.25)", fontFamily: FONT }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !nat}
            className="flex-1 rounded-full py-2.5 text-[14px] font-semibold active:scale-[0.99] disabled:opacity-50"
            style={{ background: "rgba(46,107,64,0.9)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >{busy ? "Saving…" : "Use photo"}</button>
        </div>
      </motion.div>
    </div>
  );
}
