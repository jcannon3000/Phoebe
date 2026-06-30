# For the reviewer — the Customizer ("Customize" / Rule of Life)

You've been reshaping the **self-facing progress surfaces** (the home cards, "Earlier today" / "Also today", the header meter). This brief gives you the one upstream thing those surfaces all depend on: the **Customizer** — the flow that *authors* a person's daily rhythm. Everything you've critiqued is rendered downstream of a decision made here. The goal of this doc is to let your recommendations land where the structure is actually created, and to flag the seams where your existing principles already apply or are in tension.

Code: `src/components/WayOfLoveRuleFlow.tsx` (the flow), route `/rule-of-life`. It reads/writes through `lib/officePrefs`, the server office-prefs, `homeLayout` (on the user), and `lib/customAnchors`.

---

## What it is, in one line
The Customizer turns "I want to pray every day" into a **concrete, owned daily rhythm** — and **finishing it rewrites the home**. The rhythm you assemble *is* your home screen and *is* your progress anchors. There is no separate "apply." This is the single source of truth for what the surfaces you reviewed display.

## The crucial fact for your review
**The Customizer is the author; the progress UI is the reader.** The same act here produces:
- the **home cards** (Next / Earlier today),
- the **progress anchors** (the kept dots, the day-arc),
- and — as of last week — the **spine vs. "Also today" split** you asked for.

So a recommendation about the Customizer is really a recommendation about the *grammar of the whole rhythm*, set at the one moment the user is deciding what their practice is. That's where your "communion vs. performance" test has the most leverage.

## When a user meets it (important — it is NOT onboarding)
- **New users never start here.** They're handed a coherent **starter rule out of the box** (Morning Devotion · Forward Day by Day · Evening Devotion) and land on a prayable home minute one. No configuration screen for a novice.
- **"Customize" is where you grow into it** — opened later from Settings / the home, **pre-filled with your current rhythm**, so tuning is a motion *from* a coherent rule, never assembling from a blank parts-bin.
- This "given form first, configure later" arc is deliberate and is the front half of your "scaffolding built to recede" idea. Worth holding onto when you recommend.

## The flow (adaptive — it only asks what's relevant to you)
A frosted-glass slideshow over a breathing leaf backdrop, **one decision per slide**, thin progress bar, gentle haptics. Order (`orderedSteps` in the file):

1. **When** — Morning, Evening, or both. This single answer prunes the rest of the flow.
2. **For each side — how you'll pray** (`morning-way` / `evening-way`) — Devotion · the full Office · Contemplative sit · Co-Breathe · (evening) Examen. You're choosing a *practice*, in plain side-specific language.
3. **How + when** (`*-config`) — read on screen / from the book / listen, and what time to nudge.
4. **Contemplative** — a generous **multi-select**: silent prayer, Co-Breathe, Audio Divina, Lectio, a contemplative walk, the Examen. This is the "abundance, not a checklist" slide.
5. **Earned follow-ups** — only for what you picked: a **minutes-a-day goal** for silent prayer (`contemplation-goal`); a *when-in-the-day* for a walk/listening/lectio.
6. **Learn** — the daily reflections (FDD / SSJE / CAC), multi-select, easy to skip.
7. **Add to your day** (`extras`) — light optional habits: gratitude, journaling, reading, podcasts.
8. **Create your own** (`custom`) — name anything (a walk, a stretch, **a language streak**), pick an emoji + a slot. The flow ends on *your* practice → "Save my daily rhythm."
9. **Your daily rhythm is set** (`done`) — a review of everything chosen, each row **tappable to jump back and tweak**.

Interaction grammar already in place (so you don't re-recommend it): **multi-select where it's about abundance** (contemplation, readings, extras), **single clear picks where it's about commitment** (which offices, the goal); plain devotional language; always an exit ("Add your own" / "None" / skip).

---

## The seams where your principles apply or are in tension
These are the high-value targets for your recommendations — places where the Customizer either contradicts the redesign you just shipped, or decides something your principles have an opinion about.

### 1. The contemplation **minutes goal** still lives here (direct tension)
Your pass-1 brief removed the "104 of 144 min" quota + fill bar from the home — silence is no longer framed as a deficit. **But the Customizer still asks the user to set a minutes-a-day goal** (`contemplation-goal`, default 5 min, persisted as `contemplationGoalMinutes`), framed as a target with a *"we'll remind you ~7pm on days you haven't reached it"* nudge. So the deficit frame the home no longer *shows* is still the thing the user is *taught to set*, and it still drives an "you haven't reached it" reminder. **This is the clearest place your contemplation principle is half-applied.** Open question for you: keep the number purely as "how long you'd like to sit" (a private session length, no deficit nudge)? Drop the reminder-on-shortfall? Reframe the slide from "goal" to "length"?

### 2. Sacred spine vs. imported habit is **not decided here** (it's hard-coded downstream)
You asked for offices to read as more than a peer of Duolingo, and we shipped the "Also today" band — but the classification is **hard-coded** (any user-created `custom` anchor → "Also today"; everything built-in → spine). The Customizer itself adds an **office** and a **"Create your own" Duolingo** with the *same grammar* (a row, an emoji, a slot). Two things for you to weigh:
- Should the **authoring moment** communicate the trellis/vine distinction — i.e., does "Create your own" make clear it's a habit riding alongside the rule, not part of the spine?
- The spine/leaf boundary is currently "custom = secular," nothing else. If you think a built-in extra (reading-log, podcasts) is also a vine, that boundary is a one-line change but should be *your* call, made visible in the flow rather than buried downstream.

### 3. "Scaffolding built to recede" starts here
Your new requirement — structure that quiets as a practice settles — is partly a Customizer question. The "starter rule out of the box, grow into it later" arc is the front half. The back half (a mature pray-er seeing less chrome / just the next anchor) would likely be driven by *when and how* the Customizer re-presents structure. Recommendations about the recede behavior should probably name what the Customizer does at re-entry, not only what the home renders.

### 4. Named starter rules (proposed, not built)
There's an intended-but-unbuilt step: offer 2–3 *named* starter rules at the top ("a simple morning anchor," "morning & evening with the offices," "the contemplative path") that a user adopts whole and tunes later — so every user starts from a coherent rule, never a blank trellis. If you have a view on whether/how to frame these, this is the place.

---

## Do not regress (the Customizer's load-bearing invariants)
- **A saved rhythm must never silently vanish or reset.** It's the user's intention made concrete; the home reads it regardless of version and migrates forward. This is the single biggest risk to guard in any change here.
- **New users still get a coherent starter rule, not this flow.** Don't turn first-run into configuration.
- **Keep the warm, faithfulness-shaped language** and the one-decision-per-slide feel. The flow must never start to read like a form.

## The test (yours, applied here)
For the home you said: *every indicator answers "where am I in the day?", never "how much have I done."* For the Customizer the parallel is: **does each slide build communion or performance — and does it produce a rhythm the home can render as position, not score?** The slide most likely to fail that test today is the contemplation **goal** slide (seam #1); the decision most likely to flatten the rule is how a "Create your own" habit is authored (seam #2).
