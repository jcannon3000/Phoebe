// ── The home, before there is a routine ─────────────────────────────────────
//
// Owner, 2026-09-28: "for new users … if they haven't built a routine yet, it
// just would show them practices that they can engage in … just says, maybe
// it's just pray, and then take them to the practices page · read a
// reflection and it takes them to the reflection page · practice
// contemplation, it takes them to a menu like the practices page, but doesn't
// have the offices, daily scripture reading · a fourth card that says build a
// routine or start a routine" — then, a moment later: "Have a Learn Card too".
//
// Five ways in, and nothing that asks to be kept. No dots, no streak, no
// "Next": a person who has not chosen a rhythm has nothing to fall behind on,
// and the day should not arrive pre-planned for them.
//
// The cards are the menu's own rows (MenuHub's MenuRow), so this reads as the same place
// they will land in once the rhythm begins — the furniture does not change
// underneath them, only what is on it.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MenuRow } from "@/components/MenuHub";
import { CtaArrow } from "@/components/CtaArrow";
import { startRoutine, routineJustStarted, clearRoutineJustStarted, ROUTINE_START_EVENT } from "@/lib/routineStart";

const FONT = "'Space Grotesk', sans-serif";

export function BeginHere({ onStarted }: { onStarted?: () => void }) {
  const [, setLocation] = useLocation();
  const [starting, setStarting] = useState(false);

  const begin = () => {
    if (starting) return;
    setStarting(true);
    startRoutine();
    onStarted?.();
  };

  const go = (path: string) => () => setLocation(path);

  return (
    /* THE MENU'S OWN CARDS (owner, 2026-09-30: "have the categories show like
       practices do on the menu, the taller rectangular cards" · "have start a
       routine be like a wide pill under them"). The rows are MenuHub's
       MenuRow — the same component, not a copy — with the menu's own spacing:
       16px label line, 10px gaps, one compositing layer for the list
       (reference_card_spacing_exact). */
    <div>
      {/* NO EYEBROW (owner, 2026-09-30: "Take out the Ways to Pray today
          eyebrow for non routine accounts"). A label over four cards that are
          plainly ways to pray was telling somebody what they can already see,
          and this home's whole argument is that nothing here is being
          announced at them. The rows now start at the top of the body, so the
          first thing on the page is a way in. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, willChange: "transform" }}>
        {/* PRAY — one steady word, at the owner's word ("Just 'Pray', always"). */}
        <MenuRow emoji="🙏🏽" label="Pray" sub="Guided prayer, the office for this hour, Pray As You Go, Taizé" onClick={go("/menu/pray")} />
        <MenuRow emoji="📰" label="Read a reflection" sub="A few minutes with the day's word, from a handful of publishers" onClick={go("/menu/newsletters")} />
        {/* STRAIGHT INTO THE PRACTICE (owner, 2026-09-29): /contemplation is
            the timer with the other contemplative ways beneath it. */}
        <MenuRow emoji="🕯️" label="Practice contemplation" sub="Sit in silence, with lectio, guided prayer and breath beside it" onClick={go("/contemplation")} />
        <MenuRow emoji="🎓" label="Learn" sub="Courses in prayer: Centering Prayer, the Way of Love, and more" onClick={go("/menu/learn")} />
      </div>

      {/* …and the one that changes the shape of the home: a wide pill under
          the rows. It applies the default rhythm (or brings back a routine
          that was turned off) and the next render is the ordinary day. */}
      <button
        type="button"
        onClick={begin}
        disabled={starting}
        className="w-full mt-5 active:scale-[0.99] transition-opacity hover:opacity-90"
        style={{ borderRadius: 999, padding: "14px 20px", fontSize: 15.5, lineHeight: "22px", fontWeight: 700, fontFamily: FONT, color: "#F0EDE6", background: "rgba(46,107,64,0.85)", border: "1px solid rgba(168,197,160,0.45)", cursor: starting ? "default" : "pointer", opacity: starting ? 0.7 : 1 }}
      >
        {starting ? "Starting…" : <>🌿 Start a routine<CtaArrow /></>}
      </button>
      <p style={{ fontSize: 13, lineHeight: "18px", color: "rgba(143,175,150,0.7)", textAlign: "center", margin: "10px 0 0", fontFamily: FONT }}>
        A simple daily rhythm to return to. You can change any of it afterwards.
      </p>
    </div>
  );
}

/**
 * …AND, THE FIRST TIME THEY SEE THE RHYTHM, WHERE TO CHANGE IT (owner,
 * 2026-09-28: "And then if they want to … edit it, it shows them how to edit
 * it").
 *
 * Shown once, on the home, directly after a routine begins. Either door
 * closes it — the pill into the customizer, or the ✕ — so nobody is told
 * twice. It says what they have, because a rhythm that arrives without
 * explanation is the thing the five cards were written to avoid.
 */
export function RoutineStartedCard() {
  const [, setLocation] = useLocation();
  const [showing, setShowing] = useState(() => routineJustStarted());
  /**
   * IT MOUNTS BEFORE THE ROUTINE BEGINS, so reading the flag once at mount
   * showed nothing: the home is already on screen when "Start a routine" is
   * tapped, and this card sits above the body that changes. It listens for
   * the same event the start dispatches.
   */
  useEffect(() => {
    const check = () => setShowing(routineJustStarted());
    window.addEventListener(ROUTINE_START_EVENT, check);
    return () => window.removeEventListener(ROUTINE_START_EVENT, check);
  }, []);
  if (!showing) return null;
  const close = () => { clearRoutineJustStarted(); setShowing(false); };
  return (
    <div
      className="relative rounded-2xl px-4 py-4 mt-3"
      style={{
        background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute top-2 right-2.5"
        style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 14, cursor: "pointer", padding: 6, lineHeight: 1 }}
      >
        ✕
      </button>
      <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.75)", fontFamily: FONT }}>
        Your rhythm
      </p>
      <p className="text-[16px] font-semibold mt-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
        This is your day now 🌿
      </p>
      <p className="text-[13.5px] mt-1.5" style={{ color: "rgba(200,212,192,0.78)", fontFamily: FONT, lineHeight: 1.55 }}>
        A simple rhythm to return to. Every part of it is yours to change — add a practice, take one out, or set when the day begins.
      </p>
      <button
        type="button"
        onClick={() => { close(); setLocation("/rule-of-life"); }}
        className="mt-3 rounded-full px-5 py-2.5 text-[13.5px] font-semibold"
        style={{ background: "rgba(46,107,64,0.62)", border: "1px solid rgba(143,175,150,0.6)", color: "#F0EDE6", fontFamily: FONT, cursor: "pointer" }}
      >
        Shape your routine
      </button>
    </div>
  );
}
