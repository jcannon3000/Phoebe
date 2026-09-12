import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { forwardMovementFeastUrl } from "@/lib/liturgical/forwardMovementCalendar";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import { markHagiographyRead } from "@/lib/cacReadState";
import { format } from "date-fns";
import { getDay, readLesserFeastsPref } from "@/lib/liturgical";
import type { LiturgicalColor, LiturgicalDay } from "@/lib/liturgical";

// Map a liturgical color to the CSS color we paint on the accent
// dot. Kept muted — the dot is a small cue, not a banner.
const COLOR_HEX: Record<LiturgicalColor, string> = {
  white: "#E8E4D8",
  gold: "#D9B052",
  red: "#B44545",
  violet: "#6B4C82",
  green: "#6FAF85",
  rose: "#D48A9B",
  black: "#2B2B2B",
  unbleached: "#C2B698",
};

// Labels used in the modal.
const COLOR_LABEL: Record<LiturgicalColor, string> = {
  white: "White",
  gold: "Gold",
  red: "Red",
  violet: "Violet",
  green: "Green",
  rose: "Rose",
  black: "Black",
  unbleached: "Unbleached linen",
};

// Drop-in replacement for the existing date header. Tier-aware:
//   - Principal Feasts / Holy Days / Sundays → feast name is primary,
//     calendar date is the muted subtitle.
//   - Lesser Feasts on a ferial day → calendar date is primary,
//     commemoration sits quietly beneath.
//   - Ferial / no-feast weekday → calendar date is primary, season
//     label ("The Third Week of Easter") beneath.
// A small colored dot sits to the left as a liturgical-color cue.
// Tapping a feast name opens a detail sheet.
export function LiturgicalDateHeader({
  date,
  feastOnly = false,
  fallbackText,
}: {
  date?: Date;
  feastOnly?: boolean;
  fallbackText?: string;
}) {
  const d = date ?? new Date();
  const day = getDay(d, { observeLesserFeasts: readLesserFeastsPref() });
  const [detailOpen, setDetailOpen] = useState(false);

  const dateLine = format(d, "EEEE, d MMMM");
  const dateLong = format(d, "EEEE, d MMMM yyyy");
  void dateLong;

  if (feastOnly) {
    let feast: string | null = null;
    if (day.rank === "principal_feast" || day.rank === "holy_day") {
      feast = `Feast of ${day.name}`;
    } else if (day.rank === "sunday") {
      feast = day.name || null;
    } else if (day.commemoration) {
      feast = day.life
        ? `Feast of ${day.commemoration}, ${day.life}`
        : `Feast of ${day.commemoration}`;
    }
    const text = feast ?? fallbackText ?? null;
    if (!text) return null;
    // Small uppercase eyebrow — same size/treatment as the original
    // "A Place Set Apart for Connection" tagline. Feast days swap the
    // text in place without changing the typography, so the header
    // silhouette stays put across the year.
    //
    // Long feast names ("Feast of Catherine of Siena, 1347-1380") would
    // otherwise wrap onto two lines and shove the rest of the header
    // around. We constrain to a single line and animate the text as a
    // marquee/ticker only when it actually overflows: hold at the
    // start for a beat, slide left to reveal the tail, pause, slide
    // back, repeat.
    return <FeastTicker text={text} />;
  }

  // Header layout (post-tester feedback):
  // The calendar date is ALWAYS the headline. The feast / commemoration /
  // seasonal label always sits beneath it as the muted subtitle. The
  // earlier behavior swapped the two for principal feasts and holy days,
  // which read as visually inconsistent — the date jumping out of its
  // home position depending on the kind of day. Now the structure is
  // stable; only the subtitle text changes.
  //
  // Subtitle text by rank:
  //  - Principal feast or holy day: "Feast of <name>" — even for the
  //    biggest days like Saint Mark the Evangelist. The "Feast of"
  //    prefix is what users explicitly asked for.
  //  - Sunday: the day's seasonal label as-is (e.g. "The Third
  //    Sunday of Easter"). No "Feast of" since the name already reads
  //    naturally.
  //  - Lesser feast: "Feast of <commemoration>" (with life dates if
  //    we have them).
  //  - Ferial: seasonal label if any, else nothing.
  const primary = dateLine;
  let secondary: string | null;
  if (day.rank === "principal_feast" || day.rank === "holy_day") {
    secondary = `Feast of ${day.name}`;
  } else if (day.rank === "sunday") {
    secondary = day.name || null;
  } else if (day.commemoration) {
    secondary = day.life
      ? `Feast of ${day.commemoration}, ${day.life}`
      : `Feast of ${day.commemoration}`;
  } else {
    secondary = day.name || null;
  }
  const isFeastHeader = false;
  void isFeastHeader;

  // Tap-to-open-detail is paused per user request — the header is
  // display-only for now. The FeastDetailSheet + detailOpen state
  // remain in the file so we can re-enable the tap later by flipping
  // hasDetail back to `isFeastHeader || !!day.commemoration`.
  const hasDetail = false;
  void setDetailOpen;
  void COLOR_HEX;
  /**
   * TAPPING THE FEAST OPENS ITS LIFE, in the same reader that opens Forward
   * Day by Day (owner: "if you click that line, it brings up the whole page,
   * and you have the reader over it"). Until now the line did nothing at all.
   *
   * Forward Movement's page, not our copy of it: the collect and the
   * hagiography there are Lesser Feasts and Fasts 2024, copyright the Domestic
   * and Foreign Missionary Society, used by permission — THEIRS, not ours. So
   * the words stay on their page with their notice attached, which is the same
   * rule this app already follows for oremus and every newsletter.
   *
   * Gated on the day actually BEING a commemoration, not merely on the date
   * having an entry: the map is keyed by month-day, so an ordinary Sunday that
   * outranks a lesser feast would otherwise offer a saint we are not keeping.
   */
  const isCommemoration = day.rank === "principal_feast"
    || day.rank === "holy_day"
    || !!day.commemoration;
  const feastUrl = isCommemoration ? forwardMovementFeastUrl() : null;

  return (
    <>
      <div className="min-w-0">
        <p
          style={{
            color: "#F0EDE6",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {primary}
        </p>
        {secondary && (feastUrl ? (
          <button
            type="button"
            className="mt-1"
            // Opening the life from HERE counts the same as from the card
            // (owner, 2026-09-12: "if someone opens the hagiography from the
            // feast day title, put that in done as if they completed that
            // practice") — the same read-gated mark the card uses.
            onClick={() => openExternalThenMarkRead(feastUrl, () => markHagiographyRead(), { reader: true })}
            aria-label={`${secondary} — read the life and collect`}
            style={{
              color: "rgba(200,212,192,0.6)",
              fontSize: 13,
              fontFamily: "'Space Grotesk', sans-serif",
              background: "none", border: "none", padding: 0,
              textAlign: "left", cursor: "pointer",
              // The feast itself is NOT underlined (owner). It is the day's
              // name, and dressing a name as a link makes the whole subtitle
              // read as chrome. The affordance sits at the end instead, so the
              // line still says what today is first and offers the door second.
              display: "inline", lineHeight: 1.45,
            }}
          >
            {secondary}
            {/* An (i) in a circle, drawn rather than typed: the character ⓘ
                renders at wildly different weights across iOS and Android, and
                this line is 13px — it has to sit exactly on the text baseline. */}
            <svg
              width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"
              style={{ display: "inline-block", verticalAlign: "-1px", margin: "0 3px 0 6px" }}
            >
              <circle cx="6" cy="6" r="5.25" fill="none" stroke="rgba(200,212,192,0.5)" strokeWidth="1" />
              <circle cx="6" cy="3.5" r="0.7" fill="rgba(200,212,192,0.75)" />
              <rect x="5.4" y="5.1" width="1.2" height="3.6" rx="0.6" fill="rgba(200,212,192,0.75)" />
            </svg>
            {/* Only THIS carries the underline — the one word that is a link. */}
            <span
              style={{
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(200,212,192,0.4)",
                whiteSpace: "nowrap",
              }}
            >
              More
            </span>
            <span aria-hidden="true" style={{ marginLeft: 3 }}>›</span>
          </button>
        ) : (
          <p
            className="mt-1"
            style={{
              color: "rgba(200,212,192,0.6)",
              fontSize: 13,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {secondary}
          </p>
        ))}
      </div>

      {detailOpen && hasDetail && (
        <FeastDetailSheet day={day} dateLong={dateLong} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

// Single-line feast eyebrow with a conditional marquee/ticker. We
// measure the rendered text width vs. the container width on every
// mount, font-load, and resize. If the text fits, it sits still. If
// it overflows we set a CSS custom property to the negative overflow
// distance and apply a keyframe animation that holds at 0, slides to
// that distance, pauses, returns, pauses, repeats. Keeping the math
// pixel-exact (instead of always animating to -100% or similar) lets
// the same animation read well at every viewport width.
function FeastTicker({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const span = textRef.current;
    if (!container || !span) return;

    const measure = () => {
      const containerWidth = container.clientWidth;
      const textWidth = span.scrollWidth;
      // Add a 1-pixel slack so we don't trigger the animation on a
      // sub-pixel rounding difference.
      const diff = textWidth - containerWidth;
      setOverflowPx(diff > 1 ? diff : 0);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(span);
    return () => ro.disconnect();
  }, [text]);

  // Re-measure once webfonts have loaded, since the initial paint can
  // happen with the fallback font and a different metric.
  useEffect(() => {
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      fonts.ready.then(() => {
        const container = containerRef.current;
        const span = textRef.current;
        if (!container || !span) return;
        const diff = span.scrollWidth - container.clientWidth;
        setOverflowPx(diff > 1 ? diff : 0);
      }).catch(() => {});
    }
  }, [text]);

  const animate = overflowPx > 0;

  return (
    <div
      ref={containerRef}
      className="min-w-0 overflow-hidden"
      style={{ whiteSpace: "nowrap" }}
    >
      <span
        ref={textRef}
        className={animate ? "animate-feast-ticker" : ""}
        style={{
          display: "inline-block",
          color: "rgba(143,175,150,0.5)",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          // The keyframe animation reads this value on the element
          // itself; we set it to the negative overflow distance so
          // the text slides exactly far enough to reveal the tail.
          ["--feast-distance" as string]: `${-overflowPx}px`,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// Slide-up detail sheet. Shows feast name, life dates, description,
// color, and a pointer to the collect (which lives in the BCP/LFF —
// we don't inline liturgical text here).
function FeastDetailSheet({
  day,
  dateLong,
  onClose,
}: {
  day: LiturgicalDay;
  dateLong: string;
  onClose: () => void;
}) {
  const title = day.commemoration ?? day.name;
  const subtitle = day.commemoration ? day.name : dateLong;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0F2818",
          border: "1px solid rgba(46,107,64,0.4)",
          borderRadius: 20,
          maxWidth: 480, width: "100%", maxHeight: "85vh", overflow: "auto",
          padding: "22px 22px 26px",
          fontFamily: "'Space Grotesk', sans-serif",
          color: "#F0EDE6",
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            style={{
              width: 3, alignSelf: "stretch",
              marginTop: 4, marginBottom: 4,
              borderRadius: 2, background: COLOR_HEX[day.color], opacity: 0.85,
            }}
          />
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              {title}
            </p>
            <p className="mt-1" style={{ color: "rgba(200,212,192,0.6)", fontSize: 13 }}>
              {subtitle}
            </p>
            {day.life && (
              <p className="mt-0.5" style={{ color: "rgba(200,212,192,0.55)", fontSize: 12 }}>
                {day.life}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0"
            style={{ color: "#8FAF96", background: "transparent", border: "none", padding: 6, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {day.description && (
          <p
            className="mt-4"
            style={{
              color: "#E8E4D8",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            {day.description}
          </p>
        )}

        <div
          className="mt-5 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.5)" }}>
            Liturgical color
          </p>
          <p className="text-sm mt-0.5" style={{ color: "#A8C5A0" }}>
            {COLOR_LABEL[day.color]}
          </p>
        </div>

        <p className="mt-4 text-[11px] italic" style={{ color: "rgba(143,175,150,0.55)" }}>
          See the Book of Common Prayer (1979) and <em>Lesser Feasts and Fasts</em> for
          the collect and proper lessons of the day.
        </p>
      </div>
    </div>
  );
}
