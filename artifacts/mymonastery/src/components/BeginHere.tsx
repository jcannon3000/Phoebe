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
// The cards are the app's own PracticeCard, so this reads as the same place
// they will land in once the rhythm begins — the furniture does not change
// underneath them, only what is on it.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { PracticeCard } from "@/components/DailyProgressBody";
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

  return (
    /* THE HOME'S TWO CARD RULES, which this list was missing (owner,
       2026-09-29: the borders of the cards when the home is just practices).
       ONE compositing layer for the whole list, so every card shares its
       origin instead of each landing on the device grid its own way; and
       WHOLE-PIXEL lines above the cards, so none of them starts on a half
       pixel — the label's default line height made it 16.5px, and a 1.5px
       ring on a half-pixel row paints as two faint rows. See
       reference_card_spacing_exact: DailyProgressBody's Next/Done lists. */
    <div className="flex flex-col gap-2" style={{ willChange: "transform" }}>
      <p
        className="text-[11px] leading-[16px] font-semibold uppercase tracking-widest mb-1"
        style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}
      >
        Ways to pray today
      </p>

      {/* PRAY — one steady word, at the owner's word ("Just 'Pray', always"):
          it is never wrong at any hour, and the Practices page is where every
          way in already lives. */}
      <PracticeCard
        emoji="🙏🏽"
        title="Pray"
        blurb="Guided prayer, the office for this hour, Pray As You Go, Taizé"
        cta="Open"
        done={false}
        rgb="62,124,122"
        href="/menu/pray"
        later={false}
      />

      <PracticeCard
        emoji="📰"
        title="Read a reflection"
        blurb="A few minutes with the day's word, from a handful of publishers"
        cta="Read"
        done={false}
        rgb="96,141,209"
        href="/menu/newsletters"
        later={false}
      />

      {/* STRAIGHT INTO THE PRACTICE, not a list of practices (owner,
          2026-09-29: "When you click contemplation, it shouldnt go to the menu
          for all the contemplation practices, but to the contemplation intro
          screen … with the reflection options too").
          /contemplation already is both: the timer and its bell at the top,
          and "More contemplative practices" — Guided Prayer & Reflection,
          Guided Lectio Divina, Breathing Together — underneath. A menu in
          front of it was a list standing between someone and the silence they
          tapped for. */}
      <PracticeCard
        emoji="🕯️"
        title="Practice contemplation"
        blurb="Sit in silence — with lectio, guided prayer and breath beside it"
        cta="Open"
        done={false}
        rgb="150,130,175"
        href="/contemplation"
        later={false}
      />

      <PracticeCard
        emoji="🎓"
        title="Learn"
        blurb="Courses in prayer — Centering Prayer, the Way of Love, and more"
        cta="Open"
        done={false}
        rgb="180,150,90"
        href="/menu/learn"
        later={false}
      />

      {/* …and the one that changes the shape of the home. It applies the
          default rhythm — the same seed every device used to be handed on its
          first open — and the next render is the ordinary day. */}
      <div className="mt-3">
        <PracticeCard
          emoji="🌿"
          title="Start a routine"
          blurb="A simple daily rhythm to return to — you can change any of it afterwards"
          cta={starting ? "Starting…" : "Start"}
          done={false}
          rgb="46,107,64"
          onClick={begin}
          later={false}
        />
      </div>
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
