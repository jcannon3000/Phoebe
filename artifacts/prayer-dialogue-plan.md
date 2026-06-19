# Prayer Dialogue — Head-Start Plan

> **Vision:** Turn prayer requests from a one-to-many *broadcast* (post → a crowd taps "amen") into an intimate **1:1 back-and-forth** between two people who walk through something together — Snapchat in *form* (fast, personal, threaded, timely, streaks), prayer in *substance* (depth, scripture, accountability, answered-prayer).

---

## TL;DR — the four findings that shape the build

1. **You already built the engine.** A complete 1:1 threaded-messaging system (`beta-messages`: conversations + per-member read cursor + messages, with inbox/thread/composer UI) exists and works — it's just **dark behind a `LETTERS_MESSAGES_ENABLED = false` flag** in two files. This is "graft prayer semantics onto an existing substrate," not "build chat from scratch."
2. **You already have the social graph.** `fellows` (mutual, consented, block-aware, contacts-matched, garden-integrated) is the "who can I pray with" layer. ~90% reusable as-is.
3. **Three things genuinely don't exist yet:** (a) a **mutual/pair streak** (the headline Snapchat 🔥 — today only *solo* per-person streaks exist), (b) **realtime delivery** (messaging is poll-only; the WebSocket layer is presence-only, unauthenticated, untargeted), and (c) **ephemerality** (no disappearing-message schema).
4. **The broadcast machinery must retire, not migrate.** Amen counts, face rails, the "N people prayed" digest, anonymity, and the garden-visibility feed are all fundamentally one-to-many. None of it carries into 1:1. The big risk is that `dashboard.tsx` (~6,900 lines) and `prayer-mode.tsx` (~4,000 lines) *conflate* prayer **requests** (the refactor target) with **intercessions / prayers-for / office slides** (which must NOT change).

---

## Part 1 — The experience (what "best for the user" looks like)

**A narrative walkthrough:**

1. Maria gets a scary diagnosis. She opens Phoebe → **"Ask someone to pray."** Picks her Fellow, David (or a "prayer partner").
2. She writes: *"Got some hard news from my doctor today. Could you pray for me?"* Sends.
3. David gets a gentle, time-sensitive push: **"Maria asked you to pray."** He opens it, taps **"🙏 Praying for you now"** (one tap → sends a turn, optionally opens a 60-second prayer moment), then writes back a verse and a question.
4. They go **back and forth over days.** David checks in: *"Thinking of you — how did the appointment go?"*
5. They build **days walking together** (the streak). When the prayer is answered, Maria marks it → a shared moment of thanks.

**Design principles (prayer ≠ chat):**

- **Depth over speed.** Borrow Snapchat's *intimacy and immediacy*, not its disposability. No "typing…" pressure, no anxiety-inducing read-receipt games. Presence should feel like *company*, not surveillance.
- **One-tap presence.** The single most powerful primitive is **"I'm praying for you right now"** — a one-tap turn (the old `AmenButton`, repurposed). Lowers the bar to respond when words are hard.
- **Scripture & ritual as first-class turns.** Let a turn be a verse, a candle/🕯 reaction, or a "I lit a candle for you," not just text. (Voice notes are the killer phase-2 feature — praying *aloud* for someone is profound — but it needs media storage.)
- **Answered prayer is the payoff.** The broadcast model has no satisfying close. A 1:1 thread can end in *"This was answered 🙏"* → a celebration both people see. That's the emotional core.
- **Sacred, not gamified.** A streak framed as **"7 days walking together"** (gentle) beats a Snapchat flame that makes people pray *to keep a number*. Recommend: keep it, make it warm and optional, never punitive.

**Key UX tensions → recommendations:**

| Tension | Recommendation |
|---|---|
| **Ephemeral vs. persistent?** | **Persistent by default.** Prayer history is sacred — people want to look back and see faithfulness over time. The app's existing "release / let it close" lifecycle is the *right* middle ground; keep it as an intentional act, not auto-disappear. (Optional "whispered/ephemeral" mode later.) |
| **Streak: prominent vs. gentle?** | **Gentle + optional.** Reuse the existing 🔥 slot on the People/Fellows row, but frame as "days together." Rule = *both* sent within 24h (true mutual streak). |
| **Pairing: Fellows-only or anyone?** | **Fellows-first** (consent + safety are built in). Add a "find a prayer partner" on-ramp later. |
| **Read receipts / online dots?** | **Soft presence only** — "active today," not "seen 2m ago." Avoid chat-pressure dynamics around something vulnerable. |
| **Does broadcast go away?** | **Coexist during transition** (dual-model). Make 1:1 the hero; keep a lightweight "ask the community" option so we don't strand users who rely on the feed. Decide GA cutover later. |

---

## Part 2 — What already exists (the reuse map)

### `beta-messages` — the thread engine (~75% reusable, the spine)
- **Schema** (`lib/db/src/schema/beta_messages.ts`): `beta_conversations` (`lastMessageAt` for inbox sort) · `beta_conversation_members` (two rows/pair, **`lastReadAt` cursor = unread**, `archivedAt` soft-hide) · `beta_messages` (`conversationId, senderUserId, body, createdAt`).
- **Backend** (`api-server/src/routes/beta-messages.ts`): start-or-reuse-per-pair (`:159`), inbox with preview + unread count (`:84`, unread SQL `:123-132`), thread-marks-read-on-GET (`:217-253`), send + bump + push (`:275-320`), archive (`:330`).
- **Frontend** (4 files, ~705 lines): `messages.tsx` inbox (poll 30s, unread badge) · `message-thread.tsx` thread (poll 15s, auto-scroll) · `message-write.tsx` composer (localStorage drafts) · `message-new.tsx` recipient picker.
- **Changes needed:** flip the flag; rewire recipient picker from "any beta user" → **Fellows**; add an FK from conversation → originating `prayer_request` (if the dialogue is "about" a request); swap the letter-paper composer for a lightweight inline input.

### `fellows` — the 1:1 graph (~90% reusable as-is)
- Schema `fellows` + `fellow_invites`; routes `fellows-connect.ts` (request/accept/auto-accept, search, block-aware via `user_mutes`); UI `components/FellowsConnect.tsx` (already renders `🔥 {streak}` per fellow — a streak slot exists). Garden-integrated (`garden.ts:160`).
- **Changes needed:** broaden the beta gate if shipping GA; decide whether starting a dialogue requires/creates a fellow link.

### `prayers-for` — directed private prayer (the seed)
- `prayers_for(prayer_user_id, recipient_user_id, prayer_text, duration_days, expires_at, acknowledged_at)` + `routes/prayers-for.ts`. Already directed, expiring, renewable, push-on-create — **but one-directional, no reply.** Adding a reply turn makes it conversational; `/for-me` (recipient side) already exists.

### Push — production-grade, just gated off (~85% reusable)
- `sendBetaMessagePush` (`pushSender.ts:982`) already does threaded immediate push w/ preview + deep-link + lock-screen stacking. APNs HTTP/2 + web-push, token mgmt, retries, invalidation all solid.
- **Changes needed:** flag is off (`:986`); **no per-conversation mute** (only global `users.pushEnabled`) — add "mute this conversation" via the existing `user_mutes` hook; add a "streak about to expire" reminder; Android native push still TODO.

### Streak algorithm — template exists, pair-state doesn't (~50%)
- `routes/prayer-streak.ts` has the canonical tz-aware consecutive-day walk (`stepBack`/`todayInTz`, "count from yesterday if not yet today" grace). `shared_moments` proves a `currentStreak`/`longestStreak` ledger pattern.
- **Gap:** no *mutual* "both engaged N days running" streak anywhere — needs a new per-pair counter + a "both-sent-today" rule.

### Realtime — presence-only, a rebuild to carry DMs (~25%)
- `lib/ws.ts` at `/ws`: handles presence + cobreathe only, **unauthenticated** (self-asserted identity), **untargeted** (broadcasts to all, filtered client-side), in-memory single-instance.
- **For v1, don't block on this.** Push + 15s/30s polling is *fine* for prayer (it isn't rapid-fire chat). True realtime (auth the upgrade, `userId→socket` registry, targeted emit, Redis fanout for multi-instance) is a phase-2 accelerator over the DB that already persists messages.

---

## Part 3 — What's broadcast-shaped and must retire

- **`prayer_request_amens`** (one row/tap, N→1, deduped "N people" counts) → an amen becomes a *reply/reaction in a thread*, not an anonymous fan-in.
- **Garden visibility** (`garden.ts`, `owner_id IN visibleOwnerIds` in `prayer.ts:378-406`) → replaced by **thread membership**.
- **Coalesced digest** (`prayerHeldScanner.ts`, the 2h-batched "Sara and 7 others prayed for you today") → contrary to 1:1; replace with immediate per-message push.
- **Anonymity** (`is_anonymous` everywhere), **owner-only count secrecy** ("no count leaks"), **face rails** (`amenFaces`) → meaningless with exactly one counterpart.
- **Words of comfort** (many-authored, one-shot upsert per author) → collapses into thread messages.

---

## Part 4 — Proposed architecture (phased)

### Data model (additive — nothing destructive)
**Recommended: generalize `beta-messages` into a first-class `prayer_dialogue` rather than fork it.** Either rename, or add a thin prayer layer:
- `prayer_dialogues` — `id`, normalized pair `(user_lo_id, user_hi_id) UNIQUE` (a real DB constraint, *not* route-enforced — avoids the duplicate-conversation race the beta model tolerates), `origin_request_id` (nullable FK → the prayer that started it), `last_message_at`, `current_streak`, `longest_streak`, `last_active_day`, `created_at`.
- `prayer_dialogue_members` — `dialogue_id`, `user_id`, `last_read_at`, `archived_at`, `muted_at`; `UNIQUE(dialogue_id, user_id)`.
- `prayer_dialogue_messages` — `dialogue_id`, `sender_user_id`, `body`, `kind` (`text | praying | verse | answered | reaction`), optional `expires_at`, `created_at`; index `(dialogue_id, created_at)`.
- **Invariant:** every new table needs a hand-written `CREATE TABLE IF NOT EXISTS` + indexes appended to `api-server/src/lib/migrate.ts` (deploy skips drizzle-kit).

### API (mostly mirrors `beta-messages`)
- `POST /prayer-dialogues {fellowUserId, body}` — start-or-reuse pair, first turn = the ask.
- `GET /prayer-dialogues` — inbox (other person, preview, unread, streak).
- `GET /prayer-dialogues/:id` — thread + mark read.
- `POST /prayer-dialogues/:id/messages {body, kind}` — a turn; bump, advance read, immediate push.
- `POST /prayer-dialogues/:id/praying` — the one-tap "praying now" turn.
- `POST /prayer-dialogues/:id/read`, `GET /prayer-dialogues/unread-count` (drives the app badge).
- `POST /prayer-dialogues/:id/answered` — mark answered → shared celebration.

### Frontend
- Fork the 4 message pages into prayer-dialogue screens (inbox / thread / composer / Fellow-picker).
- Repurpose `AmenButton` → "🙏 Praying for you" turn; `RequestWordField` → reply composer.
- **Add a global unread badge** (doesn't exist today) to nav/layout.
- Surgically carve the **request** paths out of `dashboard.tsx` + `prayer-mode.tsx` *without touching* intercessions / prayers-for / office slides. (Note the shared `["/api/prayer-requests"]` query key is load-bearing across dashboard, prayer-mode, prayer-list, and detail — changing the list shape ripples through all four.)
- i18n: new `prayer_dialogue` namespace; ~150–180 broadcast keys deprecate; maintain `es.ts` parity.

### Notifications / realtime
- v1: immediate `sendPrayerDialoguePush` (clone `sendBetaMessagePush`) + 15s/30s polling. Add per-conversation mute via `user_mutes`. Add streak-expiry reminder.
- v2: authenticated, targeted WebSocket for instant delivery + soft presence dots.

### Streaks
- New per-pair counter on `prayer_dialogues`; daily rule = both members sent ≥1 turn within the tz-day. Reuse `prayer-streak.ts`'s walk. Surface as "N days together" on the thread header + the existing 🔥 Fellows slot.

---

## Part 5 — Migration / dual-model strategy
- migrate.ts is additive + idempotent + error-swallowing → ship new tables **alongside** the old broadcast tables and flip surfaces incrementally. No destructive migration.
- **Existing broadcast requests have no single counterpart** — don't force-migrate them. Backfill threads only where 1:1 is inferable: `prayer_request_tags` (owner→tagged) and `prayers_for` (already directed pairs). The `anonymous_amens → auto-create fellows` pipeline is a natural on-ramp (every shared-prayer pair is a candidate first dialogue).
- Drop the dead `prayer_responses` table during the refactor (no live readers).
- Retire `prayerHeldScanner` / held-in-prayer batching when broadcast sunsets.

---

## Part 6 — Open decisions (need your call to start clean tomorrow)
1. **Ephemeral or persistent?** (Rec: persistent + intentional "release".)
2. **Generalize `beta-messages` in place, or fork a prayer-specific stack?** (Rec: generalize — one messaging spine.)
3. **Does the classic broadcast feed stay (dual-model) or get replaced?** (Rec: coexist now, decide cutover later.)
4. **Streak: ship in v1 or v2?** (Rec: v1, gentle framing.)
5. **Realtime in v1?** (Rec: no — push + polling; WS in v2.)
6. **Voice notes?** (Rec: v2 — high impact, needs media storage.)

---

## Part 7 — Tomorrow's first moves (the head start)
1. Flip `LETTERS_MESSAGES_ENABLED → true` in both flag files; smoke-test the existing messaging end to end (it's a working reference implementation of exactly the mechanics we want).
2. Add the three `prayer_dialogue*` tables to the schema + matching `migrate.ts` CREATE blocks.
3. Stand up `routes/prayer-dialogues.ts` by cloning `beta-messages.ts`, rewiring the recipient picker to Fellows, and adding `origin_request_id`.
4. Fork the 4 message pages into prayer-dialogue screens; wire the "Ask someone to pray" entry from the home FAB.
5. Defer streaks/realtime/ephemerality behind the v1 line.

---

## Appendix — key files
- **Engine:** `lib/db/src/schema/beta_messages.ts` · `api-server/src/routes/beta-messages.ts` · `mymonastery/src/pages/{messages,message-thread,message-write,message-new}.tsx`
- **Flags (dark switch):** `api-server/src/lib/lettersFlag.ts` · `mymonastery/src/lib/lettersFlag.ts`
- **Graph:** `lib/db/src/schema/{fellows,fellow_invites}.ts` · `api-server/src/routes/fellows-connect.ts` · `api-server/src/routes/people.ts:818` · `mymonastery/src/components/FellowsConnect.tsx`
- **Directed seed:** `lib/db/src/schema/prayers_for.ts` · `api-server/src/routes/prayers-for.ts`
- **Broadcast (to retire):** `api-server/src/routes/prayer.ts` · `lib/garden.ts` · `lib/prayerHeldScanner.ts` · schema `prayer_requests.ts`, `prayer_request_amens.ts`, `prayer_words.ts`, `prayer_request_tags.ts`
- **Push:** `api-server/src/lib/pushSender.ts` (`sendBetaMessagePush :982`)
- **Streak template:** `api-server/src/routes/prayer-streak.ts` · `api-server/src/routes/moments.ts:4893`
- **Realtime:** `api-server/src/lib/ws.ts` · `mymonastery/src/hooks/useGardenSocket.ts`
- **Migrations:** `api-server/src/lib/migrate.ts`
</content>
</invoke>
