import { useState } from "react";
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
export function LiturgicalDateHeader({ date }: { date?: Date }) {
  const d = date ?? new Date();
  const day = getDay(d, { observeLesserFeasts: readLesserFeastsPref() });
  const [detailOpen, setDetailOpen] = useState(false);

  const dateLine = format(d, "EEEE, d MMMM");
  const dateLong = format(d, "EEEE, d MMMM yyyy");

  const isFeastHeader =
    day.rank === "principal_feast" || day.rank === "holy_day" || day.rank === "sunday";

  const primary = isFeastHeader ? day.name : dateLine;
  const secondary = isFeastHeader ? dateLong : day.commemoration ? null : day.name;
  const commemorationLine = !isFeastHeader && day.commemoration ? day.commemoration : null;

  // The detail modal makes sense whenever there's a feast or a
  // commemoration to expand into — collect, description, life dates.
  const hasDetail =
    isFeastHeader || !!day.commemoration;

  const dotColor = COLOR_HEX[day.color];

  return (
    <>
      <div className="flex items-start gap-3">
        {/* Liturgical color accent — a 3px vertical line to the left of
            the header text. Subtle, not a banner. */}
        <div
          aria-hidden
          style={{
            width: 3,
            alignSelf: "stretch",
            marginTop: 6,
            marginBottom: 6,
            borderRadius: 2,
            background: dotColor,
            opacity: 0.85,
          }}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => { if (hasDetail) setDetailOpen(true); }}
            disabled={!hasDetail}
            className="block text-left w-full"
            style={{ cursor: hasDetail ? "pointer" : "default" }}
          >
            <p
              style={{
                color: "#F0EDE6",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {primary}
            </p>
            {secondary && (
              <p
                className="mt-1"
                style={{ color: "rgba(200,212,192,0.6)", fontSize: 13 }}
              >
                {secondary}
              </p>
            )}
            {commemorationLine && (
              <p
                className="mt-1 italic"
                style={{
                  color: "rgba(200,212,192,0.75)",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: 13,
                }}
              >
                {commemorationLine}
              </p>
            )}
          </button>
        </div>
      </div>

      {detailOpen && hasDetail && (
        <FeastDetailSheet day={day} dateLong={dateLong} onClose={() => setDetailOpen(false)} />
      )}
    </>
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
