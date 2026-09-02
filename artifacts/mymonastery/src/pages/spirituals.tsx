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
import { getSpiritualsHistory, recordSpiritualSat } from "@/lib/spiritualsHistory";
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

const MINUTES = [0, 1, 2, 3, 5] as const;

/** "No timer": a sentinel for `left` that marks the sitting as begun without
 *  starting a countdown. Non-positive, so the countdown effect leaves it be. */
const NO_TIMER = -1;

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
  const [minutes, setMinutes] = useState<number>(3);
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const song = chosen ?? appointed.song;
  const byHand = chosen != null;
  const history = useMemo(
    () => (stage === "close" ? getSpiritualsHistory().slice(0, 3) : []),
    [stage],
  );

  // The countdown. Cleared on unmount and whenever the sitting ends, so a
  // back-out mid-sit doesn't leave an interval running.
  useEffect(() => {
    if (stage !== "sit" || left == null) return;
    if (left <= 0) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(() => setLeft((v) => (v == null ? null : Math.max(0, v - 1))), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [stage, left]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

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
    if (timer.current) clearInterval(timer.current);
    setStage("close");
  };

  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{
        userSelect: "none", WebkitTapHighlightColor: "transparent",
        borderRadius: 999, padding: "9px 15px", fontSize: 13, fontWeight: 600,
        fontFamily: FONT, cursor: "pointer", color: WARM,
        background: on ? "rgba(46,107,64,0.6)" : "rgba(240,237,230,0.06)",
        border: on ? "1px solid rgba(143,175,150,0.65)" : `1px solid ${BORDER}`,
      }}>
      {label}
    </button>
  );

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

  const shell = (children: ReactNode) => (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, isolation: "isolate" }}>
      <AnimatedBackground base={BG} variant="subtle" />
      <div style={{
        position: "relative", maxWidth: 620, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 32px)",
      }}>
        {children}
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

          {primary("Continue", () => setStage("prompt"))}
          {quiet("Choose another song", () => setStage("choose"))}
        </motion.div>
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
          {primary("Continue", () => setStage("read"))}
        </div>
      </>,
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

        <div style={{ marginTop: 24 }}>{primary("Continue", () => setStage("sit"))}</div>
        {quiet("Choose another song", () => setStage("choose"))}
      </>,
    );
  }

  // -------------------------------------------------------------------- sit
  if (stage === "sit") {
    const running = left != null;
    return shell(
      <>
        {header(() => { if (timer.current) clearInterval(timer.current); setLeft(null); setStage("read"); }, "Sit")}

        {/* The prayer prompt, glowing off the dark ground the way the title
            does. Held through the sitting itself, not just before it. */}
        <p style={{
          color: WARM, fontFamily: SERIF, fontSize: 21, fontStyle: "italic",
          lineHeight: 1.6, textAlign: "center", textWrap: "balance",
          margin: running ? "26px 0 34px" : "18px 0 30px",
          textShadow: "0 0 26px rgba(143,175,150,0.4), 0 0 58px rgba(143,175,150,0.2)",
        }}>
          Take some time to bring what is on your heart to God.
        </p>

        {!running && (
          <>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 8px" }}>
              How long
            </p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 22 }}>
              {MINUTES.map((m) => pill(m === 0 ? "No timer" : `${m} min`, minutes === m, () => setMinutes(m)))}
            </div>

            {primary(
              minutes === 0 ? "Begin in silence" : `Sit for ${minutes} min`,
              // NO_TIMER holds the sitting open: the countdown effect does
              // nothing at a non-positive value, so Complete simply waits.
              () => setLeft(minutes === 0 ? NO_TIMER : minutes * 60),
            )}
          </>
        )}

        {running && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            {left != null && left >= 0 && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 34, fontVariantNumeric: "tabular-nums", margin: "0 0 30px" }}>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </p>
            )}
            {left != null && left <= 0 && primary("Complete", finish)}
            {left != null && left > 0 && quiet("End early", finish)}
          </div>
        )}
      </>,
    );
  }

  // ------------------------------------------------------------------ close
  return shell(
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", margin: "40px 0 14px" }}>
          Amen
        </p>
        <div style={{ ...FROST, borderRadius: 16, border: `1px solid ${BORDER}`, padding: 16, marginBottom: 20 }}>
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 6px" }}>
            Whose song this was
          </p>
          <p style={{ color: WARM, fontFamily: SERIF, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            “{song.title}” was sung by people held in slavery
            {song.collectedAt ? ` at ${song.collectedAt}` : ""}, and written down
            {song.contributor ? ` by ${song.contributor}` : ""} for{" "}
            {SPIRITUALS_SOURCE.title} ({SPIRITUALS_SOURCE.year}).
          </p>
          {song.commentary && (
            <p style={{ color: SAGE, fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.65, margin: "10px 0 0" }}>
              {song.commentary}
            </p>
          )}
        </div>

        {history.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 8px" }}>
              Recently
            </p>
            {history.map((h) => {
              const s = SPIRITUALS.find((x) => x.number === h.number);
              if (!s) return null;
              return (
                <p key={h.number} style={{ color: SAGE, fontFamily: SERIF, fontSize: 14, fontStyle: "italic", lineHeight: 1.5, margin: "4px 0 0" }}>
                  {s.title}
                </p>
              );
            })}
          </div>
        )}

        {primary("Done", () => setLocation("/dashboard"))}
        {quiet("Sit with another", () => {
          setLeft(null);
          setStage("choose");
        })}
      </motion.div>
    </>,
  );
}
