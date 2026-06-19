# Listening (audio divina) — product spec: what's left to build

Product-designer pass on the music practice. The frame is built; the question is
what turns it from an orphan page into a real, sticky, communal Phoebe practice.

## Where it stands
Built: the 4-movement frame (Listen→Linger→Respond→Rest), a wall-clock timer +
length picker, **bring-your-own-music** (privacy-clean — Phoebe never sees what
you play), time-per-day logging (local), and dormant in-app playback (Spotify +
Apple Music, awaiting credentials). Reachable only from the Practices menu.

The honest gap: **finishing a sit records a completion + local minutes, but
nothing in the app surfaces it.** It doesn't count toward the rhythm, doesn't
show on the home screen, has no audio bookends, and a new user would never find
it. It's a beautiful room with no door.

## The model to copy
Contemplation is the proven template: a timed practice that lives as a **rhythm
anchor** (Today's Rhythm card + daily-progress dot + addable in Customize),
counts toward the one daily streak, has start/end chimes, and an optional
minutes goal. Listening should be its sibling, not a separate island.

---

## P0 — Make it a real practice (do these or it stays an orphan)

1. **Make "listening" a daily-rhythm anchor.** Add it to `useRhythmState` + the
   Customize / rule-of-life flow as an addable anchor (the exact pattern used for
   gratitude/examen, commit-task #26). Then it renders as a 🎧 card in Today's
   Rhythm + daily-progress ("Listening · Music as a way of prayer · Begin →"),
   flips to ✓ when done, and earns a dot in the streak. `markPracticeDoneToday
   ("listening")` already fires — this just surfaces it. **This is the single
   highest-value piece.** Recommend it counts as ONE rhythm dot (same streak as
   prayer), like every other optional practice — not a parallel streak.

2. **Start + end chimes.** The practice has no audio bookends, yet the whole
   point is eyes-closed listening with the screen asleep. Without an **end
   chime** the listener never knows the sit ended. Reuse the contemplation chime
   (start = opening tone, end = closing tone; works on web too). This pairs with
   the wall-clock timer fix — together they make "lock the phone and pray" safe.

3. **Solve the blank page: "what do I play?"** The #1 BYO friction. Offer a small
   curated set of named starting points on the intro — Taizé, Gregorian chant,
   Arvo Pärt, choral evensong, gospel, ambient worship — each a one-tap deep link
   (Apple Music / Spotify search or a curated playlist URL). Solves discovery of
   *music* without needing the full in-app integration live. Low effort, high
   payoff; works for everyone today.

## P1 — Make it discoverable + sticky

4. **Discovery beyond the menu.** Add to the Customize/rule-of-life flow (so it's
   an option when shaping a routine) and consider a one-time "Try praying with
   music" nudge (the splash routine-nudge machine, `reference_routine_nudge`).

5. **Minutes server-sync + optional daily-time goal.** Today the minutes log is
   local-only (`lib/listeningLog`). For cross-device + a "10 min/day" goal like
   contemplation, add a tiny `listening_sessions` row (or extend
   practice-completion to carry minutes). Then the card can show "12 of 20 min
   today" with a progress bar, same as contemplation/steps. P1, not P0 — the
   binary dot (P0) already gives the streak.

6. **A listening reminder.** Opt-in time via the bell cron (`bellSender`,
   `reference_notifications`), or fold into the existing daily-rhythm reminder so
   we don't add notification fatigue.

7. **Light reflection capture (optional).** After the sit, one line: "What did
   you hear?" → save to the journal/gratitude. Turns a passive listen into a
   kept word. Keep it skippable — the practice must not feel like homework.

## P2 — Phoebe's soul: make it communal (less lonely)

8. **Presence: "N people are listening now."** Phoebe exists so NYU students feel
   less alone. Reuse the cobreathe same-air / Walking-Together dot patterns:
   strangers = a count, Fellows = a face. A "you and 4 others are listening right
   now" line on the listening screen would make solitary prayer feel held.

9. **A shared listening moment.** An optional set time (e.g. 9pm "Compline
   listen") where the community presses play together — the audio-divina version
   of cobreathe's synced breath.

10. **Curated Phoebe playlists by season/mood**, surfaced once Apple Music /
    Spotify in-app is live (per liturgical season, or grief / gratitude / rest).

11. **Finish the in-app playback** (Spotify + Apple Music) — the credentials +
    native steps in `artifacts/spotify-integration-notes.md`. This is an
    *enhancement*, not the spine: BYO + curated suggestions (P0.3) already make
    the practice whole, everywhere, with zero blockers.

---

## Open product decisions (need a call)
- **One streak or its own?** → Recommend: one rhythm dot, same streak as every
  other practice. Don't fragment the streak.
- **Binary dot vs minutes goal?** → Binary dot P0; minutes goal P1 once synced.
- **BYO primary, in-app enhancement?** → Yes. BYO is universal + privacy-clean;
  in-app is a nice-to-have gated on subscriptions + credentials.
- **Where does it sit in the day?** → No fixed time (unlike morning/evening
  office). Recommend the "afternoon/anytime" slot in the rhythm, like gratitude.

## The one-line recommendation
Build **P0** next — anchor + chimes + curated "what to play" suggestions. That
turns Listening from a hidden page into a practice people can find, do with the
phone locked, and keep as part of their rhythm. Everything else is upside.
