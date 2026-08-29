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
import { chooseArtwork, artworkById, alternatesForDay, readingUrl, type Chosen } from "@/lib/visioSelect";
import { isActHidden } from "@/lib/actOverrides";
import { VisioHowToIntro, visioHowtoSeen, markVisioHowtoSeen } from "@/components/VisioHowToIntro";
import { getVisioHistory, recordVisioSeen } from "@/lib/visioHistory";
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

/**
 * A work swapped in through More options, remembered for the rest of its week.
 * `{ sunday: "YYYY-MM-DD", id }` — the Sunday both scopes and expires it.
 */
const WEEK_PICK_KEY = "phoebe:visio-week-pick";

/** How long we'll wait on today's readings before praying without them. */
const READINGS_CAP_MS = 1500;

/**
 * One of today's other works, as a card.
 *
 * Deliberately a PLATE, not a poster: a small square, the title, the hand that
 * made it, and the passage it answers. Enough to choose by, not enough to have
 * already looked at — the looking belongs to the beats after this, on a full
 * screen, and a card big enough to pray with would spend the picture here.
 */
function OptionCard({
  pick, active, badge, onPick,
}: {
  pick: Chosen;
  active: boolean;
  badge?: string;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const label = badge
    // "This week's", not "Today's" — the image turns over on a Sunday.
    ?? (pick.followsToday ? t("visio.follows_today", { defaultValue: "This week's reading" }) : "");
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active || undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        padding: 10, borderRadius: 12, cursor: "pointer",
        background: active ? "rgba(46,107,64,0.42)" : "rgba(240,237,230,0.05)",
        border: `1px solid ${active ? "rgba(143,175,150,0.55)" : BORDER}`,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* NO THUMBNAIL — the same rule as the title slide (owner: "not even
          showing the image"). These are the VCS's licensed artworks; the cards
          name them and the page they open is where the licences hold. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15, fontStyle: "italic", lineHeight: 1.3 }}>
          {pick.art.title}
        </span>
        <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>
          {[tidyArtist(pick.art.artist ?? ""), pick.ref].filter(Boolean).join(" · ")}
          {label ? ` · ${label}` : ""}
        </span>
      </span>
    </button>
  );
}

export default function VisioPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  /**
   * The Sunday this week is walking TOWARD — the key a chosen work is
   * remembered under. Mirrors sundayEnding() in build-visio-week-schedule.mjs,
   * which is what decides the week's picture in the first place, so the two
   * can't disagree about where a week ends. Monday to Sunday (owner), so a
   * Sunday belongs to the week it closes and maps to itself.
   */
  const weekSunday = useMemo(() => {
    try {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
      return d.toLocaleDateString("en-CA");
    } catch { return today; }
  }, [today]);
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
   * Set when the reader taps something in the closing gallery, or picks one of
   * today's other options. From then on the deck shows THAT artwork instead of
   * today's — a way into a different picture without disturbing which one
   * today's is.
   *
   * The whole pick, not just an id: an alternate knows the passage it matched
   * and whether that passage is appointed today, and throwing that away to
   * re-derive `refs[0]` would mislabel a work that genuinely does follow
   * today's reading.
   */
  const [override, setOverride] = useState<Chosen | null>(null);
  /**
   * Restore this week's swap, if there is one.
   *
   * Runs once, and only accepts a record stamped with THIS week's Sunday — a
   * stale one is dropped rather than migrated, because a work chosen against
   * last week's readings has nothing to do with this week's. `artworkById`
   * unions both catalogues, so a work chosen before the pool changed still
   * resolves; one that no longer exists (a harvest dropped it, or it was
   * deleted in the admin tool) simply falls through to the week's own picture.
   */
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(WEEK_PICK_KEY); } catch { return; }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { sunday?: string; id?: number };
      if (saved?.sunday !== weekSunday || typeof saved?.id !== "number") {
        try { localStorage.removeItem(WEEK_PICK_KEY); } catch { /* ignore */ }
        return;
      }
      const art = artworkById(saved.id);
      if (!art || isActHidden(art.id)) return;
      setOverride({ art, ref: art.refs[0] ?? "", followsToday: false });
    } catch { /* malformed — ignore, the week's own picture stands */ }
  }, [weekSunday]);

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
  const active: Chosen | null = override ?? chosen;

  /**
   * TODAY'S OTHER OPTIONS (owner: "under the visio for the day, have a button
   * that says more options, and for each day have three others displayed as
   * cards … if they chose it they would go through it with that image").
   *
   * The three works that came closest to winning today, by the same tiered
   * rules — see alternatesForDay. Derived from the date and the appointed
   * lessons ONLY, so the options are the same for everyone praying today, like
   * the day's own picture. Computed against TODAY's work, never the active
   * one, so switching doesn't reshuffle the sheet underneath the reader.
   */
  // Keyed on the PASSAGE this week's image answers, not the day's lessons —
  // otherwise the options wander off to whatever else the day happens to
  // appoint, which is what put three Holy Week paintings beside a Psalm 137
  // image in August. `chosen.ref` is the week's passage, so the alternates are
  // other treatments of the same thing.
  const alternates = useMemo(
    () => (chosen ? alternatesForDay(today, chosen.ref, chosen.art.id) : []),
    [today, chosen],
  );
  /**
   * OPEN by default (owner, with the expanded slide: "have it just be like
   * this by default, showing all the options"). The earlier closed-default
   * reasoning — the day's picture is THE picture — holds in the cards' own
   * ORDER (today's work still leads the slide); a tap can still fold them.
   */
  const [optionsOpen, setOptionsOpen] = useState(true);
  /**
   * Pick one of today's other works and pray the whole deck with it.
   *
   * REMEMBERED FOR THE WEEK. The picture is chosen per week now, and the
   * tutorial says so in as many words — "the same picture waits for you every
   * day until Sunday". A swap that lived only in component state broke that
   * promise for exactly the people who had made a choice: they came back the
   * next day to the work they'd swapped away from. So the choice is stored
   * against the week's Sunday, and expires with it — a new week is a new
   * picture, and picking a work in July doesn't follow you into August.
   */
  const chooseAlternate = (pick: Chosen | null) => {
    // null = back to today's own picture, and forget the swap.
    try {
      if (pick) localStorage.setItem(WEEK_PICK_KEY, JSON.stringify({ sunday: weekSunday, id: pick.art.id }));
      else localStorage.removeItem(WEEK_PICK_KEY);
    } catch { /* private mode — the swap just won't outlive the visit */ }
    setOverride(pick);
    setLoadedSrc(null);
    setImageFailed(false);
    setOptionsOpen(false);
  };

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
        // The bundled fallback is a single hard-coded work, not an ACT record,
        // so it carries none of ACT's tags.
        people: [] as string[],
        subjects: [] as string[],
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
          /** ACT's own "people" tags — who the work depicts. Shown so the
           *  detail names the figures rather than leaving the looker to
           *  guess (owner). Searchable metadata in the admin tool already;
           *  this simply surfaces the same field in the practice. */
          people: active.art.people ?? [],
          /** ACT's subject tags — what the work is OF, beside who is in it. */
          subjects: active.art.subjects ?? [],
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
  /**
   * THE TWO HAND-OFFS, AND THEIR ORDER: look → passage → commentary.
   *
   * Owner: "can we also include the reading ... whatever the passage is that
   * the commentary is referring to", then, on the order, "do look → passage →
   * commentary → contemplate."
   *
   * It shipped the other way round for one commit, and that was wrong:
   * scripture reached the reader AFTER a scholar's reading of it, so someone
   * met an argument about Psalm 137 before they met Psalm 137. Interpretation
   * has to follow the text it interprets.
   *
   * The looking still comes first. The whole deck rests on it — the twelve
   * second hold exists to stop the picture being skimmed, and the reference
   * is already named on the title slide, so you arrive knowing WHAT this is
   * about without having been told what to find in it. Reading the passage
   * first would turn the first look into checking the picture against a text.
   *
   * Neither beat prints anything. Both hand off: openOfficeReading gives the
   * page the office's chrome and Phoebe's reader view restyles it — oremus
   * for the passage, VCS for the commentary. That is the ONLY way scripture
   * appears in this practice. The rule at the top of this file stands; the
   * slide that was cut twice PRINTED the passage, these beats open it.
   */
  /**
   * TWO BEATS: the title, then done.
   *
   * Owner: "that UX is not the recent one asked for. It is just supposed to be
   * the title page, not even showing the image, then opening the visual
   * commentary. Then just like this is a newsletter, we're just curating what
   * we're showing and then going home and completing."
   *
   * So Phoebe curates and hands over. The title names the work and the passage,
   * the CTA opens the Visual Commentary in the reader, and coming back
   * completes the practice. The looking beats are gone with the image itself.
   *
   * WHY NO IMAGE, which is the part that reads as a loss and isn't: the
   * artworks are licensed to the VCS by Alamy, Art Resource, bpk and DeA — 32
   * of 52 sampled captions carry an agency line, and their own terms grant
   * reproduction "for this project". Showing them here would be republishing
   * someone else's licensed material. Sending the reader to the page where
   * those licences hold costs us nothing and opens the WHOLE library rather
   * than the sliver we have rights to.
   */
  /**
   * ONE BEAT. Owner: "we dont need the visio divina complete page."
   *
   * The deck was title → commentary → a closing card. That card existed to
   * confirm the practice was kept and offer somewhere to go next, but the
   * commentary IS the practice now: you read it on the VCS's own page and
   * you are finished. A completion screen you meet on the way BACK from
   * somewhere else is a room with nothing in it.
   *
   * So the title slide's forward action opens the commentary, marks the day
   * kept, and returns to the rhythm. DONE is kept as a constant only because
   * the deck's clamp arithmetic reads it; nothing renders it.
   */
  /**
   * BACK TO A SLIDESHOW, one image for the whole week.
   *
   * Owner: "a slideshow where first you see the image, then you read the text
   * for Sunday, then you see the image again. And then if there is a
   * commentary, if there happens to be one, have that last slide do a
   * completion slide … one image for the whole week and no options on the
   * front screen."
   *
   * So: LOOK, then the Sunday's reading, then LOOK again — the second look is
   * the point of the shape, because you see differently once you know what the
   * passage says. Then the closing slide, which carries the commentary link
   * when the work has one. It no longer REQUIRES one: the pool was reopened to
   * works without commentaries, which is what took Sunday coverage from a
   * commentary-only 241 works to 553.
   */
  const TITLE = 0, LOOK = 1, READING = 2, LOOK_AGAIN = 3, DONE = 4;
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
  /**
   * The passage this work — and the reflection written about it — is about.
   *
   * `view.scriptureRef` is the reference the pick was made ON, so it is by construction
   * the passage the commentary is discussing. readingUrl turns ACT's spelling
   * of it into an address oremus answers (it writes some books back-to-front,
   * "Kings I, 19:1-18"). Null when there is no parseable reference, and then
   * the beat is simply another held look — the same way a work with no essay
   * makes the first-look beat a plain picture beat rather than changing the
   * beat count.
   */
  const passageUrl = useMemo(() => (view?.scriptureRef ? readingUrl(view.scriptureRef) : null), [view?.scriptureRef]);
  const hasReading = !!passageUrl;
  /** FIRST_LOOK is the picture — with or without a passage to open off it. It
   *  used to be a text slide when there WAS one, which put two slides of
   *  instructions back to back and made the reader tap twice before seeing
   *  anything. The reading is offered under the work instead. */
  // The image is never shown in-app now — see the note on the two beats.
  const showsImage = step === LOOK || step === LOOK_AGAIN;

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
  /**
   * NOT on the reflection beat. The two hand-off beats sit back to back, and a
   * second twelve-second lock between them would be twenty-four seconds of
   * waiting to reach a page the reader has already decided to read — a locked
   * door, which is the exact thing the comment above rules out. The hold
   * belongs to the beats that ask you to LOOK.
   */
  const holdsThisBeat = false;
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
  const isLookingBeat = false;

  const atEnd = step >= TOTAL - 1;
  const goHome = () => setLocation("/dashboard");
  const next = () => {
    // The middle beat hands off to the Sunday's reading rather than paging;
    // coming back lands on the second look, which is the point of the shape.
    if (readingOpens) { openReading(); return; }
    /**
     * THE LAST SCREEN FINISHES. It does not open the commentary.
     *
     * Owner: "it shouldn't inherently go to the reflection … from the last
     * screen, if they close it … that should just be an option, and it should
     * just be finished as, like, CTA on the last screen."
     *
     * The primary button used to become "Read reflection" whenever today's
     * work had one, so the one obvious way off the closing slide was OUT of
     * the app and into somebody else's reading of the picture. The commentary
     * is still right there — it is a pill on today's card, a few lines below
     * — but it is now a thing you may choose rather than the thing the deck
     * does to you. The button says Finished and finishes.
     */
    if (!atEnd) { setStep((s) => s + 1); return; }
    // Kept by finishing, not by opening.
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
    goHome();
  };
  // Clamp INSIDE the updater, not against the render-scoped `step`. Two Back
  // taps landing in the same render both read the same stale value, both pass
  // `step > 0`, and both decrement — step -1, a beat nothing renders for, and
  // "0 / 5" in the counter. Caught by double-tapping while testing More
  // options. The other two back paths (556, 589) already clamp this way.
  const prev = () => setStep((s) => Math.max(0, s - 1));

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
   * The commentary, the way the office opens a lesson.
   *
   * It hangs off the REFLECTION beat now, not the first look — the passage
   * goes between them (see the beat constants). The mechanism is unchanged;
   * only which beat calls it.
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
   * through the browser's Next lands you on the beat after, which sends you
   * to the image again.
   *
   * Second tap advances instead of re-opening, and a day with no passage
   * shows a plain reading beat instead: a beat you can't leave is the trap
   * this deck already had once.
   */
  const [readPassage, setReadPassage] = useState(false);
  /**
   * The first-run tutorial (owner: "the first time someone does [Visio] ... a
   * slide tutorial in a similar UI to the creation prayer tutorial"), and the
   * pill on this deck's own front slide that reopens it ("and then have that
   * tutorial available on the front page") — the same pair Co-Breathe has.
   *
   * Read ONCE, into state, rather than checked at render: marking it seen must
   * not re-run the gate mid-practice.
   */
  const [showHowto, setShowHowto] = useState<boolean>(() => !visioHowtoSeen());
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
  /* (The reset for the commentary's one-shot flag lived here. It went with
     the auto-open: the closing slide no longer hands anyone off, so there is
     no "already opened" state to clear on the way back.) */
  useEffect(() => { if (step < READING) setReadPassage(false); }, [step, READING]);
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
  /**
   * KEPT ON REACHING THE CLOSING SLIDE, not on leaving it.
   *
   * The closing slide now carries the commentary link, so a reader can arrive,
   * tap through to the VCS and never come back to the app — and a practice
   * marked only by the Done button would go unrecorded for exactly the people
   * who read the most.
   */
  useEffect(() => {
    if (step !== DONE) return;
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
  }, [step, DONE]);
  useEffect(() => { if (view?.essayUrl) preloadExternal(view.essayUrl); }, [view?.essayUrl]);
  useEffect(() => { if (passageUrl) preloadExternal(passageUrl); }, [passageUrl]);
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
  /* (`backgroundOpens` and `openBackground` lived here and are gone with the
     auto-open — see next(). The commentary is still offered on the closing
     slide, as a pill on today's card, which opens it directly; nothing about
     the deck's forward button touches it any more.) */
  /** The middle beat: the Sunday's own reading, between the two looks. */
  const readingOpens = step === READING && hasReading && !readPassage;
  /**
   * The passage itself, in the reader — the same hand-off as the reflection.
   *
   * openOfficeReading, NOT openExternal: this is a reading inside a practice,
   * and it should behave like one — the office's top bar, the floating
   * Back/Next pill that steps the deck underneath, and Phoebe's reader view
   * over oremus's own page. Coming back through Next lands on the
   * contemplation beat, which is where the looking resumes.
   */
  const openReading = () => {
    if (!passageUrl) return;
    setReadPassage(true);
    handedOff.current = true;
    const opened = openOfficeReading(passageUrl, {
      officeTitle: t("visio.title", { defaultValue: "Visio Divina" }),
      slideLabel: `${step + 1} of ${TOTAL}`,
      sectionLabel: "",
    });
    // Nothing opened (a blocked popup on web) — step DIRECTLY rather than
    // through next(), for the same reason openBackground does: readingOpens is
    // render-scoped, so next() would re-enter this function and recurse.
    if (!opened) setStep((n) => Math.min(TOTAL - 1, n + 1));
  };

  /** Jump back into a picture from the completion cards. */
  const reopen = (id: number) => {
    const art = artworkById(id);
    if (!art) return;
    // A work reopened from the gallery is not being claimed as today's.
    setOverride({ art, ref: art.refs[0] ?? "", followsToday: false });
    setLoadedSrc(null);
    // The contemplation beat, NOT the first-look beat: coming back to a work
    // you've already prayed with should show it, not hand you straight back
    // out to its commentary. (It was the middle picture beat until that beat
    // was removed; this is the one that still shows the work without the
    // hand-off.)
    setStep(TITLE);
  };

  /**
   * The tutorial sits IN FRONT of the deck, not inside it — the deck's beat
   * count, its holds and its hand-offs all stay exactly as they are, and
   * dismissing this returns to a practice that hasn't started yet. Rendered
   * before the deck rather than over it so the twelve-second hold on the first
   * looking beat isn't quietly running behind a tutorial nobody has finished
   * reading.
   */
  if (showHowto) {
    return (
      <VisioHowToIntro
        photos={LEAF_PHOTOS}
        onDone={() => { markVisioHowtoSeen(); setShowHowto(false); }}
      />
    );
  }

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
            /**
             * Record the src WE ASKED FOR, never the browser's `currentSrc`.
             *
             * `currentSrc` comes back RESOLVED and percent-encoded, so any URL
             * containing a space, an apostrophe or a non-ASCII character never
             * equalled `view.img` again and the gate below held the painting at
             * opacity 0 for good. 136 of the 317 works in the catalogue have
             * exactly such a filename ("Peter's Vision-Frank Wesley.jpg",
             * "Miraculous Catch MAFA.jpg"), so roughly two days in five opened
             * on a blank frame with the title and the artist underneath it —
             * reported as "the picture was not showing". The image had loaded
             * fine; nothing was ever wrong with the fetch.
             *
             * Comparing the string we handed the element sidesteps URL
             * normalisation entirely, and still keys the flag by src, which is
             * what stops a cached image from deadlocking at 0 (see above).
             *
             * Both paths stay: the event for a fresh fetch, the ref for one the
             * browser already had decoded before React attached the handler.
             */
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedSrc(view.img); }}
            onLoad={() => setLoadedSrc(view.img)}
            onError={() => setImageFailed(true)}
            style={{
              flex: "0 0 auto",
              maxWidth: "100%",
              // Smaller on the contemplation beat so the prompt sits under it
            // rather than below the fold — the picture is what you're praying
            // with there, not the whole screen.
            maxHeight: "62vh",
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
            {/* NO THUMBNAIL. Owner: "not even showing the image." The
                artworks are the VCS's licensed material, not ours to
                reproduce — the practice names the work and hands over to the
                page where those licences hold. */}
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
              {/**
                * THE VERSE ONLY WHEN IT IS ACTUALLY THIS WEEK'S.
                *
                * Owner: "If it is not actually the passage from this week,
                * dont have it say the verse."
                *
                * followsToday is true only when the work depicts a reading
                * appointed for the Sunday this week closes on. When it is
                * false the work is a same-book match or a stand-in, and
                * printing its reference invites the reader to believe the
                * lectionary sent them there. Better to name the work and say
                * nothing about the passage than to name a passage nobody is
                * reading.
                */}
              {view.scriptureRef && view.followsToday && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, margin: "5px 0 0", lineHeight: 1.5 }}>
                  {view.scriptureRef}
                  {` · ${t("visio.follows_today", { defaultValue: "This week's reading" })}`}
                </p>
              )}

            </div>
            {/**
              * THE PROMPT TO NOTICE, before anything is looked at.
              *
              * Owner: "it's supposed to first show the prompt to notice
              * something, then show the image." The opening slide named the
              * work and its painter and then said Begin, which tells you what
              * you are about to see but not what to DO with it — and this is a
              * practice whose whole content is an instruction about attention.
              *
              * It sits under the work's identity rather than above it because
              * the title is what the slide IS; this is what the slide asks.
              */}
            <p
              className="prompt-rise"
              style={{ color: "rgba(200,212,192,0.86)", fontFamily: FONT, fontSize: 16.5, lineHeight: 1.6, margin: "4px 0 0", maxWidth: 430 }}
            >
              {t("visio.notice_prompt", {
                defaultValue: "In a moment you will see this work. Let your eyes rest where they are drawn, and notice what you notice — there is nothing to solve here.",
              })}
            </p>

            {/**
              * TUTORIAL — owner: "and then have that tutorial available on the
              * front page." This slide is the practice's front page, and the
              * pill is where Co-Breathe puts its own ("Tutorial" on the sync
              * screen), so someone who wants the explanation back knows where
              * to look without it being in the way of someone who doesn't.
              *
              * Quiet on purpose: a frosted outline, not a filled button. The
              * one thing this slide should be asking for is Begin.
              */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowHowto(true); }}
              className="rounded-full transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                padding: "7px 16px", background: "rgba(9,26,16,0.42)",
                backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                border: "1px solid rgba(168,197,160,0.34)", color: FAINT,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t("visio.tutorial_pill", { defaultValue: "How this works" })}
            </button>

            {/* NO "MORE OPTIONS". Owner: "we dont want aditional options."
                The practice is a parish looking at the SAME image for the
                week; a chooser on the opening slide turned that into a menu,
                and the week's picture stopped being the week's picture. The
                alternates machinery (alternatesForDay) is still there and
                still used by the closing cards. */}
          </div>
        )}

        {isLookingBeat && view && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0 }}>{view.title}</p>
            {view.artist && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>{tidyArtist(view.artist)}</p>
            )}
            {/* Who the work depicts, in ACT's own words — on the beat where the
                picture is FIRST shown, not over the title (owner). It belongs
                with the looking: a museum label names the figures beside the
                painting, not on the door. */}
            {view.people.length > 0 && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "3px 0 0", lineHeight: 1.5 }}>
                {view.people.join(" · ")}
              </p>
            )}
            {/* …and what it is OF. Kept as its own line rather than folded in
                with the figures: ACT holds them as separate tags, and running
                them together would read as one list of names. */}
            {view.subjects.length > 0 && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "3px 0 0", lineHeight: 1.5 }}>
                {view.subjects.join(" · ")}
              </p>
            )}
            {/* Same rule as the title slide — a reference only when the work
                really is this week's reading. Missed on the first pass, which
                is why an audit exists. */}
            {view.scriptureRef && view.followsToday && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "3px 0 0" }}>
                {view.scriptureRef}
                {` · ${t("visio.follows_today", { defaultValue: "This week's reading" })}`}
              </p>
            )}
          </div>
        )}

        {/**
          * THE READING BEAT — which rendered NOTHING until now.
          *
          * Owner, walking the practice: "then for some reason, there's a
          * blank page, and then it's supposed to show the script you're
          * reading in the flow." Reproduced in the simulator: slide 3 of 5
          * was an empty stage with only the "Read the passage" button at the
          * bottom.
          *
          * The cause was structural rather than a race — the stage had
          * branches for TITLE, for the two looking beats (`showsImage`) and
          * for DONE, and none at all for READING, so this beat had nothing to
          * draw by construction. It is the third of five and the hinge of the
          * whole shape (look, read, look again), so an empty screen there
          * reads as the practice having broken exactly where it asks the most
          * of you.
          *
          * What it says is deliberately short: the passage's name, and what
          * the next tap does. The reading itself belongs to the reader we
          * hand off to, not to a paraphrase here.
          */}
        {step === READING && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 460 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.reading_eyebrow", { defaultValue: "The reading" })}
            </p>
            {hasReading && view?.scriptureRef ? (
              <h2
                className="prompt-rise"
                style={{ fontFamily: FONT, fontSize: "clamp(26px, 6.5vw, 34px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: 0, lineHeight: 1.12 }}
              >
                {view.scriptureRef}
              </h2>
            ) : null}
            <p style={{ color: "rgba(200,212,192,0.82)", fontFamily: FONT, fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>
              {hasReading
                ? t("visio.reading_body", { defaultValue: "Read it slowly, then come back and look again. You will see the picture differently once you know what the passage says." })
                : t("visio.reading_none", { defaultValue: "No passage is appointed for this work today. Stay with it a little longer, then look again." })}
            </p>
          </div>
        )}

        

        {/**
          * THE PROMPT, UNDER THE PICTURE, on the way back.
          *
          * Owner: "then it's gonna go back to the image with the prompt
          * underneath." This is the third look and the longest one — the
          * picture is on screen above these words, which is the whole reason
          * they sit UNDER it rather than on a slide of their own: the beat
          * asks what God may be putting on your heart through the image, and
          * with no image on the screen it was asking about something that
          * wasn't there.
          *
          * Owner's own words, near enough verbatim: "take a moment in
          * contemplation in what God may be putting on your heart through the
          * image, and lift what arises in prayer."
          *
          * .prompt-rise, a 6px rise as it fades in and then nothing — NOT the
          * office's .title-glow-breathe, whose glow keeps pulsing for as long
          * as the beat is on screen (owner: "Visio Divina is still having
          * draw animations"). A practice about holding your attention on one
          * picture cannot have the words beside it moving the whole time.
          */}
        {step === LOOK_AGAIN && view && (
          <p
            className="prompt-rise"
            style={{
              color: WARM, fontFamily: FONT, fontSize: 17, lineHeight: 1.62,
              margin: "16px 0 0", maxWidth: 460, textAlign: "center",
            }}
          >
            {t("visio.contemplation_prompt", {
              defaultValue: "Take a moment with what God may be putting on your heart through this image, and lift what arises in prayer.",
            })}
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
              // In deck order: the passage off the first look, the reflection
              // off the beat after it. Same rule for both — one destination,
              // one phrase, wherever it appears.
              : readingOpens
                ? `${t("visio.read_passage", { defaultValue: "Read the passage" })} \u2192`
              : step === TITLE
                ? t("common.begin", { defaultValue: "Begin" })
                // Audit: the closing slide's button doesn't continue anything —
                // it marks the practice kept and leaves. Saying "Continue"
                // there described the one tap in this deck that isn't one.
                // The closing slide's button doesn't continue anything — it
                // marks the practice kept and leaves. Owner: "it should just
                // be finished as, like, CTA on the last screen."
                : step === DONE
                  ? t("visio.finished", { defaultValue: "Finished" })
                  : t("common.continue", { defaultValue: "Continue" })}
          </span>
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
