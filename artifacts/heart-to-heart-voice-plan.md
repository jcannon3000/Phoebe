# Heart-to-Heart → Voice — build plan (deliberately NOT rushed)

**Status:** NOT built. The design-synthesis agent was cut off by the monthly spend
limit; the 4 mapping agents finished but their output wasn't aggregated. This is a
delicate, working subsystem the parallel session just redesigned (commit `260a31c7`),
so it must be built carefully (Merton, not Bart), not hurriedly under a spend cap.

## Goal
Make a recorded **voice prayer** the Heart-to-Heart 1:1 daily exchange, replacing
(or leading) the **text** "prayer for the day." Reuse the proven voice pipeline:
`VoiceMemo.tsx` recorder + `studioVoice.ts` polish + `voiceCrypto.ts` E2E.

## Subsystem surface (from the map)
- **Data:** `daily_prayers` (text `body`, sealed/`deliverAfter`, sender/recipient/pairing, read/seen) — lib/db/src/schema. Audio model lives in `voice_memos` + `user_public_keys`.
- **Server:** `routes/daily-prayer.ts` + prayer-partner routes; `lib/dailyPrayerDelivery.ts` (sealed-until-morning); `lib/bellSender.ts` (delivery cron + push).
- **Client:** `components/PartnerExchange.tsx`, `PartnerPairing.tsx`, `pages/prayer-partner.tsx`; the in-sheet composer reached from `FellowsConnect` ("heart to heart" → compose). **Parallel-session-owned (collision-sensitive):** the composer redesign in `260a31c7`.

## ⚠️ Critical finding (from reading daily_prayers.ts) — the real architecture fork
`daily_prayers` is **AUTHOR-scoped, one-to-many**: one prayer/day, body `notNull`,
shared with ALL the author's partners (unique on author_id+ymd; `deliverAfter`
seal; `prayer_attentions` = the "amen"). But voice memos are **E2E one-to-one**
(ECDH-encrypted to ONE recipient's public key). A single audio can't be encrypted
to N partners at once. So the simple "add audio columns to daily_prayers" plan
does NOT preserve E2E. Two real options — a DESIGN DECISION, not a guess:
- **(A) Per-partner E2E (recommended):** NEW table `daily_prayer_audio`
  (daily_prayer_id FK, partner_id FK, ciphertext, iv, ephemeral_public_jwk,
  mime, duration_ms). At compose, the client fetches each partner's public key
  (`user_public_keys`) and encrypts the audio once PER partner → N rows. Make
  `daily_prayers.body` nullable (voice rows carry no text). Each partner decrypts
  their own row. Preserves the thread/seal/attention model AND E2E. Cost: N-way
  client encryption at compose; the audio is stored N times (fine — small MP3).
- **(B) Not-E2E:** store one audio blob on the row (base64), readable by the
  server/builders. Simpler, but violates the privacy posture we just hardened.

**Recommend (A).** It's clean but it IS a deliberate build, not a column add.

## ⛔ Collision status (2026-06-18): the parallel session is ACTIVELY editing
`pages/prayer-partner.tsx` (uncommitted in their working tree), plus App.tsx +
daily-progress.tsx. The CLIENT composer/display wiring MUST wait until their
prayer-partner work commits, or it will clobber it. The data+server layer
(schema/migrate/routes — different files) is collision-safe to build first.

## Recommended approach (lowest-risk)
**Additive, not destructive.** Add audio to the EXISTING `daily_prayers` exchange so
the sealed-until-morning delivery, pairing, and volley all keep working unchanged —
only the body's medium changes.

1. **Data (migrate.ts — deploy skips drizzle-kit):** `ALTER TABLE daily_prayers ADD COLUMN IF NOT EXISTS` for `ciphertext text`, `iv text`, `ephemeral_public_jwk text`, `audio_mime text`, `audio_duration_ms int`. Keep `body` nullable (a prayer is EITHER text or voice). Same E2E shape as `voice_memos` (ECDH→AES-GCM, encrypted to the partner's `user_public_keys`).
2. **Server:** the compose endpoint accepts an audio payload (the encrypted fields) instead of `body`; delivery/`deliverAfter`/seal logic is untouched (it gates on time, not content). Reads return the audio fields. Push copy → "{first} sent you a voice prayer" (the generic-knock pattern already exists). Guard every place that renders/truncates `body` text against a null body (audio rows).
3. **Client:** in the composer, swap the text field for the **VoiceMemo recorder** (record → Studio polish → A/B → send) — but render it as the prayer-partner compose action, not a voice-memo. In the display (`PartnerExchange`), swap the text body for the **scrub player** (reuse the inbox/editor player). **Collision control:** do NOT rewrite the parallel-redesigned composer shell — mount the recorder *inside* it via a small new component, touching the minimum.
4. **Decisions to confirm with the owner first:**
   - **Sealed-until-morning for voice?** Keep (delivered next morning) or deliver voice immediately? (Voice memos are immediate + 3-day; the HtH volley is next-morning. Pick one for the voice exchange.)
   - **Keep text as a fallback option,** or voice-only?
   - **E2E for the exchange?** `daily_prayers.body` is currently PLAINTEXT; voice would be E2E (encrypted to the partner). Good — but it means the server can't render/preview it (fine; metadata-only already drives unread).

## Build tasks (when budgeted)
1. migrate.ts ALTERs + schema columns (+ `npx tsc -b lib/db`).
2. compose/read routes accept+return audio; null-body guards everywhere body is rendered.
3. delivery/cron push copy for audio.
4. Composer: mount the recorder inside the existing (parallel-owned) composer — minimal touch.
5. Display: scrub player for an audio prayer.
6. Typecheck (db+api+client), build, push, iOS sync. Verify on a real iOS device.

Until then, voice memos already work as a first-class 1:1 between fellows (the Voice
pill on each fellow row, the 3-day replay inbox, drafts) — this plan is specifically
the structural step of making them THE prayer-partner daily volley.
