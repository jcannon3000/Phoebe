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

export interface MenuHubItem {
  emoji: string;
  label: string;
  sub?: string;
  badge?: string;
  /** A small green dot to the right — "there's something new here". */
  dot?: boolean;
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
                  <button
                    key={ii}
                    type="button"
                    onClick={() => { playOpeningSwell(2); it.onClick(); }}
                    className="w-full transition-opacity hover:opacity-90"
                    style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: CARD_BG, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px" }}
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
