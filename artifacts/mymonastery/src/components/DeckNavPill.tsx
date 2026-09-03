/**
 * THE DECK'S BOTTOM PILL — Back · "N of M · Section" · Next.
 *
 * The Daily Office deck (bcp-daily-office.tsx) is the precedent for every
 * practice slideshow: one fixed frosted pill at the bottom carrying Back, the
 * counter with its section label, and the primary action. Lectio mirrors it
 * by hand; Audio Divina and Visio Divina had grown a different footer (a
 * full-width CTA with a bare "N / M" under it — no Back, no section), and the
 * owner asked for them to match the office: "we already had the UI
 * precedent, for some reason you are doing something else."
 *
 * ONE component rather than a fourth hand copy — a rule stated in more than
 * one place drifts (see memory: second-renderer drift). The office keeps its
 * own for now because it is themed through --ot-* variables; this one uses
 * the plain deck tokens the other decks already share.
 *
 * `hold` is Visio's "Pause before continuing": while it runs the primary goes
 * WORDLESS with a wash filling underneath (owner: a label for an action the
 * button will refuse reads as broken), a hint line above the pill names what
 * the wait is for, and the label RISES when it arrives. Kept exactly — only
 * the shape around it changed.
 */
import type { CSSProperties, ReactNode } from "react";

const WARM = "#F0EDE6";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export type DeckNavPillProps = {
  /** "N of M · Section" — rendered verbatim, uppercased by style. */
  label: string;
  back: { onClick: () => void; disabled?: boolean };
  primary: {
    label: ReactNode;
    onClick: () => void;
    /** Inert-but-focusable (aria-disabled), dimmed. Never `disabled`: a
     *  disabled button leaves the accessibility tree and can't say why. */
    inert?: boolean;
    ariaLabel?: string;
    /** Visio's 12s hold: wordless pill with a filling wash, keyed per beat so
     *  it restarts. `seconds` is the fill duration. */
    hold?: { active: boolean; key: string | number; seconds?: number };
    /** Adds the rise animation to the label (the beat the hold just ended). */
    rise?: boolean;
  };
  /** One quiet line above the pill (e.g. "Pause before continuing"). */
  hint?: string | null;
  /** Extra lift when something else (a player bar) sits under the pill. */
  bottomOffsetPx?: number;
  style?: CSSProperties;
};

export default function DeckNavPill({ label, back, primary, hint, bottomOffsetPx = 16, style }: DeckNavPillProps) {
  const holding = !!primary.hold?.active;
  const inert = !!primary.inert || holding;
  const seconds = primary.hold?.seconds ?? 12;
  return (
    <>
      <style>{`
        @keyframes deck-hold-grow { from { width: 0%; } to { width: 100%; } }
        @keyframes deck-cta-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .deck-cta-rise { animation: deck-cta-rise 520ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed", left: "50%", bottom: `calc(env(safe-area-inset-bottom) + ${bottomOffsetPx}px)`,
          transform: "translateX(-50%)", zIndex: 50,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          maxWidth: "calc(100vw - 32px)",
          ...style,
        }}
      >
        {hint && (
          <p aria-hidden style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.02em", margin: 0, textAlign: "center", whiteSpace: "nowrap" }}>
            {hint}
          </p>
        )}
        <div
          style={{
            background: "rgba(9,26,16, 0.462)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
            border: `1px solid ${BORDER}`, borderRadius: 999, padding: "8px 12px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", gap: 16, minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={back.onClick}
            disabled={back.disabled}
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              userSelect: "none", WebkitTapHighlightColor: "transparent",
              color: WARM, background: "transparent", border: `1px solid ${BORDER}`,
              padding: "6px 14px", fontSize: 12, fontFamily: FONT, fontWeight: 600,
              cursor: back.disabled ? "default" : "pointer",
            }}
          >
            Back
          </button>
          <p style={{ color: FAINT, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, whiteSpace: "nowrap", fontFamily: FONT, flex: "0 0 auto" }}>
            {label}
          </p>
          <button
            type="button"
            onClick={() => { if (!inert) primary.onClick(); }}
            aria-disabled={inert || undefined}
            aria-label={primary.ariaLabel}
            className="rounded-full transition-opacity"
            style={{
              position: "relative", overflow: "hidden",
              userSelect: "none", WebkitTapHighlightColor: "transparent",
              background: "rgba(46,107,64,0.55)", color: WARM, border: "none",
              padding: "6px 16px", fontSize: 12, fontFamily: FONT, fontWeight: 600,
              letterSpacing: "0.02em", whiteSpace: "nowrap",
              cursor: inert ? "default" : "pointer",
              opacity: inert ? 0.72 : 1, transition: "opacity 420ms ease-out",
              // A wordless pill still needs a width, or it collapses to its
              // padding and jumps when the word arrives.
              minWidth: holding ? 88 : undefined,
            }}
          >
            {holding && (
              <span
                key={primary.hold!.key}
                aria-hidden
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "0%", background: "rgba(168,197,160,0.16)", pointerEvents: "none", animation: `deck-hold-grow ${seconds}s linear forwards` }}
              />
            )}
            <span
              key={`${primary.hold?.key ?? ""}-${holding}`}
              className={primary.rise && !holding ? "deck-cta-rise" : undefined}
              style={{ position: "relative", display: "block", minHeight: 16, lineHeight: "16px" }}
            >
              {holding ? null : primary.label}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
