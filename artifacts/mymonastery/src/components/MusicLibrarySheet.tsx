import { AnimatePresence, motion } from "framer-motion";
import { RollingLine } from "@/components/RollingLine";
import { MUSIC_CATALOGUES } from "@/lib/youtubeCatalogues";

// ── Browse catalogues ───────────────────────────────────────────────────────
//
// Owner, 2026-09-19: "For the catalogues, let do a browse catalogue pill again
// that brings up different options". A row of pills on Audio Divina's Listen
// slide — Hymns, Hildegard, Mary Lou's Mass, Taizé Songs, and more coming —
// was becoming a wall; one pill opens this instead.
//
// The same sheet as the sit's "Music for the sit" picker: the frosted card on
// a blurred scrim, one row per catalogue, its name over a single line that
// rolls through when it doesn't fit (components/RollingLine), the list
// scrolling inside so Close is always reachable.
//
// THE LIST IS lib/youtubeCatalogues' MUSIC_CATALOGUES, never a copy: adding a
// catalogue there adds it here. Each row opens that catalogue's own page.

const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

export function MusicLibrarySheet({
  open,
  onClose,
  onPick,
  title = "Browse catalogues",
}: {
  open: boolean;
  onClose: () => void;
  /** A catalogue was chosen — its in-app path. The sheet does NOT close itself. */
  onPick: (path: string) => void;
  title?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="browse-catalogues"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(4,14,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: 20 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full flex flex-col"
            style={{
              maxWidth: 420, maxHeight: "calc(var(--app-dvh, 100dvh) - 80px)",
              borderRadius: 18, padding: 18, boxSizing: "border-box",
              background: "rgba(9,26,16,0.96)", border: "1px solid rgba(46,107,64,0.45)",
            }}
          >
            <p style={{ color: "#F0EDE6", fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
              {title}
            </p>
            <p style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontSize: 12, lineHeight: 1.45, margin: "0 0 14px" }}>
              Music to listen with, in Phoebe.
            </p>

            <div className="flex flex-col gap-2" style={{ overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
              {MUSIC_CATALOGUES.map((c) => (
                <button
                  key={c.path}
                  type="button"
                  onClick={() => onPick(c.path)}
                  className="w-full flex items-center gap-10 text-left transition-opacity hover:opacity-90"
                  style={{
                    flex: "0 0 auto",
                    borderRadius: 12, padding: "12px 13px", cursor: "pointer",
                    background: "rgba(240,237,230,0.05)", border: "1px solid rgba(46,107,64,0.38)",
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", color: "#F0EDE6", fontFamily: SPACE_GROTESK, fontSize: 14.5, lineHeight: 1.3 }}>
                      {c.title}
                    </span>
                    <RollingLine
                      text={c.browse}
                      style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontSize: 11.5, marginTop: 3 }}
                    />
                  </span>
                  <span
                    aria-hidden
                    style={{ flex: "0 0 auto", color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK, fontSize: 16, lineHeight: 1 }}
                  >
                    ›
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99] mt-4"
              style={{ flex: "0 0 auto", background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)", color: "#F0EDE6", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "12px 10px" }}
            >
              Close
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
