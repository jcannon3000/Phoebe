import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import type { Slide } from "@/components/MorningPrayer/types";
import { openExternal } from "@/lib/openExternal";
import { bibleGatewayUrl } from "@/lib/bibleGatewayUrl";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

// ── Daily Office viewer ─────────────────────────────────────────────────────
// Visual chrome mirrors Lectio: dark forest background, top-bar with
// Back / Menu / eyebrow+reference, body centered, bottom pill with
// Back · section-label · Next. The slide content itself is rendered
// inline below — no SlideView dependency, since SlideView's chrome
// fights with this layout.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Mode covers the four liturgies this viewer can render. The Daily
// Office's full Morning / Evening Prayer come from /api/office/* and
// the abbreviated Daily Devotions (BCP pp. 137 / 139) come from
// /api/devotion/* — both use the same Slide schema, so the renderer
// is identical apart from the title and endpoint.
export type LiturgyMode =
  | "morning"
  | "evening"
  | "morning-devotion"
  | "early-evening-devotion";

interface OfficeViewerProps {
  // Backward-compat: callers that already passed `office` keep working.
  // New callers (Daily Devotions) pass `mode`.
  office?: "morning" | "evening";
  mode?: LiturgyMode;
  onBack: () => void;
}

interface OfficeDayInfo {
  weekdayLabel?: string;
  sundayLabel?: string;
  feastName?: string | null;
}

// Friendly section label for the bottom pill, derived from the slide
// type. Keeps the chrome readable when the eyebrow is verbose
// (e.g. "VENITE · PSALM 95").
const SECTION_LABEL: Record<string, string> = {
  opening: "Opening",
  opening_sentence: "Opening Sentence",
  confession: "Confession",
  absolution: "Absolution",
  invitatory: "Invitatory",
  invitatory_psalm: "Invitatory Psalm",
  psalm: "Psalm",
  lesson: "Lesson",
  canticle: "Canticle",
  creed: "Creed",
  lords_prayer: "Lord's Prayer",
  suffrages: "Suffrages",
  collect: "Collect",
  prayer_for_mission: "Prayer for Mission",
  intercessions: "Intercessions",
  general_thanksgiving: "General Thanksgiving",
  closing: "Closing",
};

// Parse a 1979 BCP Psalter content blob into a structured list for the
// renderer. The data file (api-server/src/seeds/bcpPsalter.ts) stores
// each psalm with:
//   • Each verse begins with `<number><space>` at the start of a line.
//   • The first hemistich ends with " *" before a newline.
//   • The second hemistich follows on the next line, indented by two
//     spaces.
//   • A trailing Gloria Patri block is appended by the assembler,
//     prefixed by a leading newline and beginning with "Glory to the
//     Father" — has no verse number and shouldn't get one rendered.
//
// We split into "verse" entries (numbered, two lines, hemistichs) and
// a "doxology" entry for the Gloria. The renderer visualises each.
type PsalmLine = { text: string; indented: boolean };
type PsalmEntry =
  | { kind: "verse"; number: string; lines: PsalmLine[] }
  | { kind: "doxology"; text: string };

function parsePsalmContent(content: string): PsalmEntry[] {
  const result: PsalmEntry[] = [];
  // Split off the Gloria Patri (always preceded by a blank line +
  // begins with "Glory to the Father"). It's the only non-numbered
  // block we expect to see.
  const gloriaMatch = content.match(/\n\s*\n?\s*(Glory to the Father[\s\S]+)$/);
  const psalmBody = gloriaMatch
    ? content.slice(0, content.length - gloriaMatch[1].length).trimEnd()
    : content;
  const gloria = gloriaMatch ? gloriaMatch[1].trim() : null;

  // Walk the psalm body line by line. A line that starts with digits
  // followed by a space opens a new verse; the rest of its line is
  // the first hemistich. Subsequent indented lines (leading spaces)
  // belong to the same verse as additional hemistichs.
  const rawLines = psalmBody.split("\n");
  let current: { number: string; lines: PsalmLine[] } | null = null;
  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    const verseMatch = line.match(/^(\d+)\s+(.*)$/);
    if (verseMatch) {
      if (current) result.push({ kind: "verse", ...current });
      current = { number: verseMatch[1], lines: [{ text: verseMatch[2], indented: false }] };
    } else if (current) {
      // Any continuation line — indentation in the source signals
      // that this is the second (or third) hemistich of the verse.
      const indented = /^\s/.test(raw);
      current.lines.push({ text: line.trim(), indented });
    }
  }
  if (current) result.push({ kind: "verse", ...current });
  if (gloria) result.push({ kind: "doxology", text: gloria });
  return result;
}

// Centered intercession head — avatar + name + eyebrow stacked,
// mirroring prayer-mode.tsx's "request" slide. The office and
// devotion intercession slots used to render with the default
// left-aligned eyebrow + bold-title pair, which made a request from a
// specific person ("Anabelle Helsell — please pray for…") look like a
// liturgical heading instead of a face. This block lifts the prayer-
// mode visual so the same prayer reads the same way no matter which
// surface surfaces it.
function IntercessionHead({
  eyebrow,
  authorName,
  authorAvatarUrl,
}: {
  eyebrow: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
}) {
  const initials = (authorName ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {(authorName || authorAvatarUrl) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {authorAvatarUrl ? (
            <img
              src={authorAvatarUrl}
              alt={authorName ?? "Prayer author"}
              className="prayer-avatar-pulse"
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              className="prayer-avatar-pulse"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#1A4A2E",
                color: "#A8C5A0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 600,
                fontFamily: SPACE_GROTESK,
              }}
            >
              {initials}
            </div>
          )}
          {authorName && (
            <p
              style={{
                fontSize: 14,
                color: "#C8D4C0",
                fontFamily: SPACE_GROTESK,
                margin: 0,
              }}
            >
              {authorName}
            </p>
          )}
        </div>
      )}
      <p
        style={{
          fontSize: 10,
          color: "rgba(143,175,150,0.45)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          margin: 0,
        }}
      >
        {eyebrow}
      </p>
    </div>
  );
}

// Resolve mode → endpoint + title. We accept `office` as a legacy
// shortcut and translate it into the equivalent mode here so old call
// sites compile unchanged.
const MODE_CONFIG: Record<LiturgyMode, { endpoint: string; title: string }> = {
  morning: { endpoint: "/api/office/morning", title: "Morning Prayer" },
  evening: { endpoint: "/api/office/evening", title: "Evening Prayer" },
  "morning-devotion": { endpoint: "/api/devotion/morning", title: "Morning Devotion" },
  "early-evening-devotion": { endpoint: "/api/devotion/early-evening", title: "Early Evening Devotion" },
};

export function OfficeViewer({ office, mode, onBack }: OfficeViewerProps) {
  const resolvedMode: LiturgyMode = mode ?? office ?? "morning";
  const { endpoint, title: officeTitle } = MODE_CONFIG[resolvedMode];
  // The Daily Devotions are explicitly the personal short forms
  // (BCP pp. 137 / 139). The full Daily Office's missal-page layout
  // (top-aligned, left-aligned, role-labelled) reads as overkill
  // here — devotion mode swaps short call-and-response slides to a
  // centered, label-less layout that feels like personal prayer
  // rather than a corporate liturgy.
  const isDevotion =
    resolvedMode === "morning-devotion" ||
    resolvedMode === "early-evening-devotion";

  const [slides, setSlides] = useState<Slide[]>([]);
  const [officeDay, setOfficeDay] = useState<OfficeDayInfo | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  // Reset scroll to the top each time the slide changes — otherwise a
  // long-content slide that the reader scrolled through carries its
  // scroll position into the next slide, which is shorter and starts
  // mid-way down (or below the eyebrow). Run after the new slide
  // mounts so the scrollHeight is correct.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = 0;
  }, [slideIdx]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const fetched: Slide[] = data.slides ?? [];
        if (fetched.length === 0) throw new Error("No slides returned");
        setSlides(fetched);
        setOfficeDay(data.officeDay ?? null);
        setSlideIdx(0);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to load ${resolvedMode}:`, err);
          setError(`${officeTitle} couldn't load (${msg}).`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [endpoint, officeTitle, resolvedMode]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ color: MUTED_GREEN, fontSize: 14, letterSpacing: "0.06em" }}>Preparing today's office…</p>
      </div>
    );
  }

  if (error || slides.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ fontSize: 18, color: WARM_TEXT }}>{error ?? `${officeTitle} is not available right now.`}</p>
        <button onClick={onBack} style={{ fontSize: 14, color: MUTED_GREEN, background: "none", border: "none", cursor: "pointer" }}>
          ← Back to Daily Offices
        </button>
      </div>
    );
  }

  const currentSlide = slides[slideIdx];
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;
  const sectionLabel = SECTION_LABEL[currentSlide.type] ?? currentSlide.type.toUpperCase();
  const refLabel = officeDay?.feastName ?? officeDay?.weekdayLabel ?? officeDay?.sundayLabel ?? "";

  function next() { if (!atEnd) setSlideIdx(slideIdx + 1); }
  function prev() { if (!atStart) setSlideIdx(slideIdx - 1); }

  // Amen flow on intercession slides — fires the right endpoint for
  // the slide's source so the amen counts toward the recipient's
  // metrics + the bell scheduler's "prayed today" gate. Best-effort:
  // we never block the slide advance on the network call, and we
  // never block the user from advancing if the call fails.
  const isIntercessionSlide = currentSlide.type === "intercessions";
  function fireAmenSideEffect(slide: Slide) {
    const meta = slide.metadata as
      | {
          source?: unknown;
          requestId?: unknown;
          feedSlug?: unknown;
          entryDate?: unknown;
        }
      | undefined;
    const source = typeof meta?.source === "string" ? meta.source : null;
    if (source === "request" && typeof meta?.requestId === "number") {
      const rid = meta.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`)
        .then(() => {
          // Same invalidation prayer-mode does — keeps the dashboard
          // "prayed today" state + the prayer-list amen counts in sync.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
        })
        .catch(() => { /* best-effort */ });
      return;
    }
    if (
      source === "feed"
      && typeof meta?.feedSlug === "string"
      && typeof meta?.entryDate === "string"
    ) {
      const slug = meta.feedSlug;
      const date = meta.entryDate;
      apiRequest("POST", `/api/prayer-feeds/${slug}/entries/${date}/pray`)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
        })
        .catch(() => { /* best-effort */ });
      return;
    }
    // prayer-for + circle-intention: no amen endpoint exists for
    // these surfaces yet. The Amen button still advances; we just
    // don't log a metric until those endpoints land.
  }
  function amen() {
    if (currentSlide) fireAmenSideEffect(currentSlide);
    if (!atEnd) setSlideIdx(slideIdx + 1);
    else onBack();
  }

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        overscrollBehavior: "none",
        background: BG,
        color: WARM_TEXT,
        display: "flex",
        flexDirection: "column",
        fontFamily: SPACE_GROTESK,
      }}
    >
      {/* Top bar — Back / Menu / eyebrow+ref. Mirrors Lectio's header. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
            paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.5rem))",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(19,44,29,0.85)",
              border: `1px solid ${BORDER}`,
              color: WARM_TEXT,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "6px 16px",
            }}
          >
            {officeTitle}
          </span>
          {/* Right column kept as a grid spacer so the centered
              officeTitle pill stays centered. The day-label that
              used to sit here ("Wednesday in the 5th Week of
              Easter") was visually crowded against the pill on
              narrow screens. */}
          <div />

        </div>
      </header>

      {/* Body. Top padding bumped from safe+88 → max(120, safe+108)
          so the bar clears on web (where safe-area-inset-top is 0)
          without forcing the slide content to ride up under the
          fixed header. The earlier value left the title sitting too
          close to the bar; the user reported "loads a little too low"
          as shorthand for content reading too compressed against the
          header strip. Inner content is left-aligned now (was center)
          so liturgical text reads like a missal page rather than a
          centered poster. */}
      <main
        ref={mainRef}
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: "max(72px, calc(env(safe-area-inset-top) + 60px))",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 112px)",
        }}
      >
        <div
          className="max-w-2xl w-full mx-auto"
          // Top-aligned content with breathing-room padding above the
          // first element. Earlier this was `justifyContent: "center"`
          // which floated short slides into the middle of the viewport
          // — fine for a one-line slide but it made the eyebrow + title
          // pair drift far below the header on slides with little body
          // text. Top-aligned reads as a missal page: title near the
          // top, body flowing down.
          style={(() => {
            // Devotion mode centers short call-and-response slides
            // (opening versicle, simple greetings) so they read as
            // personal prayer beats rather than missal pages. The
            // full Office still left-aligns those for the missal
            // feel. Intercession slides on either surface stay
            // centered to match the prayer-mode slideshow.
            const isCenteredDevotionBeat = isDevotion && currentSlide.isCallAndResponse;
            const centered = isCenteredDevotionBeat || currentSlide.type === "intercessions";
            return {
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
              justifyContent: isCenteredDevotionBeat ? "center" : "flex-start",
              textAlign: centered ? ("center" as const) : ("left" as const),
              alignItems: centered ? "center" : undefined,
              gap: 20,
            };
          })()}
        >
          {/* Intercession-mode head: avatar (when we have one) + name
              + eyebrow, mirroring prayer-mode.tsx's "request" slide.
              The default left-aligned eyebrow + bold-title pair
              renders in the else branch below. */}
          {currentSlide.type === "intercessions" ? (
            <IntercessionHead
              eyebrow={currentSlide.eyebrow || sectionLabel}
              authorName={
                (currentSlide.metadata as { authorName?: unknown } | undefined)?.authorName as string | undefined
                ?? currentSlide.title
                ?? null
              }
              authorAvatarUrl={
                (currentSlide.metadata as { authorAvatarUrl?: unknown } | undefined)?.authorAvatarUrl as string | null | undefined
                ?? null
              }
            />
          ) : currentSlide.type === "psalm" ? (
            // Psalm slide header has three stacked labels per the
            // BCP missal idiom + user direction:
            //   1) Contextual eyebrow ("The Psalm Appointed For This
            //      Morning / Evening") — orients the reader.
            //   2) The big psalm reference ("Psalm 72" or
            //      "Psalm 119:73-96") as the slide title.
            //   3) The Latin incipit ("Deus, judicium") as a small
            //      italic subtitle below the title, the way it sits
            //      on a printed BCP page.
            <>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {resolvedMode === "evening" || resolvedMode === "early-evening-devotion"
                  ? "The Psalm Appointed For This Evening"
                  : "The Psalm Appointed For This Morning"}
              </p>
              {currentSlide.eyebrow && (
                <h2
                  style={{
                    // Convert the eyebrow's all-caps "PSALM 72" into
                    // a normal-case "Psalm 72" header. Range form
                    // ("PSALM 119:73-96") survives the transform —
                    // only the leading word gets re-cased.
                    fontSize: 28,
                    fontWeight: 700,
                    fontFamily: SPACE_GROTESK,
                    color: WARM_TEXT,
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  {currentSlide.eyebrow.replace(/^PSALM\b/, "Psalm")}
                </h2>
              )}
              {currentSlide.title && (
                <p
                  style={{
                    fontSize: 16,
                    fontStyle: "italic",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    color: "rgba(200,212,192,0.75)",
                    margin: 0,
                  }}
                >
                  {currentSlide.title}
                </p>
              )}
            </>
          ) : (
            <>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {(() => {
                  // Lesson slides get a contextual eyebrow that
                  // mirrors the psalm slide's "The Psalm Appointed
                  // For This Morning" treatment. We tailor it to the
                  // existing eyebrow value so an MP First Lesson and
                  // an EP Gospel each read true to themselves while
                  // staying in the same voice.
                  if (currentSlide.type === "lesson") {
                    const isEvening =
                      resolvedMode === "evening" ||
                      resolvedMode === "early-evening-devotion";
                    const tod = isEvening ? "Evening" : "Morning";
                    const e = (currentSlide.eyebrow ?? "").toUpperCase();
                    if (e.includes("FIRST")) return `The First Lesson Appointed For This ${tod}`;
                    if (e.includes("SECOND")) return `The Second Lesson Appointed For This ${tod}`;
                    if (e.includes("GOSPEL")) return `The Gospel Appointed For This ${tod}`;
                    return `The Lesson Appointed For This ${tod}`;
                  }
                  return currentSlide.eyebrow || sectionLabel;
                })()}
              </p>
              {/* Title slot. Intercession + psalm slides took
                  earlier branches (above), so we know currentSlide
                  isn't either of those here. */}
              {currentSlide.title && (
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    fontFamily: SPACE_GROTESK,
                    color: WARM_TEXT,
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  {currentSlide.title}
                </h2>
              )}
            </>
          )}
          {/* Psalms render as a structured list of verses — verse number
              on the left, asterisk visible at the half-verse caesura,
              second hemistich indented, and a clear gap between
              verses. Mirrors the 1979 BCP Psalter page format. The
              Gloria Patri (which the assembler appends to every
              psalm) renders as an unnumbered italic doxology at the
              bottom. The fallback continues to use whiteSpace pre-
              wrap for any non-psalm long-text slide.
              The data is already in the right shape — verses begin
              with `<digit><space>`, hemistichs are split by " *\n  "
              — so the parser just walks line by line. */}
          {currentSlide.type === "psalm" && currentSlide.content ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
              {parsePsalmContent(currentSlide.content).map((v, i) => (
                v.kind === "verse" ? (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        minWidth: 22,
                        color: FAINT_GREEN,
                        fontSize: 13,
                        fontFamily: SPACE_GROTESK,
                        lineHeight: 1.6,
                        paddingTop: 2,
                      }}
                    >
                      {v.number}
                    </span>
                    <div style={{ flex: 1 }}>
                      {v.lines.map((ln, li) => (
                        <p
                          key={li}
                          style={{
                            fontSize: 16,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            margin: 0,
                            paddingLeft: ln.indented ? 24 : 0,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {ln.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Gloria Patri — italic, no verse number, separated
                  // by a hairline rule above to mark it as a doxology
                  // not part of the numbered psalm body.
                  <div
                    key={i}
                    style={{
                      borderTop: "1px solid rgba(143,175,150,0.18)",
                      paddingTop: 12,
                      marginTop: 4,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 15,
                        lineHeight: 1.7,
                        color: WARM_TEXT,
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontStyle: "italic",
                        margin: 0,
                      }}
                    >
                      {v.text}
                    </p>
                  </div>
                )
              ))}
            </div>
          ) : currentSlide.isCallAndResponse && currentSlide.callAndResponseLines ? (
            // The Officiant / People / All speaker labels make sense
            // when a community prays the Office together. The Daily
            // Devotions (BCP pp. 137 / 139) are explicitly the short
            // forms for personal or family use, so on devotion mode we
            // drop the role labels and read the lines as one
            // continuous prayer.
            <div style={{ display: "flex", flexDirection: "column", gap: isDevotion ? 10 : 14, maxWidth: 560 }}>
              {currentSlide.callAndResponseLines.map((line, i) => (
                <div key={i}>
                  {!isDevotion && (
                    <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0, marginBottom: 4 }}>
                      {line.speaker === "officiant" ? "Officiant" : line.speaker === "people" ? "People" : "All"}
                    </p>
                  )}
                  <p style={{ fontSize: 17, lineHeight: 1.6, color: WARM_TEXT, margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
                    {line.text}
                  </p>
                </div>
              ))}
            </div>
          ) : currentSlide.content ? (
            <p
              style={{
                // Intercession slides bump the body to 22px italic
                // serif to match the prayer-mode slideshow's
                // "carrying one prayer" weight; everything else stays
                // at the missal-page 17px reading size.
                fontSize: currentSlide.type === "intercessions" ? 22 : 17,
                lineHeight: currentSlide.type === "intercessions" ? 1.5 : 1.7,
                fontWeight: currentSlide.type === "intercessions" ? 500 : 400,
                color: currentSlide.type === "intercessions" ? "#E8E4D8" : WARM_TEXT,
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
                maxWidth: 600,
              }}
            >
              {currentSlide.content}
            </p>
          ) : null}
          {/* On lesson slides we link out to BibleGateway for the
              appointed passage. The URL is computed client-side from
              the slide title (the reference) so it works even when
              the server-cached slide pre-dates the metadata.readUrl
              field. We render an actual <a> with href so iOS won't
              swallow the click — onClick still goes through
              openExternal so the iOS shell shows SFSafariViewController
              instead of bouncing the user out to mobile Safari. */}
          {currentSlide.type === "lesson" && (() => {
            const meta = currentSlide.metadata as { readUrl?: unknown } | undefined;
            const serverUrl = typeof meta?.readUrl === "string" ? meta.readUrl : null;
            const computed = currentSlide.title ? bibleGatewayUrl(currentSlide.title) : null;
            const url = serverUrl ?? computed;
            if (!url) return null;
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Always intercept on native + web. openExternal
                  // routes through SFSafariViewController on iOS and
                  // window.open on the web. preventDefault stops the
                  // iOS WebView from also navigating to the URL.
                  e.preventDefault();
                  openExternal(url);
                }}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.45)",
                  color: WARM_TEXT,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Read on BibleGateway →
              </a>
            );
          })()}
          {currentSlide.bcpReference && (
            <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0, marginTop: 8 }}>
              {currentSlide.bcpReference}
            </p>
          )}
        </div>
      </main>

      {/* Bottom nav pill — Back · section · Next/Done. Mirrors Lectio. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "rgba(19,44,29,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "8px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              color: WARM_TEXT,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              padding: "6px 14px",
              fontSize: 12,
              fontFamily: SPACE_GROTESK,
              fontWeight: 600,
              cursor: atStart ? "default" : "pointer",
            }}
          >
            Back
          </button>
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: 0,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {slideIdx + 1} · {sectionLabel}
          </p>
          <button
            type="button"
            // Intercession slides swap "Next" for "Amen" — same button,
            // same place, same visual weight, but the click logs the
            // amen via the right endpoint for the slide's source so it
            // counts toward the recipient's metrics + the bell
            // scheduler's "prayed today" gate. Office + Devotion both
            // route through this viewer so the wiring covers Morning
            // Prayer, Evening Prayer, In the Morning, and In the Early
            // Evening simultaneously.
            onClick={
              isIntercessionSlide
                ? amen
                : atEnd ? onBack : next
            }
            className="rounded-full transition-opacity"
            style={{
              background: BUTTON_BG,
              color: WARM_TEXT,
              border: "none",
              padding: "6px 16px",
              fontSize: 12,
              fontFamily: SPACE_GROTESK,
              fontWeight: 600,
              letterSpacing: "0.02em",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isIntercessionSlide ? "Amen" : atEnd ? "Done" : "Next"}
          </button>
        </div>
      </nav>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showOffice, setShowOffice] = useState<"morning" | "evening" | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  if (showOffice === "morning") {
    return <OfficeViewer office="morning" onBack={() => setShowOffice(null)} />;
  }
  if (showOffice === "evening") {
    return <OfficeViewer office="evening" onBack={() => setShowOffice(null)} />;
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isEvening = hour >= 14;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Daily Offices 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Morning Prayer and Evening Prayer for today
          </p>
        </div>

        <div className="space-y-3">
          {/* Morning Prayer */}
          <button
            onClick={() => setShowOffice("morning")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isMorning ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${isMorning ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌅</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Morning Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isMorning && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>

          {/* Evening Prayer */}
          <button
            onClick={() => setShowOffice("evening")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isEvening ? "rgba(26,28,46,0.4)" : "rgba(26,28,46,0.15)",
              border: `1px solid ${isEvening ? "rgba(139,157,195,0.25)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌙</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Evening Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isEvening && <p className="text-xs mt-1.5 font-medium" style={{ color: "#8B9DC3" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Want to pray the office daily with others?
          </p>
          <Link href="/moment/new" className="text-xs font-semibold mt-1 inline-block" style={{ color: "#6FAF85" }}>
            Start a Daily Office practice →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
