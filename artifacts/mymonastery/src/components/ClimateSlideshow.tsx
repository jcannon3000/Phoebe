import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ClimateSlideshowProps {
  entry: { id: number; title: string; body: string; scriptureRef: string | null };
  dayLocal: string;
  alreadyPrayed: boolean;
  // Closing-slide counters. Parish is null for unparished users — that's a
  // first-class state, not an error condition. The parish association is
  // purely additive on top of the global daily prayer.
  globalCount: number;
  parish: { name: string; count: number } | null;
  onClose: () => void;
}

type Phase = "entry" | "closing";

export function ClimateSlideshow({
  entry,
  alreadyPrayed,
  globalCount,
  parish,
  onClose,
}: ClimateSlideshowProps) {
  const [phase, setPhase] = useState<Phase>("entry");
  const [visible, setVisible] = useState(false);
  const queryClient = useQueryClient();

  // Fade overlay in on mount; lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, []);

  const prayMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/climate/today/pray"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/climate/today"] });
    },
  });

  function advance() {
    if (phase === "entry") {
      // Log the prayer when the user reaches the closing slide. Idempotent
      // server-side, but we still gate on alreadyPrayed to avoid an
      // unnecessary round-trip when the user is re-praying for the day.
      if (!alreadyPrayed) prayMutation.mutate();
      setPhase("closing");
    }
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: "#040D06" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Close button — top-right, respects iOS safe area */}
      <button
        onClick={handleClose}
        className="absolute top-0 right-0 p-4 text-2xl"
        style={{
          color: "rgba(200,212,192,0.5)",
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))",
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {phase === "entry" && (
            <motion.div
              key="entry"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center gap-6"
            >
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{ color: "rgba(143,175,150,0.45)" }}
              >
                Phoebe Climate
              </p>

              <h2
                className="text-[24px] leading-[1.3] font-semibold"
                style={{
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                {entry.title}
              </h2>

              <p
                className="text-[18px] leading-[1.6] italic"
                style={{
                  color: "#E8E4D8",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                {entry.body}
              </p>

              {entry.scriptureRef && (
                <p
                  className="text-[12px] tracking-wide mt-1"
                  style={{ color: "rgba(143,175,150,0.6)" }}
                >
                  {entry.scriptureRef}
                </p>
              )}

              <button
                onClick={advance}
                className="mt-6 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
                style={{
                  background: "rgba(46,107,64,0.28)",
                  border: "1px solid rgba(46,107,64,0.5)",
                  color: "#C8D4C0",
                }}
              >
                Amen →
              </button>
            </motion.div>
          )}

          {phase === "closing" && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center gap-5"
            >
              <div className="text-4xl">🌿</div>

              <h3
                className="text-[22px] leading-[1.3] font-semibold"
                style={{
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                {alreadyPrayed ? "Welcome back." : "You prayed today."}
              </h3>

              {/* Counters. Global always shown; parish only when the user
                  has joined one — being unparished is fine, the parish
                  association is purely additive. */}
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <div
                  className="rounded-2xl px-5 py-4"
                  style={{
                    background: "rgba(46,107,64,0.14)",
                    border: "1px solid rgba(46,107,64,0.22)",
                  }}
                >
                  <p
                    className="text-3xl font-bold"
                    style={{
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {globalCount}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#8FAF96" }}>
                    {globalCount === 1 ? "person praying today" : "people praying today"}
                  </p>
                </div>

                {parish && (
                  <div
                    className="rounded-2xl px-5 py-4"
                    style={{
                      background: "rgba(46,107,64,0.08)",
                      border: "1px solid rgba(46,107,64,0.15)",
                    }}
                  >
                    <p
                      className="text-3xl font-bold"
                      style={{
                        color: "#F0EDE6",
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {parish.count}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#8FAF96" }}>
                      from {parish.name}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleClose}
                className="mt-4 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
                style={{
                  background: "rgba(46,107,64,0.28)",
                  border: "1px solid rgba(46,107,64,0.5)",
                  color: "#C8D4C0",
                }}
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
