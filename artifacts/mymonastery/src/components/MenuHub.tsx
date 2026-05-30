import { useLocation } from "wouter";
import { Layout } from "@/components/layout";

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
const CARD_BG = "rgba(46,107,64,0.10)";
const CARD_BORDER = "rgba(46,107,64,0.22)";

export interface MenuHubItem {
  emoji: string;
  label: string;
  sub?: string;
  badge?: string;
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
}: {
  title: string;
  emoji?: string;
  subtitle?: string;
  backLabel?: string;
  backHref?: string;
  groups: MenuHubGroup[];
}) {
  const [, setLocation] = useLocation();
  return (
    <Layout>
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
                    onClick={it.onClick}
                    className="w-full transition-opacity hover:opacity-90"
                    style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px" }}
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
                    <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
