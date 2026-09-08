import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import DeckNavPill from "@/components/DeckNavPill";
import { useDeckBackGuard } from "@/hooks/useDeckBackGuard";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { DeckAnnouncer } from "@/components/DeckAnnouncer";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { artworkById } from "@/lib/visioSelect";
import { tidyArtist, tidyDate, safeArtUrl } from "@/lib/artistName";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { openReadingPage } from "@/lib/openExternal";
import { bibleUrl } from "@/lib/bibleGatewayUrl";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { toast } from "@/hooks/use-toast";
import { isOnline } from "@/lib/offline";
import {
  MYSTERY_SETS, mysterySetForDay, artIdForDay, type MysterySet, type Mystery,
  ANGLICAN_SETS, ANGLICAN_CIRCLES, type AnglicanSet,
} from "@/lib/rosary";
import {
  buildRomanBeats, buildAnglicanBeats, ordinal, cap, type Form,
} from "@/lib/rosaryBeats";

/**
 * THE ROSARY — a guided walk through a set of mysteries.
 *
 * Built on Simple Guided Prayer's recipe exactly (owner: "use a similar UI to
 * the Simple Guided or Examen"): the same still-landscape backdrop under the
 * same wash, the same header with Back stepping the deck and a ✕ to leave, the
 * same centred column at 560/480, the same frosted pill and quiet dots in the
 * bottom band. Only the accent moves — a dusted blue rather than PACT's
 * terracotta — so the two practices are told apart at a glance without
 * inventing a second visual language.
 *
 * REPETITION IS ONE SLIDE THAT SAYS HOW MANY TIMES (owner: "for any
 * repetition, like the Hail Marys, lets not have 10 slides, just say repeat 10
 * times"). A decade is ten Hail Marys and the opening is three; as slides that
 * is fifty-three screens of identical text, and as one tap per bead it was
 * seventy-nine taps to finish. Either turns a prayer into a chore. So the
 * words appear once with the count above them and the mystery held alongside,
 * and you pray them at your own pace — which is what the beads in your hand
 * are for.
 *
 * OPEN TO EVERYONE (owner) — signed in or not. Nothing in it needs an
 * account: the prayers and mysteries are bundled, the artwork is the public
 * ACT library, and completion is a local flag whose server write already
 * treats a signed-out 401 as "nothing to sync". /rosary is in
 * GUEST_ALLOWED_EXACT for the same reason Visio and the Examen are.
 */

/**
 * THE OFFICE'S OWN TOKENS, NOT A SECOND PALETTE (owner: "audit to make sure
 * you have it exactly like the office UI").
 *
 * These are lifted verbatim from bcp-daily-office.tsx — same var() names with
 * the same fallbacks — so the Rosary is themed by the office's paper/type
 * settings rather than sitting beside them in a private blue. What is left of
 * the Marian accent is one thing: the intro's mystery-set chips, where four
 * options need telling apart.
 */
const FONT = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";
const SERIF = "Georgia, 'Times New Roman', serif";
const BG = "var(--oh-bg2, #091A10)";
const WARM = "var(--oh-ink, #F0EDE6)";
const FAINT_GREEN = "rgba(var(--ot-sage, 143,175,150),0.55)";
const BORDER = "rgba(var(--ot-green, 46,107,64),0.38)";
const CHROME_BG = "rgba(var(--ot-deep, 9,26,16), 0.297)";
/** The one place the Rosary keeps a blue: four chips that must read apart. */
const ACCENT = "rgba(150,170,205,0.5)";

// The office's own title scale (bcp-daily-office 110-112) — reused, not
// re-clamped, so the deck can't drift apart one slide at a time.
const TITLE_LG = "clamp(40px, 8vw, 48px)"; // threshold title
const TITLE_MD = "clamp(36px, 7vw, 44px)"; // a mystery being announced

/**
 * A PRAYER, SET IN LINES.
 *
 * The texts carry the office's own line breaking — a line per clause, two
 * spaces of indent for a continuation (see the note over the texts in
 * lib/rosary.ts). Rendering that with `white-space: pre-wrap` would honour the
 * breaks but NOT the indent on wrap: a long indented line that runs past the
 * measure comes back to the left margin, which is precisely where the eye
 * expects a new clause. So each line is its own block with real padding —
 * the same thing the office does for an indented psalm hemistich — and a
 * wrapped line hangs under its own indent.
 *
 * A blank line in the source (the Anglican invitatory has one between the
 * versicle pair and the Gloria) becomes a gap, not an empty row.
 */
function PrayerLines({ text, style }: { text: string; style?: CSSProperties }) {
  const lines = text.split("\n");
  return (
    <p style={{ color: WARM, margin: 0, fontFamily: FONT, fontSize: 20, lineHeight: 1.7, maxWidth: 600, ...style }}>
      {lines.map((raw, i) => {
        if (raw.trim() === "") return <span key={i} aria-hidden style={{ display: "block", height: "0.7em" }} />;
        const indent = (raw.length - raw.trimStart().length) / 2;
        return (
          <span key={i} style={{ display: "block", paddingLeft: indent * 18, textIndent: 0 }}>
            {raw.trimStart()}
          </span>
        );
      })}
    </p>
  );
}

/** Office chrome circle — ✕ and ⚙ are the same 38px frosted button. */
const CHROME_BTN: CSSProperties = {
  width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center",
  justifyContent: "center", background: CHROME_BG,
  backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
  border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0,
};

export default function RosaryPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  /**
   * WHERE YOU WERE, KEPT.
   *
   * A full rosary is fifty Hail Marys and something like twenty minutes. It is
   * the practice in this app MOST likely to be interrupted — and without this,
   * a phone call at the third decade meant starting again from the Sign of the
   * Cross, which nobody does twice. The office persists its slide for exactly
   * this reason; a longer practice needs it more, not less.
   *
   * Kept for the local day only: coming back tomorrow should start a new
   * rosary, not resume yesterday's. Set as well as position, so the resume
   * lands in the mysteries you were actually praying.
   */
  const RESUME_KEY = "phoebe:rosary:progress";
  const resumed = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as
        { day?: string; form?: Form; set?: MysterySet; ang?: AnglicanSet; circle?: number; step?: number } | null;
      if (!raw || raw.day !== new Date().toLocaleDateString("en-CA")) return null;
      if (typeof raw.step !== "number" || raw.step < 1) return null;
      // A resume from before the Anglican form existed has no `form` and a
      // Roman `set` — read it as Roman rather than throwing the place away.
      const form: Form = raw.form === "anglican" ? "anglican" : "roman";
      if (form === "roman" && (!raw.set || !(raw.set in MYSTERY_SETS))) return null;
      if (form === "anglican" && (!raw.ang || !(raw.ang in ANGLICAN_SETS))) return null;
      return { ...raw, form };
    } catch { return null; }
  }, []);

  // step 0 is the intro; 1..beats.length walks the beats.
  const [step, setStep] = useState(0);
  /**
   * THE OPENING SLIDE SHOWS THE DAY, NOT YESTERDAY'S CHOICE.
   *
   * These used to initialise FROM the resume, so a second visit on the same
   * day opened on whatever you last chose — and the intro, whose whole job is
   * "all four visible with today's highlighted", stopped highlighting today
   * and changed its line to "Traditionally prayed on…". The resume is an
   * OFFER: the button below sets all four of these when you take it. Pressing
   * Begin instead starts the day's own rosary, which is what Begin says.
   */
  const [form, setForm] = useState<Form>("roman");
  const [set, setSet] = useState<MysterySet>(() => mysterySetForDay());
  const [angSet, setAngSet] = useState<AnglicanSet>("jesus");
  /** Anglican only: which time round the circle you are on, 1..3. */
  const [circle, setCircle] = useState(1);

  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const isAnglican = form === "anglican";
  const beats = useMemo(
    () => (isAnglican ? buildAnglicanBeats(angSet) : buildRomanBeats(set)),
    [isAnglican, angSet, set],
  );
  const def = MYSTERY_SETS[set];
  const angDef = ANGLICAN_SETS[angSet];
  /** What the intro and the header call whichever form is in your hand. */
  const formName = isAnglican ? angDef.name : def.name;

  /** What the day appoints — kept separate from `set` so the intro can say
   *  "Today's mysteries" when they match and name the tradition when they don't. */
  const todaysSet = useMemo(() => mysterySetForDay(), []);

  /** Changing the form on the intro resets the circle — you are starting a
   *  different object, not continuing this one. */
  const chooseForm = (f: Form) => { setForm(f); setCircle(1); setStep(0); };

  const isIntro = step === 0;
  const beat = isIntro ? null : beats[step - 1] ?? null;
  const isClosing = beat?.kind === "closing";

  // Write the place on every move. Cheap (one small JSON), and it means the
  // resume offer below is always truthful.
  useEffect(() => {
    if (step === 0) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        day: new Date().toLocaleDateString("en-CA"), form, set, ang: angSet, circle, step,
      }));
    } catch { /* private mode — resume simply won't be offered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form, set, angSet, circle]);

  /**
   * WARM THE NEXT MYSTERY'S PICTURE WHILE THIS DECADE IS PRAYED.
   *
   * The ACT originals average ~570 KB and the host offers no resizing (its
   * IIIF paths 403), so an unwarmed picture pops in a beat or two late on
   * cellular. A decade is ten Hail Marys — a minute or more of certain
   * warning — so the next one is fetched during it and is simply there.
   */
  useEffect(() => {
    if (isAnglican || beat?.kind !== "repeat" || !beat.decade) return;
    const next = beats.slice(step).find((b) => b.kind === "mystery") as { mystery: Mystery } | undefined;
    const nextId = next ? artIdForDay(def, next.mystery) : null;
    const art = nextId ? artworkById(nextId) : null;
    if (!art?.img) return;
    try { const img = new Image(); img.decoding = "async"; img.src = safeArtUrl(art.img); } catch { /* non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, beat?.kind, isAnglican]);

  /**
   * THE READER'S OWN BOTTOM BAR STEPS THIS DECK.
   *
   * openOfficeReading opens the passage with `officeChrome` — the office's
   * top bar and a floating Back/Next pill over the page — and that pill does
   * not navigate the browser: it dismisses it and posts
   * phoebe:office-{next,prev}-slide to whatever deck is underneath. Every
   * other deck listens (bcp-daily-office, lectio, visio); this one did not, so
   * the reading opened over the Rosary and its Next did nothing, which is
   * exactly what "the scripture link is not loading" looks like from the
   * outside — you go, you come back, and nothing has moved.
   */
  /** The reader's floating pill fires from an effect that must not re-bind on
   *  every render — the latest goBack is read through a ref instead. */
  const goBackRef = useRef<() => void>(() => {});
  useEffect(() => {
    const next = () => setStep((n) => Math.min(n + 1, beats.length));
    const prev = () => goBackRef.current();
    window.addEventListener("phoebe:office-next-slide", next);
    window.addEventListener("phoebe:office-prev-slide", prev);
    return () => {
      window.removeEventListener("phoebe:office-next-slide", next);
      window.removeEventListener("phoebe:office-prev-slide", prev);
    };
  }, [beats.length]);

  useEffect(() => {
    if (step === 1) { try { playOpeningSwell(); } catch { /* non-fatal */ } }
    if (isClosing) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      /**
       * Kept the way every other practice is kept, now that the Rosary is a
       * real option in the customizer: markPracticeDoneToday writes the local
       * flag, queues the server row through the outbox, and is what the home
       * card, the dots and the weekly grid all read. "rosary" was added to
       * OptionalPractice and to the server's own section allow-list in the
       * same change, so the write is accepted rather than 400ing.
       */
      try {
        markPracticeDoneToday("rosary");
        // Finished — there is nothing to resume.
        localStorage.removeItem("phoebe:rosary:progress");
      } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);


  /**
   * TITLE CARD vs CONTENT SLIDE — the office's one distinction, and the whole
   * of the owner's ask ("the title slides can be centered", "left aligned in
   * Space Grotesk"). A card that ANNOUNCES (the opening, a mystery, the end)
   * is centred and vertically middled; a slide you READ FROM (a prayer, a
   * decade) is left-aligned and starts at the top, because centred prose is
   * unreadable at the Creed's length.
   */
  const isTitleCard = isIntro || beat?.kind === "mystery" || beat?.kind === "circle" || isClosing;

  const decadeOf = beat && (beat.kind === "mystery" || beat.kind === "repeat") ? (beat.decade ?? null) : null;

  /**
   * WHERE YOU ARE, IN THE OFFICE'S WORDS: "N of M · Section". The section is
   * the part of the rosary you are in — the opening prayers, one of the five
   * decades by name, or the close — so the counter says something more useful
   * than a bare number in a deck of thirty-six.
   */
  const navLabel = (() => {
    if (isAnglican) {
      // "N of M" is the wrong counter for a circle you go round three times —
      // it would run 1..17 and then jump backwards. Where you are on THIS form
      // is which circle and which week, which is what the beads say too.
      if (isIntro) return t("rosary.sec_beads", { defaultValue: "Anglican prayer beads" });
      if (isClosing) return t("rosary.sec_closing", { defaultValue: "Closing" });
      const here = t("rosary.circle_of", { defaultValue: "Circle {{n}} of {{of}}", n: circle, of: ANGLICAN_CIRCLES });
      // The turn of the circle is a place of its own — labelling it with the
      // fourth week (the beat before it) said you were still in the week you
      // had just finished.
      if (beat?.kind === "circle") return here;
      const w = decadeOf;
      if (w === null) return here;
      return `${here} · ${t("rosary.week_n", { defaultValue: "{{which}} week", which: cap(ordinal(w)) })}`;
    }
    const total = beats.length + 1;
    const n = step + 1;
    let section: string;
    if (isIntro) section = t("rosary.sec_open", { defaultValue: "The Rosary" });
    else if (decadeOf !== null) {
      section = t("rosary.sec_decade", { defaultValue: "{{which}} Mystery", which: cap(ordinal(decadeOf)) });
    } else if (step <= 5) section = t("rosary.sec_opening", { defaultValue: "Opening" });
    else if (step > 5 && step < beats.length - 4) {
      // Between the opening and the close, an un-numbered beat still belongs
      // to the decade it follows — count the mysteries passed so far.
      const d = beats.slice(0, step).filter((b) => b.kind === "mystery").length;
      section = d > 0
        ? t("rosary.sec_decade", { defaultValue: "{{which}} Mystery", which: cap(ordinal(d)) })
        : t("rosary.sec_opening", { defaultValue: "Opening" });
    } else section = t("rosary.sec_closing", { defaultValue: "Closing" });
    return `${n} of ${total} · ${section}`;
  })();
  /**
   * The mystery's picture, from the same ACT library Visio prays with.
   * Undefined for the Assumption, which the library has nothing for — the beat
   * simply shows no picture rather than borrowing an unrelated one.
   */
  const mysteryArt = (() => {
    if (beat?.kind !== "mystery") return null;
    const id = artIdForDay(def, beat.mystery);
    return id ? artworkById(id) : null;
  })();
  /** The Anglican set's one icon — shown on the intro and at each turn of the
   *  circle. There are no mysteries to illustrate on this form, so one image
   *  held throughout is the honest equivalent. */
  const angArt = useMemo(() => (angDef.artId ? artworkById(angDef.artId) : null), [angDef.artId]);
  /** Every work seen in THIS session — what the closing slide credits. */
  const creditedArt = useMemo(
    () => (isAnglican
      ? (angArt ? [angArt] : [])
      : def.mysteries
        .map((m) => { const id = artIdForDay(def, m); return id ? artworkById(id) : null; })
        .filter((a): a is NonNullable<typeof a> => !!a)),
    [def, isAnglican, angArt],
  );

  /** The bottom pill: what it says, and what it does. */
  /**
   * BACK, ROUND A CIRCLE.
   *
   * Stepping back from the first cruciform bead on circle 2 or 3 would land on
   * the invitatory — out of the loop entirely, and one circle over-counted for
   * the rest of the session. It goes to the turn you came through instead.
   */
  /**
   * A CIRCUIT STARTS AT THE INVITATORY BEAD, NOT THE FIRST CRUCIFORM.
   *
   * The received count is a HUNDRED — thirty-three beads three times round is
   * ninety-nine, and the invitatory said once more at the end makes the
   * hundredth, which is what ties the form to the century of the Jesus Prayer.
   * That arithmetic only works if the invitatory heads EVERY circuit. Looping
   * back to the first cruciform instead prayed 32 beads a circuit — 96, plus
   * the two invitatories, 98 — so the header's own "33 × 3 = 99" was two short
   * of what the deck actually did.
   */
  const circuitStartStep = useMemo(() => {
    const i = beats.findIndex((b) => b.kind === "prayer" && /invitatory/i.test(b.eyebrow));
    return i >= 0 ? i + 1 : -1;
  }, [beats]);
  const circleStep = useMemo(() => {
    const i = beats.findIndex((b) => b.kind === "circle");
    return i >= 0 ? i + 1 : -1;
  }, [beats]);
  const goBack = () => {
    if (isAnglican && circle > 1 && step === circuitStartStep && circleStep > 0) {
      setCircle((c) => c - 1);
      setStep(circleStep);
      return;
    }
    setStep((n) => Math.max(0, n - 1));
  };
  goBackRef.current = goBack;

  /**
   * ANDROID'S BACK STEPS THE DECK (it did not, here).
   *
   * The office, Lectio and Visio all guard this; the Rosary did not, and it is
   * the practice that can least afford it — thirty-six slides is the longest
   * walk in the app, and on Android one Back press at the fourth decade left
   * for the dashboard. The deck pushes no history of its own, so the guard
   * keeps one spare entry in front of the page while you are past the intro.
   * No early returns above it: this component has none, and the hook must run
   * on every render or React tears the tree down (learned the hard way in the
   * office — see the crash note in bcp-daily-office).
   */
  useDeckBackGuard({ active: step > 0, atStart: step <= 0, onBack: goBack });

  const primary = (() => {
    if (isIntro) return { label: t("rosary.begin", { defaultValue: "Begin" }), onClick: () => setStep(1) };
    if (isClosing) return { label: t("rosary.done", { defaultValue: "Done" }), onClick: () => setLocation("/dashboard") };
    if (beat?.kind === "circle" && circle < ANGLICAN_CIRCLES) {
      // Back to the FIRST cruciform bead — index 2 in the built list (cross,
      // invitatory, then the circle), so step 3. Derived, not hard-coded, so
      // the loop still lands right if the opening ever gains a beat.
      return {
        label: t("rosary.round_again", { defaultValue: "Round again" }),
        onClick: () => { setCircle((c) => c + 1); setStep(circuitStartStep > 0 ? circuitStartStep : 2); },
      };
    }
    return { label: t("rosary.continue", { defaultValue: "Continue" }), onClick: () => setStep((s) => s + 1) };
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <DeckAnnouncer
        label={
          isIntro ? `${formName}. ${isAnglican ? angDef.blurb : def.blurb}`
            : beat?.kind === "mystery" ? `${beat.mystery.title}, the ${ordinal(beat.decade)} mystery. ${beat.mystery.ref}`
            : beat?.kind === "repeat" ? `${beat.title}, on ${beat.times} beads. ${beat.eyebrow}`
            : beat?.kind === "versicle" ? `${beat.v} ${beat.r}`
            : beat?.kind === "circle" ? t("rosary.circle_done", { defaultValue: "Circle {{n}} of {{of}} complete", n: circle, of: ANGLICAN_CIRCLES })
            : beat?.kind === "prayer" ? `${beat.eyebrow}. ${beat.title}`
            : t("rosary.closing_title", { defaultValue: "The rosary is prayed" })
        }
      />
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto}
            alt=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      {/* THE OFFICE'S HEADER, COLUMN FOR COLUMN — ← Back, the centred title
          pill, the ✕ circle. It was a two-item flex row with no title; the
          office uses a 1fr/auto/1fr grid precisely so the pill stays centred
          however wide "Back" gets in another language. pointerEvents is off on
          the bar and back on inside it, so the header never eats a tap meant
          for the slide beneath it. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
            gap: 12, pointerEvents: "auto", paddingTop: "max(1.5rem, var(--safe-top))",
          }}
        >
          <button
            type="button"
            onClick={() => {
              // Back steps the deck; from the intro it leaves. Home, not the
              // offices picker — the same exit PACT and the Examen settled on.
              if (step > 0) goBack();
              else setLocation("/dashboard");
            }}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: FONT }}
          >
            {t("rosary.back", { defaultValue: "← Back" })}
          </button>
          <span
            className="rounded-full"
            style={{
              background: CHROME_BG, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: `1px solid ${BORDER}`, color: WARM, fontSize: 12, fontWeight: 600,
              letterSpacing: "0.04em", padding: "6px 16px", fontFamily: FONT, whiteSpace: "nowrap",
            }}
          >
            {isAnglican
              ? t("rosary.title_ang", { defaultValue: "Anglican Beads" })
              : t("rosary.title", { defaultValue: "The Rosary" })}
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setLocation("/dashboard")}
              aria-label={t("rosary.exit", { defaultValue: "Close" })}
              style={CHROME_BTN}
            >
              <X size={19} />
            </button>
          </div>
        </div>
      </header>

      <main
        className="flex-1 px-5"
        style={{
          /**
           * THE OFFICE'S SCROLL COLUMN, STRUCTURE FOR STRUCTURE.
           *
           * flex-1 + minHeight:0 rather than minHeight:var(--app-dvh): a
           * dvh-tall child inside a fixed root cannot scroll to its end on
           * Android web, where the visual viewport is shorter than 100dvh.
           *
           * Bottom clearance is a SPACER CHILD at the end of this element,
           * never paddingBottom here — iOS WKWebView drops a flex-column
           * scroll container's padding-bottom once a child overflows, which is
           * exactly how the end of the Creed ended up behind the nav pill.
           */
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          /**
           * HEADER CLEARANCE ON EVERY SLIDE, NOT ONLY THE READING ONES.
           *
           * The office gives its title cards 24px because its title cards are
           * two lines and centre far below the bar. Two of THESE are not: the
           * mystery card carries a painting, and the closing card carries five
           * picture credits. Measured on a 375×812 phone, the closing card's
           * first line sat at y=22 with the header's bottom edge at y=63 — the
           * top of the slide was behind the chrome. Every slide clears the bar
           * now, and the auto margins below still centre the short ones.
           */
          paddingTop: "max(110px, calc(var(--safe-top) + 80px))",
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative", zIndex: 1,
          // Slight drop shadow on all slide text so it stays legible over the
          // leaf backdrop — the office's own line.
          textShadow: "0 1px 6px rgba(var(--ot-shadow, 8,30,18),0.5)",
        }}
      >
        <div
          className="mx-auto"
          style={{
            display: "flex", flexDirection: "column", width: "100%", maxWidth: 672,
            /**
             * AUTO MARGINS, NOT justify-content, TO CENTRE A TITLE CARD.
             *
             * `flex-grow:1` + `justify-content:center` centres a card that
             * fits and CLIPS one that doesn't: the overflow spills equally off
             * both ends and the top half becomes unreachable by scrolling —
             * the classic flex-centring trap. Auto margins centre exactly the
             * same way while collapsing to zero when the card is taller than
             * the box, so a long closing simply starts at the top and scrolls.
             */
            marginTop: isTitleCard ? "auto" : 0,
            marginBottom: isTitleCard ? "auto" : 0,
            flexGrow: 0,
            flexShrink: 0,
            justifyContent: "flex-start",
            textAlign: isTitleCard ? "center" : "left",
            alignItems: isTitleCard ? "center" : undefined,
            gap: 20,
          }}
        >
        <AnimatePresence mode="wait">
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 540, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}
            >
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                {t("rosary.eyebrow", { defaultValue: "Before you begin" })}
              </p>
              <h1
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: TITLE_LG, lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}
              >
                {formName}
              </h1>
              <p style={{ color: "var(--oh-ink2, #E8E4D8)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 3.4vw, 22px)", lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
                {isAnglican ? angDef.blurb : def.blurb}
              </p>

              {/* The Anglican set's icon, held here the way a mystery's picture
                  is held on its own slide — there are no scenes to illustrate
                  on this form, so one image stays with you throughout. */}
              {isAnglican && angArt?.img && (
                <figure style={{ margin: 0, width: "100%" }}>
                  <img
                    src={safeArtUrl(angArt.img)}
                    alt={`${angArt.title}${angArt.artist ? ` — ${tidyArtist(angArt.artist)}` : ""}`}
                    loading="eager"
                    decoding="async"
                    style={{ width: "100%", maxWidth: 260, maxHeight: "26dvh", objectFit: "contain", margin: "0 auto", display: "block" }}
                  />
                  <figcaption style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, marginTop: 8 }}>
                    {angArt.title}
                    {angArt.artist ? <span style={{ display: "block", color: "rgba(240,237,230,0.55)" }}>{tidyArtist(angArt.artist)}</span> : null}
                  </figcaption>
                </figure>
              )}

              {/* HOW THE BEADS WORK, IN ONE LINE. Somebody opening this has
                  quite possibly never held a rosary — the deck names a bead at
                  every step ("on the crucifix", "on the ten small beads"), and
                  that only helps if you have been told what is in your hand.
                  It also says plainly that you don't need the beads at all. */}
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: 15.5, lineHeight: 1.6 }}>
                {isAnglican
                  ? t("rosary.intro_ang", {
                      defaultValue:
                        "Thirty-three beads, for the years of his life: a cross, one invitatory bead, then four cruciform beads dividing four weeks of seven. You go round the circle three times. Each slide names the bead — and if you have no beads, your fingers or nothing at all will do.",
                    })
                  : t("rosary.intro_body", {
                      defaultValue:
                        "Five mysteries, a decade each. Each slide names the bead it belongs to — the crucifix, the large bead, the ten small ones — and if you have no beads, your fingers or nothing at all will do. Pray at your own pace; the deck keeps your place, so you can put it down whenever you need to.",
                    })}
              </p>

              {/* All four, with today's highlighted (owner: "I want the
                  original of keeping all four visible with todays
                  highlighted"). The day decides which is lit; any of them can
                  be tapped. On the Anglican form the same row offers the four
                  devotions instead — nothing there is appointed by day. */}
              <div className="flex flex-wrap items-center justify-center gap-2" style={{ marginTop: 2 }}>
                {isAnglican
                  ? (Object.keys(ANGLICAN_SETS) as AnglicanSet[]).map((k) => {
                      const on = k === angSet;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => { setAngSet(k); setCircle(1); }}
                          aria-pressed={on}
                          className="rounded-full"
                          style={{
                            padding: "12px 16px", minHeight: 44,
                            fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
                            color: on ? WARM : "rgba(240,237,230,0.66)",
                            background: on ? "rgba(150,170,205,0.18)" : CHROME_BG,
                            border: `1px solid ${on ? ACCENT : "rgba(150,170,205,0.22)"}`,
                            backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                          }}
                        >
                          {ANGLICAN_SETS[k].name}
                        </button>
                      );
                    })
                  : (Object.keys(MYSTERY_SETS) as MysterySet[]).map((k) => {
                      const on = k === set;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSet(k)}
                          aria-pressed={on}
                          className="rounded-full"
                          style={{
                            // 44px minimum — these were ~30px tall.
                            padding: "12px 16px", minHeight: 44,
                            fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
                            color: on ? WARM : "rgba(240,237,230,0.66)",
                            background: on ? "rgba(150,170,205,0.18)" : CHROME_BG,
                            border: `1px solid ${on ? ACCENT : "rgba(150,170,205,0.22)"}`,
                            backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                          }}
                        >
                          {MYSTERY_SETS[k].name.replace("The ", "").replace(" Mysteries", "")}
                        </button>
                      );
                    })}
              </div>
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 12.5, margin: 0 }}>
                {isAnglican
                  ? angDef.source
                  : set === todaysSet
                    ? `${t("rosary.today_is", { defaultValue: "Today's mysteries" })} · ${def.days}`
                    : `${t("rosary.traditionally", { defaultValue: "Traditionally prayed on" })} ${def.days}`}
              </p>

              {/* Offered, never forced: Begin still starts a fresh rosary. */}
              {resumed && (
                <button
                  type="button"
                  onClick={() => {
                    setForm(resumed.form);
                    if (resumed.set) setSet(resumed.set);
                    if (resumed.ang) setAngSet(resumed.ang);
                    setCircle(resumed.circle ?? 1);
                    setStep(resumed.step!);
                  }}
                  style={{
                    padding: "12px 16px", minHeight: 44, borderRadius: 999, cursor: "pointer",
                    fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: WARM,
                    background: "rgba(150,170,205,0.18)", border: `1px solid ${ACCENT}`,
                    backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                  }}
                >
                  {t("rosary.resume", { defaultValue: "Pick up where you left off" })}
                </button>
              )}

              {/* WHICH BEADS ARE IN YOUR HAND — the toggle the owner asked for,
                  at the foot of the opening slide. Two genuinely different
                  objects prayed two genuinely different ways, so it sits below
                  everything else with a rule above it: it changes what the
                  whole rest of the deck is, not which set within one form. */}
              <div style={{ marginTop: 6, paddingTop: 18, borderTop: `1px solid ${BORDER}`, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                  {t("rosary.which_beads", { defaultValue: "Which beads" })}
                </p>
                <div
                  role="group"
                  aria-label={t("rosary.which_beads", { defaultValue: "Which beads" })}
                  className="rounded-full"
                  style={{
                    display: "inline-flex", padding: 4, gap: 4, background: CHROME_BG,
                    backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {([["roman", t("rosary.form_roman", { defaultValue: "Rosary" })],
                     ["anglican", t("rosary.form_anglican", { defaultValue: "Anglican beads" })]] as const).map(([k, label]) => {
                    const on = form === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => chooseForm(k)}
                        aria-pressed={on}
                        className="rounded-full"
                        style={{
                          padding: "10px 18px", minHeight: 44, border: "none", cursor: "pointer",
                          fontFamily: FONT, fontSize: 13, fontWeight: 600,
                          color: on ? WARM : "rgba(240,237,230,0.62)",
                          background: on ? "rgba(var(--ot-green, 46,107,64),0.55)" : "transparent",
                          transition: "background 200ms ease-out, color 200ms ease-out",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {beat?.kind === "mystery" && (
            <motion.div
              key={`mystery-${beat.decade}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 540, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                {t("rosary.mystery_n", { defaultValue: "The {{which}} mystery", which: ordinal(beat.decade) })}
              </p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: TITLE_MD, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0 }}
              >
                {beat.mystery.title}
              </h2>
              {mysteryArt?.img && (
                /* Held small and soft — this is a mystery being announced, not
                   Visio's long look at one picture. Attribution rides the alt
                   text the way Visio's does; the ACT licence is the same one. */
                <figure style={{ margin: 0, width: "100%" }}>
                  <img
                    src={safeArtUrl(mysteryArt.img)}
                    alt={`${mysteryArt.title}${mysteryArt.artist ? ` — ${tidyArtist(mysteryArt.artist)}` : ""}`}
                    loading="eager"
                    decoding="async"
                    // No frame: no border, no card, no shadow (owner). The
                    // painting sits on the deck's own ground the way Visio's
                    // does, and anything drawn round it reads as chrome.
                    style={{
                      width: "100%", maxWidth: 300, maxHeight: "34dvh", objectFit: "contain",
                      margin: "0 auto", display: "block",
                    }}
                  />
                  {/* Credited on the slide, not only in the alt text — through
                      the SAME formatter Visio uses, so "JESUS MAFA" reads as
                      the Mafa community here too. */}
                  <figcaption style={{ color: "rgba(168,186,216,0.78)", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, marginTop: 8 }}>
                    {mysteryArt.title}
                    {mysteryArt.artist ? <span style={{ display: "block", color: "rgba(240,237,230,0.55)" }}>{tidyArtist(mysteryArt.artist)}</span> : null}
                  </figcaption>
                </figure>
              )}
              <p style={{ color: "var(--oh-ink2, #E8E4D8)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 3.4vw, 22px)", lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
                {beat.mystery.meditation}
              </p>
              {/* The passage opens in the app's reader, the same hand-off the
                  office and Lectio use — saved page first, live otherwise. */}
              <button
                type="button"
                onClick={() => {
                  // bibleUrl returns null for a reference it can't parse —
                  // never hand that to the reader, which would open about:blank.
                  const url = bibleUrl(beat.mystery.ref);
                  if (!url) return;
                  void openReadingPage(url, { officeTitle: def.name, slideLabel: `${beat.decade} of 5`, sectionLabel: beat.mystery.title })
                    .then((opened) => {
                      // Silence is the worst answer — the office and Lectio
                      // both say why rather than appearing to ignore the tap.
                      if (opened) return;
                      toast(isOnline()
                        ? { title: "Your browser blocked the reading", description: "Allow pop-ups for Phoebe, and the passage will open in a new tab." }
                        : { title: "This reading isn't saved yet", description: "Open the app once with a connection and it will be kept for you." });
                    });
                }}
                style={{
                  color: "var(--oh-sage, #8FAF96)", background: "none", border: "none",
                  // A link you tap on a phone needs a tappable box, not a text baseline.
                  padding: "10px 12px", minHeight: 44,
                  cursor: "pointer", fontFamily: FONT, fontSize: 14.5, textDecoration: "underline", textUnderlineOffset: 4,
                }}
              >
                {beat.mystery.ref} →
              </button>
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 12.5, margin: 0 }}>
                {t("rosary.fruit", { defaultValue: "Fruit of the mystery" })}: {beat.mystery.fruit}
              </p>
            </motion.div>
          )}

          {beat?.kind === "repeat" && (
            <motion.div
              key={`repeat-${step}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}
            >
              {/* Whose decade this is, held above the prayer — ten Hail Marys
                  are never prayed without the mystery in front of you. */}
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                {beat.eyebrow}
              </p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 600, fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.01em", margin: 0 }}>
                {beat.title}
              </h2>
              <p style={{ color: "var(--oh-sage, #8FAF96)", fontFamily: FONT, fontSize: 13, fontWeight: 600, margin: 0 }}>
                {/* Beads, not "times" (owner): it is what your hand is
                    holding, and it names the thing rather than the count. */}
                {t("rosary.beads", { defaultValue: "{{times}} beads", times: beat.times })}
              </p>
              <PrayerLines text={beat.body} />
              {beat.note && (
                <p style={{ color: FAINT_GREEN, margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }}>
                  {beat.note}
                </p>
              )}
            </motion.div>
          )}

          {beat?.kind === "prayer" && (
            <motion.div
              key={`prayer-${step}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}
            >
              {/* A PRAYER IS SET LIKE THE OFFICE SETS ONE (owner): eyebrow at
                  10px/0.18em in faint sage, title at 22/600, body at 20/1.7 in
                  Space Grotesk, left, measure capped at 600 — the office's
                  collect slide exactly. Not centred serif italic, which turns
                  the Creed into a pull-quote you can't read. */}
              {beat.eyebrow && (
                <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                  {beat.eyebrow}
                </p>
              )}
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 600, fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.01em", margin: 0 }}>
                {beat.title}
              </h2>
              <PrayerLines text={beat.body} />
              {beat.note && (
                <p style={{ color: FAINT_GREEN, margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }}>
                  {beat.note}
                </p>
              )}
            </motion.div>
          )}

          {/* SAID AND ANSWERED. A versicle and its response are two voices, and
              the office sets them as two lines with the ℣/℟ marks rather than
              as a title over a body — so does this. It was previously a
              versicle jammed into the eyebrow slot, rendered in letterspaced
              ten-point small caps, which read as a label for the slide. */}
          {beat?.kind === "versicle" && (
            <motion.div
              key={`versicle-${step}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                {beat.eyebrow}
              </p>
              {([["℣", beat.v], ["℟", beat.r]] as const).map(([mark, line]) => (
                <p key={mark} style={{ color: WARM, margin: 0, fontFamily: FONT, fontSize: 20, lineHeight: 1.7, maxWidth: 600, display: "flex", gap: 10 }}>
                  <span aria-hidden style={{ flex: "0 0 auto", color: FAINT_GREEN, fontSize: 15, paddingTop: 4 }}>{mark}</span>
                  <span>{line}</span>
                </p>
              ))}
            </motion.div>
          )}

          {/* ROUND AGAIN — the Anglican circle's turn. A title card, because
              it is a pause and a place, not something to read. */}
          {beat?.kind === "circle" && (
            <motion.div
              key={`circle-${circle}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 540, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                {t("rosary.circle_done", { defaultValue: "Circle {{n}} of {{of}} complete", n: circle, of: ANGLICAN_CIRCLES })}
              </p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: TITLE_MD, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0 }}
              >
                {circle < ANGLICAN_CIRCLES
                  ? t("rosary.round_again_title", { defaultValue: "Round again" })
                  : t("rosary.circle_last", { defaultValue: "Three times round" })}
              </h2>
              {angArt?.img && (
                <img
                  src={safeArtUrl(angArt.img)}
                  alt=""
                  aria-hidden
                  decoding="async"
                  style={{ width: "100%", maxWidth: 240, maxHeight: "28dvh", objectFit: "contain", margin: 0, display: "block" }}
                />
              )}
              <p style={{ color: "var(--oh-ink2, #E8E4D8)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 3.4vw, 22px)", lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
                {circle < ANGLICAN_CIRCLES
                  ? t("rosary.round_again_body", { defaultValue: "You have come back to where you started, which is how a circle works. Go round again — the same words, further in." })
                  : t("rosary.circle_last_body", { defaultValue: "Three times round the circle, and one prayer left to say. Return to the invitatory bead." })}
              </p>
            </motion.div>
          )}

          {isClosing && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 540, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              <p style={{ fontSize: 40, margin: 0 }} aria-hidden>📿</p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: TITLE_MD, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0 }}
              >
                {isAnglican
                  ? t("rosary.closing_title_ang", { defaultValue: "The circle is prayed" })
                  : t("rosary.closing_title", { defaultValue: "The rosary is prayed" })}
              </h2>
              <p style={{ color: "var(--oh-ink2, #E8E4D8)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 3.4vw, 22px)", lineHeight: 1.55, maxWidth: 460 }}>
                {isAnglican
                  ? t("rosary.closing_body_ang", { defaultValue: "Three times round the circle, and back to the cross you started from. Carry the last prayer into the day." })
                  : t("rosary.closing_body", { defaultValue: "Five mysteries held, one decade at a time. Carry them into the day." })}
              </p>

              {/**
                * THE PICTURES ARE CREDITED HERE (owner).
                *
                * Five works are seen in a rosary and each is someone's, held
                * under a licence. The mystery beats carry the title and the
                * artist so you know what you are looking at; the formal line —
                * ACT's attribution, where the work is, and the licence it is
                * offered under — belongs at the end, the way Visio's closing
                * slide credits its one work. Same fields, same order, same
                * formatter for the name.
                */}
              {creditedArt.length > 0 && (
                <div style={{ marginTop: 12, textAlign: "left", width: "100%" }}>
                  <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>
                    {creditedArt.length === 1
                      ? t("rosary.credit_one", { defaultValue: "The picture" })
                      : t("rosary.credits", { defaultValue: "The pictures" })}
                  </p>
                  {creditedArt.map((a) => (
                    <p key={a.id} style={{ color: "rgba(240,237,230,0.6)", fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "0 0 8px" }}>
                      <span style={{ color: "rgba(240,237,230,0.8)" }}>{a.title}</span>
                      {a.artist ? ` — ${tidyArtist(a.artist)}` : ""}
                      {a.date ? `, ${tidyDate(a.date)}` : ""}
                      {a.attribution ? <span style={{ display: "block" }}>{a.attribution}{a.where ? ` ${a.where}.` : ""}{a.licence ? ` ${a.licence}.` : ""}</span> : null}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
        {/* Bottom clearance — a real box, so it survives iOS's flex-overflow
            padding-drop and the last line always scrolls clear of the pill. */}
        <div aria-hidden style={{ flexShrink: 0, height: "calc(env(safe-area-inset-bottom) + 112px)" }} />
      </main>

      {/* THE OFFICE'S BOTTOM BAR (owner: "we want the bottom bar that the
          office has") — Back · "N of M · Section" · Next, the same
          DeckNavPill lectio, visio and audio divina already share. It
          replaces a lone centred pill with a bare row of decade dots: the
          dots said which decade, but nothing said where you were in the
          whole, and there was no Back except the one in the corner. */}
      <DeckNavPill
        label={navLabel}
        back={{ onClick: goBack, disabled: isIntro }}
        primary={{ label: primary.label, onClick: primary.onClick }}
      />
    </div>
  );
}
