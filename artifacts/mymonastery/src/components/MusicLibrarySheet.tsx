import { AnimatePresence, motion } from "framer-motion";
import { RollingLine } from "@/components/RollingLine";
import { MUSIC_PLAYLISTS, type MusicPlaylist } from "@/lib/practiceMusic";

// ── Choose from library ─────────────────────────────────────────────────────
//
// Owner, 2026-09-18, on Audio Divina: "instead of those two pills there should
// be a wide pill that says chose from library, and then they would chose a
// catalogue", and "hymns need to be an audio Divina option, below Ryuichi
// Sakamoto".
//
// The catalogue sheet that wide pill opens. The same sheet as the sit's "Music
// for the sit" picker (pages/contemplation.tsx): the frosted card on a blurred
// scrim, one row per catalogue, the name over a single detail line that rolls
// through when it doesn't fit (components/RollingLine), so every row is the
// same height.
//
// THE ROWS ARE READ FROM lib/practiceMusic's MUSIC_PLAYLISTS, never copied:
// the list changes (albums come in, Black Christ of the Andes went out), and
// a second hand-kept copy here would drift from the sit's and the office's.
//
// HYMNS IS NOT A PLAYLIST. It is the Hymnal 1982, a catalogue of its own with
// its own page (/hymns), so it gets its own callback, onHymns, rather than a
// fake MusicPlaylist that every consumer would have to remember to special-
// case. It sits directly under the Sakamoto row, where the owner put it; if
// that row is ever removed it falls to the end of the list rather than
// vanishing.
//
// Not mounted here. listening.tsx mounts it (Claude RC, 2026-09-18).

const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

/** The Sakamoto album — Hymns is placed directly under it. */
const SAKAMOTO_ID = "1833109181";

type Row =
  | { kind: "playlist"; pl: MusicPlaylist }
  | { kind: "hymns" };

function rows(): Row[] {
  const out: Row[] = MUSIC_PLAYLISTS.map((pl) => ({ kind: "playlist", pl }));
  const at = out.findIndex((r) => r.kind === "playlist" && r.pl.id === SAKAMOTO_ID);
  out.splice(at >= 0 ? at + 1 : out.length, 0, { kind: "hymns" });
  return out;
}

export function MusicLibrarySheet({
  open,
  onClose,
  onPick,
  onHymns,
  selectedId,
  title = "Choose from library",
}: {
  open: boolean;
  onClose: () => void;
  /** A playlist, album or artist was chosen. The sheet does NOT close itself. */
  onPick: (pl: MusicPlaylist) => void;
  /** The Hymns row was chosen (the caller opens /hymns). */
  onHymns: () => void;
  /** The catalogue currently chosen, if any; its row shows a check. */
  selectedId?: string | null;
  title?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="music-library"
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
              Choose a catalogue to listen from.
            </p>

            {/* The list scrolls inside the card, so a long library never pushes
                Close off the screen. */}
            <div className="flex flex-col gap-2" style={{ overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
              {rows().map((r) => {
                const key = r.kind === "hymns" ? "hymns" : r.pl.id;
                const label = r.kind === "hymns" ? "Hymns" : r.pl.label;
                const sub = r.kind === "hymns" ? "The Hymnal 1982 · find a hymn by number or name" : r.pl.sub;
                const on = r.kind === "playlist" && selectedId === r.pl.id;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => (r.kind === "hymns" ? onHymns() : onPick(r.pl))}
                    aria-pressed={r.kind === "playlist" ? on : undefined}
                    className="w-full flex items-center gap-10 text-left transition-opacity hover:opacity-90"
                    style={{
                      flex: "0 0 auto",
                      borderRadius: 12, padding: "12px 13px", cursor: "pointer",
                      background: on ? "rgba(46,107,64,0.32)" : "rgba(240,237,230,0.05)",
                      border: `1px solid ${on ? "rgba(143,175,150,0.55)" : "rgba(46,107,64,0.38)"}`,
                    }}
                  >
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: "#F0EDE6", fontFamily: SPACE_GROTESK, fontSize: 14.5, lineHeight: 1.3 }}>
                        {label}
                      </span>
                      <RollingLine
                        text={sub}
                        style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontSize: 11.5, marginTop: 3 }}
                      />
                    </span>
                    {/* A check for the chosen one, a chevron for Hymns (it opens
                        a page); an empty box keeps the other rows aligned. */}
                    <span
                      aria-hidden
                      style={{
                        flex: "0 0 auto", width: 21, height: 21, borderRadius: 6,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: on ? "#2D5E3F" : "transparent",
                        border: r.kind === "hymns" ? "none" : `1px solid ${on ? "rgba(143,175,150,0.7)" : "rgba(143,175,150,0.35)"}`,
                        color: r.kind === "hymns" ? "rgba(143,175,150,0.75)" : "#F0EDE6", fontSize: r.kind === "hymns" ? 16 : 12, lineHeight: 1,
                      }}
                    >
                      {r.kind === "hymns" ? "›" : on ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
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
