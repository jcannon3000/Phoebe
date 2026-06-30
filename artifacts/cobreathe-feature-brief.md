# Phoebe — Co-Breathe (a.k.a. Cobreathe): feature handoff

A briefing for another session picking up Co-Breathe. Grounded in the current code, not just intent.

## What it is
A short **contemplative breathing prayer**. The name comes from **"conspire" — con + spirare, "to breathe together."** You take ~12 slow breaths, and the timer is **paced by one global clock for everyone**, so anyone else breathing in that same moment is breathing *with* you. The theology/framing: a small bodily prayer for one another and for **climate justice** — breathing with people, with the trees, with a planet whose own breath (carbon in, oxygen out) has been thrown out of balance. (The essay lives at `/cobreathe/about`.)

It is **solo + globally-synchronized**, not location-based. **All location/map features were deliberately removed** — opening it goes straight to the synced breath, no geolocation.

## The experience (what a user does)
1. Open **`/cobreathe`** (or deep-link `/cobreathe?start=1`).
2. **Intro slide** — settings: breath count in **6-breath increments, default 12** (`DEFAULT_TOTAL_BREATHS`), then Begin.
3. **The breath** — a full-screen **nature photo field + left-aligned guiding text**; the breath expands/contracts on a fixed cadence (`CYCLE_MS`) that is **epoch-aligned to a global clock** so all breathers are in phase. Audio starts at the **lowest octave**; a **smooth Core-Haptics "swell"** plays at completion (`PhoebeAudio.smoothSwell`, dispatched via `phoebe:haptic`).
   - NOTE: the old **centre globe + progress rings were removed** — the breath is now photo + text only. The spinning globe glyph moved onto **cards/pills** (`CobreatheGlobe.tsx`).
4. **Open-ended** — you can keep breathing **past 12**; history credits the full length.
5. **Summary slide** (`CobreatheSummary`) — breaths taken + how many others breathed today.

## The one hard rule: completion-gated logging
A sit **only counts if you complete the set** (reach the target / 12th breath). **Cancelling or bailing early does NOT log** anything. When it does count, it's logged with the **full elapsed time** (e.g. 20 breaths → 20 counted, not floored at 12). This gate fixed a class of "frozen day / stale done-screen" bugs — don't loosen it casually.

## Data model + endpoints
- **Table `breath_sessions`** (`migrate.ts`): `user_id`, `day` (user-local `YYYY-MM-DD` TEXT), `seconds`, `created_at`. **One row per (user, day)**, unique — additive + idempotent. The summary counts rows for that `day` to say "you breathed with N others today."
- **`api-server/src/routes/breath.ts`**:
  - `GET /api/breath/today` — your day's state.
  - `POST /api/breath/today` — record a completed sit (rate-limited).
  - `GET /api/breath/together` — today's communal count (drives teaser cards).
  - `POST /api/breath/together-with` — **fellow mode** (see caveat).

## How it plugs into the rest of the app
- **It's a contemplation *style*.** A Co-Breathe sit logs as a contemplation sit with `source: "cobreathe"` and counts toward the **Contemplation** anchor. Selectable in the **Customizer's contemplative step**; it's a **home rhythm card** and a **Practices-menu** entry.
- Photo library is a **bundled, offline, compressed** glob import (works with no network); it **rotates per session**. Add/replace photos with `scripts/cobreathe-sync.sh`.

## File map
- Client: `pages/cobreathe.tsx` (main flow), `pages/cobreathe-about.tsx` (the "conspire" essay). Components: `CobreatheBreath.tsx` (the breath + `DEFAULT_TOTAL_BREATHS`, `CYCLE_MS`), `CobreatheSummary.tsx`, `CobreatheGlobe.tsx` (globe glyph), `CobreatheOverlay.tsx`, `CobreatheMap.tsx` + `BreathNearInvite.tsx` (location — **dormant/removed**).
- Server: `routes/breath.ts`, `breath_sessions` in `lib/migrate.ts`.
- Native (iOS): `CobreatheMusicPlugin.swift`.

## Current state of the two optional layers
- **Apple Music over the breath** — native MusicKit *playback-only* (`CobreatheMusicPlugin.swift`) is wired (plugin + bridge + toggle + plist) but **DORMANT** until 4 manual Xcode steps: add the Swift file to the target, `registerPluginInstance` in `MainViewController`, enable the MusicKit capability in the Apple portal, and supply a real playlist id. `cap sync` won't activate it (web-only sync).
- **Fellows coupling — IMPORTANT RIGHT NOW.** The "breathe **with a fellow**" path (`POST /api/breath/together-with`) starts a Heart to Heart and counts as Walking Together. **Fellows are being turned off** (a parallel session is hiding the People surface). The **core solo synchronized breath is independent of fellows** and stays — but anything that reads `together-with` / fellow presence should be treated as part of the fellows-off sweep, not core Co-Breathe.

## The feeling to protect
Calm, embodied, communal-without-surveillance: you're breathing *with* whoever else is breathing now, but it never becomes a count to beat or a place to be seen failing. Keep it offline-capable, keep the global pacing intact, keep the completion gate honest.
