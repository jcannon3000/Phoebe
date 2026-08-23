/**
 * AI-assisted routine interview — "tell Phoebe the rhythm you already keep."
 *
 * Owner: a questionnaire that is "not focused on suggesting a new prayer
 * routine, but would ask someone what their current routine is and ... program
 * that into Phoebe for them." So every word here is about RECORDING a practice,
 * never recommending one — /find-your-rhythm is the surface that suggests.
 *
 * The flow, as the owner described it:
 *   describe  → they write their practice in their own words
 *   thinking  → processing screen while the model reads it
 *   followups → its questions (two or more), ONE PER SLIDE. A question whose
 *               answer is really a setting comes back with choices to tap.
 *   thinking  → processing screen while it builds
 *   confirm   → a read-back slide each for morning, contemplation, evening;
 *               saying "not quite" on any rebuilds with the correction. The
 *               office slides carry their own reminder switch, and the
 *               contemplation slide turns into a picker when we heard no
 *               contemplative practice at all
 *   extras    → the customizer's "additional practice" step, replicated
 *   review    → the finished routine, in the manual flow's own row format
 *
 * The model's spec is validated server-side (sanitizeSpec) before it ever gets
 * here and again on apply, so nothing on this page has to trust it.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { adoptRoutineConfig } from "@/lib/routineSync";
import { PRESCRIBE_SPEC_KEY } from "@/lib/prescribeHandoff";
import { addCustomAnchor, getCustomAnchors, type CustomSlot } from "@/lib/customAnchors";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const CREAM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.35)";
const CTA = "#2D5E3F";

// Owner: "what if we did a third round, where after the first two, we show what
// we are hearing for morning, contemplation, and evening ... and then asks them
// for each if that represents what they do. Each one has a slide." Then an
// extras slide in the customizer's own format before the final review.
type Phase =
  // "mode" only appears for someone who ALREADY has a routine — see the slide
  // itself for why a first-timer never sees it.
  | "mode"
  | "describe" | "thinking-followups" | "followups" | "thinking-build"
  | "confirm" | "extras" | "review";
type InterviewMode = "scratch" | "adjust";

// The read-back sections, in the order the day runs.
const CONFIRM_SECTIONS: Array<{ key: SpecSection; title: string; ask: string }> = [
  { key: "morning", title: "Your morning", ask: "Is that your morning?" },
  // Not "Silence": a walk or a breath counts as their contemplative practice
  // and reads back on this slide, so the heading has to cover more than sitting.
  { key: "contemplation", title: "Your contemplative practice", ask: "Is that right?" },
  { key: "evening", title: "Your evening", ask: "Is that your evening?" },
  // Owner: "if there's something in addition to an anchor practice ... a fourth
  // slide." Where a second practice on a side lands (a Morning Devotion kept
  // alongside Morning Prayer), plus anything else Phoebe has no name for — so
  // it gets read back and can be corrected, rather than appearing for the first
  // time on the final review.
  { key: "practices", title: "Anything else you keep", ask: "Is that right?" },
];

// The manual customizer's "Add an additional practice" step, replicated. Each
// maps to a home-layout card key; the slot ones also take a time of day, which
// we leave at the customizer's own defaults rather than asking again.
const SLOT_TEXT: Record<string, string> = {
  morning: "in the morning", midday: "at midday", afternoon: "in the afternoon",
  evening: "in the evening", anytime: "any time of day",
};
/**
 * Offered on the Silence slide ONLY when the interview heard no contemplative
 * practice at all.
 *
 * Owner: "if they don't mention a contemplative practice, then ... say 'would
 * you like a contemplative practice?' And the first one would be sitting in
 * silence. And if they click that, it goes ... after picking the length, the
 * method of logging."
 *
 * This is the one place the interview offers rather than records, and it's
 * offering the CATEGORY, not talking anyone into a practice — "not right now"
 * sits in the list as a real answer, not as a way out of it.
 */
const CONTEMPLATIVE_CHOICES: Array<{ key: string; emoji: string; label: string; sub: string; slot?: string }> = [
  { key: "silence", emoji: "🕯️", label: "Sitting in silence", sub: "A silent sit, however long you like." },
  { key: "cobreathe", emoji: "🌍", label: "Creation Prayer", sub: "Breathing together with God's creation.", slot: "anytime" },
  // "anytime" on purpose: getPracticeSlot (lib/customAnchors) hard-returns
  // "anytime" for cobreathe / listening / examen / walk, so any other value
  // would put a time on the review that the app never actually applies.
  { key: "walk", emoji: "🚶", label: "Contemplative Walk", sub: "A walk as prayer.", slot: "anytime" },
  { key: "listening", emoji: "🎵", label: "Audio Divina", sub: "Sacred listening.", slot: "anytime" },
];
// One list, not two. A dropdown that swaps its options when you toggle
// "once / more than once" can strand the value you already picked; the toggle
// changes what the number MEANS, not which numbers are sayable.
const SILENCE_LENGTHS = [5, 10, 15, 20, 30, 45, 60, 90];

/**
 * The practices a side can hold — for changing one BY HAND on the read-back.
 *
 * Owner: "instead of 'not quite', how about it goes to an adjust where they do
 * it manually for whatever that is."
 *
 * "Not quite" opened a text box and rebuilt the whole routine through the
 * model: a spinner, a fresh spec, and a chance for something else to move,
 * all to say "it's the devotion, not the office". The format and the reminder
 * were already editable in place on this slide; the PRACTICE was the one thing
 * that still had to go back through the model. Now it doesn't.
 *
 * Labels are the side-prefixed names the cards use, built per side so the row
 * reads the same before and after the change.
 */
const SIDE_PRACTICES: Array<{ level: string; label: (cap: string) => string; sub: string }> = [
  { level: "office", label: (c) => `${c} Prayer`, sub: "The full Daily Office." },
  { level: "devotion", label: (c) => `${c} Devotion`, sub: "A short devotion." },
  { level: "psalms", label: (c) => `${c} Psalms`, sub: "The day's appointed psalms." },
  { level: "readings", label: (c) => `${c} Scripture Reading`, sub: "The day's appointed readings." },
  { level: "guided-prayer", label: () => "Simple Guided Prayer", sub: "About three minutes." },
  { level: "examen", label: (c) => `${c} Examen`, sub: "Review the day with God." },
  { level: "fdd", label: () => "Forward Day by Day", sub: "Today's meditation." },
  { level: "reflect-sit", label: (c) => `${c} Contemplation`, sub: "A silent sit." },
  { level: "compline", label: () => "Compline", sub: "The night office." },
];

/**
 * How they take the office — asked here as a dropdown rather than spent on one
 * of the two clarifying questions.
 *
 * Owner: "those at least two clarification questions should not be about
 * medium, because we could actually ask medium on the third stage through a
 * dropdown. Have Venite digital [be] the default for all of them."
 *
 * Venite leads because it's Phoebe's default reader (getDefaultOfficeEntry).
 * "watch" isn't offered: it's the National Cathedral's weekday morning
 * broadcast, too conditional to sit in a plain list.
 */
const MEDIUM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "venite", label: "Venite Digital" },
  // Owner: "it should be Digital Slideshow if it's the slideshow." "On screen"
  // described the device, not the thing — and it read as the opposite of the
  // physical book rather than as one of several formats, two of which are also
  // on a screen.
  { value: "read", label: "Digital Slideshow" },
  { value: "book", label: "My physical prayer book" },
  { value: "listen", label: "Read aloud to me" },
];

const EXTRAS: Array<{ key: string; emoji: string; label: string; sub: string; slot?: string }> = [
  { key: "compline", emoji: "🌙", label: "Compline", sub: "The night office — available from 7pm." },
  { key: "listening", emoji: "🎵", label: "Audio Divina", sub: "Sacred listening.", slot: "anytime" },
  // "anytime", not "evening" — see the note on CONTEMPLATIVE_CHOICES.
  { key: "examen", emoji: "🌗", label: "The Examen", sub: "Review the day with God.", slot: "anytime" },
  { key: "cobreathe", emoji: "🌍", label: "Creation Prayer", sub: "Breathing together with God's creation.", slot: "anytime" },
  // "anytime" on purpose: getPracticeSlot (lib/customAnchors) hard-returns
  // "anytime" for cobreathe / listening / examen / walk, so any other value
  // would put a time on the review that the app never actually applies.
  { key: "walk", emoji: "🚶", label: "Contemplative Walk", sub: "A walk as prayer.", slot: "anytime" },
];

/**
 * A follow-up question, and — when its answer is a setting rather than a
 * story — the settings to choose from.
 *
 * Owner: "for something like this that you're asking about three options that
 * pertain to settings, how about instead of [a text] field you list the
 * settings and they choose." Asking "from your prayer book, on a screen, or
 * listening?" and then handing over an empty textarea makes the person
 * transcribe an option we already knew the shape of — on a phone, mid-keyboard,
 * to set an enum. The model marks those questions; everything genuinely open
 * still gets the box.
 */
type Question = { q: string; choices?: string[] };

type CustomPractice = { title: string; emoji: string; slot: string };

type Spec = Record<string, unknown>;
// Same shape the manual customizer's review rows use.
type SpecSection = "morning" | "contemplation" | "evening" | "newsletters" | "practices";
// `id` names what the row IS, so it can be edited or deleted — see the server's
// routineDescribe.ts for the shapes ("side:morning", "slot:walk", …).
type SpecRow = { id: string; emoji: string; label: string; sub: string; section: SpecSection };


/**
 * A one-row select pill — the manual customizer's dropdown, reproduced.
 *
 * Owner: "the time should be in a dropdown, wide one-row pill like the manual
 * customizer" and "the medium drop needs a more clear dropdown UI."
 *
 * The chevron is the whole point. A bare <select> with appearance:none looks
 * exactly like a read-only field, so the medium row read as a statement of
 * fact rather than something you could change — and a grid of minute chips
 * isn't a dropdown at all.
 */
function SelectPill({
  value, onChange, ariaLabel, children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{
          // maxWidth/minWidth are the guard that matters: a <select> keeps
          // min-width:auto and won't shrink below its longest option inside a
          // flex row, which is the one way these actually overflow (Tailwind's
          // preflight already gives everything border-box).
          width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
          background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: `1px solid ${CARD_B}`, borderRadius: 12,
          // Right padding leaves room for the chevron.
          padding: "14px 40px 14px 14px",
          color: WARM, fontSize: 16, fontFamily: FONT, outline: "none",
          colorScheme: "dark", appearance: "none", WebkitAppearance: "none",
        }}
      >
        {children}
      </select>
      <span
        aria-hidden
        style={{
          position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
          color: SAGE, fontSize: 12, pointerEvents: "none",
        }}
      >
        ▾
      </span>
    </div>
  );
}

export default function RoutineInterviewPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const backdrop = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  const [phase, setPhase] = useState<Phase>("describe");
  /**
   * Rebuilding from nothing, or changing what's already there.
   *
   * Owner: "if someone only has a routine and they click 'ask me about my
   * practice', let's have two more options — start from scratch, or adjust my
   * routine."
   *
   * Worth the extra slide because the two are genuinely different tasks. Asked
   * "what does your daily routine look like?", someone who only wants their
   * evening reminder moved has to retype their entire rule of life, and any
   * practice they forget to mention gets deleted. Adjusting asks one question
   * and carries the rest forward.
   */
  const [mode, setMode] = useState<InterviewMode>("adjust");
  /**
   * Building for SOMEONE ELSE (?prescribe=1), from the admin tools' preset
   * rhythm link. Owner: "if I'm building a prayer routine for someone else —
   * the preset rhythm link in the admin tools — I want to do it through the
   * questionnaire."
   *
   * Everything about the interview holds except the ending: nothing may touch
   * the admin's own account. The finished spec is handed back to
   * prescribe-routine.tsx, which names it and mints the link.
   */
  const { prescribe, prescribeBack } = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const raw = q.get("from") || "";
      // Only an in-app path. `from` ends up in setLocation, and a value off the
      // query string is attacker-supplied — "//evil.example" is protocol-
      // relative and would leave the app entirely.
      const safeBack = /^\/(?!\/)/.test(raw) ? raw : "/admin/tools";
      return { prescribe: q.get("prescribe") === "1", prescribeBack: safeBack };
    } catch { return { prescribe: false, prescribeBack: "/admin/tools" }; }
  }, []);
  // What they're standing on. Empty = no routine yet, so there is nothing to
  // adjust and the mode slide is skipped entirely.
  const [currentSettings, setCurrentSettings] = useState<SpecRow[]>([]);
  /**
   * Which parts of the day an adjustment actually touched, from the server's
   * diff of the rebuilt routine against the one in force.
   *
   * Owner: "if it's pertaining to the morning, just show morning" — don't walk
   * someone through contemplation and evening to confirm a change that never
   * went near them. Empty means "confirm everything", which is right for a
   * from-scratch build and for an adjustment we couldn't get a baseline for.
   */
  const [touchedSections, setTouchedSections] = useState<SpecSection[]>([]);
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  // Owner: "have the follow up questions on two separate slides." One
  // question at a time reads as a conversation; both at once reads as a form.
  const [qIndex, setQIndex] = useState(0);
  // Read-back round: which section we're confirming, and the corrections they
  // gave. A correction is the person looking at our reading and rejecting it,
  // so it outranks the original description on the rebuild.
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [fixText, setFixText] = useState("");
  const [showFix, setShowFix] = useState(false);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  // The Silence slide turns into a PICKER when the interview heard no
  // contemplative practice at all. Its own little sub-flow: choose one, and if
  // it's a silent sit, choose how long and how it gets kept.
  const [contPick, setContPick] = useState<string | null>(null);
  const [contStep, setContStep] = useState<0 | 1 | 2>(0);
  const [contMinutes, setContMinutes] = useState(10);
  const [contLog, setContLog] = useState<"timer" | "manual">("timer");
  // How often they sit. Owner, after a real run: "I said I did fifteen minutes
  // of silence today, but it didn't ask me [whether] that was the only time...
  // if they do more than once, we wanna know the total time throughout the
  // day." Asked here as a control rather than left to the follow-up round,
  // which is what missed it — the model has to notice a gap, this can't.
  const [contOften, setContOften] = useState<"once" | "more">("once");
  const [spec, setSpec] = useState<Spec | null>(null);
  const [summary, setSummary] = useState("");
  // Derived server-side FROM the sanitized spec — the authoritative account of
  // what saving will actually set. `summary` is the model's own prose, which is
  // nice framing but is not evidence of what it programmed.
  const [settings, setSettings] = useState<SpecRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  // Practices Phoebe has no preset for (a rosary, a gratitude list). They ride
  // beside the spec rather than inside it — custom anchors sync through their
  // own channel, not through ruleConfig — so they're written locally on apply.
  const [customPractices, setCustomPractices] = useState<CustomPractice[]>([]);
  // Typed on the extras step — "is there any other practice you do that isn't
  // named here?" See the field itself for why it lives on that step.
  const [ownPractice, setOwnPractice] = useState("");
  // The free-text box on a follow-up question. Reported: "the just to be sure
  // field, I can[']t type cause the page won't scroll up" — tapping "Something
  // else" revealed a textarea below the fold and autoFocus raised the keyboard
  // over it, so the caret was somewhere you couldn't see.
  const freeTextRef = useRef<HTMLTextAreaElement | null>(null);
  // Review-screen row editing. Owner: "a settings circle, and an X circle on
  // the right — settings to configure it, X to delete it, with some type of
  // popup that says [are you sure] you want to delete it."
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<SpecRow | null>(null);
  // Set when a read-back slide was opened FROM the review's gear. Without it,
  // fixing one thing from the review dropped you back into the middle of the
  // read-back and made you walk forward through every remaining section and
  // the extras page to get back — losing your place to change one dropdown.
  const [returnToReview, setReturnToReview] = useState(false);
  // Read-back → "Change it myself": the practice picker, open on one section.
  const [pickingPractice, setPickingPractice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Ask what they're standing on. Until this resolves we stay on "describe",
  // so a first-timer — and anyone whose fetch fails — gets the from-scratch
  // flow immediately rather than a spinner or an empty chooser. Only a person
  // who actually HAS a routine is moved onto the mode slide.
  useEffect(() => {
    // Building for someone else: the routine in force is the ADMIN's own, which
    // has nothing to do with the person this is for. Offering to "adjust" it
    // would be offering to adjust the wrong person's rule of life.
    if (prescribe) return;
    let cancelled = false;
    apiRequest("GET", "/api/routine-interview/current")
      .then((r: any) => {
        if (cancelled) return;
        const rows: SpecRow[] = Array.isArray(r?.settings) ? r.settings : [];
        if (rows.length === 0) return;
        setCurrentSettings(rows);
        // Don't yank someone who has already started typing.
        setPhase((cur) => (cur === "describe" && description.length === 0 ? "mode" : cur));
      })
      .catch(() => { /* no routine context — from-scratch is the safe default */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Owner: "the page needs to scroll up when I'm on the second." Advancing a
  // slide keeps the window's scroll position, so a long first answer left the
  // next question rendered above the fold — it looked like nothing happened.
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* ignore */ }
  }, [phase, qIndex, confirmIndex, contStep]);

  // Close the picker whenever the slide changes, so it never appears already
  // open on a section they haven't asked to edit.
  useEffect(() => { setPickingPractice(false); }, [confirmIndex, phase]);

  // Seed the sit controls from what was actually built, so the panel opens
  // showing their minutes and log method rather than the component defaults.
  // Runs when the read-back arrives (spec changes), never on every keystroke.
  useEffect(() => {
    const sp = spec as any;
    if (!sp) return;
    const mins = sp.officePrefs?.contemplationGoalMinutes;
    if (typeof mins === "number" && mins > 0) setContMinutes(mins);
    const lm = sp.ruleConfig?.["phoebe:contemplation-log-method"];
    if (lm === "manual" || lm === "timer") setContLog(lm);
    // Reported: "even though I had multiple sits saved, it defaulted to one sit
    // when I came back." It had nowhere to be saved — the answer only lived in
    // component state, so any rebuild (a correction, a re-entry) silently reset
    // it to "once" and the minutes then read as one sit.
    const sits = sp.ruleConfig?.["phoebe:contemplation-sits"];
    if (sits === "one" || sits === "several") setContOften(sits === "several" ? "more" : "once");
  }, [spec]);

  // "adjust" is the default, but it only MEANS anything when there's a routine
  // to adjust. Sending it regardless would make the server read a routine it's
  // about to ignore, and — if that read ever succeeded for someone mid-setup —
  // frame a first-time description as a change to something.
  const effectiveMode: InterviewMode = currentSettings.length > 0 ? mode : "scratch";

  /**
   * The read-back slides to actually walk.
   *
   * An adjustment confirms only what it changed (owner). A from-scratch build,
   * or an adjustment the server couldn't diff, confirms the whole day — an
   * empty list from the server means "no information", not "nothing changed",
   * and silently skipping the entire read-back would be the worse reading of
   * an ambiguous signal.
   */
  /**
   * "Anything else you keep?" is a from-scratch question.
   *
   * Someone adjusting one thing has already said what they wanted; offering
   * them the full extras picker and a custom-practice field afterwards is a
   * page of noise between them and Save — and an invitation to add practices
   * they never came here for.
   */
  const skipExtras = effectiveMode === "adjust";

  // Does anything contemplative exist at all — a sit, or a walk/breath/listening
  // in a slot? Decides whether the contemplation slide has something to show or
  // something to ask; without it the slide can be neither.
  const hasAnyContemplativePractice = (() => {
    const rc = ((spec as any)?.ruleConfig ?? {}) as Record<string, string>;
    return ["walk", "cobreathe", "listening"].some((k) => !!rc[`phoebe:slot:${k}`]);
  })();

  const confirmSections = (
    touchedSections.length > 0
      ? CONFIRM_SECTIONS.filter((sec) => touchedSections.includes(sec.key))
      : CONFIRM_SECTIONS
  ).filter((sec) =>
    // Contemplation earns its slide even when empty — that's the one that ASKS
    // (see the picker). Every other section with nothing in it is a slide with
    // no card and a question about nothing, which is what an empty morning
    // used to render.
    // Contemplation earns a slide when it has rows OR when it's going to ASK.
    // It used to be exempt unconditionally, which rendered an empty slide —
    // heading, "here's what we heard", no card, no controls — for anyone whose
    // contemplative practice is a walk or a breath, since those rows live in
    // the "practices" section now.
    // Owner: "take out the last slide in the third stage that shows
    // contemplative practices — if they haven't said it already, let's not do
    // that at this stage." So contemplation gets a slide only when there is
    // something to READ BACK. The interview records what they keep; offering a
    // menu of practices they never mentioned is the recommending job, and it
    // belongs to the customizer, not here.
    settings.some((r) => r.section === sec.key),
  );

  // Every read-back section filtered out — nothing left to confirm. Move on
  // rather than render an empty slide. In an EFFECT, not during render: calling
  // setPhase mid-render is the kind of thing that warns today and loops
  // tomorrow, and this component has already cost one crash from a hook in the
  // wrong place.
  useEffect(() => {
    if (phase === "confirm" && confirmSections.length === 0) setPhase(skipExtras ? "review" : "extras");
  }, [phase, confirmSections.length]);


  const errorText = (code: string): string => {
    switch (code) {
      case "ai_unconfigured":
        return "The assistant isn't switched on yet for this server.";
      // Three failures that need a person to change something, named
      // separately so they can't be mistaken for a passing network blip and
      // waited out.
      case "ai_bad_key":
        return "The assistant's API key was rejected. It needs updating on the server.";
      case "ai_bad_model":
        return "The assistant's model isn't available to this server's account. Check ROUTINE_INTERVIEW_MODEL.";
      case "ai_no_credits":
        // Not a wait-and-retry: the balance is empty until someone tops it up.
        return "The assistant's OpenAI account is out of credits. Add credits to switch it back on.";
      case "ai_rate_limited":
        return "The assistant is over its rate limit right now. Give it a minute.";
      case "ai_unreachable":
      case "ai_failed":
        return "Couldn't reach the assistant just now. Try again in a moment.";
      case "ai_bad_json":
      case "ai_bad_spec":
        return "The assistant's answer came back garbled. Try again — it usually works on a second pass.";
      case "too_short":
        return "Tell us a little more first — a sentence or two about your day.";
      default:
        return "Something went wrong. Try again in a moment.";
    }
  };

  const submitDescription = async () => {
    setError(null);
    setPhase("thinking-followups");
    try {
      const res = (await apiRequest("POST", "/api/routine-interview/followups", {
        description, mode: effectiveMode,
      })) as { questions?: Array<Question | string> } | null;
      const qs: Question[] = (res?.questions ?? [])
        // Tolerate the bare-string shape as well as {q, choices} — the server
        // normalizes, but this page shouldn't break on an older deploy of it.
        .map((item) => (typeof item === "string" ? { q: item } : item))
        .filter((item): item is Question => !!item && typeof item.q === "string" && item.q.trim().length > 0);
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      setQIndex(0);
      // An adjustment that needed nothing clarified goes straight to the build.
      // "Move my evening reminder to nine" is complete as stated, and making
      // someone answer two invented questions to get there is the slowest
      // possible way to change one line.
      if (qs.length === 0) {
        if (effectiveMode !== "adjust") throw new Error("ai_bad_json");
        void submitFollowups();
        return;
      }
      setPhase("followups");
    } catch (e: any) {
      setError(errorText(e?.body?.error ?? e?.message ?? ""));
      setPhase("describe");
    }
  };

  /**
   * Build (or REBUILD) the spec.
   *
   * `resumeAt` is where the read-back should land afterwards. A first build
   * starts at the beginning; a rebuild triggered by a correction returns to the
   * section that was being corrected, rather than sending them back through
   * morning and silence to reach the evening they just fixed.
   *
   * The spec is rebuilt whole each time, so the earlier sections MAY have
   * changed — but re-confirming two things they already approved, every time
   * they correct the third, is the worse trade. Anything that did change is
   * still shown on the final review before anything is saved.
   */
  const submitFollowups = async (nextCorrections?: string[], resumeAt = 0) => {
    setError(null);
    const cameFromConfirm = phase === "confirm";
    setPhase("thinking-build");
    try {
      const res = (await apiRequest("POST", "/api/routine-interview/build", {
        description, mode: effectiveMode,
        followups: questions.map((item, i) => ({ q: item.q, a: answers[i] ?? "" })),
        corrections: nextCorrections ?? corrections,
      })) as {
        spec?: Spec; summary?: string; settings?: SpecRow[]; notes?: string[];
        customPractices?: CustomPractice[]; changedSections?: SpecSection[];
      } | null;
      if (!res?.spec) throw new Error("ai_bad_spec");
      setSpec(res.spec);
      setSummary(res.summary ?? "");
      setSettings(res.settings ?? []);
      setNotes(res.notes ?? []);
      const touched = Array.isArray(res.changedSections) ? res.changedSections : [];
      setTouchedSections(touched);
      setCustomPractices(res.customPractices ?? []);
      setConfirmIndex(resumeAt);
      setShowFix(false);
      setFixText("");
      // An adjustment that changed none of the three parts of the day has
      // nothing to read back — sending them through "is that your morning?"
      // for a routine we didn't touch is a question with no purpose.
      // Only an ADJUSTMENT can have "nothing to confirm". The server sends
      // changedSections on every build — empty for a from-scratch one — so
      // testing Array.isArray meant every first-time interview skipped the
      // whole read-back round and jumped to extras. Morning, contemplation and
      // evening were never shown to the people the read-back was built for,
      // and the "would you like a contemplative practice?" picker was dead on
      // the only path that reaches it.
      const nothingToConfirm = effectiveMode === "adjust"
        && touched.length === 0
        && (res.settings ?? []).length > 0;
      setPhase(nothingToConfirm ? (skipExtras ? "review" : "extras") : "confirm");
    } catch (e: any) {
      setError(errorText(e?.body?.error ?? e?.message ?? ""));
      // Return them where they were. A failed rebuild during the read-back used
      // to dump them back on the follow-up questions, losing the round entirely
      // for what is usually a transient model error.
      setPhase(cameFromConfirm ? "confirm" : "followups");
    }
  };

  /**
   * Hand the finished routine to prescribe-routine.tsx.
   *
   * Via sessionStorage rather than a prop, because the interview is its own
   * route — and deliberately NOT through /apply, which writes to the caller's
   * own account. An admin designing a rhythm for someone else must come out of
   * this with their own routine untouched.
   */
  const handOffPrescribed = () => {
    if (!spec) return;
    try { sessionStorage.setItem(PRESCRIBE_SPEC_KEY, JSON.stringify(spec)); } catch { /* quota */ }
    setLocation(prescribeBack);
  };

  const applySpec = async () => {
    if (!spec || applying) return;
    setApplying(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/routine-interview/apply", { spec });
      // Mirror onto THIS device immediately — the home reads office levels and
      // slots straight from localStorage, so without this they'd land on the
      // old rhythm until the next sync. Same pattern routine-invite.tsx uses
      // after accepting a prescribed routine.
      try {
        const rc = (spec as { ruleConfig?: Record<string, string> }).ruleConfig;
        if (rc) adoptRoutineConfig(rc);
      } catch { /* non-fatal — the server already has it */ }
      // Custom practices, written straight to the anchor list. Skips any title
      // already there so re-running the interview doesn't leave two rosaries.
      try {
        const existing = new Set(getCustomAnchors().map((a) => a.title.trim().toLowerCase()));
        for (const c of customPractices) {
          if (existing.has(c.title.trim().toLowerCase())) continue;
          addCustomAnchor(c.title, c.emoji, c.slot as CustomSlot);
        }
      } catch { /* non-fatal — a custom practice can be re-added by hand */ }
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/me/silence-ladder"] });
      setLocation("/daily-progress");
    } catch {
      setError("Couldn't save that routine just now. Try again.");
      setApplying(false);
    }
  };

  // Chromeless <Layout> drops the horizontal gutter its non-chromeless <main>
  // applies (px-4 sm:px-6 md:px-8), so this page owns its own — without it the
  // title and body ran flush to both screen edges on device.
  const wrap: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 18,
    padding: "8px 20px 40px", maxWidth: 560, margin: "0 auto", width: "100%",
    boxSizing: "border-box",
  };
  const card: React.CSSProperties = {
    background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: `1px solid ${CARD_B}`, borderRadius: 18, padding: 16,
  };
  const primaryBtn: React.CSSProperties = {
    background: CTA, color: CREAM, border: `1px solid ${CARD_B}`, borderRadius: 14,
    padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
    width: "100%",
  };
  const quietBtn: React.CSSProperties = {
    background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)",
    borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT,
    cursor: "pointer", width: "100%",
  };
  // The manual customizer's review-row shape — one definition shared by the
  // read-back slides, the extras list and the final review, so all three read
  // as the same object.
  const rowCard: React.CSSProperties = {
    background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
    borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
  };
  // Owner asked for the read-back cards to look "like how on the weekly detail
  // page the routine card" — that's /turn-learn-pray's per-slot card, which is
  // NOT the flat review row: rounded-3xl, a left accent bar, and the emoji in a
  // circular badge. Reproduced here so the read-back matches the surface the
  // owner pointed at.
  const routineCard: React.CSSProperties = {
    position: "relative", display: "flex", borderRadius: 24, overflow: "hidden",
    background: "rgba(46,107,64,0.07)", border: `1px solid ${CARD_B}`,
  };
  const routineAccent: React.CSSProperties = {
    width: 6, flexShrink: 0, background: "rgba(110,180,130,0.72)",
  };
  const routineBadge: React.CSSProperties = {
    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 999, width: 26, height: 26, fontSize: 15,
    background: "rgba(110,180,130,0.18)",
  };
  // ── Top progress ───────────────────────────────────────────────────────────
  // Owner: "a top progress bar UI with the questionnaire where there [are]
  // three sections as bars that fill in as they proceed." Three segments —
  // telling us, answering, checking — each filling across its own steps, so
  // the strip shows both which part of the interview you're in and how far
  // through that part you are. A single bar couldn't say the first thing, and
  // the round it's easiest to feel lost in is the third.
  const sectionFill = ((): [number, number, number] => {
    const qN = Math.max(1, questions.length);
    // Third section's steps: one per read-back slide, plus extras, plus review.
    const lastN = confirmSections.length + 2;
    switch (phase) {
      case "describe":            return [0, 0, 0];
      case "thinking-followups":  return [1, 0, 0];
      case "followups":           return [1, qIndex / qN, 0];
      case "thinking-build":      return [1, 1, 0];
      case "confirm":             return [1, 1, confirmIndex / lastN];
      case "extras":              return [1, 1, confirmSections.length / lastN];
      case "review":              return [1, 1, (confirmSections.length + 1) / lastN];
      default:                    return [0, 0, 0];
    }
  })();
  // Styled after the CAC reflection slideshow's header bars (owner: "like how
  // the CAC newsletter slideshow does it, but just three bars") — same h-1,
  // fully-rounded, equal-width, 6px-gapped strip. One difference on purpose:
  // CAC's segments are binary because each is a single slide, whereas each of
  // these three covers several steps, so they fill proportionally. Otherwise a
  // bar would sit empty through the whole read-back round and jump at the end.
  const progressBars = (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }} aria-hidden>
      {sectionFill.map((fill, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: 4, borderRadius: 999, overflow: "hidden",
            background: "rgba(255,255,255,0.14)",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(1, fill)) * 100}%`, height: "100%",
              // Fern, not SAGE: sage against the track was two light tones on a
              // dark ground and the filled portion barely read.
              borderRadius: 999, background: "#A8C5A0", transition: "width 0.3s ease",
            }}
          />
        </div>
      ))}
    </div>
  );

  const eyebrow: React.CSSProperties = {
    fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
    color: SAGE, fontFamily: FONT, margin: 0, fontWeight: 600,
  };
  const h1: React.CSSProperties = {
    fontSize: "clamp(26px, 7vw, 32px)", fontWeight: 700, color: WARM,
    fontFamily: FONT, lineHeight: 1.2, margin: "8px 0 0", letterSpacing: "-0.02em",
  };

  // ── Processing screen ──────────────────────────────────────────────────────
  // Owner: "it shows a processing screen." Two model calls, two waits — the
  // label says which one so a long pause doesn't read as a hang.
  if (phase === "thinking-followups" || phase === "thinking-build") {
    const line = phase === "thinking-followups"
      ? "Reading what you wrote…"
      : "Shaping your rhythm in Phoebe…";
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={{ ...wrap, minHeight: "60dvh", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div
            aria-hidden
            style={{
              width: 46, height: 46, borderRadius: "50%",
              border: "2px solid rgba(143,175,150,0.25)", borderTopColor: SAGE,
              animation: "phoebe-spin 1s linear infinite",
            }}
          />
          <style>{"@keyframes phoebe-spin{to{transform:rotate(360deg)}}"}</style>
          <p style={{ ...eyebrow, marginTop: 4 }}>One moment</p>
          <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, margin: 0 }}>{line}</p>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, margin: 0, maxWidth: 380 }}>
            This usually takes a few seconds.
          </p>
        </div>
      </Layout>
    );
  }

  // ── 1. Describe ────────────────────────────────────────────────────────────
  // ── 0. Adjust, or start over? Only for someone who already has a routine. ──
  if (phase === "mode") {
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={wrap}>
          {progressBars}
          <div>
            <p style={eyebrow}>Your rhythm 🌿</p>
            <h1 style={h1}>You already have a routine</h1>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              Change one part of it, or describe your whole practice again from
              the beginning.
            </p>
          </div>

          {/* Show what they have. The choice is meaningless without it — "adjust
              my routine" only means something once you can see the routine. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {currentSettings.map((r, i) => (
              <div key={`${r.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 17, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600 }}>{r.label}</span>
                  <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 12.5, marginTop: 1 }}>{r.sub}</span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              { v: "adjust" as const, emoji: "✏️", label: "Adjust my routine", sub: "Change one thing. Everything else stays as it is." },
              { v: "scratch" as const, emoji: "🌱", label: "Start from scratch", sub: "Describe your whole practice again." },
            ]).map((o) => {
              const on = mode === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => { setMode(o.v); setError(null); setPhase("describe"); }}
                  style={{
                    ...card, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer",
                    padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                    border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                    background: on ? "rgba(45,94,63,0.55)" : CARD,
                  }}
                  aria-pressed={on}
                >
                  <span aria-hidden style={{ fontSize: 20 }}>{o.emoji}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 15.5, fontWeight: on ? 700 : 600 }}>{o.label}</span>
                    <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{o.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* No Continue (owner). Tapping a row IS the choice on a two-way
              fork, and confirming it again only added a step. The Back that
              used to sit here pointed at this very slide — an edit meant for
              the description screen landed on this one, since the two ended
              with identical buttons. */}
          <button type="button" onClick={() => setLocation("/rule-of-life")} style={quietBtn}>
            I'd rather set it up myself
          </button>
        </div>
      </Layout>
    );
  }

  if (phase === "describe") {
    // Only an ADJUST when there's actually something to adjust — a failed or
    // empty current-routine fetch must not leave them answering "what would
    // you like to change?" about a routine that doesn't exist.
    const adjusting = effectiveMode === "adjust";
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={wrap}>
          {progressBars}
          <div>
            <p style={eyebrow}>Your rhythm 🌿</p>
            {/* Owner: "just create a flow where it says, what would you like to
                adjust, and it puts an open field." Same box, different
                question — asking someone who wants one thing moved to describe
                their whole practice again is how a small change turns into a
                retyped rule of life with a practice accidentally dropped. */}
            <h1 style={h1}>
              {prescribe
                ? "What does their daily routine look like?"
                : adjusting ? "What would you like to adjust?" : "What does your daily routine look like?"}
            </h1>
            {/* Owner: the four things to cover belong in the LLM's prompt, not
                on screen as a checklist — "that's what we want to look for in
                the response." So this asks openly and the server prompt does
                the structuring. */}
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              {prescribe
                ? "Describe the practice you're setting up for them, and any newsletters they read."
                : adjusting
                  ? "Just the part you want changed. Everything else stays exactly as it is."
                  : "Describe any daily practices you engage in, and any newsletters you may read."}
            </p>
          </div>

          {/* No example placeholder (owner). A worked example in the box
              anchors people to its shape — they describe a day that resembles
              the sample rather than their own, which is the one thing this
              whole surface is trying not to do. */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            maxLength={4000}
            style={{
              ...card, width: "100%", boxSizing: "border-box", color: WARM,
              fontFamily: FONT, fontSize: 15, lineHeight: 1.6, outline: "none", resize: "vertical",
            }}
          />

          {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

          <button
            type="button"
            onClick={submitDescription}
            disabled={description.trim().length < 10}
            style={{ ...primaryBtn, opacity: description.trim().length < 10 ? 0.5 : 1 }}
          >
            Continue
          </button>
          {/* Back to the fork when there was one. Reported: "the back goes to
              the home screen and not the previous thing" — leaving the flow
              entirely is a heavy answer to "I picked the wrong option". */}
          {currentSettings.length > 0 ? (
            <button type="button" onClick={() => { setError(null); setPhase("mode"); }} style={quietBtn}>
              Back
            </button>
          ) : (
            <button type="button" onClick={() => setLocation("/rule-of-life")} style={quietBtn}>
              I'd rather set it up myself
            </button>
          )}
        </div>
      </Layout>
    );
  }

  // ── 2. Follow-ups — ONE question per slide ────────────────────────────────
  if (phase === "followups") {
    const question = questions[qIndex] ?? { q: "" };
    const q = question.q;
    const choices = question.choices ?? [];
    const answer = answers[qIndex] ?? "";
    const isLast = qIndex >= questions.length - 1;
    const setAnswer = (v: string) =>
      setAnswers((prev) => prev.map((a, j) => (j === qIndex ? v : a)));
    // A tapped choice IS the answer, so tapping one twice clears it rather than
    // leaving them stuck with a pick they can't take back. "Something else"
    // opens the box for a practice the list didn't anticipate — the list is the
    // fast path, never a cage.
    const chosen = choices.find((c) => c === answer) ?? null;
    const wroteInstead = answer.length > 0 && !chosen;
    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={wrap}>
          {progressBars}
          <div>
            <p style={eyebrow}>
              {questions.length > 1 ? `Question ${qIndex + 1} of ${questions.length}` : "One question"} 🌿
            </p>
            <h1 style={h1}>Just to be sure</h1>
            {/* Owner: '"I don\'t" doesn\'t make sense here. Take it out.' It was
                written for "do you sit in silence?" and reads as a non-sequitur
                against a question like "one sit or several?" — which is not a
                yes/no at all. */}
          </div>

          <p style={{ color: WARM, fontFamily: FONT, fontSize: 16.5, lineHeight: 1.5, margin: 0 }}>{q}</p>

          {choices.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {choices.map((c) => {
                const on = chosen === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAnswer(on ? "" : c)}
                    style={{
                      ...card, width: "100%", boxSizing: "border-box", textAlign: "left",
                      cursor: "pointer", padding: "14px 16px",
                      display: "flex", alignItems: "center", gap: 12,
                      color: on ? WARM : SAGE,
                      fontFamily: FONT, fontSize: 15.5, fontWeight: on ? 700 : 500,
                      border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                      background: on ? "rgba(45,94,63,0.55)" : CARD,
                    }}
                    aria-pressed={on}
                  >
                    <span aria-hidden style={{ fontSize: 15, opacity: on ? 1 : 0.45 }}>{on ? "●" : "○"}</span>
                    {c}
                  </button>
                );
              })}
              {/* Only when the model didn't already offer one — it sometimes
                  includes "Something else" as a choice, and two of them next to
                  each other is just confusing. */}
              {!wroteInstead && !choices.some((c) => /^something else$/i.test(c.trim())) && (
                <button
                  type="button"
                  onClick={() => {
                    setAnswer(" ");
                    // Bring it above the keyboard. Deferred a frame because the
                    // textarea doesn't exist until this state change renders,
                    // and again after the keyboard animates in — iOS resizes
                    // the viewport partway through, so a single scroll lands
                    // short.
                    requestAnimationFrame(() => {
                      freeTextRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                    });
                    setTimeout(() => {
                      freeTextRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                    }, 350);
                  }}
                  style={{
                    background: "transparent", color: SAGE, border: "none", cursor: "pointer",
                    fontFamily: FONT, fontSize: 13.5, padding: "6px 2px", textAlign: "left",
                    textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  Something else
                </button>
              )}
            </div>
          )}

          {(choices.length === 0 || wroteInstead) && (
            <textarea
              key={qIndex}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              ref={freeTextRef}
              autoFocus={wroteInstead}
              rows={4}
              maxLength={1000}
              placeholder="Your answer…"
              style={{
                ...card, width: "100%", boxSizing: "border-box", color: WARM,
                fontFamily: FONT, fontSize: 15, lineHeight: 1.6, outline: "none", resize: "vertical",
              }}
            />
          )}

          {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

          <button
            type="button"
            onClick={() => { if (isLast) { submitFollowups(); } else { setError(null); setQIndex((i) => i + 1); } }}
            style={primaryBtn}
          >
            {isLast ? "Build my rhythm" : "Continue"}
          </button>
          <button
            type="button"
            onClick={() => { setError(null); if (qIndex > 0) setQIndex((i) => i - 1); else setPhase("describe"); }}
            style={quietBtn}
          >
            Back
          </button>
        </div>
      </Layout>
    );
  }

  // ── 3. Read-back — one slide per part of the day ──────────────────────────
  // Owner: show what we heard for morning / contemplation / evening as cards,
  // and ask for each whether it represents what they do. Rows come from the
  // SANITIZED spec, so this is a read-back of the routine itself, not of the
  // model's prose about it.
  if (phase === "confirm") {
    // Guard the index: a rebuild triggered by a correction can come back with a
    // SHORTER list than the one being walked, and reading past the end would
    // crash the slide.
    // Empty list → Math.min(0, -1) is -1 → undefined → `section.key` throws a
    // white screen mid-flow. The useEffect that redirects runs AFTER this
    // render, so it cannot save us; render nothing and let it move us on.
    if (confirmSections.length === 0) return null;
    const section = confirmSections[Math.max(0, Math.min(confirmIndex, confirmSections.length - 1))]!;
    const rows = settings.filter((r) => r.section === section.key);
    const isLast = confirmIndex >= confirmSections.length - 1;
    const specNow = (spec ?? {}) as any;
    const prefs = (specNow.officePrefs ?? {}) as {
      morning?: string; evening?: string; morningTime?: string | null; eveningTime?: string | null;
      contemplationGoalMinutes?: number;
    };
    /**
     * This slide is about THE SIT.
     *
     * Owner: "we want it to focus just on the sit — asking how much time, how
     * often, things like that." So a walk / breath / sacred listening reads
     * back under "practices" now, not here.
     *
     * Which means an empty `rows` no longer proves they keep nothing
     * contemplative: they might have described a walk, which lives in the
     * rule-config. Ask only when BOTH are absent, or someone who told us about
     * their walk gets asked whether they'd like a contemplative practice.
     */
    const rcNow = (specNow.ruleConfig ?? {}) as Record<string, string>;
    // Always false now that a contemplation slide requires rows (see the
    // filter above). The picker markup below is left in place but unreachable;
    // it is the only implementation of "choose a contemplative practice" and
    // will be wanted again if that step ever returns to this flow.
    const asking = false as boolean;
    // A sit we DID hear — the slide becomes an editable panel for it.
    const hasSit = section.key === "contemplation" && rows.length > 0;
    const isSide = section.key === "morning" || section.key === "evening";
    const reminderOn = isSide && (prefs as any)[section.key] !== "none" && !!(prefs as any)[section.key];
    const reminderTime = (isSide && ((prefs as any)[`${section.key}Time`] as string | null))
      || (section.key === "morning" ? "07:00" : "18:00");
    // Only the office and the short devotion have a medium to choose. Psalms,
    // the Examen and Compline are one surface each, so a "how" row there would
    // be a control with nothing behind it.
    const sideLevel = ((specNow.ruleConfig ?? {}) as Record<string, string>)[`phoebe:office:level:${section.key}`];
    const mediumApplies = isSide && (sideLevel === "office" || sideLevel === "devotion");
    const mediumValue = ((specNow.ruleConfig ?? {}) as Record<string, string>)[`phoebe:office:entry:${section.key}`]
      || "venite";

    /** Patch the pending spec in place. Nothing is written to the account until
     *  the final review, so these edits are free to be direct. */
    const patchSpec = (fn: (draft: any) => void) => {
      setSpec((prev) => {
        const draft = JSON.parse(JSON.stringify(prev ?? {}));
        draft.officePrefs = draft.officePrefs ?? {};
        draft.ruleConfig = draft.ruleConfig ?? {};
        draft.homeLayout = draft.homeLayout ?? { order: [], hidden: [] };
        fn(draft);
        return draft;
      });
    };

    /** Keep the REVIEW in step with the sit controls. `settings` is what the
     *  final screen renders, so a sit edited here that still read "15 min ·
     *  with a timer" at the end would be asking them to approve the number
     *  they'd just changed. Only the contemplation section holds sit rows now. */
    const syncSitRows = (mins: number, log: "timer" | "manual", often: "once" | "more") => {
      const sub = `${mins} min a day${often === "more" ? ", across a few sits" : ""} · ${log === "manual" ? "tap to log" : "with a timer"}`;
      setSettings((prev) => prev.map((r) => (r.section === "contemplation" ? { ...r, sub } : r)));
    };

    const advance = () => {
      setError(null); setShowFix(false); setFixText("");
      // Came here from the review's gear → go straight back to it. They came to
      // change one thing, not to re-walk the flow.
      if (returnToReview) { setReturnToReview(false); setPhase("review"); return; }
      if (isLast) { setPhase(skipExtras ? "review" : "extras"); return; }
      setConfirmIndex((i2) => i2 + 1);
    };
    /**
     * Advance the Silence picker: choose → (length → log method) → next slide.
     *
     * The chosen practice is written straight onto the pending spec AND
     * appended to `settings`, because `settings` is what the final review
     * renders. A pick that changed the spec without showing up there would be
     * applied to the account while being absent from the screen that asks you
     * to approve it.
     */
    const contNext = () => {
      setError(null);
      if (contStep === 0) {
        if (contPick === "silence") { setContStep(1); return; }
        const choice = CONTEMPLATIVE_CHOICES.find((c) => c.key === contPick);
        if (choice?.slot) {
          patchSpec((d) => {
            d.ruleConfig[`phoebe:slot:${choice.key}`] = choice.slot;
            const order: string[] = d.homeLayout.order ?? [];
            if (!order.includes(choice.key)) order.push(choice.key);
            d.homeLayout.order = order;
            d.homeLayout.hidden = (d.homeLayout.hidden ?? []).filter((k: string) => k !== choice.key);
          });
          setSettings((prev) => [...prev, {
            id: `slot:${choice.key}`,
            emoji: choice.emoji, label: choice.label,
            sub: SLOT_TEXT[choice.slot!] ?? "Each day", section: "contemplation",
          }]);
        }
        advance();
        return;
      }
      if (contStep === 1) { setContStep(2); return; }
      patchSpec((d) => {
        d.officePrefs.contemplationGoalMinutes = contMinutes;
        d.ruleConfig["phoebe:contemplation-style"] = "silent";
        d.ruleConfig["phoebe:contemplation-log-method"] = contLog;
        d.ruleConfig["phoebe:contemplation-sits"] = contOften === "more" ? "several" : "one";
        const order: string[] = d.homeLayout.order ?? [];
        if (!order.includes("contemplation")) order.push("contemplation");
        d.homeLayout.order = order;
        d.homeLayout.hidden = (d.homeLayout.hidden ?? []).filter((k: string) => k !== "contemplation");
      });
      setSettings((prev) => [...prev, {
        id: "contemplation",
        emoji: "🕯️", label: "Silence",
        sub: `${contMinutes} min a day · ${contLog === "manual" ? "tap to log" : "with a timer"}`,
        section: "contemplation",
      }]);
      advance();
    };

    const saveFix = () => {
      const t = fixText.trim();
      // Empty box → close it, don't advance. Advancing here is what made the
      // correction path feel like it "just goes back".
      if (!t) { setShowFix(false); return; }
      // Rebuild with the correction folded in rather than patching the spec
      // here — the model owns turning "actually I use the book" into a level
      // and an entry, and a half-corrected spec is worse than a fresh one.
      // Replace this section's correction rather than appending. Correcting
      // the same slide twice used to send BOTH lines to the model — "Morning:
      // actually the book" followed by "Morning: no, on screen" — leaving it
      // to reconcile two contradictory instructions from the same person about
      // the same thing. The latest word wins, which is what they mean.
      const next = [
        ...corrections.filter((c) => !c.startsWith(`${section.title}: `)),
        `${section.title}: ${t}`,
      ];
      setCorrections(next);
      // Come back to THIS section so they can see their correction landed.
      void submitFollowups(next, confirmIndex);
    };

    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={wrap}>
          {progressBars}
          <div>
            <p style={eyebrow}>{`Part ${confirmIndex + 1} of ${confirmSections.length}`} 🌿</p>
            <h1 style={h1}>
              {asking ? (contStep === 1 ? "How long?" : contStep === 2 ? "How you'll keep it" : "A contemplative practice") : section.title}
            </h1>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              {!asking
                ? "Here's what we heard."
                : contStep === 1
                  ? "However long you actually sit. You can change it any time."
                  : contStep === 2
                    ? "What should happen when you tap the card?"
                    : "We didn't hear one — would you like one? \u201CNot right now\u201D is a real answer."}
            </p>
          </div>

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r, i2) => (
                <div key={`${r.label}-${i2}`} style={routineCard}>
                  <div style={routineAccent} />
                  <div style={{ flex: 1, minWidth: 0, padding: "18px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={routineBadge} aria-hidden>{r.emoji}</span>
                      <p style={{ color: WARM, fontFamily: FONT, fontSize: 18, fontWeight: 600, margin: 0 }}>{r.label}</p>
                    </div>
                    {/* The dropdown below owns the medium once it's shown, so
                        the card reads from the live spec rather than from the
                        sub the server rendered — otherwise changing it there
                        would leave the card still claiming the old one. */}
                    <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 0" }}>
                      {hasSit
                        // The controls below own the minutes and the log
                        // method now, so the card must not also state them —
                        // it would be asserting the old values underneath the
                        // switches that change them.
                        ? "Silent prayer"
                        : mediumApplies && i2 === 0
                          ? (MEDIUM_OPTIONS.find((o) => o.value === mediumValue)?.label ?? r.sub)
                          : r.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* How they take it. A dropdown, not a question — see MEDIUM_OPTIONS. */}
          {isSide && rows.length > 0 && mediumApplies && (
            <div>
              {/* Owner: "it shouldn't say how do you take it... it should ask what
                  format." */}
              <p style={{ ...eyebrow, marginBottom: 8 }}>What format</p>
              <SelectPill
                value={mediumValue}
                ariaLabel="What format"
                onChange={(v) => patchSpec((d) => { d.ruleConfig[`phoebe:office:entry:${section.key}`] = v; })}
              >
                {MEDIUM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectPill>
            </div>
          )}

          {/* Reminder — its own control, under the practice card. Owner: "as a
              separate UI, similar to how it is in the manual slideshow, have it
              ask if they would like a notification or [that] it is off." Same
              one-line switch the customizer uses, and the time only appears
              when the switch is on. */}
          {isSide && rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() => patchSpec((d) => {
                  if (reminderOn) {
                    d.officePrefs[section.key] = "none";
                  } else {
                    // Match the reminder to what they actually pray, the way
                    // the customizer does — a devotion side gets the devotion
                    // nudge, everything else the office one.
                    const level = d.ruleConfig[`phoebe:office:level:${section.key}`];
                    d.officePrefs[section.key] = level === "devotion" ? "devotion" : "office";
                    if (!d.officePrefs[`${section.key}Time`]) {
                      d.officePrefs[`${section.key}Time`] = section.key === "morning" ? "07:00" : "18:00";
                    }
                  }
                })}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  background: reminderOn ? "rgba(46,107,64,0.14)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${reminderOn ? "rgba(110,180,130,0.5)" : CARD_B}`,
                  borderRadius: 16, padding: 16, display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 12,
                }}
                aria-pressed={reminderOn}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: WARM, fontFamily: FONT, margin: 0 }}>🔔 Remind me</p>
                  <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT, margin: "3px 0 0" }}>
                    {reminderOn
                      ? `A gentle nudge to pray in the ${section.key}.`
                      : "No daily nudge — pray when you like."}
                  </p>
                </div>
                <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: reminderOn ? CTA : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
                  <span style={{ position: "absolute", top: 3, left: reminderOn ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: WARM, transition: "left 0.2s" }} />
                </span>
              </button>
              {reminderOn && (
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Only keep a complete HH:MM — a half-typed time would
                    // fail the server's time check and silently become null.
                    if (/^\d{2}:\d{2}$/.test(v)) patchSpec((d) => { d.officePrefs[`${section.key}Time`] = v; });
                  }}
                  aria-label="Reminder time"
                  style={{
                    // maxWidth/minWidth matter here: iOS gives input[type=time]
                    // an intrinsic width from its native control that ignores
                    // width:100%, which is what made the 7:00 AM row sit wider
                    // than the cards above it.
                    // Full length, matching the customizer's twin of this row
                    // and the controls above it. maxWidth/minWidth are the
                    // overflow guard, not a size — iOS gives input[type=time]
                    // an intrinsic native width that ignores width:100%.
                    ...card, width: "100%", maxWidth: "100%", minWidth: 0,
                    boxSizing: "border-box", color: WARM,
                    fontFamily: FONT, fontSize: 16, outline: "none", colorScheme: "dark", padding: "13px 14px",
                  }}
                />
              )}
            </div>
          )}

          {/* The sit, as controls rather than a claim. Owner, after a real run:
              it never asked whether fifteen minutes was the only sit, and never
              asked whether they'd use the in-app timer or log it by hand.
              Both are asked here, on the third stage, where a control can't
              forget to fire the way a prompt instruction can. */}
          {hasSit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <p style={{ ...eyebrow, marginBottom: 8 }}>How often you sit</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {([
                    { v: "once" as const, label: "Once a day" },
                    { v: "more" as const, label: "More than once" },
                  ]).map((o) => {
                    const on = contOften === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => {
                          setContOften(o.v);
                          patchSpec((d) => {
                            d.ruleConfig["phoebe:contemplation-sits"] = o.v === "more" ? "several" : "one";
                          });
                          syncSitRows(contMinutes, contLog, o.v);
                        }}
                        style={{
                          flex: 1, cursor: "pointer", padding: "14px 10px", borderRadius: 14,
                          border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                          background: on ? "rgba(45,94,63,0.55)" : CARD,
                          color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 14.5,
                          fontWeight: on ? 700 : 600,
                        }}
                        aria-pressed={on}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                {/* Owner: "it should be contemplation time, [and] the time
                    should be in a dropdown, wide one-row pill like the manual
                    customizer."

                    Phoebe's goal field is a DAILY TOTAL either way, so both
                    answers write the same number — asking "once or more?" is
                    what makes that number right. Someone who sits three times
                    reads a bare "how long?" as one sit and under-reports the
                    day, so the hint below says which is being asked for. */}
                <p style={{ ...eyebrow, marginBottom: 8 }}>Contemplation time</p>
                {/* A text field, not presets (owner). A silence practice is
                    whatever length it actually is — 12 minutes, 25, 40 — and a
                    fixed list quietly rounds people to the nearest option we
                    happened to think of. */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={180}
                    value={contMinutes === 0 ? "" : String(contMinutes)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      // Allow the field to be empty mid-edit without writing 0
                      // to the spec — clearing it to type "45" shouldn't land
                      // as "no silence" for the keystroke in between.
                      if (raw === "") { setContMinutes(0); return; }
                      const m = Math.max(1, Math.min(180, parseInt(raw, 10)));
                      setContMinutes(m);
                      patchSpec((d) => { d.officePrefs.contemplationGoalMinutes = m; });
                      syncSitRows(m, contLog, contOften);
                    }}
                    aria-label="Contemplation time in minutes"
                    style={{
                      ...card, width: 120, maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
                      color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 600,
                      outline: "none", colorScheme: "dark", padding: "13px 14px",
                    }}
                  />
                  <span style={{ color: SAGE, fontFamily: FONT, fontSize: 15 }}>minutes</span>
                </div>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, margin: "8px 0 0" }}>
                  {contOften === "more" ? "Across the whole day." : "For your daily sit."}
                </p>
              </div>

              <div>
                <p style={{ ...eyebrow, marginBottom: 8 }}>How you keep it</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {([
                    { v: "timer" as const, emoji: "⏱️", label: "The meditation timer", sub: "Sit with a countdown in the app — tap Begin to start it." },
                    { v: "manual" as const, emoji: "✅", label: "Log it myself", sub: "No timer — tap the card to mark the sit done." },
                  ]).map((o) => {
                    const on = contLog === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => {
                          setContLog(o.v);
                          patchSpec((d) => { d.ruleConfig["phoebe:contemplation-log-method"] = o.v; });
                          syncSitRows(contMinutes, o.v, contOften);
                        }}
                        style={{
                          ...card, width: "100%", boxSizing: "border-box", textAlign: "left",
                          cursor: "pointer", padding: "14px 16px", display: "flex",
                          alignItems: "center", gap: 12,
                          border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                          background: on ? "rgba(45,94,63,0.55)" : CARD,
                        }}
                        aria-pressed={on}
                      >
                        <span aria-hidden style={{ fontSize: 20 }}>{o.emoji}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 15.5, fontWeight: on ? 700 : 600 }}>{o.label}</span>
                          <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{o.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Change the practice by hand — no rebuild, no spinner, nothing else
              in the routine moves. Writes the level straight onto the pending
              spec and relabels the row, which is all "not quite" was ever
              really being asked to accomplish for a side. */}
          {pickingPractice && isSide && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ ...eyebrow, marginBottom: 2 }}>What do you pray instead?</p>
              {SIDE_PRACTICES
                // Compline is the night office — never a morning anchor.
                .filter((o) => !(o.level === "compline" && section.key === "morning"))
                .map((o) => {
                  const cap = section.key === "morning" ? "Morning" : "Evening";
                  const on = sideLevel === o.level;
                  return (
                    <button
                      key={o.level}
                      type="button"
                      onClick={() => {
                        patchSpec((d) => {
                          d.ruleConfig[`phoebe:office:level:${section.key}`] = o.level;
                          // The format only applies to the office and the short
                          // devotion; carrying "on venite.app" onto the Examen
                          // would describe a way to pray it that doesn't exist.
                          if (o.level !== "office" && o.level !== "devotion") {
                            delete d.ruleConfig[`phoebe:office:entry:${section.key}`];
                          }
                        });
                        setSettings((prev) => prev.map((r) => (
                          r.id === `side:${section.key}`
                            ? { ...r, label: o.label(cap), sub: o.sub }
                            : r
                        )));
                        setPickingPractice(false);
                      }}
                      style={{
                        ...card, width: "100%", boxSizing: "border-box", textAlign: "left",
                        cursor: "pointer", padding: "13px 15px",
                        border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                        background: on ? "rgba(45,94,63,0.55)" : CARD,
                      }}
                      aria-pressed={on}
                    >
                      <span style={{ display: "block", color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 15, fontWeight: on ? 700 : 600 }}>
                        {o.label(cap)}
                      </span>
                      <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 12.5, marginTop: 2 }}>{o.sub}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {asking && contStep === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...CONTEMPLATIVE_CHOICES, { key: "none", emoji: "🌿", label: "Not right now", sub: "Leave silence out of your rhythm." }].map((c) => {
                const on = contPick === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setContPick(on ? null : c.key)}
                    style={{
                      ...card, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer",
                      padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                      border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                      background: on ? "rgba(45,94,63,0.55)" : CARD,
                    }}
                    aria-pressed={on}
                  >
                    <span aria-hidden style={{ fontSize: 20 }}>{c.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 15.5, fontWeight: on ? 700 : 600 }}>{c.label}</span>
                      <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{c.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {asking && contStep === 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {SILENCE_LENGTHS.map((m) => {
                const on = contMinutes === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setContMinutes(m)}
                    style={{
                      flex: "1 1 28%", cursor: "pointer", padding: "16px 10px", borderRadius: 14,
                      border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                      background: on ? "rgba(45,94,63,0.55)" : CARD,
                      color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 16, fontWeight: on ? 700 : 600,
                    }}
                    aria-pressed={on}
                  >
                    {m} min
                  </button>
                );
              })}
            </div>
          )}

          {asking && contStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { v: "timer" as const, emoji: "⏱️", label: "Timer", sub: "Sit with a countdown — tap Begin to start it." },
                { v: "manual" as const, emoji: "✅", label: "Tap to log", sub: "No timer — tap the card to mark it done." },
              ]).map((o) => {
                const on = contLog === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setContLog(o.v)}
                    style={{
                      ...card, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer",
                      padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                      border: `1px solid ${on ? "rgba(110,180,130,0.62)" : CARD_B}`,
                      background: on ? "rgba(45,94,63,0.55)" : CARD,
                    }}
                    aria-pressed={on}
                  >
                    <span aria-hidden style={{ fontSize: 20 }}>{o.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", color: on ? WARM : SAGE, fontFamily: FONT, fontSize: 15.5, fontWeight: on ? 700 : 600 }}>{o.label}</span>
                      <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{o.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {showFix && (
            <textarea
              value={fixText}
              onChange={(e) => setFixText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What's different?"
              style={{
                ...card, width: "100%", boxSizing: "border-box", color: WARM,
                fontFamily: FONT, fontSize: 15, lineHeight: 1.6, outline: "none", resize: "vertical",
              }}
            />
          )}

          {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

          {showFix ? (
            <button type="button" onClick={saveFix} style={primaryBtn}>Use this instead</button>
          ) : asking ? (
            <button
              type="button"
              onClick={contNext}
              disabled={contStep === 0 && contPick === null}
              style={{ ...primaryBtn, opacity: contStep === 0 && contPick === null ? 0.45 : 1 }}
            >
              Continue
            </button>
          ) : (
            <button type="button" onClick={advance} style={primaryBtn}>
              {section.ask.replace(/\?$/, "")} — yes
            </button>
          )}
          {/* Nothing to disagree with on a slide that's asking rather than
              telling — "Not quite" there would just be a second no. */}
          {/* Owner: "instead of 'not quite', how about it goes to an adjust
              where they do it manually."

              For a side, the manual path is complete — format and reminder are
              already inline above, and the picker covers the practice — so it
              leads, and the model is never involved in a correction. Describing
              it in words stays as a quiet second option, for the case the
              picker can't express ("I alternate", "only on Fridays"), where a
              rebuild really is the right tool. */}
          {!asking && isSide && !showFix && (
            <button
              type="button"
              onClick={() => setPickingPractice((v) => !v)}
              style={quietBtn}
            >
              {pickingPractice ? "Never mind" : "Change it myself"}
            </button>
          )}
          {/* On a SIDE there is no "Not quite" any more. Everything it used to
              cover is editable in place — the practice picker above, the format
              dropdown and the reminder switch on the card — so the old button
              opened a text box that rebuilt the routine, and tapping through it
              with nothing typed simply advanced. Reported as "not quite doesn't
              have you edit it, it just goes back". The remaining sections have
              no inline controls yet, so they keep it. */}
          {!asking && !pickingPractice && !isSide && (
            <button
              type="button"
              onClick={() => (showFix ? setShowFix(false) : setShowFix(true))}
              style={quietBtn}
            >
              {showFix ? "Never mind" : "Not quite"}
            </button>
          )}
          {!showFix && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (asking && contStep > 0) { setContStep((st) => (st === 2 ? 1 : 0)); return; }
                if (confirmIndex > 0) { setConfirmIndex((i2) => i2 - 1); return; }
                // An adjustment that needed no clarification has no follow-up
                // slides to go back to. Sending them there rendered a live
                // dead-end: "One question", no question text, an empty box and
                // a Continue that rebuilt from nothing.
                if (questions.length === 0) { setPhase("describe"); return; }
                setQIndex(questions.length - 1);
                setPhase("followups");
              }}
              style={{ ...quietBtn, border: "none", color: "rgba(143,175,150,0.7)" }}
            >
              Back
            </button>
          )}
        </div>
      </Layout>
    );
  }

  // ── 4. Extras — the customizer's "additional practice" step ───────────────
  // Owner: "a third slide that gives them the options in the customizer format
  // for extra contemplative practices, replicating the slide from the manual
  // slideshow." Deterministic — these are the person's own picks, so they're
  // written straight onto the spec rather than sent back through the model.
  if (phase === "extras") {
    // The manual slide HIDES an option that's already a side's primary prayer,
    // and replicating it means replicating that too — otherwise someone whose
    // evening anchor IS Compline gets offered Compline again here and ends up
    // with two Compline cards for one office. Same for the Examen, and for
    // Creation Prayer when it's already a side's contemplation style.
    const rc = ((spec as any)?.ruleConfig ?? {}) as Record<string, string>;
    const levels = [rc["phoebe:office:level:morning"], rc["phoebe:office:level:evening"]];
    const alreadyPrimary: Record<string, boolean> = {
      compline: levels.includes("compline"),
      examen: levels.includes("examen"),
      cobreathe: rc["phoebe:contemplation-style"] === "cobreathe"
        && (rc["phoebe:office:contemplation:morning"] === "1" || rc["phoebe:office:contemplation:evening"] === "1"),
    };
    /**
     * Also drop anything the interview ALREADY heard them say.
     *
     * Owner: "when it got to the contemplative practices page, I didn't realize
     * that — hey, I had marked contemplative walk." They hadn't: they'd
     * described a walk, the model had programmed it, and this page then offered
     * it as though it were news. Picking it added a SECOND row, so the review
     * showed "Contemplative Walk, in the morning" and "Contemplative Walk, in
     * the afternoon" — one practice, contradicting itself.
     *
     * A card counts as heard when it's placed in a slot, or sits in the layout
     * unhidden. `order` alone isn't evidence: the server backfills every module
     * key into it and uses `hidden` to decide what actually shows.
     */
    const hl = ((spec as any)?.homeLayout ?? {}) as { order?: string[]; hidden?: string[] };
    const hiddenNow = new Set(hl.hidden ?? []);
    const visibleNow = new Set((hl.order ?? []).filter((k) => !hiddenNow.has(k)));
    const alreadyHeard = EXTRAS.filter(
      (e) => alreadyPrimary[e.key] || !!rc[`phoebe:slot:${e.key}`] || visibleNow.has(e.key),
    );
    const heardKeys = new Set(alreadyHeard.map((e) => e.key));
    const offered = EXTRAS.filter((e) => !heardKeys.has(e.key));

    const toggle = (k: string) =>
      setExtras((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        return next;
      });

    const finish = () => {
      if (spec) {
        const next = { ...(spec as any) };
        const hl = { ...(next.homeLayout ?? { order: [], hidden: [] }) };
        const order: string[] = [...(hl.order ?? [])];
        const hidden: string[] = [...(hl.hidden ?? [])];
        const rc: Record<string, string> = { ...(next.ruleConfig ?? {}) };
        // This step only ADDS. Leaving one un-picked means "I didn't say I do
        // this", not "remove it" — a card the model already placed from what
        // they described stays, and the read-back round is where something
        // wrong gets corrected.
        const added: SpecRow[] = [];
        for (const e of offered) {
          if (!extras.has(e.key)) continue;
          if (!order.includes(e.key)) order.push(e.key);
          // Adding to `order` isn't enough on its own: a key sitting in
          // `hidden` stays off the home no matter where it is in the order, so
          // a practice they just picked would silently not appear.
          const h = hidden.indexOf(e.key);
          if (h >= 0) hidden.splice(h, 1);
          if (e.slot) rc[`phoebe:slot:${e.key}`] = e.slot;
          added.push({ id: e.slot ? `slot:${e.key}` : `card:${e.key}`, emoji: e.emoji, label: e.label, sub: e.slot ? SLOT_TEXT[e.slot] ?? "Each day" : "Each day", section: "practices" });
        }
        next.homeLayout = { ...hl, order, hidden };
        next.ruleConfig = rc;
        setSpec(next);
        // The review renders `settings`, which came from the server BEFORE
        // these picks existed. Without appending them, a practice chosen here
        // would be applied to the account while being absent from the screen
        // that asks you to approve it — the same "approve what you can't see"
        // failure the derived-settings change was made to close.
        if (added.length > 0) setSettings((prev) => [...prev, ...added]);
      }
      // A practice of their own, typed above. Owner: "after they've seen their
      // thing — is there any other practice you do that is not named here, and
      // it's a custom practice?" Rides beside the spec like the ones the model
      // proposed, and is written as a custom anchor on apply.
      const typed = ownPractice.trim();
      if (typed) {
        const already = customPractices.some((c) => c.title.trim().toLowerCase() === typed.toLowerCase());
        if (!already) {
          setCustomPractices((prev) => [...prev, { title: typed.slice(0, 40), emoji: "🌿", slot: "anytime" }]);
          setSettings((prev) => [...prev, {
            id: `custom:${typed.slice(0, 40)}`,
            emoji: "🌿", label: typed.slice(0, 40), sub: "Any time of day", section: "practices",
          }]);
        }
      }
      setError(null);
      setPhase("review");
    };

    return (
      <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
        <div style={wrap}>
          {progressBars}
          <div>
            <p style={eyebrow}>One more thing 🌿</p>
            <h1 style={h1}>Anything else you keep?</h1>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
              Only if you already do it. Skip whatever you don't.
            </p>
          </div>

          {/* Name what we already caught before asking for more, so this page
              reads as "and anything else?" rather than starting from zero and
              inviting them to re-add what they just told us. */}
          {alreadyHeard.length > 0 && (
            <div>
              <p style={{ ...eyebrow, marginBottom: 8 }}>Already in your rhythm</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {alreadyHeard.map((e) => (
                  <span
                    key={e.key}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      background: "rgba(110,180,130,0.16)", border: `1px solid ${CARD_B}`,
                      borderRadius: 999, padding: "7px 13px",
                      color: WARM, fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
                    }}
                  >
                    <span aria-hidden>{e.emoji}</span>
                    {e.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {offered.map((e) => {
              const on = extras.has(e.key);
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => toggle(e.key)}
                  style={{
                    ...rowCard,
                    cursor: "pointer", textAlign: "left", width: "100%",
                    background: on ? "rgba(46,107,64,0.24)" : CARD,
                    borderColor: on ? "rgba(46,107,64,0.65)" : CARD_B,
                  }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{e.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{e.label}</span>
                    <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{e.sub}</span>
                  </span>
                  <span style={{ color: on ? "#A8C5A0" : "rgba(143,175,150,0.35)", fontSize: 16, flexShrink: 0 }} aria-hidden>
                    {on ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Owner asked where this belongs; this step is the answer. It's
              already the "anything else you keep?" moment, it comes AFTER the
              read-back so they've seen what we heard, and BEFORE the review so
              whatever they add still gets approved with everything else. A
              fourth stage would be a second screen asking the same question. */}
          {/* Hidden when building for someone else: a PrescribedRoutineSpec has
              no place for custom anchors, so anything typed here would be
              collected and then quietly dropped on the way to the link. */}
          {!prescribe && (
          <div>
            <p style={{ ...eyebrow, marginBottom: 8 }}>Something not listed?</p>
            <input
              value={ownPractice}
              onChange={(e) => setOwnPractice(e.target.value.slice(0, 40))}
              maxLength={40}
              placeholder="e.g. The Rosary"
              aria-label="A practice of your own"
              style={{
                ...card, width: "100%", boxSizing: "border-box", color: WARM,
                fontFamily: FONT, fontSize: 15, outline: "none", padding: "13px 14px",
              }}
            />
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, margin: "8px 0 0" }}>
              Any practice you keep that Phoebe doesn't have a name for. It'll
              become a card of your own.
            </p>
          </div>
          )}

          <button type="button" onClick={finish} style={primaryBtn}>Continue</button>
          <button type="button" onClick={() => { setError(null); setConfirmIndex(confirmSections.length - 1); setPhase("confirm"); }} style={quietBtn}>
            Back
          </button>
        </div>
      </Layout>
    );
  }

  /**
   * Editing and deleting a row on the review.
   *
   * Both work off the row's `id` rather than its label — a label is display
   * text, and matching on it breaks the first time a practice is renamed.
   *
   * Delete removes the practice from the SPEC as well as from the list: a row
   * that vanished from the screen while its rule-config entry survived would be
   * the worst of both, applying a practice they'd just told us to drop.
   */
  const patchReviewSpec = (fn: (draft: any) => void) => {
    setSpec((prev) => {
      const draft = JSON.parse(JSON.stringify(prev ?? {}));
      draft.officePrefs = draft.officePrefs ?? {};
      draft.ruleConfig = draft.ruleConfig ?? {};
      draft.homeLayout = draft.homeLayout ?? { order: [], hidden: [] };
      fn(draft);
      return draft;
    });
  };

  const hideCard = (draft: any, key: string) => {
    draft.homeLayout.order = (draft.homeLayout.order ?? []).filter((k: string) => k !== key);
    const hidden: string[] = draft.homeLayout.hidden ?? [];
    if (!hidden.includes(key)) hidden.push(key);
    draft.homeLayout.hidden = hidden;
  };

  const deleteRow = (row: SpecRow) => {
    const [kind, rest] = [row.id.slice(0, row.id.indexOf(":")), row.id.slice(row.id.indexOf(":") + 1)];
    patchReviewSpec((d) => {
      if (row.id === "contemplation") {
        d.officePrefs.contemplationGoalMinutes = 0;
        delete d.ruleConfig["phoebe:office:contemplation:morning"];
        delete d.ruleConfig["phoebe:office:contemplation:evening"];
        delete d.ruleConfig["phoebe:office:minutes:morning"];
        delete d.ruleConfig["phoebe:office:minutes:evening"];
        delete d.ruleConfig["phoebe:contemplation-sits"];
        hideCard(d, "contemplation");
        return;
      }
      if (kind === "side") {
        // "ask" is how Phoebe says a side has no anchor — the same thing the
        // customizer's None option sets.
        d.ruleConfig[`phoebe:office:level:${rest}`] = "ask";
        delete d.ruleConfig[`phoebe:office:entry:${rest}`];
        d.officePrefs[rest] = "none";
        d.officePrefs[`${rest}Time`] = null;
        // Only drop the office card when NEITHER side is left using it.
        const other = rest === "morning" ? "evening" : "morning";
        const otherLevel = d.ruleConfig[`phoebe:office:level:${other}`];
        if (!otherLevel || otherLevel === "ask") hideCard(d, "office");
        return;
      }
      if (kind === "slot") { delete d.ruleConfig[`phoebe:slot:${rest}`]; hideCard(d, rest); return; }
      if (kind === "card") { hideCard(d, rest); return; }
    });
    if (row.id.startsWith("custom:")) {
      const title = row.id.slice("custom:".length);
      setCustomPractices((prev) => prev.filter((c) => c.title !== title));
    }
    setSettings((prev) => prev.filter((r) => r.id !== row.id));
    setDeletingRow(null);
    setEditingRow(null);
  };

  /** The slot rows and custom practices share one setting: time of day. */
  const setRowSlot = (row: SpecRow, slot: string) => {
    if (row.id.startsWith("slot:")) {
      const key = row.id.slice("slot:".length);
      patchReviewSpec((d) => { d.ruleConfig[`phoebe:slot:${key}`] = slot; });
    } else if (row.id.startsWith("custom:")) {
      const title = row.id.slice("custom:".length);
      setCustomPractices((prev) => prev.map((c) => (c.title === title ? { ...c, slot } : c)));
    }
    setSettings((prev) => prev.map((r) => (r.id === row.id ? { ...r, sub: SLOT_TEXT[slot] ?? "Each day" } : r)));
  };

  // ── 3. Review ──────────────────────────────────────────────────────────────
  const reviewPrefs = ((spec as any)?.officePrefs ?? {}) as {
    morning?: string; evening?: string; morningTime?: string | null; eveningTime?: string | null;
  };
  const reminderLines = (["morning", "evening"] as const)
    .map((side) => {
      const pref = reviewPrefs[side];
      const time = reviewPrefs[`${side}Time`];
      if (!pref || pref === "none" || !time) return null;
      const [h, m] = time.split(":").map((n) => parseInt(n, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      const hour = h % 12 === 0 ? 12 : h % 12;
      return `${side === "morning" ? "Morning" : "Evening"} reminder at ${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    })
    .filter((l): l is string => l !== null);

  return (
    <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation(prescribe ? prescribeBack : "/daily-progress")}>
      <div style={wrap}>
          {progressBars}
        <div>
          <p style={eyebrow}>Here it is 🌿</p>
          <h1 style={h1}>Your rhythm in Phoebe</h1>
        </div>

        {summary && (
          <div style={card}>
            <p style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>
              {summary}
            </p>
          </div>
        )}

        {/* The routine itself, rendered as the manual customizer's review rows
            (owner: "I want the routine to be shown like it would at the end of
            the manual flow") — same emoji / label / sub shape, so the two flows
            end on the same screen. Derived server-side FROM the sanitized spec,
            never from the model's prose: approving a description the model
            wrote about its own output gives no way to catch it describing one
            routine and programming another. */}
        {settings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settings.map((r, i) => {
              const open = editingRow === r.id;
              // Only rows with something to configure get a gear. A newsletter
              // is on or off — offering settings that hold nothing is worse
              // than offering none.
              const slotEditable = r.id.startsWith("slot:") || r.id.startsWith("custom:");
              const configurable = slotEditable || r.id === "contemplation" || r.id.startsWith("side:");
              const circle: React.CSSProperties = {
                width: 30, height: 30, flexShrink: 0, borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.06)", border: `1px solid ${CARD_B}`,
                color: SAGE, fontSize: 14, cursor: "pointer", padding: 0,
              };
              return (
                <div key={r.id || `${r.label}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div style={rowCard}>
                    <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{r.label}</span>
                      <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{r.sub}</span>
                    </span>
                    {configurable && (
                      <button
                        type="button"
                        onClick={() => {
                          // The office and the sit already HAVE a full editor —
                          // their read-back slide, with the format dropdown,
                          // the reminder switch and the sit controls. Send them
                          // there rather than growing a second copy here that
                          // would drift from the first.
                          const target = r.id === "contemplation"
                            ? "contemplation"
                            : r.id.startsWith("side:") ? r.id.slice("side:".length) : null;
                          if (target) {
                            const idx = confirmSections.findIndex((sec) => sec.key === target);
                            if (idx >= 0) {
                              setError(null);
                              setEditingRow(null);
                              setConfirmIndex(idx);
                              setReturnToReview(true);
                              setPhase("confirm");
                              return;
                            }
                          }
                          setEditingRow(open ? null : r.id);
                        }}
                        aria-label={`Settings for ${r.label}`}
                        aria-expanded={open}
                        style={{ ...circle, background: open ? "rgba(45,94,63,0.55)" : circle.background, color: open ? WARM : SAGE }}
                      >
                        ⚙
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeletingRow(r)}
                      aria-label={`Remove ${r.label}`}
                      style={{ ...circle, marginLeft: 8 }}
                    >
                      ✕
                    </button>
                  </div>

                  {open && (
                    <div style={{ ...card, marginTop: -2, borderTopLeftRadius: 0, borderTopRightRadius: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                      {slotEditable && (
                        <div>
                          <p style={{ ...eyebrow, marginBottom: 8 }}>When</p>
                          <SelectPill
                            value={(Object.keys(SLOT_TEXT).find((k) => SLOT_TEXT[k] === r.sub)) ?? "anytime"}
                            ariaLabel={`When you keep ${r.label}`}
                            onChange={(v) => setRowSlot(r, v)}
                          >
                            {Object.entries(SLOT_TEXT).map(([k, label]) => (
                              <option key={k} value={k}>{label}</option>
                            ))}
                          </SelectPill>
                        </div>
                      )}
                      {(r.id === "contemplation" || r.id.startsWith("side:")) && (
                        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                          {/* The office and the sit are configured on their own
                              read-back slides, which carry the reminder switch,
                              the format dropdown and the sit controls. Pointing
                              back there beats reproducing all of it twice and
                              letting the two copies drift. */}
                          {r.id === "contemplation"
                            ? "How often you sit, how long, and how you keep it"
                            : "The format and the reminder"} are set on the read-back
                          screen for this part of your day.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reminders, read from the pending spec rather than from `settings`.
            They came off the practice cards when they got their own control on
            the read-back slides, and the last screen before saving is the wrong
            place for a setting to go unmentioned. */}
        {reminderLines.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reminderLines.map((line) => (
              <div key={line} style={rowCard}>
                <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>🔔</span>
                <span style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 15, fontFamily: FONT }}>{line}</span>
              </div>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ ...card, background: "rgba(46,107,64,0.08)" }}>
            <p style={{ ...eyebrow, fontSize: 10, marginBottom: 8 }}>Where we had to choose</p>
            {notes.map((n, i) => (
              <p key={i} style={{ color: "rgba(200,212,192,0.85)", fontFamily: FONT, fontSize: 13.5, margin: "0 0 6px", lineHeight: 1.5 }}>
                · {n}
              </p>
            ))}
          </div>
        )}

        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          {prescribe
            // A prescribed routine is a PrescribedRoutineSpec, and that shape
            // has no place for custom anchors — they're written per-device on
            // accept. Saying so beats letting an admin believe they'd shared a
            // practice that silently won't arrive.
            ? "You'll name this and get a link to share. Practices Phoebe doesn't have a name for can't travel in a shared routine."
            : "Saving this replaces your current routine. You can change any of it afterwards in Customize."}
        </p>

        {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

        <button
          type="button"
          onClick={prescribe ? handOffPrescribed : applySpec}
          disabled={applying}
          style={{ ...primaryBtn, opacity: applying ? 0.6 : 1 }}
        >
          {prescribe ? "Use this routine" : applying ? "Saving…" : "Save this as my rhythm"}
        </button>
        {/* Back to whatever actually preceded this. In an adjustment the extras
            page is skipped, so "go back" must land on the read-back rather than
            a page they never saw. */}
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (skipExtras) { setConfirmIndex(Math.max(0, confirmSections.length - 1)); setPhase("confirm"); }
            else setPhase("extras");
          }}
          style={quietBtn}
        >
          Not quite — go back
        </button>

        {/* Delete confirmation. Owner: "X to delete it, and have some type of
            popup that says [are you sure] you want to delete it." Worth the
            interruption — the ✕ sits inches from the gear on a phone, and the
            thing behind it is a practice they just spent five screens
            describing. */}
        {deletingRow && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Remove ${deletingRow.label}`}
            onClick={() => setDeletingRow(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 300,
              background: "rgba(4,12,7,0.72)",
              backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...card, maxWidth: 380, width: "100%", boxSizing: "border-box" }}
            >
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 700, margin: 0 }}>
                Remove {deletingRow.label}?
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>
                It won't be part of the rhythm you save. You can add it back in
                Customize whenever you like.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => deleteRow(deletingRow)}
                  style={{
                    flex: 1, background: CTA, color: WARM, border: `1px solid ${CARD_B}`,
                    borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 700,
                    fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingRow(null)}
                  style={{
                    flex: 1, background: "transparent", color: SAGE,
                    border: "1px solid rgba(143,175,150,0.25)", borderRadius: 12,
                    padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  Keep it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
