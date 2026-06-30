# Brief: The "Customize" flow — a UX walkthrough

Audience: another session picking up Phoebe. This describes the customizer the
way a *user* experiences it — the journey, the feel, and the design intent —
not the plumbing. (Code lives in `WayOfLoveRuleFlow.tsx` at `/rule-of-life` if
you need it.)

## The premise

A person says "I want to pray every day" — but that intention dies without a
shape. The Customize flow's whole job is to turn that wish into a **concrete,
owned daily rhythm** in a couple of minutes, without it ever feeling like
filling out a form. It's a guided, frosted-glass slideshow over a slowly
breathing leaf backdrop: **one decision per slide**, calm typography
(Space Grotesk), a thin progress bar, gentle haptics. You're being walked, not
quizzed.

## When you meet it

- **NOT first.** A brand-new user does **not** start in the customizer. No
  monastery hands a novice a configuration screen — it hands them a given form
  and lets them grow into it. So a new user is handed a coherent, prayable
  **starter rule out of the box** — currently **Morning Devotion · Forward Day by
  Day · Evening Devotion** (the un-set-up default; contemplation off) — and lands
  straight on a home that's already prayable on minute one. Onboarding is just a
  short "here's how Phoebe carries you through your day" intro + a push-permission
  ask + a profile photo, then home. Faster time-to-first-prayer, no decision
  paralysis, less churn.
- **"Customize" is where you grow into it** — from Settings / the home BCP card —
  reopening the flow pre-filled with your current rhythm (which already matches
  the starter rule for an un-set-up user), so tuning your practice is a gentle
  motion *from* a coherent rule, never assembling from a blank parts-bin.
- **Possible next step (not built yet):** offer 2–3 *named* starter rules at the
  top of onboarding — e.g. "a simple morning anchor," "morning & evening with the
  offices," "the contemplative path" — that the user adopts whole and tunes
  later. Same agency, but every user starts from a coherent rule, never a blank
  trellis.

## The journey (what it feels like, slide by slide)

The flow is **adaptive** — it only ever asks what's relevant to *you*, so the
progress bar shrinks or grows with your answers. Nobody sees an evening-config
slide if they only pray mornings.

1. **"When"** — the gentlest possible start: just *Morning, Evening, or both?*
   One tap, no commitment yet. This single answer quietly decides how much of
   the rest of the flow you'll even see.

2. **"Morning" / "Evening" — how you'll pray** — for each time you picked, a
   short menu of *ways*: a short Devotion, the full Office, a silent
   Contemplative sit, Co-Breathe (12 breaths as a prayer for climate justice),
   or — in the evening — the Examen. The language is plain and side-specific
   ("The full Evening Prayer office."), so you're choosing a **practice**, not a
   feature. There's always an "Add your own" escape hatch so the app never feels
   prescriptive.

3. **A quiet "how + when"** — once you've picked an office, one more calm slide:
   read it on screen, from your physical prayer book, or listen — and what time
   should we nudge you. Reminders are opt-in and never nagging.

4. **"Contemplation"** — a generous, multi-select page. Pick *as many as you
   like*: silent prayer, Co-Breathe, sacred listening (Audio Divina), sacred
   reading (Lectio), a contemplative walk, the Examen. This is the slide that
   signals Phoebe is a *sanctuary*, not a checklist — abundance, not obligation.

5. **The follow-ups feel earned, not bureaucratic** — if you chose silent prayer,
   you get one warm slide to set a minutes-a-day goal ("we'll gently remind you
   around 7pm on days you haven't reached it"); if you chose a walk or listening,
   you just say *when in the day* it fits. Each follow-up exists only because
   *you* opted into it, so it reads as Phoebe helping you place the practice,
   not as more questions.

6. **"Daily Reflection"** — pick the daily readings you want to read (CAC,
   Forward Day by Day, SSJE) or none. Low stakes, easy to skip.

7. **"Add to your day"** — light, optional habits: gratitude, journaling (when?),
   reading, podcasts. Framed as *extras you can keep*, so saying no costs
   nothing.

8. **"Create your own"** — the closing note of ownership: name anything (a walk,
   a stretch, a phone call), pick an emoji, drop it into your day. The flow ends
   on *your* practice, not Phoebe's — then **"Save my daily rhythm."**

9. **"Your daily rhythm is set"** — a calm review of everything you chose, each
   item **tappable to jump straight back and tweak it**. It's a moment of
   "look what you built," and an easy door back in.

## Why it's shaped this way (the UX bets)

- **One decision per slide.** No dense settings screen. Each choice is small,
  so the whole thing feels like a conversation, not configuration.
- **Adaptive, not exhaustive.** The flow prunes itself to your answers, so it's
  short for a simple rhythm and only gets longer if *you* asked for more.
- **Multi-select where it's about abundance** (contemplative practices, readings,
  extras), **single, clear picks where it's about commitment** (which offices,
  the goal). The interaction model matches the emotional weight of the choice.
- **Plain, devotional language.** Practices, not features; "the day is kept,"
  not "task complete." The copy does a lot of the gentleness.
- **Always an exit.** "Add your own," "None," skip — the user never feels boxed
  into Phoebe's idea of prayer.
- **It builds the home you'll actually see.** This is the key UX payoff: the
  rhythm you assemble *is* your home screen. Finishing Customize rewrites the
  home into exactly your chosen anchors — morning prayer, your reflection,
  contemplation, evening prayer, plus your extras — each becoming a card and a
  "Daily progress" dot. There's no separate "apply." What you designed is what
  greets you tomorrow morning.

## How it pays off, day to day

Back on the home, your rhythm reads as a small set of cards that **cascade in**
each morning, split into **Next** and **Done**. Tapping one takes you into the
practice; finishing it (an office prayed, a breath completed, a reflection read)
flips it to Done with a soft swell haptic and lights up a progress dot. Reflection
sits second by default. "Every day we begin again" — it's a fresh set each day,
not a running scoreboard. Re-open Customize anytime and the home reshapes to
match; the customizer is the one place that owns your rhythm.

## The feeling we're protecting

Calm, unhurried, generous, *yours*. Someone should leave the flow feeling they've
been gently helped to shape a practice they chose — and arrive on a home screen
that feels like it already knows them. The biggest UX risk to guard is losing
that: a user's saved rhythm must never silently vanish or reset (it's their
intention made concrete), and the flow should never start to read like a form.
