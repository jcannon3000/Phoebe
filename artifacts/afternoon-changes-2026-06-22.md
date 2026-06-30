# Phoebe — what changed this afternoon (2026-06-22)

All changes are pushed (web auto-deploys; iOS bundle cap-synced). Where something was built and then pulled back, the **net current state** is what's written here.

## 1. Fellows — presence, splash, and invites
- **Three-light presence.** Fellow cards now show three coarse, today-only lights — **Turn / Learn / Pray** (blue), derived server-side. "Turn" lights from ~30s of foreground use; Learn/Pray from reflections/offices. Only the **lit** dots are drawn (no empty placeholders); nothing shows on a quiet day.
- **Retired the old Walking-Together count dots + the "Pray 1:1 to see today" lock** — one presence model, no "N of M kept," no locks.
- **App-open splash** now surfaces fellows who've practiced today (up to 4) with your own card beneath; falls back to a quote when no one has.
- **Invite link → onboarding.** A shareable `/fellow/:token` link: a signed-in opener gets a one-tap "become fellows" card; a brand-new visitor gets a 7-page onboarding deck (what Phoebe is, the daily practice, the Fellows feature, the settings), then signs up and the fellowship forms. The deck now wears the standard leaf-photo + frosted-glass look.

## 2. Onboarding / accounts
- **New users start from a given rule, not the customizer** — handed a coherent starter rhythm (Morning Devotion · Forward Day by Day · Evening Devotion) on a prayable home, minute one.
- **A real "Sign up" tab** on the auth screen (self-serve account creation; the waitlist gate is gone), and the auth pages got the frosted leaf backdrop.

## 3. Self-facing progress UI (per the reviewer brief — net state after iteration)
- **Contemplation is no longer a quota** on the home: no "X of Y min," no fill bar — the card just reads "You rested in silence today."
- **"Done" → "Earlier today."**
- **Header meter retired** → a morning→evening **day-arc** with a "you are here" marker (position in the day, not "N of M to go"); the pill reads **"Today."**
- *(Tried and reverted, per your call:)* a sacred-spine vs. "Also today" two-tier band, and replacing the green ✓ with lit dots — both rolled back. **Checkmarks and the single list are back.**

## 4. The Customizer ("Shape your rhythm" / Rule of Life)
Built five of six seams from the customizer brief (skipped the spine/vine one per your direction):
- **Contemplation is a length, not a quota.** "Minutes of silence a day" → **"How long would you like to sit?"**, and the **7pm "you haven't reached it" shortfall reminder is disabled** server-side (the "sit at your chosen time" bell stays).
- **Named starter rules.** A first-time author opens to three coherent rules to adopt whole — *A simple morning anchor · Morning & evening with the offices · The contemplative path* — plus a quieter "build my own."
- **Author vs. tend.** Re-entry (a rhythm already shaped) opens to a calm **"Tend your rhythm"** overview instead of the full 11-slide flow; a no-edit visit never re-saves.
- **The review screen beholds the rule** ("This is the shape of your days") with a weightier "Keep this rhythm" save.
- **Wording:** dropped the "7/11" step fraction and the "habit" framing; entry points renamed **"Customize" → "Shape your rhythm."**

## 5. Contemplation now counts on *entering* the silence (just shipped)
Following the customizer reframe: the Contemplation anchor is **kept the moment you've entered the silence today** (any sit, or Apple Health mindful minutes) — it no longer measures a daily *total* against a target. The chosen minutes are now only the **suggested length of a sit**, never a quota. (This also makes a stray saved value like "144" harmless — a long suggested sit, not "144 minutes owed today.")

## 6. A copy-rendering bug found and fixed
A batch of the customizer copy edits silently weren't showing because they changed the `t()` fallback while the real strings live in `src/i18n/en.ts` (the resource wins). Fixed the actual `en.ts` values (and brought `es.ts` to parity, which also removed a now-false Spanish 7pm-reminder promise). The contemplation slide now renders correctly.

## Earlier-afternoon odds and ends
- Cobreathe breathing library: +4 photos (88 total), and the opening photo now rotates per session.
- Contemplation goal field became a free numeric input (any value preserved).

## Known gaps / deferred (not regressions)
- The brand-new Customizer screens (Tend / Starter) show **English in Spanish** until those new keys are translated.
- Seam 4's "quiet the *Customize entry point itself* once a rhythm has held a long while" — not built (needs rhythm-age tracking).
- The **"Principles across surfaces" governing doc** (which would, among other things, retire the Fellows lights entirely) was set aside — those lights are still live. That conversation is open, not actioned.
