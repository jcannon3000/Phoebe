import type { ReactNode } from "react";
import { useMemo } from "react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { playOpeningSwell } from "@/lib/amenFeedback";

// ── MenuHub — the shared "list of cards" page ───────────────────────────────
//
// One visual language for the page-based navigation that replaced the drawer:
// a titled page with an optional back link and groups of tappable cards
// (emoji · title · optional subtitle · chevron). Mirrors the Daily Offices
// page style. Used by /menu and every category page under it.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BG = "rgba(9,26,16, 0.297)";
const CARD_BORDER = "rgba(46,107,64,0.38)";
// Action-pill colors — the app's existing format language, carried over from
// the offices page: gold = Forward Movement audio, purple = a broadcast,
// green = anything else.
const ACTION_PALETTE = {
  gold:   { bg: "rgba(212,160,70,0.14)", border: "rgba(212,160,70,0.38)", color: "#F0DCA8" },
  purple: { bg: "rgba(120,80,180,0.16)", border: "rgba(120,80,180,0.42)", color: "#E0D0F5" },
  green:  { bg: "rgba(46,107,64,0.18)",  border: "rgba(46,107,64,0.45)",  color: "#A8C5A0" },
} as const;

/** A small pill sitting UNDER a card — an alternate way into the same thing
 *  (listen to it, watch it) rather than a separate menu entry. Rendered
 *  outside the card's own <button> so we never nest interactive elements. */
export interface MenuHubAction {
  emoji: string;
  label: string;
  /** Matches the app's format language: gold = audio, purple = broadcast,
   *  green = everything else. */
  variant?: "gold" | "purple" | "green";
  onClick: () => void;
}
export interface MenuHubItem {
  emoji: string;
  label: string;
  sub?: string;
  badge?: string;
  /** A small green dot to the right — "there's something new here". */
  dot?: boolean;
  /** Dims the card without disabling it — for something that isn't its
   *  time of day yet but is still tappable (the offices page's "later"
   *  offices). Purely visual. */
  muted?: boolean;
  actions?: MenuHubAction[];
  onClick: () => void;
}
export interface MenuHubGroup {
  header?: string;
  items: MenuHubItem[];
}

export function MenuHub({
  title,
  emoji,
  subtitle,
  backLabel,
  backHref,
  groups,
  headerSlot,
}: {
  title: string;
  emoji?: string;
  subtitle?: string;
  backLabel?: string;
  backHref?: string;
  groups: MenuHubGroup[];
  /** Optional content rendered between the subtitle and the card groups
   *  (e.g. El Jardín's "Today's reading" card). */
  headerSlot?: ReactNode;
}) {
  const [, setLocation] = useLocation();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
        {backHref && (
          <button
            type="button"
            onClick={() => setLocation(backHref)}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← {backLabel ?? "Back"}
          </button>
        )}

        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          {title}{emoji ? ` ${emoji}` : ""}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: SAGE, margin: "0 0 20px", lineHeight: 1.5 }}>{subtitle}</p>
        )}

        {headerSlot && <div style={{ marginBottom: 22 }}>{headerSlot}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: subtitle ? 0 : 18 }}>
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.header && (
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT, margin: "0 0 10px" }}>
                  {g.header}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {g.items.map((it, ii) => (
                  <div key={ii}>
                  <button
                    type="button"
                    onClick={() => { playOpeningSwell(2); it.onClick(); }}
                    className="w-full transition-opacity hover:opacity-90"
                    style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: CARD_BG, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px", opacity: it.muted ? 0.62 : 1 }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, width: 28, textAlign: "center" }} aria-hidden>{it.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: WARM }}>{it.label}</span>
                        {it.badge && (
                          <span style={{ fontSize: 9.5, fontWeight: 600, color: FAINT, border: `1px solid ${CARD_BORDER}`, borderRadius: 999, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {it.badge}
                          </span>
                        )}
                      </span>
                      {it.sub && <span style={{ display: "block", fontSize: 13, color: SAGE, marginTop: 3, lineHeight: 1.35 }}>{it.sub}</span>}
                    </span>
                    {it.dot && (
                      <span aria-label="new" style={{ width: 9, height: 9, borderRadius: 999, background: "#6FAF85", boxShadow: "0 0 0 3px rgba(111,175,133,0.22)", flexShrink: 0 }} />
                    )}
                    <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
                  </button>
                  {/* Alternate formats of the SAME item (listen / watch),
                      outside the card button so we never nest buttons. */}
                  {it.actions && it.actions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, paddingLeft: 4 }}>
                      {it.actions.map((a, ai) => {
                        const p = ACTION_PALETTE[a.variant ?? "green"];
                        return (
                          <button
                            key={ai}
                            type="button"
                            onClick={a.onClick}
                            className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-90"
                            style={{ background: p.bg, border: `1px solid ${p.border}`, color: p.color, borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
                          >
                            <span aria-hidden>{a.emoji}</span>
                            <span>{a.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </Layout>
  );
}
