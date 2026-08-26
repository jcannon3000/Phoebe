/**
 * Visio Divina — praying with an image.
 *
 * The sibling of Audio Divina: there, sacred listening; here, sacred looking.
 *
 * Six beats: title+prompt · picture · prompt · picture · contemplation · completion.
 *
 * Look first, with only an instruction for your eyes. Then read what somebody
 * who has looked at this for a living has to say about it. Then be asked what
 * God might be saying to YOU through it — a question that lands differently
 * once the commentary has opened the picture up. Then look again, holding all
 * of it. That second look is what the sequence is built to earn.
 *
 * There is no scripture slide. The passage the artwork depicts is named — it
 * is the eyebrow over the title — but not printed: the office is where you
 * read, and a lesson here competed with the looking.
 *
 * ── Where the art comes from ──
 *
 * lib/visioCatalogue.ts — 229 works from Vanderbilt's Art in the Christian
 * Tradition, every one licence-verified against Wikimedia Commons (see
 * scripts/fetch-act-catalogue.mjs). Each is tagged to the passages it depicts,
 * so lib/visioSelect.ts can cross that against TODAY'S appointed lessons: on
 * the day the lectionary gives Luke 10:38-42 you get Vermeer's Martha and
 * Mary, not whatever a modulo landed on.
 *
 * Catalogue images load from ACT's own host — 229 paintings is far too much to
 * put in the app binary. So this screen is built to degrade: the readings
 * lookup is capped, an unreachable image falls back to a BUNDLED work, and
 * nothing here ever renders an empty page while it waits (the blank-screen rule
 * this repo keeps).
 *
 * Completion is finishing the deck, the same bar the office keeps — marked on
 * the closing slide, not on arrival. markPracticeDoneToday carries the local
 * flag and the server write, so the card, the dot, the weekly row, the widget
 * and yesterday's ordering all move together.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openExternal, openOfficeReading, preloadExternal } from "@/lib/openExternal";
import { FROST_BLUR } from "@/lib/frost";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { artworkForDay } from "@/lib/visioArtworks";
import { chooseArtwork, artworkById, type Chosen } from "@/lib/visioSelect";
import { getVisioHistory, recordVisioSeen, recordVisioFelt } from "@/lib/visioHistory";
import { useVisioLessons } from "@/hooks/useVisioToday";
import { apiRequest } from "@/lib/queryClient";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/**
 * THE prompt, said BEFORE the picture appears — "as you view the following
 * picture" — so it's an instruction for your eyes, given while there's still
 * nothing to look at. It only asks you to NOTICE: no interpreting, no meaning
 * yet, just what your eye keeps returning to.
 *
 * There used to be a second one ("As you return to the image, consider what
 * God might be speaking to you…"), on its own slide between two picture
 * beats. Owner: "take the second prompt and the second image viewing out."
 * What it asked is what the contemplation beat asks, and that beat asks it
 * with the picture on the screen rather than a slide ahead of it.
 *
 * Owner walked back a mechanics-narrating version of this one too ("First
 * you'll see the picture, with a background behind the work…"): "just going
 * back to the first prompt without talking about the description then the
 * image." The prompt points the eyes; the beat itself shows how the looking
 * happens.
 */
const NOTICE =
  "As you view the following picture, notice anything that is sticking out to you, or grabs your attention.";

/** "1050-1100" is a range, and a range takes an en dash. */
function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1\u2013$2");
}

/**
 * "Lippi, Filippino, -1504" → "Lippi, Filippino, d. 1504".
 *
 * ACT records an unknown birth year as a bare leading dash, which renders as
 * a dangling minus sign under the painting — it reads like a typo rather than
 * like "died 1504". Ranges that HAVE both years are left to tidyDate.
 */
function tidyArtist(a: string): string {
  return tidyDate(a.replace(/(^|[,\s])-\s*(\d{3,4})/g, "$1d. $2"));
}

/** How long we'll wait on today's readings before praying without them. */
const READINGS_CAP_MS = 1500;

export default function VisioPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  // FIXED, not the clock — see useVisioToday. Picking by the hour gave two
  // people on the same day different paintings, and let the home card name a
  // different image from the one this page then opened.
  // Both offices' lessons AND psalms — the shared hook, so the card and the
  // practice can never disagree (see useVisioLessons).
  const { lessons: dayLessons, isFetched } = useVisioLessons();

  /**
   * The closing cards' record, and NOTHING ELSE.
   *
   * `chooseArtwork(ymd, lessons)` does not take this and must never take it.
   * Everyone praying Visio on a given day sees the SAME work (owner: "we want
   * everyone to be viewing the same image who's practicing it"), which holds
   * only while the choice is a pure function of the date and the appointed
   * lessons. A version that subtracted the reader's own history made the image
   * quietly personal, and this comment used to say that was still the case —
   * so anyone tidying up would have wired it back. Read once at mount so this
   * session's own entry can't reorder the cards underneath it.
   */
  const [history] = useState(() => getVisioHistory());
  /**
   * Set when the reader taps something in the closing gallery. From then on
   * the deck shows THAT artwork instead of today's — a way back into a picture
   * they've been carrying, without disturbing which one today's is.
   */
  /**
   * Up to three emoji for what the looking FELT like — optional, wordless, and
   * the same log Audio Divina keeps (owner: "I want emojis back on audio
   * divina and visio divina … and Visio put it on the last line as well").
   * Counted in GRAPHEMES: 🙏🏽 is four UTF-16 units and a family emoji eleven,
   * so a check on `.length` would let one emoji fill the field or halve
   * another. Seeded from what today already carries, so reopening the close
   * shows what was written rather than an empty field.
   */
  const [felt, setFelt] = useState(() => getVisioHistory().find((v) => v.ymd === new Date().toLocaleDateString("en-CA"))?.felt ?? "");
  /** Whether anything has been typed into the emoji log this visit — drives
   *  the "Kept ✓" confirmation under the field. Starts false so a value
   *  restored from an earlier day doesn't claim to have just been saved. */
  const [feltSaved, setFeltSaved] = useState(false);
  const feltCount = (v: string) => (typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(v)].length
    : [...v].length);
  const [overrideId, setOverrideId] = useState<number | null>(null);
  const override = overrideId != null ? artworkById(overrideId) : null;

  /**
   * The choice is made ONCE and then frozen. Re-picking when the readings
   * arrive late would swap the painting out from under someone already looking
   * at it, which is the one thing this practice must not do.
   */
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    if (isFetched) {
      settled.current = true;
      setChosen(chooseArtwork(today, dayLessons));
      return;
    }
    // …and a hard cap, so a hanging request can't hold the practice shut.
    const timer = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setChosen(chooseArtwork(today, []));
    }, READINGS_CAP_MS);
    return () => clearTimeout(timer);
  }, [isFetched, dayLessons, today]);

  /** Whichever artwork the deck is actually showing — today's, or one the
   *  reader tapped back into from the closing gallery. */
  const active: Chosen | null = override
    ? { art: override, ref: override.refs[0] ?? "", followsToday: false }
    : chosen;

  // An unreachable image (offline, or their host having a bad day) falls back
  // to a work bundled in the binary, so the practice still happens.
  const [imageFailed, setImageFailed] = useState(false);
  // The failure belongs to ONE src. Left sticky, a single blip on the
  // catalogue host locked this mount onto the bundled work for good —
  // including a different painting tapped in the closing gallery, which then
  // silently showed the wrong image. Cleared whenever the artwork changes so
  // each src gets its own try. (loadedSrc needs no reset — it's keyed by src.)
  useEffect(() => { setImageFailed(false); }, [active?.art.id]);
  /**
   * Which SOURCE has finished loading — not a bare boolean.
   *
   * A boolean plus "reset it when the src changes" deadlocks on a cached
   * image: the browser has it decoded before React attaches the handler, so
   * `onLoad` never fires, the reset effect puts the flag back to false, and
   * the painting sits at opacity 0 forever. Keyed by src, the flag is simply
   * true for the image that loaded and false for any other — no reset needed,
   * and the ref below covers the cached case where no event is coming.
   */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const bundled = useMemo(() => artworkForDay(today), [today]);

  /**
   * The leaf (owner: "we want the leaf as the background").
   *
   * An earlier pass lit the frame with a blurred copy of the ARTWORK itself.
   * That made every screen look like the painting it happened to be showing —
   * a cream Blake engraving washed the whole deck pale — and it made Visio the
   * one practice that doesn't look like the others. Contemplation, Co-Breathe,
   * the Examen and Simple Guided Prayer all sit on the same still landscape;
   * this belongs with them. Picked once per open, exactly as they do it.
   */
  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  // Remember today's, once it's settled — for the closing cards. It pins
  // nothing: the date does that, since chooseArtwork is pure. Not recorded for
  // an override: re-reading an old picture shouldn't rewrite today.
  useEffect(() => {
    if (!chosen) return;
    try { recordVisioSeen(chosen.art.id, today); } catch { /* non-fatal */ }
  }, [chosen, today]);

  /**
   * The completion cards: what you just looked at, then what you looked at
   * before it. Owner: "cards, like history that shows a thumbnail of the image
   * and the name of the image."
   */
  const cards = useMemo(() => {
    const seen = history
      .map((h) => artworkById(h.id))
      .filter((a): a is NonNullable<typeof a> => !!a);
    const list = active ? [active.art, ...seen.filter((a) => a.id !== active.art.id)] : seen;
    // Five fits the slide without it becoming a scrolling archive; this is a
    // closing beat, not a library.
    return list.slice(0, 5);
  }, [history, active]);
  /** What a given work's day was felt to be, from the device-local history. */
  const feltFor = (artId: number): string => history.find((h) => h.id === artId)?.felt ?? "";

  /**
   * The view model, from whichever source is actually usable.
   *
   * NULL while the choice is still resolving — deliberately. Falling back to
   * the bundled work during that moment meant the practice opened on Rublev's
   * Trinity and then swapped to the day's painting a beat later: a flash of
   * the WRONG image, which is the one thing a looking practice can't do. The
   * bundled artwork is a failure path, not a loading state.
   */
  const view = imageFailed
    ? {
        title: bundled.title,
        artist: bundled.artist,
        date: bundled.date,
        where: bundled.where,
        img: bundled.image,
        scriptureRef: bundled.scriptureRef,
        attribution: bundled.attribution,
        licence: "Public domain",
        // The commentary this artwork links to — LINKED, never reproduced.
        essayUrl: bundled.essayUrl ?? null,
        followsToday: false,
      }
    : active
      ? {
          title: active.art.title,
          artist: active.art.artist ?? "",
          date: active.art.date ?? "",
          where: active.art.where ?? "",
          img: active.art.img,
          scriptureRef: active.ref,
          attribution: active.art.attribution,
          licence: active.art.licence,
          essayUrl: active.art.essay,
          followsToday: active.followsToday,
        }
      : null;

  /**
   * FIVE beats: title · prompt · the picture-with-its-background ·
   * contemplation · completion.
   *
   * Owner: "take the second prompt and the second image viewing out, and just
   * have it go to the third image viewing, which also has the prompt under
   * it."
   *
   * It was seven. Between the first look and the contemplation sat a prompt
   * slide ("as you return to the image…") and then the image again — and the
   * beat after THOSE shows the same image with a prompt under it. So the pair
   * was a prompt-then-picture that the next beat immediately repeated as
   * picture-with-prompt, better, with the words and the work on screen at
   * once. Two taps to arrive somewhere you were already going.
   *
   * What's left: read the prompt, look (guided by the commentary, and held),
   * then look again with the contemplation prompt under the work and pray
   * what rises. Two looks, not three, and neither of them is a slide you page
   * past.
   *
   * NO ESSAY, NO HAND-OFF. Every one of the 229 catalogued works has one, but
   * the bundled fallback may not, and a beat that opens nothing is the trap
   * this deck has already had once. Without an essay the same beat simply
   * shows the picture, on its own, held — see `hasEssay` below. The beat count
   * doesn't change, so neither does the counter.
   *
   * NO SCRIPTURE SLIDE. It has been cut twice now; the passage the artwork
   * depicts is still NAMED — it's the eyebrow over the title on the picture
   * beat — but its text isn't printed here. The office is where you read.
   */
  const TITLE = 0, PROMPT_1 = 1, FIRST_LOOK = 2, CONTEMPLATE = 3, DONE = 4;
  const [step, setStep] = useState(TITLE);
  const TOTAL = 5;
  /**
   * Which beats hold the picture.
   *
   * Owner: "you took out the third view of the image." The contemplation beat
   * asks what God may be putting on your heart THROUGH THE IMAGE — with no
   * image on the screen it was asking about something that wasn't there. It's
   * the third look, and the longest one.
   */
  /**
   * Whether today's work has a reflection to open.
   *
   * `view` is null while the day's artwork resolves, so this is false for a
   * moment on load — which is the safe way round: the first-look beat falls
   * back to being a plain picture beat, and flips to the hand-off once the
   * essay is known. Never the reverse.
   */
  const hasEssay = !!view?.essayUrl;
  /** FIRST_LOOK is the picture — with or without a reflection to open. It used
   *  to be a text slide when there WAS one, which put two slides of
   *  instructions back to back and made the reader tap twice before seeing
   *  anything. The reading is offered under the work instead. */
  const showsImage = step === FIRST_LOOK || step === CONTEMPLATE;

  /**
   * SIT WITH IT — a 12-second hold before each beat will let you move on.
   *
   * Owner: "just as we have an amen time on the prayer request, what if it has
   * them sit with it each time for 12 seconds." Same reasoning prayer-mode's
   * AmenButton was built on, and the same failure it fixes: tappers rip through
   * a deck in a few seconds without pausing on anything. In a LOOKING practice
   * that's the whole practice gone — the one thing you cannot do quickly is
   * look slowly.
   *
   * ONLY where the picture is actually on screen (owner). The prompts are read,
   * not looked at — holding someone on a sentence they finished in two seconds
   * is just a locked door, and it delays the very thing the prompt sent them to
   * do. The three beats that show the image are the ones worth sitting in; the
   * title, the prompts and the close all move when you do.
   */
  const HOLD_MS = 12_000;
  const holdsThisBeat = showsImage;
  const [holdReady, setHoldReady] = useState(false);
  useEffect(() => {
    if (!holdsThisBeat) { setHoldReady(true); return; }
    setHoldReady(false);
    const t = window.setTimeout(() => {
      setHoldReady(true);
      /**
       * The release, felt (owner: "have a haptic when the button is done").
       *
       * MEDIUM, not the amen hold's "light". That one marks the end of a
       * three-second wait you're already watching; this ends twelve seconds
       * spent looking at a picture, which is exactly when your eyes are NOT on
       * the button. A tap you can feel without looking is the whole point of
       * it here, and "light" was too easy to miss.
       */
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [step, holdsThisBeat]);
  /** The beat that is ONLY the picture — where its label belongs. (The
   *  contemplation beat shows the picture too, but carries a prompt under it,
   *  so the title and artist would crowd the words being read.) */
  const isLookingBeat = step === FIRST_LOOK;

  const atEnd = step >= TOTAL - 1;
  const goHome = () => setLocation("/dashboard");
  const next = () => {
    // The Background beat's forward action IS the hand-off — see openBackground.
    if (backgroundOpens) { openBackground(); return; }
    if (!atEnd) { setStep((s) => s + 1); return; }
    // Kept by finishing, not by opening.
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
    goHome();
  };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

  /**
   * Tap and swipe, the same way the office deck pages.
   *
   * Owner: "we need tap and swipe navigation." Lifted from
   * bcp-daily-office's handleTapNavigate / handleSwipeTouchEnd so the two
   * decks answer a gesture identically — tap the left half to go back and the
   * right half forward, swipe left for next and right for back.
   *
   * The CLOSING slide is exempt from both. Its cards are the content: a tap
   * there is meant for a card, and a stray page forward would mark the
   * practice kept and leave the screen — the one gesture in this deck you
   * can't take back. The footer button still does it, deliberately.
   */
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const gestureNav = step !== DONE;
  const onTouchStart = (e: React.TouchEvent) => {
    if (!gestureNav) return;
    touchStartX.current = e.touches[0]!.clientX;
    touchStartY.current = e.touches[0]!.clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const x0 = touchStartX.current, y0 = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (!gestureNav || x0 === null || y0 === null) return;
    const dx = e.changedTouches[0]!.clientX - x0;
    const dy = e.changedTouches[0]!.clientY - y0;
    // Vertical-dominant is a scroll (the picture beats can overflow) — leave it.
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 50) return; // palm tremor
    // FORWARD is subject to the same hold the button is. Gesture nav was added
    // after the twelve-second sit and knew nothing about it, so a swipe — the
    // most natural thing to do in a deck — walked straight past the one beat
    // that asks you to stay. Back is always free.
    if (dx < 0) { if (holdReady) next(); } else prev();
  };
  const onTapNavigate = (e: React.MouseEvent) => {
    if (!gestureNav) return;
    // A tap that lands on a control belongs to the control.
    // `[role="button"]` too, not just <button>: the closing slide's cards are
    // role="button" divs. That slide is exempt from paging today, so this
    // changes nothing now — it removes the trap for whoever enables gestures
    // on a slide with card surfaces later and finds every tap doing two things.
    if ((e.target as HTMLElement | null)?.closest('button, a, input, textarea, select, label, [role="button"]')) return;
    if (e.clientX < window.innerWidth / 2) prev(); else if (holdReady) next();
  };

  /**
   * FIRST_LOOK → the reflection, the way the office opens a lesson.
   *
   * Owner: "include the reflection of the visio as a slide with navigation
   * like in the office", then "a first prompt after the title slide that says
   * background, then goes to the reflection, then the three slide flow", and
   * finally "we can use the reflection as the first image view too" — which
   * is why this beat is now the FIRST LOOK and not a preamble to one.
   *
   * The commentary itself can't BE a slide — it's VCS's writing, their images
   * are licensed from agencies, and their robots.txt excludes AI crawlers, so
   * the app links it and never reproduces it. But the office already solved
   * exactly this for its own lessons: openOfficeReading hands the page to the
   * native browser wearing the office's chrome — top bar, and a floating
   * bottom pill whose Back/Next dismiss it and step the deck underneath. The
   * reading behaves like a slide with navigation because, to the reader, it is
   * one.
   *
   * Which is why this beat's FORWARD action opens the reading rather than
   * paging — the same thing the office's lesson slide does. Coming back
   * through the browser's Next lands you on the second prompt, which sends you
   * to the image again; Back lands you on the first, which offers the
   * reflection again (see the readBackground reset below).
   *
   * Second tap advances instead of re-opening, and a day with no essay shows
   * the picture here instead: a beat you can't leave is the trap this deck
   * already had once.
   */
  const [readBackground, setReadBackground] = useState(false);
  /** True only while OUR hand-off is the thing on screen — see the listener below. */
  const handedOff = useRef(false);
  /**
   * Back out of the reflection, and you're back a slide.
   *
   * Owner: "if you click back on the reflection, let it go to the past slide."
   * The bottom pill's Back already did — it fires phoebe:office-prev-slide and
   * the deck steps. The EDGE SWIPE didn't: in office chrome there is no top-bar
   * close (BibleWebViewController leaves the left item out on purpose), so the
   * swipe is how you leave, and it only fires phoebe:browserfinished. That
   * dropped you back on the beat that had just handed you out — a slide you'd
   * finished with, whose Continue now pages straight past the reflection. The
   * two ways of going back have to mean the same thing.
   *
   * browserfinished is a global event and the native side suppresses it for
   * the pill's Back/Next (`handingOff`), so this fires only for a real dismiss
   * — but it fires for any browser anyone opens, hence the ref.
   */
  useEffect(() => {
    const onFinished = () => {
      if (!handedOff.current) return;
      // Belt and braces: see the step-change reset below for why this can't
      // already be a stale flag from an earlier beat.
      handedOff.current = false;
      setStep((n) => Math.max(0, n - 1));
    };
    window.addEventListener("phoebe:browserfinished", onFinished);
    return () => window.removeEventListener("phoebe:browserfinished", onFinished);
  }, []);
  /**
   * Standing before the hand-off again means it's on offer again.
   *
   * readBackground exists to stop a second tap re-opening the reading instead
   * of advancing. Once you've gone BACK past that beat, though, the next
   * forward tap should hand you off exactly as the first one did — otherwise
   * going back one slide silently deletes the reflection from the practice.
   */
  useEffect(() => { if (step < FIRST_LOOK) setReadBackground(false); }, [step, FIRST_LOOK]);
  /**
   * The hand-off flag belongs to ONE beat.
   *
   * Leaving the reflection doesn't change `step` (that's the whole point of the
   * listener above), so this never fires on the path it protects. It fires when
   * the deck moves on by any other route — and that matters because the closing
   * slide opens VCS too ("Read reflection", openExternal). Without this, a flag
   * left set at beat 3 would still be armed at beat 7, and closing THAT browser
   * would walk the reader backwards out of their own completion screen.
   *
   * Unreachable today: on iOS every exit from the reading already clears it
   * (the pill's Back/Next fire office-prev/next-slide, the edge swipe fires
   * browserfinished), and on web no browserfinished is ever fired at all. It
   * costs one line to stop being one native tweak away from true.
   */
  useEffect(() => { handedOff.current = false; }, [step]);
  useEffect(() => { if (view?.essayUrl) preloadExternal(view.essayUrl); }, [view?.essayUrl]);
  useEffect(() => {
    const onNext = () => { handedOff.current = false; setStep((n) => Math.min(TOTAL - 1, n + 1)); };
    const onPrev = () => { handedOff.current = false; setStep((n) => Math.max(0, n - 1)); };
    window.addEventListener("phoebe:office-next-slide", onNext);
    window.addEventListener("phoebe:office-prev-slide", onPrev);
    return () => {
      window.removeEventListener("phoebe:office-next-slide", onNext);
      window.removeEventListener("phoebe:office-prev-slide", onPrev);
    };
  }, []);
  /** True when this beat's forward action should open the reading, not page. */
  const backgroundOpens = step === FIRST_LOOK && hasEssay && !readBackground;
  const openBackground = () => {
    if (!view?.essayUrl) return;
    setReadBackground(true);
    handedOff.current = true;
    const opened = openOfficeReading(view.essayUrl, {
      officeTitle: t("visio.title", { defaultValue: "Visio Divina" }),
      slideLabel: `${step + 1} of ${TOTAL}`,
      // Deliberately NOT the artwork's title — some run to eighty characters
      // and overflow the web viewer's bottom bar.
      sectionLabel: "",
    });
    // Nothing opened (a blocked popup on web) — don't strand them on a beat
    // whose whole action just failed silently. Step DIRECTLY, never next():
    // backgroundOpens is a render-scoped const that setReadBackground can't
    // change until a re-render, so next() re-enters this function and the
    // pair recurse to stack overflow — window.open on every frame of it.
    if (!opened) setStep((n) => Math.min(TOTAL - 1, n + 1));
  };

  /** Jump back into a picture from the completion cards. */
  const reopen = (id: number) => {
    setOverrideId(id);
    setLoadedSrc(null);
    // The contemplation beat, NOT the first-look beat: coming back to a work
    // you've already prayed with should show it, not hand you straight back
    // out to its commentary. (It was the middle picture beat until that beat
    // was removed; this is the one that still shows the work without the
    // hand-off.)
    setStep(CONTEMPLATE);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Backdrop — the shared treatment: one still landscape held at 0.22
          under the multi-stop dark wash, both on zIndex -1 inside the isolated
          stacking context. ABSOLUTE, never position:fixed (iOS flash — see the
          page-backdrop rule this repo keeps). Falls back to the ambient drift
          when there's no photo. Identical to guided-prayer.tsx / examen.tsx. */}
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
      <style>{`
        @keyframes visio-breathe { 0%,100% { opacity: .5 } 50% { opacity: .85 } }
        /* The hold's own progress wash. Kept in sync with HOLD_MS above — if
           one changes the other must, or the wash finishes before or after the
           button actually enables. Restarts each beat: the element is keyed by
           the step, so it remounts. (No backticks in here — this is inside a
           template literal and one would end it.) */
        @keyframes visio-hold-grow { from { width: 0%; } to { width: 100%; } }
        .visio-hold-fill { width: 0%; animation: visio-hold-grow 12s linear forwards; }
        /* Continue arriving once the hold is up — the same 6px rise the app's
           illuminated titles use (title-glow-fade-in), so the word lands the
           way they do rather than blinking into place. */
        @keyframes visio-cta-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .visio-cta-rise { animation: visio-cta-rise 520ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* (The prompts rise and then hold still — .prompt-rise, in index.css,
           shared with Audio Divina's deck. See its own note there.) */
      `}</style>

      {/* Header — Back / title / close, matching the office's reader chrome. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: step === 0 ? "transparent" : SAGE, fontFamily: FONT, fontSize: 14, cursor: step === 0 ? "default" : "pointer", padding: 6 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {t("visio.title", { defaultValue: "Visio Divina" })}
        </span>
        <button
          type="button"
          onClick={goHome}
          aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onTapNavigate}
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          // The gospel beat fills from the top so the image can hold a fixed
          // band and the text scroll under it; every other beat is centred.
          justifyContent: "center",
          padding: "0 20px", gap: 16,
          overflowY: "auto",
        }}
      >
        {/* Owner: "we also want each slide to fade into each other." A keyed
            fade-IN, deliberately — NOT AnimatePresence mode="wait".
            
            mode="wait" holds the incoming beat until the outgoing one reports
            its exit finished, and framer-motion drives that on
            requestAnimationFrame. In a tab that isn't painting (backgrounded,
            the app in the app-switcher) rAF is suspended, the exit never
            completes, and the deck freezes on the old slide while the footer's
            counter walks on — caught doing exactly that under test. A slide
            that can get stuck is the blank-screen class this repo keeps a rule
            about, and no crossfade is worth it. Remounting on `step` and
            fading the new beat in has no such state to be stuck in.

            The wrapper carries the container's own flex layout (column,
            centred, gap 16) because it now sits between the container and its
            children, and without it every beat's spacing would collapse. */}
        <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.34, ease: "easeOut" }}
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
          >
        {/* The painting, lit from behind by itself.
            Owner: "have it be on a blurred background and there's a drop
            shadow." A blown-up, blurred copy sits underneath and bleeds past
            the frame, so a small image on a dark screen sits in its own light
            instead of floating on black. aria-hidden — it's the same picture,
            and a screen reader should hear about it once. */}
        {/* The painting itself, on the leaf. The drop shadow is what lifts it
            off the scenery — without it a dark artwork dissolves into the
            wash. */}
        {showsImage && view && (
          <img
            src={view.img}
            alt={`${view.title}${view.artist ? ` — ${view.artist}` : ""}`}
            decoding="async"
            // Both paths: the event for a fresh fetch, the ref for one the
            // browser already had.
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedSrc(el.currentSrc || el.src); }}
            onLoad={(e) => setLoadedSrc(e.currentTarget.currentSrc || e.currentTarget.src)}
            onError={() => setImageFailed(true)}
            style={{
              flex: "0 0 auto",
              maxWidth: "100%",
              // Smaller on the contemplation beat so the prompt sits under it
            // rather than below the fold — the picture is what you're praying
            // with there, not the whole screen.
            maxHeight: step === CONTEMPLATE ? "38vh" : "62vh",
              objectFit: "contain", borderRadius: 10,
              boxShadow: "0 26px 74px rgba(0,0,0,0.66), 0 4px 14px rgba(0,0,0,0.45)",
              // Fades in rather than snapping: these load over the network,
              // and a hard pop is the wrong first movement here.
              opacity: loadedSrc === view.img ? 1 : 0,
              transition: "opacity 420ms ease-out",
            }}
          />
        )}

        {/* Resolving. A soft empty frame rather than a spinner: the practice
            opens on stillness, and the first prompt normally covers the wait.
            Every beat that reads from `view` must show SOMETHING while the
            choice settles — a beat that renders nothing is the blank-screen
            class this repo keeps a rule about. */}
        {!view && showsImage && (
          <div
            aria-hidden
            style={{
              width: "min(100%, 320px)", height: "46vh", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "rgba(46,107,64,0.07)",
              animation: "visio-breathe 2600ms ease-in-out infinite",
            }}
          />
        )}

        {/* The picture's identity.
            Owner: "the title of the image should be like how we do canticle
            titles" — so on its own opening slide it is set the way the office
            sets Canticle 8: Space Grotesk, bold, tight tracking, the same
            breathing glow, with the artist and the passage quiet underneath.
            Scaled down from the office's clamp(48px,9vw,56px): "Canticle 8" is
            two words and a painting's title is often eight.

            NO DATE EYEBROW (owner: "take the date above the name out"). The
            artist line already carries the painter's dates, so the work's date
            above the title was a second set of numbers doing nothing.

            On the two looking beats the same facts stay, small — a museum
            label under the picture rather than a headline over it. */}
        {/* …and while the choice is still settling. The title slide is now the
            FIRST thing this practice shows, and `view` is null for up to
            READINGS_CAP_MS while today's lessons resolve — so without this the
            practice opens on an empty screen, which is the blank-screen class
            this repo keeps a rule about. Breathes like the picture frame
            below rather than spinning. */}
        {step === TITLE && !view && (
          <div
            aria-hidden
            style={{
              width: "min(100%, 300px)", height: 92, borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "rgba(46,107,64,0.07)",
              animation: "visio-breathe 2600ms ease-in-out infinite",
            }}
          />
        )}

        {step === TITLE && view && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {/**
              * A THUMBNAIL over the title (owner: "why don't we show a
              * thumbnail of the image on the title page above the title").
              *
              * Small on purpose. The looking beats are where the picture is
              * given its whole screen; here it's the size of a plate in a
              * book — enough to know which painting you're about to sit with,
              * not enough to have already looked at it.
              *
              * It also warms the fetch: by the time the next beat gives it
              * 62vh, the browser has it, so the practice doesn't open on an
              * empty frame.
              */}
            <img
              src={view.img}
              alt=""
              aria-hidden
              decoding="async"
              className="prompt-rise"
              style={{
                width: 132, height: 132, objectFit: "cover", borderRadius: 10,
                boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.4)",
                marginBottom: 4,
              }}
            />
            <h1
              className="prompt-rise"
              style={{ fontFamily: FONT, fontSize: "clamp(30px, 7vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: 0, lineHeight: 1.08 }}
            >
              {view.title}
            </h1>
            <div>
              {view.artist && (
                <p style={{ color: "rgba(200,212,192,0.75)", fontFamily: FONT, fontSize: 15, margin: 0, lineHeight: 1.5 }}>{tidyArtist(view.artist)}</p>
              )}
              {view.scriptureRef && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, margin: "5px 0 0", lineHeight: 1.5 }}>
                  {view.scriptureRef}
                  {view.followsToday ? ` · ${t("visio.follows_today", { defaultValue: "Today's reading" })}` : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {isLookingBeat && view && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0 }}>{view.title}</p>
            {view.artist && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>{tidyArtist(view.artist)}</p>
            )}
            {view.scriptureRef && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "3px 0 0" }}>
                {view.scriptureRef}
                {view.followsToday ? ` · ${t("visio.follows_today", { defaultValue: "Today's reading" })}` : ""}
              </p>
            )}
          </div>
        )}

        {/* (No text slide here any more. It said "The work, and a little about
            it. Stay as long as you like — you'll come back here." directly
            after the prompt that had just said "first you'll see the picture,
            with a background behind the work" — owner: "this is repetitive of
            the slide before it." The beat shows the PICTURE now, with the
            reading offered under it, which is what the prompt promised and
            what the eyebrow already called it.) */}

        {step === PROMPT_1 && (
          <p
            className="prompt-rise"
            style={{ color: WARM, fontFamily: FONT, fontSize: 21, fontWeight: 500, lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}
          >
            {t("visio.prompt_notice", { defaultValue: NOTICE })}
          </p>
        )}

        {/* Sit with it, then pray it. Owner's own words, near enough verbatim:
            "take a moment in contemplation in what God may be putting on your
            heart through the image, and lift what arises in prayer." Set like
            the two prompts — same serif, same italic, same measure — because
            it is the same kind of thing: an instruction for the reader's
            attention, not a caption.

            Owner: the illuminated rise, upright, Space Grotesk — .prompt-rise,
            a 6px rise as it fades in and then nothing. It used the office's
            .title-glow-breathe, whose glow keeps pulsing for as long as the
            beat is on screen; owner: "Visio Divina is still having draw
            animations." A practice about holding your attention on one picture
            can't have the words beside it moving the whole time. */}
        {step === CONTEMPLATE && (
          <p
            className="prompt-rise"
            style={{ color: WARM, fontFamily: FONT, fontSize: 21, fontWeight: 500, lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}
          >
            {t("visio.prompt_contemplate", { defaultValue: "Take a moment in contemplation on what God may be putting on your heart through the image, and lift what arises in prayer." })}
          </p>
        )}

        {/* The completion slide. Frosted cards (owner) — thumbnail and name —
            for what's been looked at lately, tappable to go back in. The
            attribution lives here too, because ACT asks for it and the
            CC-licensed works REQUIRE it. */}
        {step === DONE && (
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 2px", textAlign: "center" }}>
              {t("visio.close_eyebrow", { defaultValue: "Visio Divina complete" })}
            </p>
            {/* (the emoji line sits after these cards — "on the last line") */}
            {cards.map((a) => {
              /**
               * "Read reflection" belongs to TODAY'S card only (owner).
               *
               * The commentary left the practice itself — looking and prayer,
               * with nobody else's reading of the picture in between — but the
               * closing slide is after all of that, which is exactly where
               * somebody else's reading is welcome. On the day's own card, so
               * it reads as more about THIS picture rather than a stray link.
               *
               * Deliberately openExternal, NOT openOfficeReading: the office
               * flavour carries a Back/Next pill that steps the deck it was
               * opened from, and this deck is over — its Next would have
               * nothing to move to and would sit there looking broken.
               */
              /**
               * No reflection → no pill (owner: "if there isn't a reflection
               * just don't show the reflection").
               *
               * A usable reflection is a real http(s) URL, not merely a
               * non-empty string: anything else can only open the in-app
               * browser onto nothing, which is how a reflection presented as a
               * blank white page with a Back button. (A link that's well
               * formed but unreachable is the browser's problem now — it shows
               * what went wrong and offers Safari, rather than blankness.)
               */
              const hasReflection = (() => {
                if (!a.essay) return false;
                try { return /^https?:$/.test(new URL(a.essay).protocol); } catch { return false; }
              })();
              const isToday = !!active && a.id === active.art.id && hasReflection;
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => reopen(a.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reopen(a.id); } }}
                  style={{
                    userSelect: "none", WebkitTapHighlightColor: "transparent",
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: 10, borderRadius: 14, cursor: "pointer", textAlign: "left",
                    // Frosted (owner).
                    background: "rgba(240,237,230,0.06)",
                    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <img
                    src={a.img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15.5, fontStyle: "italic", lineHeight: 1.3 }}>{a.title}</span>
                    <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                      {[tidyArtist(a.artist ?? ""), tidyDate(a.date ?? "")].filter(Boolean).join(" · ")}
                      {/* What that day felt like, if they said — a colour on
                          the line, not a fact of its own (as Audio Divina's
                          entries do it). */}
                      {feltFor(a.id) ? <span style={{ marginLeft: 6 }} aria-label="what you felt">{feltFor(a.id)}</span> : null}
                    </span>
                  </span>
                  {isToday && (
                    <button
                      type="button"
                      // The card underneath reopens the picture; without this
                      // the pill would do both at once.
                      // reader: the article chrome — one button, no Options,
                      // no title. back: that button says "Back", because this
                      // is a page you step into and out of, not a reading you
                      // finish. Nothing else on the bar; the page IS the UI.
                      onClick={(e) => { e.stopPropagation(); openExternal(a.essay, { reader: true, back: true }); }}
                      style={{
                        flex: "0 0 auto", userSelect: "none", WebkitTapHighlightColor: "transparent",
                        background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)",
                        color: WARM, borderRadius: 999, padding: "8px 12px",
                        fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer", lineHeight: 1.2,
                      }}
                    >
                      {t("visio.read_reflection", { defaultValue: "Read reflection" })}
                    </button>
                  )}
                </div>
              );
            })}
            {/* THE LAST LINE (owner): the same optional three-emoji log Audio
                Divina keeps, for what the looking felt like. Written straight
                to the day's history entry as they type — the deck's Done tap
                leaves for home, and a log you have to remember to save is a
                log that gets lost. */}
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: "10px 0 6px", textAlign: "center" }}>
              {t("visio.felt_label", { defaultValue: "What did you feel?" })}{" "}
              <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>
                {t("visio.felt_hint", { defaultValue: "— optional, up to three emoji" })}
              </span>
            </p>
            <input
              value={felt}
              onChange={(e) => {
                const v = e.target.value;
                // Deletion is never blocked; only growth is capped.
                if (feltCount(v) <= 3 || v.length < felt.length) {
                  setFelt(v);
                  try { recordVisioFelt(today, v); } catch { /* non-fatal */ }
                  setFeltSaved(true);
                }
              }}
              inputMode="text"
              placeholder="🕊️ 🌊 🙏🏽"
              aria-label="Up to three emoji for what you felt"
              style={{
                width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 22,
                padding: "12px 16px", borderRadius: 14, outline: "none",
                background: "rgba(240,237,230,0.06)", color: WARM,
                backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                border: `1px solid ${BORDER}`, fontFamily: FONT,
              }}
            />
            {/**
              * "Kept" — because there is no Log button and there shouldn't be.
              *
              * Owner: "on the emoji log there's no log button, it's just the
              * field." True, and deliberate: the entry is written to the day's
              * history on each keystroke, since the Done tap leaves for home
              * and a log you have to remember to save is a log that gets lost.
              *
              * But a field that saves invisibly is indistinguishable from a
              * field that does nothing, which is what the report is really
              * about. So it says so, quietly, once something has been typed —
              * confirmation instead of a button that would only re-do what has
              * already happened.
              */}
            {feltSaved && felt.trim() !== "" && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, margin: "6px 0 0", textAlign: "center" }}>
                {t("visio.felt_saved", { defaultValue: "Kept ✓" })}
              </p>
            )}
            {view && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "6px 0 0", textAlign: "center" }}>
                {view.attribution}
                {view.where ? ` ${view.where}.` : ""}
                {view.licence ? ` ${view.licence}.` : ""}
              </p>
            )}
          </div>
        )}
          </motion.div>
      </div>

      <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/**
          * "Pause before continuing" (owner: "above the bar that loads for
          * twelve seconds, have it say pause before continuing").
          *
          * The pill goes deliberately WORDLESS while the wash fills — a label
          * for an action the button will refuse reads as broken. But wordless
          * also says nothing about WHY it won't move, and a filling bar with
          * no explanation reads as loading, which invites you to wait on the
          * app rather than to look at the picture. One line above it names
          * what the wait is for. It's the only text on the beat besides the
          * work's own, so it sits in the caption size and colour, not the
          * prompt's — an instruction about the deck, not part of the prayer.
          *
          * Only while the hold is actually running: once Continue arrives the
          * line has nothing left to explain, and leaving it there would ask
          * for a pause that is already over.
          */}
        {holdsThisBeat && !holdReady && (
          <p
            aria-hidden
            style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.02em", margin: "0 0 2px", textAlign: "center" }}
          >
            {t("visio.hold_hint", { defaultValue: "Pause before continuing" })}
          </p>
        )}
        <button
          type="button"
          // Inert until the hold is up, rather than disabled: a `disabled`
          // button is dropped from the accessibility tree and can't announce
          // WHY it isn't working. This one stays focusable and says so.
          onClick={() => { if (holdReady) next(); }}
          aria-disabled={!holdReady}
          aria-label={holdReady ? undefined : t("visio.hold_aria", { defaultValue: "Stay with this a moment longer" })}
          // Frosted, like every other CTA in the app (lib/frost) — this one
          // was a flat green panel sitting on a photo backdrop that every
          // surface around it lets through.
          style={{ position: "relative", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420, background: "rgba(46,107,64,0.55)", ...FROST_BLUR, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: holdReady ? "pointer" : "default", opacity: holdReady ? 1 : 0.72, transition: "opacity 420ms ease-out" }}
        >
          {/* The wash filling under the label while the hold runs — the same
              language prayer-mode's amen hold uses, so "wait with this" looks
              the same wherever the app asks for it. Keyed by the step so it
              restarts on every beat. */}
          {!holdReady && (
            <span
              key={step}
              aria-hidden
              className="visio-hold-fill"
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: "rgba(168,197,160,0.16)", pointerEvents: "none" }}
            />
          )}
          <span
            key={`${step}-${holdReady}`}
            className={holdsThisBeat && holdReady ? "visio-cta-rise" : undefined}
            // A BLOCK with a reserved line box, because this span renders
            // nothing at all while the hold runs (owner: "the height of the
            // progress bar shouldn't be shorter when it is loading"). Empty,
            // an inline span has no line box, so the button collapsed to its
            // padding and then jumped taller the moment the word arrived —
            // the filling pill changing size under your eyes on the one beat
            // that's asking you to hold still. minHeight only applies to a
            // block, so it's a block; the button still centres it.
            style={{ position: "relative", display: "block", minHeight: 20, lineHeight: "20px" }}
          >
            {/* NOTHING while the hold runs, and Continue RISES when it's time
                (owner). A button labelled for an action it will refuse reads as
                broken, and a substitute label ("Stay with it") is still a word
                asking to be read on a beat whose whole job is looking. So: an
                empty pill with its wash filling, then the word arrives — the
                same 6px rise the app's illuminated titles use, which is what
                makes it read as arriving rather than appearing. */}
            {!holdReady
              ? null
              // The button that opens the reading says the SAME thing wherever
              // it appears. It said "Look and read" here and "Read reflection"
              // on the closing card — one destination under two names, which
              // is how a reader ends up unsure whether they're two different
              // things (owner, comparing the two: "why is there
              // inconsistency"). One phrase, one key.
              : backgroundOpens
                ? `${t("visio.read_reflection", { defaultValue: "Read reflection" })} \u2192`
              : step === TITLE
                ? t("common.begin", { defaultValue: "Begin" })
                // Audit: the closing slide's button doesn't continue anything —
                // it marks the practice kept and leaves. Saying "Continue"
                // there described the one tap in this deck that isn't one.
                : step === DONE
                  ? t("common.done", { defaultValue: "Done" })
                  : t("common.continue", { defaultValue: "Continue" })}
          </span>
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
