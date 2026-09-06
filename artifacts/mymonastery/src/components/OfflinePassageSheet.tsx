/**
 * The passage, read from the phone.
 *
 * Every reader in the app opens bible.oremus.org; with no connection that is a
 * blank page. When a passage has been saved (lib/passageCache), the decks open
 * THIS instead — over the deck, so the deck keeps its place.
 *
 * IT CARRIES THE DECK'S OWN PILL. A simulator walk (2026-09-05) found the
 * office's own bottom pill drawn OVER this sheet and inert: tapping its Next
 * re-entered the same lesson and re-opened the same passage, so nothing
 * appeared to happen, and the text scrolled underneath it. The sheet is
 * portalled to <body> above every deck's stacking context now, and it wears
 * the same Back · "N of M · SECTION" · Next pill the decks do — one set of
 * controls on screen, and they step the deck through the very events the
 * native reader's pill posts.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import DeckNavPill from "@/components/DeckNavPill";
import type { CachedPassage } from "@/lib/passageCache";

const FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const WARM = "#F0EDE6";
const BG = "#0B1F14";

export function OfflinePassageSheet({ passage, title, slideLabel, onClose, onPrev, onNext }: {
  passage: CachedPassage;
  /** The deck's own name — "Lectio Divina", "Morning Prayer". */
  title: string;
  /** "18 of 38 · Lesson", verbatim from the deck. Empty = no counter. */
  slideLabel?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheet = (
    <div
      role="dialog"
      aria-label={passage.ref}
      style={{
        position: "fixed", inset: 0,
        // Above every deck: the office draws its own chrome inside a
        // stacking context of its own (isolation: isolate), and its pill was
        // landing on top of this sheet.
        zIndex: 2000,
        background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 10px) 14px 8px" }}>
        <button type="button" onClick={onClose} style={pill()}>Done</button>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "rgba(200,212,192,0.85)" }}>{title}</span>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(143,175,150,0.7)" }}>Saved</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never, padding: "8px 22px 0" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(200,212,192,0.75)", fontWeight: 600, margin: "10px 0 6px" }}>{passage.version}</p>
        <h1 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 700, margin: "0 0 18px" }}>{passage.ref}</h1>
        {passage.paragraphs.map((p, i) => (
          <p key={i} style={{ fontSize: 21, lineHeight: 1.72, margin: "0 0 1.1em", color: WARM }}>{p}</p>
        ))}
        {passage.credit && (
          <p style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(200,212,192,0.45)", margin: "24px 0 0" }}>{passage.credit}</p>
        )}
        {/* A SPACER, never padding-bottom: iOS WKWebView drops a flex-column
            scroll container's bottom padding once a child overflows, and the
            last verses ended up behind the pill. */}
        <div aria-hidden style={{ height: "calc(env(safe-area-inset-bottom) + 132px)", flexShrink: 0 }} />
      </div>
      <DeckNavPill
        label={slideLabel || ""}
        back={{ onClick: () => (onPrev ? onPrev() : onClose()) }}
        primary={{ label: "Next →", onClick: () => (onNext ? onNext() : onClose()) }}
      />
    </div>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}

function pill(): React.CSSProperties {
  return {
    background: "rgba(200,212,192,0.10)",
    color: WARM, border: "1px solid rgba(200,212,192,0.18)", borderRadius: 999,
    padding: "8px 14px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
  };
}
