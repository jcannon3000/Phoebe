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
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DeckNavPill from "@/components/DeckNavPill";
import type { CachedPassage } from "@/lib/passageCache";

const FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const WARM = "#F0EDE6";
const BG = "#0B1F14";

export function OfflinePassageSheet({ passage, slideLabel, onClose, onPrev, onNext }: {
  passage: CachedPassage;
  /** "18 of 38 · Lesson", verbatim from the deck. Empty = no counter. */
  slideLabel?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [standardNote, setStandardNote] = useState(false);
  // The parser marks them; nothing here guesses. A heuristic read "he makes
  // peace in his high heaven. 3 Is there any number to his armies?" as a
  // heading — short, and ending in a question mark.
  const headings = new Set(passage.headingIndexes ?? []);
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
      {/* THE READER'S OWN CHROME (owner: "make sure the UI is the same as if
          online, with the Standard button at the top"). Done on the left, the
          Standard capsule centred, Previous on the right — the arrangement
          BibleWebViewController builds over a live page, so the saved reading
          and the fetched one are the same room. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "calc(env(safe-area-inset-top) + 10px) 12px 8px" }}>
        <button type="button" onClick={onClose} style={pill()}>Done</button>
        <button
          type="button"
          onClick={() => setStandardNote((v) => !v)}
          aria-expanded={standardNote}
          style={{ ...pill(), fontWeight: 600 }}
        >
          Standard
        </button>
        <button type="button" onClick={onClose} style={{ ...pill(), opacity: 0.55 }}>Previous</button>
      </div>
      {standardNote && (
        // The one thing that cannot be the same offline, said plainly rather
        // than left as a button that does nothing: Standard shows the
        // publisher's own page, and that page is on the web.
        <p style={{ margin: "0 12px 6px", fontSize: 12.5, lineHeight: 1.5, color: "rgba(200,212,192,0.62)" }}>
          You're reading the copy saved on your phone. The publisher's own page needs a connection.
        </p>
      )}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never, padding: "0 12px" }}>
        {/* The masthead readerJS inserts on a live oremus page, verbatim. */}
        <p style={{ margin: "2px 0 0", padding: "2px 0 0", fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", color: "rgba(168,197,160,0.95)" }}>
          the oremus Bible Browser
        </p>
        {/* h2.passageref — the reference, in the reader's own small caps. */}
        <h2 style={{ margin: 0, padding: "14px 0 6px", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(200,212,192,0.75)", fontWeight: 600 }}>
          {passage.ref}
        </h2>
        {/* .bibletext — 21px / 1.72, the reader's measure since the +2 today.
            A section heading (oremus's "Salt and Light") is set as the page
            sets it: 15px, quieter than the verses, with room above. */}
        {passage.paragraphs.map((p, i) => (
          headings.has(i)
            ? <h3 key={i} style={{ margin: "1.5em 0 0.5em", padding: 0, fontSize: 15, fontWeight: 600, color: "rgba(200,212,192,0.8)" }}>{p}</h3>
            : <p key={i} style={{ fontSize: 21, lineHeight: 1.72, margin: "0 0 1.15em", color: WARM }}>{p}</p>
        ))}
        {passage.credit && (
          <p style={{ margin: "2em 0 0", padding: "16px 0", fontSize: 12, lineHeight: 1.6, color: "rgba(200,212,192,0.62)", borderTop: "1px solid rgba(200,212,192,0.16)" }}>
            {passage.credit}
          </p>
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
