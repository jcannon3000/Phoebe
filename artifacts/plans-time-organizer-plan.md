# Finding a time, together — a calm time-organizer for Phoebe Plans

*(Research synthesis, 2026-06-17. Built from: Howbout app UX research, a survey of
availability-poll patterns (When2meet/LettuceMeet/Doodle/Rallly/Partiful/Cal.com),
a ground-truth map of Phoebe's current Plans code, and calm-UX design principles.)*

## 1. The opportunity

Today a Plan carries exactly one `when`: either an exact `startsAt` or free-form
`whenText`, both set unilaterally by the host before anyone weighs in. There's no
way to say "I'm thinking Thursday *or* Friday — which works for you two?" and let
Fellows converge. So hosts guess a time (and lose anyone it doesn't suit) or take
coordination off to Messages, where it scatters. A lightweight organizer lets a
host offer a few candidate times, lets Fellows lean toward what works, and then
quietly resolves into the ordinary dated Plan we already have.

## 2. Recommended direction

**Host-proposed candidate times + soft per-time RSVP.** The host offers 2–4
specific times; each Fellow taps **Works / Maybe** per time; the option the group
leans toward simply grows greener; the host taps "Let's do this one" and it
collapses into a normal Plan.

Why this over the alternatives, for Phoebe:
- **Reuses the RSVP pill the user already knows**, repeated per-time. It *is*
  Plans in a "still deciding" state — almost no new mental model.
- **One-handed and calm at any size.** A short vertical stack of big tap targets —
  no horizontal grid, no drag-to-paint. The card's shape never changes from 2
  Fellows to 8; faces stack, Thursday just gets greener. That invariance is the calm.
- **Host-led agency fits the monastic register** better than algorithmic consensus
  or an anxious heatmap. Verbs stay warm ("this works for me"), never "submit availability."
- **Closes the loop like Partiful**: picking auto-converts leanings to RSVPs and it
  becomes the plan — no re-announcing in Messages.

Why not the others: the **grid heatmap** (When2meet) is hostile on mobile and too
much ceremony; **free/busy calendar overlay** (Google/Calendly) is a faux pas
between friends, broken across Apple↔Google, and needs a calendar-connection
privacy bar Phoebe avoids; **ambient shared-calendar** (Howbout's standing model)
has a real adoption tax — it only works if the whole circle lives in the app.

Runner-up to graft: a single cheap idea — when the host adds candidate times,
softly pre-suggest the hour most of their Fellows already pray ("Most of your
fellows pray around 6:00 PM" — tap to fill). Suggestion only, no new permissions.

## 3. What it looks like

- **Compose:** today's composer, but the single "When?" becomes **"Offer a few
  times"** — a stack of up to 4 datetime rows + a dashed "+ add another time" pill.
  One time → a normal Plan (organizer never appears). Two+ → a gathering-in-progress.
- **Gathering card (everyone):** "{Host} is finding a time for {title}." Candidate
  times stack vertically, each with **Works / Maybe** pills; each row's green fill
  deepens with leanings (reuse the existing `CARD_BG → rgba(46,107,64,0.85)` ramp);
  one prose footer is the only "computation": **"Thursday's looking good."** A
  Fellow may lean Works on several times.
- **Host picks:** each row carries a quiet **"Let's do this one."** → writes
  `fellow_plans.startsAt`, promotes every "Works" leaner to a whole-plan `coming`
  RSVP, collapses to a normal Plan card, fires one push ("It's Thursday, 6:00 PM 🌿").
  The app never auto-picks.
- **Becomes a normal dated plan** → flows into the existing `PlanEventCard`
  timeline, viewer-tz display, real-calendar path, and share landing for free.
- **Warm fallback:** if nothing converges, "Times are scattered — want to just talk
  it through?" → opens the existing 1:1 Messages thread.
- **Share landing (`/plans/:token`):** branches deciding-vs-decided; a texted Fellow
  leans Works/Maybe in one tap. No new page.

## 4. Data model

- **New `fellow_plan_times`** (`planId` FK cascade, `startsAt` tz, `createdAt`) —
  index on `planId`; 1–4 enforced at API layer. 0 rows = behaves like today; 2+ =
  "deciding." On resolve, copy chosen `startsAt` to the plan and delete candidate rows.
- **Extend `fellow_plan_rsvps`** with nullable `planTimeId` (FK cascade): null =
  whole-plan RSVP (today), non-null = a per-time leaning. Relax unique to
  `(planId, userId, planTimeId)` **plus** a partial unique `(planId, userId) WHERE
  planTimeId IS NULL` to keep the one-RSVP-per-plan upsert working.
- Per the migrate.ts schema invariant, the new table needs a `CREATE` in migrate.ts.
- Untouched: `coming|maybe`, share token, host-implicitly-attending,
  `fellowPrefs.sharePlans` opt-out, fellow-scoping.

## 5. API (mirror existing fellow-plans.ts style)

- **POST `/api/fellow-plans`** (extend): optional `times: string[]` (1–4 ISO). ≥2 →
  insert candidate rows, leave `startsAt` null. ≤1 → set `startsAt` as today.
- **PUT `/api/fellow-plans/:id/times/:timeId/rsvp`** (new): per-time leaning; same
  guards as whole-plan RSVP (`areFellows`, rate-limited); no host push per leaning.
- **POST `/api/fellow-plans/:id/resolve`** (new): host-only; `{timeId, promoteMaybe?}`;
  transaction sets `startsAt`, promotes leaners → `coming`, deletes candidate rows,
  fires one push.
- **GET feed + share** (extend `serializePlan`): when deciding, include
  `times: [{ id, startsAt, comingCount, maybeCount, comingPreview, myStatus }]` +
  derived `leadingTimeId`. No emails/roster, as today.

## 6. Phasing

**MVP (ship this week):** the table + `planTimeId` + indexes + migrate CREATE;
composer "offer a few times"; gathering card with per-time Works/Maybe + green
warmth + footer; per-time RSVP PUT + resolve (promote Works only); share landing
renders the deciding card.

**Cut from MVP:** prayer-rhythm garnish, "promote Maybe too" toggle, the warm
Messages fallback, "suggest another time." One existing coming-push on resolve.

**v2:** prayer-rhythm pre-suggestion (suggestion-only); Messages fallback; "none of
these — suggest another"; an optional day-level "open window" mode; keep resolved
rows with a `chosen` flag for history if usage wants it.

## 7. Aesthetic guardrails

- **Never a 2-D grid.** Vertical list of one-time-per-row thumb targets only.
- **Convergence is ambient, never announced** — no "73% match," no "BEST TIME";
  the leaning time grows greener, one soft prose line is the only surfaced compute.
- **Invariant at 8 Fellows** — avatars overflow to "+3," warmth deepens, footer
  still names one time.
- **No yellow.** Sage `#8FAF96`, warm `#F0EDE6`, green family, Space Grotesk.
- **One thing at a time, single column.** The apparatus resolves and *dissolves*
  into the ordinary Plan card.
- Warm verbs only: "Works," "Maybe," "Let's do this one," "finding a time."
- Absolute-instant + viewer-tz display (respects the amen viewer-tz invariant).

## 8. Risks / open questions

- **Overlap with the parallel Fellows/Walking-Together workstream** on the same
  surfaces + `fellow_plans` infra. The additive table + nullable column is
  low-conflict, but the unique-index relaxation touches a shared write path —
  coordinate before landing.
- **Notification restraint** — per-time leanings must NOT push the host (notification
  overload is Howbout's top real-world complaint). Only create + resolve notify.
- **iMessage-bubble future option** — resolution + fallback exit into the existing
  Messages thread; keep the door open, don't build chat into the card in MVP.
- **Host proposes badly** — MVP fallback is Messages; "suggest another" is v2.
- **Resolution data** — MVP deletes candidate rows; switch to a `chosen` flag only
  if history proves valuable (v2).

---

### Notable Howbout findings (the app Phoebe Plans is modeled on)
- A **Plan** is a durable container: details + RSVP roster + **its own group chat** +
  post-event **photo/video archive** + a **"nudge"** to chase non-responders.
- **Three-tier availability**, not one model: (1) passive synced **free/busy/maybe**
  overlay you filter by person; (2) a group **Availability** day view you tap to
  plan from; (3) **"Instant Availability"** that auto-highlights windows when
  everyone's free; (4) **Time Polls** as the fallback — and the magic is polls
  **pre-fill the voter's own availability**, collapsing the When2meet grid step.
- **Privacy-preserving status** ("free after 5 PM" not "Dr's appt at 2") and
  **friendship-gated, per-context visibility** are the trust unlock + a headline feature.
- Top real-world pain points to design around: **notification overload** in active
  groups, and a **forced invite/referral gate**.
