/**
 * The passage, read from the phone.
 *
 * Every reader in the app opens bible.oremus.org; with no connection that is a
 * blank page. When a passage has been saved (lib/passageCache), the decks open
 * THIS instead — a sheet over the deck, so the deck keeps its place — and its
 * Continue steps the deck exactly as the native reader's own pill would, by
 * posting phoebe:office-next-slide.
 */
import { useEffect } from "react";
import type { CachedPassage } from "@/lib/passageCache";

const FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const WARM = "#F0EDE6";

export function OfflinePassageSheet({ passage, title, onClose, onContinue }: {
  passage: CachedPassage;
  /** The deck's own name — "Lectio Divina", "Morning Prayer". */
  title: string;
  onClose: () => void;
  /** Omitted = close only. Given = close, then step the deck. */
  onContinue?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={passage.ref}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "#0B1F14", color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 10px) 14px 8px" }}>
        <button type="button" onClick={onClose} style={pill()}>Done</button>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "rgba(200,212,192,0.85)" }}>{title}</span>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(143,175,150,0.7)" }}>Saved · offline</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as never, padding: "8px 22px calc(env(safe-area-inset-bottom) + 110px)" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(200,212,192,0.75)", fontWeight: 600, margin: "10px 0 6px" }}>{passage.version}</p>
        <h1 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 700, margin: "0 0 18px" }}>{passage.ref}</h1>
        {passage.paragraphs.map((p, i) => (
          <p key={i} style={{ fontSize: 21, lineHeight: 1.72, margin: "0 0 1.1em", color: WARM }}>{p}</p>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 20px calc(env(safe-area-inset-bottom) + 18px)", background: "linear-gradient(to top, rgba(11,31,20,1) 55%, rgba(11,31,20,0))", display: "flex", justifyContent: "center" }}>
        <button type="button" onClick={onContinue ?? onClose} style={{ ...pill(true), minWidth: 160, padding: "12px 26px", fontSize: 15 }}>
          {onContinue ? "Continue →" : "Done"}
        </button>
      </div>
    </div>
  );
}

function pill(filled = false): React.CSSProperties {
  return {
    background: filled ? "#2D5E3F" : "rgba(200,212,192,0.10)",
    color: WARM, border: "1px solid rgba(200,212,192,0.18)", borderRadius: 999,
    padding: "8px 14px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
  };
}
