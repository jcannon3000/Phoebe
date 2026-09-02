/**
 * Meditating on Negro Spirituals — sit with one of the songs.
 *
 * Owner: "create it as a contemplative practice called Meditating on Negro
 * Spirituals … start by creating a lectionary where it would have one for
 * each day … there would be the featured of the day but also a button to
 * choose a different [one]."
 *
 * The shape is Visio's, not the icon practice's: the DAY appoints the song and
 * everyone gets the same one, because these were sung together. But the icon
 * practice's door is kept — "Choose another" opens the whole collection — so
 * the day is an invitation rather than an assignment. lib/spiritualsLectionary
 * carries the appointment and says why it was made; a song chosen by hand is
 * simply the song, with no reason given, which is the honest thing to show.
 *
 * DELIBERATELY BARE (owner, 2026-09-02). The opening is the title, its
 * metadata, and a door to the rest of the collection — no framing paragraph.
 * Read the song, then sit with it for a chosen length; there is no
 * pick-a-line step. lib/spiritualsHistory still accepts a `line` for older
 * records but nothing writes one now.
 *
 * Completion writes the device-local history AND marks the practice done, so
 * it is a card in the daily rhythm.
 *
 * TEN LISTS, SEVEN FILES, and the "spirituals" key has to be in all of them at
 * once: practiceCompletion's OptionalPractice union; customAnchors'
 * SlottedPractice and PRACTICE_SLOT_DEFAULT; useRhythmState; DailyProgressBody;
 * widgetSync; customize-home's HOME_MODULES; dashboard's OWN separate copy of
 * HOME_MODULES (inside a component, not at module scope); WayOfLoveRuleFlow's
 * onKeys/offKeys pair in commit() — NOT only buildPrescribeSpec(), which runs
 * just for admin prescriptions and is how icons and taize once switched
 * themselves off; resetRoutine's optional-module list; the server's
 * homeModules; and the server's SECTIONS gate in routes/practice-completion.ts.
 *
 * A key in one list and not its twin is how a card goes green while still
 * sitting in Next, or logs fine on the device and 400s on every sync. When
 * this practice was wired, the two that got missed were NOT among the obvious
 * renderers — they were resetRoutine and the server's SECTIONS gate. So the
 * question that finds them all is "what else enumerates every optional
 * practice?", never "which files draw the card?"
 *
 * And none of it does anything without a caller: the card was once wired into
 * every list above while nothing on earth called markPracticeDoneToday, so it
 * could never be completed. Check the caller exists, not just the lists.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { SPIRITUALS, SPIRITUALS_SOURCE, type Spiritual } from "@/lib/spiritualsCatalogue";
import { spiritualForDate } from "@/lib/spiritualsLectionary";
import { recordSpiritualSat } from "@/lib/spiritualsHistory";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { FROST } from "@/lib/frost";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { spiritualsVisible } from "@/lib/spiritualsFlag";
import { useAuth } from "@/hooks/useAuth";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Only the sacred songs are ever offered here; the Creole and work songs
 *  stay in the library. Same rule the lectionary builder applies. */
const POOL = SPIRITUALS.filter((s) => s.sacred);

const todayLocalISO = () => new Date().toLocaleDateString("en-CA");

/**
 * The day's song. The lectionary covers the years we have a calendar for; past
 * or beyond it, fall back to a stable rotation on the date itself rather than
 * showing nothing — a practice that opens blank is worse than one that opens
 * on an unappointed song.
 */
function songForToday(ymd: string): { song: Spiritual; how: "season" | "rotation" | "cycle"; season: string | null } {
  const pick = spiritualForDate(ymd);
  if (pick) {
    const song = POOL.find((s) => s.number === pick.number);
    if (song) return { song, how: pick.how, season: pick.season };
  }
  const ord = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000) || 0;
  return { song: POOL[((ord % POOL.length) + POOL.length) % POOL.length]!, how: "cycle", season: null };
}

/* NO TIMER HERE (owner, 2026-09-02: "I never asked for a timer").
   The reflect beat is a title slide, not a sitting: read, reflect, close. The
   minute pills, the countdown, the interval ref and the NO_TIMER sentinel are
   all gone rather than hidden — a timer nobody starts is still a timer someone
   has to reason about. Contemplation is the practice that owns timed sitting;
   this one doesn't need its own. */

type Stage = "opening" | "choose" | "prompt" | "read" | "sit" | "close";

function norm(s: string): string {
  try { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch { return s.toLowerCase(); }
}

export default function SpiritualsPage() {
  const [, setLocation] = useLocation();
  const ymd = useMemo(todayLocalISO, []);
  const appointed = useMemo(() => songForToday(ymd), [ymd]);

  // Every exit from this practice goes to /dashboard, NOT /practices —
  // /practices routes to MomentsDashboard, an old rituals/moments surface that
  // should not be reachable from here (it renders gatherings and participant
  // names). The Practices MENU is /menu/practices; the two are different pages
  // with confusingly similar paths.
  //
  // Admin-only — see lib/spiritualsFlag.ts. The Practices row and the
  // customizer entry already hide it; this is defense-in-depth against a stale
  // bookmark or deep link. /admin/spirituals is deliberately NOT gated.
  //
  // GATE ON `isLoading`, NOT ON `settled`. useAuth's `settled` is
  // isFetchedAfterMount, and for a signed-out visitor /auth/me answers 401 —
  // which react-query records as an ERROR, so settled never flips. A guard
  // written against it does nothing at all for the exact people it exists to
  // stop: measured here, the page sat open on /spirituals for 11s with no
  // redirect. `isLoading` resolves on an errored query, so it fires.
  //
  // The cost of isLoading is the sharp edge useAuth documents: a persisted
  // null hydrates immediately, so an admin whose cached session says
  // signed-out is bounced once before the refetch corrects it. That is the
  // right trade here — this gate decides who SEES a practice of public-domain
  // 1867 texts, not who may read private data, so failing closed on a stale
  // cache beats failing open on every deep link.
  const { user, isLoading: authLoading } = useAuth();
  const mayView = spiritualsVisible(user?.isSuperAdmin);
  useEffect(() => {
    if (!authLoading && !mayView) setLocation("/dashboard");
  }, [authLoading, mayView, setLocation]);

  const [stage, setStage] = useState<Stage>("opening");
  const [chosen, setChosen] = useState<Spiritual | null>(null);
  const [query, setQuery] = useState("");

  const song = chosen ?? appointed.song;
  const byHand = chosen != null;
  /* No "Recently" list on the close any more — see the close beat. The
     history is still WRITTEN (recordSpiritualSat in finish), it just isn't
     read back here; /spirituals' own chooser is where past songs belong. */

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return POOL;
    const words = q.split(/\s+/).filter(Boolean);
    return POOL.filter((s) => {
      const hay = norm([s.title, s.collectedAt ?? "", s.region ?? "",
        ...s.stanzas.flatMap((st) => st.lines)].join(" "));
      return words.every((w) => hay.includes(w));
    });
  }, [query]);

  const finish = () => {
    recordSpiritualSat(song.number, todayLocalISO());
    // Flips the rhythm card, the dot and the widget. Without this the practice
    // is wired into every surface and can never complete — the card sits
    // active forever. The key must ALSO be in the server's SECTIONS gate in
    // routes/practice-completion.ts, or the cross-device write 400s on every
    // single completion while the local flag still flips (which is what
    // shipping Visio without it did).
    markPracticeDoneToday("spirituals");
    setStage("close");
  };

  const primary = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{
        userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%",
        background: "rgba(46,107,64,0.62)", border: "1px solid rgba(143,175,150,0.6)",
        color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 15,
        fontWeight: 700, fontFamily: FONT, cursor: "pointer",
      }}>
      {label}
    </button>
  );

  const quiet = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{
        userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%",
        background: "none", border: "none", color: SAGE, padding: "12px 8px",
        fontSize: 13.5, fontFamily: FONT, cursor: "pointer",
      }}>
      {label}
    </button>
  );

  /** Where the song came from — shown at the opening and again at the close. */
  const provenance = (s: Spiritual) => [s.collectedAt, s.contributor].filter(Boolean).join(" · ");

  /**
   * THE CTA SITS AT THE BOTTOM (owner: "the continue button is midway on the
   * page. it should be at the bottom").
   *
   * It used to flow directly after the copy, so on a short slide it landed in
   * the middle of the screen and on a long one it drifted — the button moved
   * with the text instead of staying where a thumb is. Audio Divina and Visio
   * both pin theirs; this now matches. The column fills the viewport, content
   * takes the slack, and `footer` is pinned under it inside the safe area.
   */
  /**
   * TAP AND SWIPE THROUGH IT, like the office deck and Visio (owner: "the
   * meditation on spirituals still has a very different UI than the office
   * slideshow or Visio Divina — no reason for it to be so different").
   *
   * This deck could only be advanced by hitting the button. bcp-daily-office
   * has always taken a tap on the LEFT half as back and the RIGHT half as
   * forward, plus a horizontal swipe (see its onClick around :2328) — so
   * moving through a spiritual felt nothing like moving through an office,
   * which is precisely what was reported.
   *
   * The office's two guards are copied deliberately rather than reinvented:
   *   • a tap that lands on a button/link/field is left alone, so Continue,
   *     "Choose another song" and the search box still do their own thing;
   *   • CHOOSER beats are excluded. In the office that's the welcome slide,
   *     because a stray right-half tap there opens an external site and
   *     leaves the app. Here it's `choose`, where a stray tap would pick a
   *     song out from under the reader — and `close`, which is an ending, not
   *     a slide to walk past.
   */
  const stageBack: Partial<Record<Stage, () => void>> = {
    prompt: () => setStage("opening"),
    read: () => setStage("prompt"),
    sit: () => setStage("read"),
  };
  const stageForward: Partial<Record<Stage, () => void>> = {
    opening: () => setStage("prompt"),
    prompt: () => setStage("read"),
    read: () => setStage("sit"),
    sit: () => finish(),
  };
  const swipeStartX = useRef<number | null>(null);
  const deckNav = {
    onClick: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, label")) return;
      const go = e.clientX < window.innerWidth / 2 ? stageBack[stage] : stageForward[stage];
      go?.();
    },
    onTouchStart: (e: React.TouchEvent) => { swipeStartX.current = e.touches[0]?.clientX ?? null; },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = swipeStartX.current;
      swipeStartX.current = null;
      if (start == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? start) - start;
      // Same threshold shape the office uses — a deliberate horizontal drag,
      // not a scroll that wandered sideways.
      if (Math.abs(dx) < 60) return;
      (dx < 0 ? stageForward[stage] : stageBack[stage])?.();
    },
  };

  const shell = (children: ReactNode, footer?: ReactNode) => (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, isolation: "isolate" }}>
      <AnimatedBackground base={BG} variant="subtle" />
      <div
        {...(stage === "choose" || stage === "close" ? {} : deckNav)}
        style={{
        position: "relative", maxWidth: 620, margin: "0 auto",
        display: "flex", flexDirection: "column", minHeight: "100dvh",
        padding: "calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 24px)",
        boxSizing: "border-box",
      }}>
        {/* `1 0 auto`, and NO minHeight:0 — both deliberate. As `1 1 auto`
            with minHeight:0 the content was allowed to SHRINK below its natural
            height, so on the read beat the song was squashed against the
            viewport, the page stopped scrolling at the last verse and the
            Continue button underneath became unreachable — the deck could not
            be advanced. Growing but never shrinking gives both behaviours from
            one rule: on a short slide the content takes the slack and pushes
            the footer to the bottom; on a long one the column grows past the
            viewport and the footer follows the text down. */}
        <div style={{ flex: "1 0 auto" }}>{children}</div>
        {footer != null && <div style={{ flex: "0 0 auto", paddingTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );

  const header = (back: () => void, label: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
      <button type="button" onClick={back}
        style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}>
        ←
      </button>
      <span style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ width: 24 }} />
    </div>
  );

  // ---------------------------------------------------------------- opening
  if (stage === "opening") {
    return shell(
      <>
        {header(() => setLocation("/dashboard"), "Meditating on Spirituals")}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 8px" }}>
            {byHand ? "Chosen" : appointed.season ? `Today · ${appointed.season}` : "Today"}
          </p>
          {/* The title carries the screen — lifted off the dark ground with a
              soft glow rather than a card around it. */}
          <p style={{
            color: WARM, fontFamily: SERIF, fontSize: 34, fontStyle: "italic",
            lineHeight: 1.18, margin: "0 0 14px", textWrap: "balance",
            textShadow: "0 0 28px rgba(143,175,150,0.35), 0 0 60px rgba(143,175,150,0.18)",
          }}>
            {song.title}
          </p>

          {/* Metadata, quiet, directly under the title. */}
          <div style={{ marginBottom: 26 }}>
            {provenance(song) && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "0 0 3px" }}>
                {provenance(song)}
              </p>
            )}
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: 0 }}>
              {SPIRITUALS_SOURCE.title}, {SPIRITUALS_SOURCE.year} · no. {song.number}
            </p>
          </div>

          {/* Where the songs come from — at the foot of the intro, just above
              the CTA, so the source is stated without standing between the
              reader and the song. */}
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 16px" }}>
            These songs come from <i style={{ fontFamily: SERIF }}>{SPIRITUALS_SOURCE.title}</i>,
            published in {SPIRITUALS_SOURCE.year} — the first collection of
            African-American sacred song ever printed. They were written down
            from the singing of freedpeople in the Sea Islands of South Carolina
            and across the South.
          </p>

        </motion.div>
      </>,
      <>
        {primary("Continue", () => setStage("prompt"))}
        {quiet("Choose another song", () => setStage("choose"))}
      </>,
    );
  }

  // ----------------------------------------------------------------- choose
  if (stage === "choose") {
    return shell(
      <>
        {header(() => setStage("opening"), "Choose a song")}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, words, or where it was sung…"
          inputMode="search"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
            borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
            background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
          }}
        />
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "10px 0" }}>
          {results.length} of {POOL.length}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((s) => (
            <button key={s.number} type="button"
              onClick={() => { setChosen(s); setStage("read"); }}
              style={{
                userSelect: "none", WebkitTapHighlightColor: "transparent",
                display: "block", textAlign: "left", width: "100%", padding: "12px 14px",
                borderRadius: 12, cursor: "pointer",
                background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
              }}>
              <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 16, fontStyle: "italic", lineHeight: 1.3 }}>
                {s.title}
              </span>
              {s.collectedAt && (
                <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                  {s.collectedAt}
                </span>
              )}
            </button>
          ))}
        </div>
      </>,
    );
  }

  // ----------------------------------------------------------------- prompt
  //
  // Its own beat, set exactly as Visio's and Audio Divina's prompts are:
  // centred, Space Grotesk, no card, and .prompt-rise (index.css) to bring it
  // up and hold it. The instruction is read on its own and then the song
  // follows — a prompt boxed above the text is a caption, not a beat.
  if (stage === "prompt") {
    return shell(
      <>
        {header(() => setStage("opening"), "Meditating on Spirituals")}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "58vh" }}>
          <p
            className="prompt-rise"
            style={{
              color: WARM, fontFamily: FONT, fontSize: 21, fontWeight: 500,
              lineHeight: 1.6, textAlign: "center", maxWidth: 480,
              margin: "0 auto 36px", textWrap: "balance",
            }}
          >
            As you read this spiritual, notice any words or phrases that stick
            out to you.
          </p>
        </div>
      </>,
      primary("Continue", () => setStage("read")),
    );
  }

  // ------------------------------------------------------------------- read
  if (stage === "read") {
    return shell(
      <>
        {header(() => setStage("prompt"), "Read")}
        <p style={{ color: WARM, fontFamily: SERIF, fontSize: 24, fontStyle: "italic", lineHeight: 1.25, margin: "0 0 4px" }}>
          {song.title}
        </p>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "0 0 18px" }}>
          {SPIRITUALS_SOURCE.title}, {SPIRITUALS_SOURCE.year} · no. {song.number}
        </p>

        {song.stanzas.map((st, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.08, 0.5) }}
            style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, minWidth: 14, paddingTop: 6 }}>
              {st.number ?? ""}
            </span>
            <p style={{ margin: 0, color: WARM, fontFamily: SERIF, fontSize: 17, fontStyle: "italic", lineHeight: 1.85, whiteSpace: "pre-line" }}>
              {st.lines.join("\n")}
            </p>
          </motion.div>
        ))}

        {song.glosses.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 6px" }}>
              The collectors' notes
            </p>
            {song.glosses.map((g, i) => (
              <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, margin: "3px 0 0" }}>— {g}</p>
            ))}
          </div>
        )}
      </>,
      <>
        {primary("Continue", () => setStage("sit"))}
        {quiet("Choose another song", () => setStage("choose"))}
      </>,
    );
  }

  // -------------------------------------------------------------------- sit
  /**
   * REFLECT — a title slide, nothing more (owner: "just have it say take some
   * time to reflect on what touched you during the reading and bring what is
   * on your heart to God, just as a title slide, and just have continue at the
   * bottom, and just go straight").
   *
   * This was a timed sitting: minute pills, a countdown, an "End early". None
   * of that was asked for and none of it belongs here — the practice is read,
   * reflect, close. Continue completes the day's sitting and goes to the
   * close, so the walk is straight through with no decision to make.
   */
  if (stage === "sit") {
    return shell(
      <>
        {header(() => setStage("read"), "Reflect")}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "58vh" }}>
          <p
            className="prompt-rise"
            style={{
              color: WARM, fontFamily: SERIF, fontSize: 22, fontStyle: "italic",
              lineHeight: 1.6, textAlign: "center", maxWidth: 480,
              margin: "0 auto", textWrap: "balance",
              textShadow: "0 0 26px rgba(143,175,150,0.4), 0 0 58px rgba(143,175,150,0.2)",
            }}
          >
            Take some time to reflect on what touched you during the reading,
            and bring what is on your heart to God.
          </p>
        </div>
      </>,
      primary("Continue", finish),
    );
  }

  // ------------------------------------------------------------------ close
  /**
   * THE CLOSE — background, not a card (owner: "there's a lot of stuff on the
   * last slide on a card … take the card, we just need it on the background
   * and have it just say who's song this was").
   *
   * Was a frosted panel holding an eyebrow, the provenance sentence, the
   * collector's commentary, a "Recently" list and two buttons — a lot of
   * furniture at the end of a practice whose whole shape is quiet. The panel,
   * the commentary and the Recently list are gone; the sentence stands on the
   * ground on its own.
   *
   * The wording is the owner's, and two details in it are deliberate:
   *   • "in North Carolina", not "at" — it read as a venue rather than a place.
   *   • the Smithsonian pointer, because "can be found through the Smithsonian"
   *     is the difference between citing a book and telling someone where to go
   *     and read it themselves.
   */
  return shell(
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", margin: "40px 0 18px" }}>
          Amen
        </p>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 10px" }}>
          Whose song this was
        </p>
        <p style={{ color: WARM, fontFamily: SERIF, fontSize: 16, lineHeight: 1.75, margin: 0, maxWidth: 520 }}>
          “{song.title}” was sung by people held in slavery
          {song.collectedAt ? ` in ${song.collectedAt}` : ""}, and written down in{" "}
          <i>{SPIRITUALS_SOURCE.title}</i> ({SPIRITUALS_SOURCE.year}) — the first
          collection of these songs ever printed, which can be found through the
          Smithsonian.
        </p>
      </motion.div>
    </>,
    <>
      {primary("Done", () => setLocation("/dashboard"))}
      {quiet("Sit with another", () => setStage("choose"))}
    </>,
  );
}
