import { forwardRef } from "react";
import type { Slide as SlideData, MemberPresence } from "./types";
import { CallAndResponse } from "./CallAndResponse";
import { triggerAmenFeedback } from "@/lib/amenFeedback";
import { fixQuoteDirection } from "@/lib/smartQuotes";
import { openExternal } from "@/lib/openExternal";
import { useTranslation } from "react-i18next";
// Single daily-reflection pill on the closing slide. The user picks
// ONE source in Office Settings → After the office; the pill opens
// that source externally and marks it read so the home card flips.
import {
  CAC_TODAY_URL,
  FDD_TODAY_URL,
  SSJE_TODAY_URL,
  markCacRead,
  markFddRead,
  markSsjeRead,
} from "@/lib/cacReadState";
import { useEffectiveReflectionSource } from "@/lib/officePrefs";

interface SlideProps {
  slide: SlideData;
  scrollBlocked: boolean;
  onScroll: () => void;
  presenceData?: MemberPresence[];
  hasLogged?: boolean;
  onLog?: () => void;
  onBack?: () => void;
  momentId?: number;
  memberToken?: string;
  theme?: "morning" | "evening";
}

// Morning Prayer palette
const SOIL = "#2C1810";
const CREAM = "#E8E4D8";
const SAGE = "#5C7A5F";
const AMBER = "#C17F24";
const MUTED = "#9B8577";

// Evening Prayer palette
const EP_BG = "#0F2818";
const EP_TEXT = "#E8E4D8";
const EP_ACCENT = "#8FAF96";
const EP_MUTED = "rgba(143,175,150,0.5)";
const EP_HIGHLIGHT = "#C8D4C0";

const SEASON_LABEL: Record<string, string> = {
  advent: "Advent 🕯️",
  christmas: "Christmas 🌟",
  epiphany: "Epiphany ✨",
  lent: "Lent 🌿",
  holy_week: "Holy Week ✝️",
  easter: "Eastertide 🌸",
  season_after_pentecost: "Season after Pentecost 🌳",
};

function formatPresence(presence: MemberPresence[]): string {
  if (presence.length === 0) return "You are the first to pray today 🌿";
  if (presence.length === 1) return `${presence[0].name} has prayed this today 🌿`;
  if (presence.length === 2)
    return `${presence[0].name} and ${presence[1].name} have prayed this today 🌿`;
  return `${presence[0].name} and ${presence.length - 1} others have prayed this today 🌿`;
}

function formatLogTime(loggedAt: string | null): string {
  if (!loggedAt) return "";
  const d = new Date(loggedAt);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const SlideView = forwardRef<HTMLDivElement, SlideProps>(
  (
    {
      slide,
      scrollBlocked,
      onScroll,
      presenceData = [],
      hasLogged = false,
      onLog,
      onBack,
      theme = "morning",
    },
    ref,
  ) => {
    const isEvening = theme === "evening";
    const isOpenClose = slide.type === "opening" || slide.type === "closing";
    // Office-close prefs drive the daily-reflection pills (CAC / FDD)
    // rendered on the closing slide. Hook is safe outside the render
    // branch — it's only read inside the closing block below.
    // NCMP is intentionally NOT a closing-pill option: it's a live
    // weekday broadcast that IS Morning Prayer at the National
    // Cathedral, not a post-office reflection. It's reachable via
    // the drawer Resources entry instead.
    // Effective precedence: explicit Settings pick → visible home
    // reflection card → FDD default.
    const reflectionSource = useEffectiveReflectionSource(isEvening ? "evening" : "morning");
    const { t } = useTranslation();

    // Color scheme
    const bg = isEvening ? EP_BG : (isOpenClose ? SOIL : CREAM);
    const textColor = isEvening ? EP_TEXT : (isOpenClose ? CREAM : SOIL);
    const accentColor = isEvening ? EP_ACCENT : SAGE;
    const highlightColor = isEvening ? EP_HIGHLIGHT : AMBER;
    const mutedColor = isEvening ? EP_MUTED : MUTED;

    const containerStyle: React.CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100vh",
      background: bg,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      padding: "48px 32px",
      overflow: "hidden",
    };

    // ── OPENING ────────────────────────────────────────────────────────────────
    if (slide.type === "opening") {
      const season = slide.metadata?.season as string;
      const seasonLabel = (slide.metadata?.seasonLabel as string) ?? SEASON_LABEL[season] ?? "";
      const presenceLine = formatPresence(presenceData);
      const isEP = slide.metadata?.office === "evening";

      return (
        <div style={{ ...containerStyle, background: isEvening ? EP_BG : SOIL }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>{slide.emoji}</div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: isEvening ? EP_TEXT : CREAM,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {slide.content}
            </h1>
            {seasonLabel && (
              <p
                style={{
                  fontSize: 16,
                  color: isEvening ? EP_ACCENT : AMBER,
                  fontStyle: "italic",
                  fontFamily: "Georgia, serif",
                  margin: 0,
                }}
              >
                {seasonLabel}
              </p>
            )}
            {isEP && (
              <p
                style={{
                  fontSize: 14,
                  color: EP_MUTED,
                  margin: 0,
                  fontFamily: "Georgia, serif",
                  fontStyle: "italic",
                }}
              >
                Evening Prayer · Rite II
              </p>
            )}
            <p
              style={{
                fontSize: 14,
                color: isEvening ? EP_MUTED : SAGE,
                margin: 0,
                fontFamily: "Space Grotesk, sans-serif",
              }}
            >
              {presenceLine}
            </p>
          </div>
          <p
            style={{
              fontSize: 13,
              color: isEvening ? "rgba(200,212,192,0.4)" : "rgba(247,240,230,0.4)",
              margin: "24px 0 0",
              fontFamily: "Space Grotesk, sans-serif",
            }}
          >
            Tap to begin
          </p>
        </div>
      );
    }

    // ── CLOSING ────────────────────────────────────────────────────────────────
    if (slide.type === "closing") {
      const dateStr = slide.metadata?.date
        ? new Date(slide.metadata.date as string).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "";
      const isEP = slide.metadata?.office === "evening";
      const closingTitle = isEP ? "Evening Prayer" : "Morning Prayer";

      return (
        <div style={{ ...containerStyle, background: isEvening ? EP_BG : SOIL }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <h1
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: isEvening ? EP_TEXT : CREAM,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
              }}
            >
              {closingTitle}
            </h1>
            {dateStr && (
              <p
                style={{
                  fontSize: 18,
                  color: isEvening ? EP_ACCENT : AMBER,
                  fontFamily: "Space Grotesk, sans-serif",
                  margin: 0,
                }}
              >
                {dateStr}
              </p>
            )}

            {/* Garden section */}
            {presenceData.length > 0 && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <p
                  style={{
                    fontSize: 11,
                    color: accentColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontFamily: "Space Grotesk, sans-serif",
                    margin: "0 0 12px",
                  }}
                >
                  Today's Garden 🌿
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {presenceData.map((member) => (
                    <div
                      key={member.email}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          color: isEvening ? EP_TEXT : CREAM,
                          fontFamily: "Space Grotesk, sans-serif",
                        }}
                      >
                        {member.name ?? member.email}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: member.loggedAt ? accentColor : mutedColor,
                          fontFamily: "Space Grotesk, sans-serif",
                        }}
                      >
                        {member.loggedAt
                          ? `Prayed ${formatLogTime(member.loggedAt)} 🌸`
                          : "Not yet 🌱"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Amen button */}
            <div style={{ width: "100%", marginTop: 16 }}>
              {hasLogged ? (
                <p
                  style={{
                    fontSize: 16,
                    color: accentColor,
                    fontFamily: "Space Grotesk, sans-serif",
                    margin: 0,
                  }}
                >
                  🌸 You prayed this today.
                </p>
              ) : (
                <button
                  onClick={() => {
                    triggerAmenFeedback();
                    onLog?.();
                  }}
                  style={{
                    width: "100%",
                    height: 56,
                    background: isEvening ? EP_ACCENT : CREAM,
                    color: isEvening ? EP_BG : SOIL,
                    border: "none",
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: 600,
                    fontFamily: "Space Grotesk, sans-serif",
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                >
                  Amen 🙏🏽
                </button>
              )}
            </div>

            {/* Single daily-reflection pill. Source follows the
                effective precedence (explicit Settings pick → the
                reflection card visible on the home screen → FDD
                default). The pill opens that source externally and
                marks today as read so the home card flips. When the
                user has explicitly picked "none" the pill disappears
                entirely. */}
            {(() => {
              const src = reflectionSource;
              if (src === "none") return null;
              const cfg =
                src === "fdd"
                  // Forward Movement blue — FDD's identity color everywhere.
                  ? { label: t("offices.read_reflection"), bg: "rgba(96,141,209,0.20)", border: "rgba(96,141,209,0.50)", url: FDD_TODAY_URL, mark: markFddRead }
                  : src === "ssje"
                  ? { label: t("offices.read_reflection"), bg: "rgba(46,107,64,0.22)", border: "rgba(46,107,64,0.50)", url: SSJE_TODAY_URL, mark: markSsjeRead }
                  : { label: t("offices.read_reflection"), bg: "rgba(46,107,64,0.22)", border: "rgba(46,107,64,0.50)", url: CAC_TODAY_URL, mark: markCacRead };
              return (
                <button
                  type="button"
                  onClick={() => { cfg.mark(); openExternal(cfg.url); }}
                  style={{
                    background: cfg.bg,
                    color: isEvening ? EP_TEXT : CREAM,
                    border: `1px solid ${cfg.border}`,
                    borderRadius: 999,
                    padding: "10px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "Space Grotesk, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {cfg.label}
                </button>
              );
            })()}

            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: "none",
                  border: "none",
                  color: accentColor,
                  fontSize: 14,
                  fontFamily: "Space Grotesk, sans-serif",
                  cursor: "pointer",
                  padding: "4px 0",
                  textAlign: "left",
                }}
              >
                ← Back to practice
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── PERSONAL THANKSGIVING ──────────────────────────────────────────────────
    // Opt-in gratitude slide spliced in just before the closing when
    // the "Include a gratitude slide" office pref is on (Settings →
    // Gratitude in the office). Reflective: a centered prompt the
    // user dwells on for a beat, then taps forward. Same eyebrow
    // styling as opening / closing so it reads as "a held moment"
    // rather than a content slide.
    if (slide.type === "personal_thanksgiving") {
      return (
        <div style={{ ...containerStyle, background: isEvening ? EP_BG : SOIL }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              maxWidth: 520,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: accentColor,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
              }}
            >
              {slide.eyebrow} 🌾
            </p>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: isEvening ? EP_TEXT : CREAM,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              What are you grateful for today?
            </h1>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.7,
                fontStyle: "italic",
                color: isEvening ? EP_ACCENT : AMBER,
                fontFamily: "Georgia, 'Times New Roman', serif",
                margin: 0,
              }}
            >
              {slide.content}
            </p>
            <p
              style={{
                fontSize: 13,
                color: mutedColor,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
              }}
            >
              Tap to continue when you're ready.
            </p>
          </div>
        </div>
      );
    }

    // ── CONTENT SLIDES ─────────────────────────────────────────────────────────

    const isLiturgicalText =
      slide.type === "opening_sentence" ||
      slide.type === "collect" ||
      slide.type === "prayer_for_mission" ||
      slide.type === "general_thanksgiving" ||
      slide.type === "creed";

    const isLesson = slide.type === "lesson";

    const textStyle: React.CSSProperties = isLiturgicalText
      ? {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 19,
          lineHeight: 1.9,
          color: textColor,
          margin: 0,
          whiteSpace: "pre-wrap",
        }
      : {
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 18,
          lineHeight: 1.85,
          color: textColor,
          margin: 0,
          whiteSpace: "pre-wrap",
        };

    return (
      <div style={containerStyle}>
        {/* Eyebrow */}
        {slide.eyebrow && (
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              color: accentColor,
              textTransform: "uppercase",
              fontFamily: "Space Grotesk, sans-serif",
              margin: "0 0 12px",
            }}
          >
            {slide.eyebrow}
          </p>
        )}

        {/* Emoji */}
        <div style={{ fontSize: 36, marginBottom: 16 }}>{slide.emoji}</div>

        {/* Title (lesson reference, collect label) */}
        {slide.title && (
          <p
            style={{
              fontSize: 15,
              color: highlightColor,
              fontFamily: "Space Grotesk, sans-serif",
              fontWeight: 600,
              margin: "0 0 12px",
            }}
          >
            {slide.title}
          </p>
        )}

        {/* Contextual prompt (creed, confession) */}
        {(slide.type === "creed" || slide.type === "confession") &&
          !!slide.metadata?.prompt && (
            <p
              style={{
                fontSize: 15,
                color: accentColor,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
                margin: "0 0 16px",
              }}
            >
              {slide.metadata.prompt as string}
            </p>
          )}

        {/* Psalm title */}
        {slide.type === "psalm" && !!slide.metadata?.psalmTitle && (
          <p
            style={{
              fontSize: 14,
              color: mutedColor,
              fontStyle: "italic",
              fontFamily: "Georgia, serif",
              margin: "0 0 12px",
            }}
          >
            {slide.metadata.psalmTitle as string}
          </p>
        )}

        {/* Reading note for lessons */}
        {isLesson && !!slide.metadata?.readingNote && (
          <p
            style={{
              fontSize: 14,
              color: mutedColor,
              fontStyle: "italic",
              fontFamily: "Georgia, serif",
              margin: "0 0 16px",
            }}
          >
            {slide.metadata.readingNote as string}
          </p>
        )}

        {/* Scrollable content area */}
        <div
          ref={ref}
          onScroll={onScroll}
          style={{
            flex: 1,
            overflowY: slide.isScrollable ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            position: "relative",
            paddingBottom: slide.isScrollable ? 48 : 0,
          }}
        >
          {/* Call-and-response */}
          {slide.isCallAndResponse && slide.callAndResponseLines ? (
            <CallAndResponse lines={slide.callAndResponseLines} theme={theme} />
          ) : isLesson ? (
            /* Lesson slides — show reference prominently, no raw content */
            <div>
              <p style={{
                fontSize: 22,
                fontWeight: 700,
                color: textColor,
                fontFamily: "Space Grotesk, sans-serif",
                margin: "16px 0",
              }}>
                {(slide.metadata?.reference as string | undefined) ?? slide.content}
              </p>
              <p style={{
                fontSize: 15,
                color: accentColor,
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
                margin: "8px 0 0",
              }}>
                Read in your Bible or preferred translation
              </p>
            </div>
          ) : (
            <p style={textStyle}>{fixQuoteDirection(slide.content)}</p>
          )}

          {slide.type === "general_thanksgiving" && !!slide.metadata?.prompt && (
            <p
              style={{
                fontSize: 13,
                color: mutedColor,
                margin: "12px 0 0",
                fontFamily: "Space Grotesk, sans-serif",
              }}
            >
              {slide.metadata.prompt as string}
            </p>
          )}

          {/* Bottom fade overlay when scrollable and blocked */}
          {slide.isScrollable && scrollBlocked && (
            <div
              style={{
                position: "sticky",
                bottom: 0,
                left: 0,
                right: 0,
                height: 64,
                background: `linear-gradient(to bottom, transparent, ${bg})`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Scroll hint */}
        {slide.isScrollable && slide.scrollHint && scrollBlocked && (
          <p
            style={{
              fontSize: 13,
              color: accentColor,
              fontFamily: "Space Grotesk, sans-serif",
              margin: "8px 0 0",
              letterSpacing: "0.03em",
            }}
          >
            {slide.scrollHint}
          </p>
        )}

        {/* BCP reference */}
        {slide.bcpReference && (
          <p
            style={{
              fontSize: 13,
              color: highlightColor,
              margin: "12px 0 0",
              fontFamily: "Space Grotesk, sans-serif",
            }}
          >
            {slide.bcpReference}
          </p>
        )}
      </div>
    );
  },
);

SlideView.displayName = "SlideView";
