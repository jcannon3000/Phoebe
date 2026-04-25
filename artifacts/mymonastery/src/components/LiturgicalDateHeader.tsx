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
  void dateLong;

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
        {secondary && (
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
        )}
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
