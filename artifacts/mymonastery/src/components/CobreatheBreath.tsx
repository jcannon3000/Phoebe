import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { playOpeningSwell, primeAudio } from "@/lib/amenFeedback";
import { buildCanonical, photoForGlobalIndex, randomSeed, type Canonical } from "@/lib/cobreatheOrder";

// ── CobreatheBreath ─────────────────────────────────────────────────────────
//
// The animated breath at the heart of Cobreathe — a circle that swells on the
// inhale, rests, and falls on the exhale. Reused by the /cobreathe page and
// the prayer-mode pause slide so the ceremony is identical everywhere.
//
// SYNCHRONIZED: the breath phase is a pure function of WALL-CLOCK TIME, not of
// when the user pressed Begin. `Date.now() % CYCLE_MS` anchors every cycle to
// the Unix epoch, so any two people breathing at the same instant — anywhere
// in the world, with roughly correct device clocks — are inhaling and exhaling
// together, in the same rhythm. That shared rhythm is the whole point: not
// just the same practice, but the same breath.
//
// Because the rhythm is global, a session JOINS the ongoing breath rather than
// starting its own. We let the user settle in until the next clean cycle
// boundary (the "find the rhythm" pre-roll — they breathe along immediately,
// it just isn't counted), then count `totalBreaths` whole breaths, each one
// beginning on an inhale.

const WARM = "#F0EDE6";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// Breath pacing — a simple in / out breath, 12s each: a long, slow inhale
// and an equally long exhale, no holds. 20s per cycle; twelve cycles ≈ 4:00.
const INHALE_MS = 10000;
const EXHALE_MS = 10000;
// Each phase (in, out) is one PHASE_MS slice of the cycle — used to derive a
// globally-synced octave that rotates 0→1→2→3 across phases.
const PHASE_MS = INHALE_MS;
export const CYCLE_MS = INHALE_MS + EXHALE_MS;
export const DEFAULT_TOTAL_BREATHS = 12;

// Glow scale endpoints (relative to its base): collapsed at full exhale,
// expanded at full inhale. SMALL trimmed ~5% so the exhale settles a touch
// smaller.
const SMALL = 0.78;
const BIG = 1.42;

type Phase = "in" | "out";

// One line per breath, shown as the cycle begins. A small arc through Kearns'
// essay: etymology → interconnection → planetary + ruach → justice → communion.
const INTENTIONS: Array<{ key: string; text: string }> = [
  { key: "conspire", text: "To conspire — con spirare — is to breathe together." },
  { key: "inspire", text: "Inspire, respire, expire — all of it is breath." },
  { key: "shared_air", text: "The air in your lungs has passed through every living thing." },
  { key: "reciprocal", text: "Trees breathe out what you breathe in. You breathe out what they breathe in." },
  { key: "planet", text: "The planet breathes too — exhaling in winter, drawing it back in spring." },
  { key: "ruach", text: "Ruach — breath, wind, Spirit. One word. One breath." },
  { key: "cannot_breathe", text: "Breathe with those who cannot breathe freely." },
  { key: "no_one_alone", text: "No one breathes alone." },
  { key: "borrowed", text: "Every breath is borrowed from the whole." },
  { key: "communion", text: "Breath given, breath returned — a quiet communion." },
  { key: "commit", text: "To breathe together is to be bound to one another." },
  { key: "justice", text: "Let this breath become work for justice." },
];

// Smooth ease-in-out so the circle accelerates and settles rather than
// moving linearly — reads as a body breathing, not a metronome.
function easeInOut(p: number): number {
  return (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, p)))) / 2;
}

// Continuous scale for a position within the global cycle [0, CYCLE_MS).
// Simple breath: rise (in) → fall (out), no holds.
function scaleAt(pos: number): number {
  if (pos < INHALE_MS) return SMALL + (BIG - SMALL) * easeInOut(pos / INHALE_MS);
  return BIG - (BIG - SMALL) * easeInOut((pos - INHALE_MS) / EXHALE_MS);
}

function phaseAt(pos: number): Phase {
  return pos < INHALE_MS ? "in" : "out";
}

// ── The breath ─────────────────────────────────────────────────────────────
// The field starts darker (settling in, before sync) and warms a touch greener
// once the session goes live — a quiet swell that marks joining the global
// breath. CSS-transitioned between the two.
const FIELD_DIM = "#040D08";          // before sync — near-black green
const FIELD_LIVE = "#0B2014";         // live — a touch lighter/greener
// Vertical centre of the breath text — lowered toward the bottom third of the
// screen so the breath sits low and there's room above.
const BREATH_Y = "63%";

// The bundled photo library — every image under src/assets/cobreathe is glob-
// imported here so the breath ALWAYS has pictures, no matter which surface
// launches it (the /cobreathe page OR the office/devotion slideshow overlay).
// Callers may still pass their own `photos`, but when they don't we fall back
// to this so the world never breathes on an empty green field.
const DEFAULT_PHOTOS = Object.values(
  import.meta.glob("@/assets/cobreathe/*.{jpg,jpeg,png,avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
) as string[];

export function CobreatheBreath({
  onReachTarget,
  onEnd,
  totalBreaths = DEFAULT_TOTAL_BREATHS,
  todayCount,
  backgroundImage,
  photos,
  followSeed,
  followStartEpochMs,
  onSession,
}: {
  // Fired ONCE, when the target number of breaths has been kept. The breath
  // does NOT stop here — people can keep breathing as long as they like.
  onReachTarget?: (secondsKept: number) => void;
  // Fired when the user taps the end button. reachedTarget says whether they
  // got through the full set (Finish) or backed out early (End early).
  onEnd: (secondsKept: number, reachedTarget: boolean) => void;
  totalBreaths?: number;
  // Accepted but no longer shown DURING the practice — the social "you
  // cobreathed with N" count lives on the summary slide now, so the breath
  // itself stays calm and undistracted.
  othersToday?: number;
  // Everyone who has breathed today (incl. the caller once recorded) — shown
  // as the participation detail under the title.
  todayCount?: number;
  // Optional photo behind the breath (e.g. the /cobreathe page). A dark green
  // wash sits over it so the glow, globe, and text stay legible.
  backgroundImage?: string;
  // A library of photos of life on earth. Instead of a static background, ONE
  // photo at a time fades up on the inhale and down on the exhale, then the next
  // one takes its place at the bottom of the breath — the world breathing. The
  // set is shuffled once per session and rotated through, one photo per breath.
  // No captions: the images speak for themselves.
  photos?: string[];
  // ── Synchronized photos (optional) ────────────────────────────────────────
  // When breathing alongside a garden-mate, the /cobreathe page elects a leader
  // and passes the leader's photo seed + count origin so this session shows the
  // SAME photo at the same moment — after its own opening photo. Absent → solo:
  // our own random seed drives the order. See useCobreatheSync + cobreatheOrder.
  followSeed?: number;
  followStartEpochMs?: number;
  // Fired once, when counting begins, with the photo plan this breath is running:
  // our own {origin, seed} when leading/solo, or the LEADER's when following. The
  // page broadcasts it either way, so followers re-advertise the leader's plan —
  // that keeps the chain alive when the original leader leaves (those following us
  // keep flowing, and new joiners can still pick up the same plan from us).
  onSession?: (info: { startEpochMs: number; masterSeed: number }) => void;
}) {
  const { t } = useTranslation();
  // The breath is text + a softly breathing photo field — no centre globe or
  // progress rings. The phase word ("Breathe In/Out") is the only moving glyph.
  const labelRef = useRef<HTMLDivElement>(null);
  // Two stacked photo layers that crossfade, plus a group wrapper whose opacity
  // breathes with the cycle. The rAF loop ping-pongs between A and B: each breath
  // the incoming layer fades in over the outgoing (never a hard switch), and each
  // photo slowly zooms in (Ken Burns push) the whole time it's shown. Srcs are
  // assigned via refs from the rAF clock (not React render) so the swap can't
  // race the 150ms tick. `lastIdx` tracks the current breath; `preloaded` marks
  // when we've decoded the next photo onto the hidden layer.
  const photoGroupRef = useRef<HTMLDivElement>(null);
  const photoARef = useRef<HTMLImageElement>(null);
  const photoBRef = useRef<HTMLImageElement>(null);
  const photoLastIdxRef = useRef<number>(-1);
  const photoPreloadedRef = useRef<number>(-1);
  // Counts inhale tones since this breath began, so the octave always STARTS
  // on the lowest (0) and rotates 0,1,2 per breath — regardless of where the
  // global clock happens to be when the user starts.
  const inhaleToneCountRef = useRef(0);
  // Fall back to the bundled library when no caller passes photos, so the
  // breath always has pictures (the office/devotion overlay passes none).
  const photoLibrary = photos && photos.length > 0 ? photos : DEFAULT_PHOTOS;
  // Canonical (stem-sorted) photo split, built once. The order shown is derived
  // DETERMINISTICALLY from a seed — ours when leading/solo, the leader's when
  // following — so garden-mates can see the very same sequence without exchanging
  // the list. See @/lib/cobreatheOrder and useCobreatheSync.
  const canonicalRef = useRef<Canonical | null>(null);
  if (canonicalRef.current === null && photoLibrary.length > 0) {
    canonicalRef.current = buildCanonical(photoLibrary);
  }
  const hasPhotos = photoLibrary.length > 0;
  // Our own random seed — used when we're the leader or breathing solo.
  const ownSeedRef = useRef<number>(randomSeed());
  // Live mirror of the follow props until counting begins, then FROZEN so a
  // leader arriving or leaving mid-session never reroutes our plan (the freeze +
  // leader announcement happen in the slow tick below).
  const followSeedRef = useRef<number | null>(followSeed ?? null);
  const followStartRef = useRef<number | null>(followStartEpochMs ?? null);
  const frozenRef = useRef(false);
  const sessionAnnouncedRef = useRef(false);
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  // Mirror the follow props into refs (read live by the rAF loop) until frozen.
  useEffect(() => {
    if (frozenRef.current) return;
    followSeedRef.current = followSeed ?? null;
    followStartRef.current = followStartEpochMs ?? null;
  }, [followSeed, followStartEpochMs]);

  // Prime the audio subsystem on mount so the per-breath swell tones sound. (No
  // fade-in: the scene is held still at rest until synced, so nothing flashes.)
  // Also reset the inhale-tone counter so EVERY session starts on the lowest
  // octave (0), even if this component instance is reused across sits.
  useEffect(() => {
    primeAudio();
    inhaleToneCountRef.current = 0;
  }, []);

  // Anchor points (fixed at mount): when the user arrived, and the next clean
  // cycle boundary where the count begins. There is NO end anchor — the rhythm
  // runs on until the user chooses to finish.
  const startRef = useRef(Date.now());
  const countStartRef = useRef(Math.ceil(startRef.current / CYCLE_MS) * CYCLE_MS);
  const reachedRef = useRef(false);
  // Presence gate: a breath only counts if the page/app stayed open and
  // visible the whole time. If the tab is backgrounded / the app is
  // sent to the background long enough that you couldn't have been
  // breathing along, the session is invalidated — the clock keeps
  // turning, but it won't record. `endedRef` guards a single onEnd.
  const invalidRef = useRef(false);
  const endedRef = useRef(false);
  // Timestamp of the previous count tick — a large gap means the timer was
  // suspended (app/tab backgrounded), even if visibilitychange hasn't fired
  // its handler yet on resume. Used to invalidate before the reach check.
  const lastTickRef = useRef(0);
  // Phase at the previous frame — used to fire a soft haptic + tone at the
  // start of each of the four box-breathing phases. null until the first frame
  // so we don't buzz mid-phase on mount.
  const lastPhaseRef = useRef<Phase | null>(null);

  // A rAF loop writes transforms straight to the DOM from the global clock —
  // no React re-render per frame, perfectly synced for everyone, and only
  // transform/opacity (GPU-composited) so the swell stays glass-smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const pos = now % CYCLE_MS;
      const isCounting = now - countStartRef.current >= 0;
      // Phase transitions (inhale ↔ exhale): a soft haptic on each, but the
      // swell TONE sounds only at the start of the inhale (once synced) — one
      // note per breath. The octave ALWAYS starts on the lowest (0) and rotates
      // 0,1,2 per breath from a per-session counter (reset on mount), so every
      // sit opens on the same grounding low note.
      const phase = phaseAt(pos);
      if (lastPhaseRef.current === null) {
        lastPhaseRef.current = phase;
      } else if (phase !== lastPhaseRef.current) {
        lastPhaseRef.current = phase;
        if (isCounting) {
          try {
            window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } }));
          } catch { /* no native shell on web — silent */ }
          // Sound ONLY on the inhale (the start of each breath), not the
          // exhale — one tone per breath, rising through the three lower slide
          // octaves (0,1,2) from a per-session counter that starts at 0.
          if (phase === "in") {
            // Start on the lowest octave, then rotate 0,1,2 per breath.
            const octave = inhaleToneCountRef.current % 3;
            inhaleToneCountRef.current += 1;
            try { playOpeningSwell(octave); } catch { /* audio locked — non-fatal */ }
          }
        }
      }
      const s = scaleAt(pos);
      // 0 at rest (full exhale / bottom hold) → 1 at full inhale / top hold.
      const p = (s - SMALL) / (BIG - SMALL);
      // Don't breathe until synced — while "Syncing", hold the scene STILL at
      // rest (p=0) so nothing pulses in/out. The count begins on a clean cycle
      // boundary (p=0), so the breath starts from this exact rest state with no
      // jump.
      const pAnim = isCounting ? p : 0;
      // The photo of life on earth fades UP on the inhale and DOWN on the
      // exhale — brightest at the top of the breath, receding into the dark
      // field at the bottom (where it's swapped for the next one, so the change
      // is never seen). A gentle ease via pAnim, capped so the glow/globe/text
      // stay legible over it.
      // ── Breathing photo: crossfade between photos + slow zoom-in ─────────
      // The whole group's opacity breathes (up on inhale, down on exhale). The
      // two layers ping-pong: the incoming photo fades IN over the outgoing at
      // the breath boundary (a crossfade, never a hard cut), and each photo
      // slowly pushes in (scale 1 → 1+ZOOM) the entire time it's shown.
      const canonical = canonicalRef.current;
      if (canonical && (canonical.opening || canonical.rest.length > 0)) {
        const ZOOM = 0.10;          // total scale push per photo while shown
        // Our own breath index since counting began.
        const localIdx = isCounting
          ? Math.max(0, Math.floor((now - countStartRef.current) / CYCLE_MS))
          : 0;
        // Following a garden-mate? Show our OWN opening photo for the first
        // counted breath, then snap to the photo the LEADER is currently on
        // (derived from their start origin) so we advance in lockstep. Solo /
        // leader: our own seed, our own index. (Refs so the rAF loop reads the
        // live value; frozen once counting begins — see the slow tick.)
        const fSeed = followSeedRef.current;
        const fStart = followStartRef.current;
        const following = fSeed !== null && fStart !== null;
        const seed = following ? (fSeed as number) : ownSeedRef.current;
        const idx = following
          ? (localIdx === 0 ? 0 : Math.max(1, Math.floor((now - (fStart as number)) / CYCLE_MS)))
          : localIdx;
        const a = photoARef.current;
        const b = photoBRef.current;
        // New breath: the incoming layer was preloaded last cycle; make sure it
        // holds the right photo (covers the very first breath, where it wasn't,
        // and the follower's snap from its opening photo to the leader's).
        if (idx !== photoLastIdxRef.current) {
          photoLastIdxRef.current = idx;
          const incoming = (idx % 2 === 0) ? a : b;
          const url = photoForGlobalIndex(canonical, seed, idx);
          if (incoming && incoming.getAttribute("src") !== url) incoming.src = url;
          photoPreloadedRef.current = -1;
        }
        const activeIsA = idx % 2 === 0;
        const activeEl = activeIsA ? a : b;
        const prevEl = activeIsA ? b : a;
        const zoomP = pos / CYCLE_MS;                                  // 0→1 across the breath
        // No crossfade: the swap to the next photo happens at the cycle
        // boundary, where the whole group has faded to 0 (bottom of the breath),
        // so the cut is invisible and the OLD photo is fully gone before the new
        // one rises. The active layer shows alone; the previous one is hidden.
        if (activeEl) {
          activeEl.style.opacity = "1";
          activeEl.style.transform = `scale(${(1 + zoomP * ZOOM).toFixed(4)})`;
          activeEl.style.zIndex = "2";
        }
        if (prevEl) {
          prevEl.style.opacity = "0";
          prevEl.style.zIndex = "1";
        }
        // The group breathes with the lungs: fully faded DOWN to 0 at the bottom
        // of every breath (and before sync), rising to a gentle ~0.55 peak at
        // the top of the inhale. The slight ease (pAnim^1.25) pulls the lower
        // range down faster so the photo is truly GONE at the bottom of the
        // exhale — no lingering as the next one rises.
        if (photoGroupRef.current) photoGroupRef.current.style.opacity = (Math.pow(pAnim, 1.25) * 0.55).toFixed(4);
        // Preload the NEXT photo onto the now-hidden previous layer so it's
        // decoded before its turn (it becomes the active layer next breath).
        if (photoPreloadedRef.current !== idx && prevEl) {
          const nextUrl = photoForGlobalIndex(canonical, seed, idx + 1);
          if (prevEl.getAttribute("src") !== nextUrl) prevEl.src = nextUrl;
          photoPreloadedRef.current = idx;
        }
      }
      // The phase word — "Breathe In" / "Breathe Out" — fades UP from nothing at
      // the start of each phase, peaks mid-phase, and fades DOWN to nothing at
      // the turn (so the word swap happens while invisible). A hair of scale
      // rides along with the breath. Before sync, the "Syncing" label holds at
      // full opacity instead of breathing.
      if (labelRef.current) {
        const f = pos < INHALE_MS ? pos / INHALE_MS : (pos - INHALE_MS) / EXHALE_MS;
        labelRef.current.style.opacity = isCounting ? Math.sin(Math.PI * f).toFixed(4) : "1";
        labelRef.current.style.transform = `scale(${0.97 + pAnim * 0.06})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // A slow tick drives the phase word + counter and fires onReachTarget once
  // the target set is complete. (The circle itself is rAF-smooth above.)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      // Presence guard, evaluated BEFORE the reach check so a backgrounded
      // session can never record. Two signals, covering both platforms:
      //   • document.hidden — a hidden web tab still fires throttled ticks.
      //   • a >1.5s gap since the last tick — the timer was suspended (iOS app
      //     backgrounded), which can race ahead of the visibilitychange handler
      //     on resume.
      const gap = lastTickRef.current ? now - lastTickRef.current : 0;
      lastTickRef.current = now;
      // First counted tick freezes our role and announces the plan we're running:
      // the LEADER's {origin, seed} if we were handed one to follow, otherwise our
      // OWN. Followers re-advertise the leader's plan so it survives the leader
      // leaving and new joiners can still pick it up from us. Frozen so a leader
      // arriving/leaving later never reroutes us.
      if (!frozenRef.current && now - countStartRef.current >= 0) {
        frozenRef.current = true;
        if (!sessionAnnouncedRef.current) {
          sessionAnnouncedRef.current = true;
          const fSeed = followSeedRef.current;
          const fStart = followStartRef.current;
          const plan = fSeed !== null && fStart !== null
            ? { startEpochMs: fStart, masterSeed: fSeed }
            : { startEpochMs: countStartRef.current, masterSeed: ownSeedRef.current };
          onSessionRef.current?.(plan);
        }
      }
      if (!reachedRef.current &&
          ((typeof document !== "undefined" && document.hidden) || gap > 1500)) {
        invalidRef.current = true;
      }
      const since = now - countStartRef.current;
      const completed = since >= 0 ? Math.floor(since / CYCLE_MS) : 0;
      // Only credit the breath if the session stayed open + visible the whole
      // time — a backgrounded tab/app that "completed" the count doesn't count.
      if (!reachedRef.current && !invalidRef.current && completed >= totalBreaths) {
        reachedRef.current = true;
        // The payoff when all twelve breaths are kept: a GENTLE swell haptic
        // (soft rise-and-fall, no jolts) paired with Phoebe's swell tone — a calm
        // exhale of a moment, not a buzz. See `breath-complete` in native-shell.
        try {
          window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "breath-complete" } }));
        } catch { /* no native shell on web — silent */ }
        try { playOpeningSwell(); } catch { /* audio locked — non-fatal */ }
        onReachTarget?.(Math.round((now - startRef.current) / 1000));
      }
      setTick((n) => n + 1);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presence: if the page is hidden (tab switched, app backgrounded) for more
  // than a brief blip before the breath completes, the breath can't have been
  // kept — invalidate it, and end the session without recording when the user
  // returns. (A quick <1.2s flicker is tolerated.) Once the target is reached
  // the breath is already credited, so later backgrounding is fine.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (away > 1200 && !reachedRef.current) invalidRef.current = true;
        if (invalidRef.current && !reachedRef.current && !endedRef.current) {
          endedRef.current = true;
          onEnd(Math.round((Date.now() - startRef.current) / 1000), false);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // iOS Capacitor: the native shell also signals app resume/suspend.
    window.addEventListener("phoebe:appactive", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("phoebe:appactive", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const pos = now % CYCLE_MS;
  const phase = phaseAt(pos);
  const phaseLabel =
    phase === "in"
      ? t("cobreathe.phase_in", { defaultValue: "Breathe In" })
      : t("cobreathe.phase_out", { defaultValue: "Breathe Out" });

  // Where are we in the count? Negative during the pre-roll; uncapped after,
  // so the count keeps climbing past the target while they keep breathing.
  const sinceCount = now - countStartRef.current;
  const counting = sinceCount >= 0;
  // While syncing (before the count begins), the centre word reads "Syncing"
  // with an animated ellipsis instead of "Breathe in / out".
  const syncDots = ".".repeat(Math.floor(now / 450) % 4);
  const centerLabel = counting ? phaseLabel : `${t("cobreathe.syncing", { defaultValue: "Syncing" })}${syncDots}`;
  const completed = counting ? Math.floor(sinceCount / CYCLE_MS) : 0;
  const breathNum = completed + 1;
  const reachedNow = counting && completed >= totalBreaths;
  const intention = counting ? INTENTIONS[(breathNum - 1) % INTENTIONS.length] : null;

  // Soft sage tones that sit calmly on the deep-green field.
  const TEXT_DIM = "rgba(182,210,188,0.72)";
  const TEXT_FAINT = "rgba(182,210,188,0.48)";

  // Portal to <body> so the full-screen overlay escapes any transformed
  // ancestor (page transitions, etc.) that would otherwise trap its fixed
  // positioning and let the app header show through at the top — the "edge of
  // the darkness." At body level it truly covers the whole screen.
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80, overflow: "hidden",
        // With a photo, a deep-green wash sits over it (a touch lighter once the
        // session goes live); otherwise the solid breath field as before.
        ...(backgroundImage
          ? {
              backgroundColor: FIELD_DIM,
              backgroundImage: `linear-gradient(${counting ? "rgba(8,32,20,0.62), rgba(4,13,8,0.72)" : "rgba(4,13,8,0.74), rgba(4,13,8,0.82)"}), url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transition: "background-image 1.6s ease",
            }
          : {
              background: counting ? FIELD_LIVE : FIELD_DIM,
              transition: "background-color 1.6s ease",
            }),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        paddingTop: "calc(var(--safe-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      {/* The breathing photos — images of life on earth, full-bleed behind the
          breath. Two stacked layers crossfade so the change from one photo to
          the next is never a hard cut; each photo slowly zooms in (Ken Burns
          push) the whole time it's shown. The group's opacity breathes: up on
          the inhale, down on the exhale. The rAF loop drives all of it (srcs,
          opacity, zoom). A deep-green wash over the top keeps the glow, globe
          and text legible. No captions — the images speak for themselves. */}
      {hasPhotos && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
          <div
            ref={photoGroupRef}
            style={{
              position: "absolute", inset: 0, willChange: "opacity",
              // Gentle ramp-down over the bottom 30% (behind the "Breathe Out"
              // word + counter) — a little reduction, not all the way — so the
              // lower edge of the photo recedes rather than reading as a hard
              // band of imagery under the text.
              WebkitMaskImage: "linear-gradient(to bottom, #000 70%, rgba(0,0,0,0.55) 100%)",
              maskImage: "linear-gradient(to bottom, #000 70%, rgba(0,0,0,0.55) 100%)",
            }}
          >
            <img
              ref={photoARef}
              alt=""
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: 0, transformOrigin: "center",
                willChange: "transform, opacity",
              }}
            />
            <img
              ref={photoBRef}
              alt=""
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: 0, transformOrigin: "center",
                willChange: "transform, opacity",
              }}
            />
          </div>
          {/* (No legibility gradient overlay — removed per request. The photo's
              own bottom mask ramp-down above is the only fade; the deep-green
              page background keeps the breath text readable.) */}
        </div>
      )}

      {/* Cancel — top-right, exits the breath (no count unless already kept). */}
      <button
        type="button"
        aria-label={t("common.cancel", { defaultValue: "Cancel" })}
        onClick={() => onEnd(Math.round((Date.now() - startRef.current) / 1000), reachedRef.current)}
        style={{
          position: "absolute", top: "calc(var(--safe-top) + 16px)", right: 16,
          width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(182,210,188,0.22)",
          color: TEXT_DIM, fontSize: 16, lineHeight: 1, cursor: "pointer", zIndex: 2,
        }}
      >
        ✕
      </button>

      {/* While SYNCING (before the session joins the global breath), a quote
          rests in the upper-middle of the screen — left-aligned, in Space
          Grotesk. It's kept mounted and FADES DOWN (opacity → 0, drifting down a
          touch) once the breath goes live, rather than hard-cutting, so the
          transition into the practice is smooth. */}
      <div
        aria-hidden={counting}
        style={{
          position: "absolute", left: 28, right: 32, top: "50%",
          // Centered, then lifted ~80px into the upper-middle; on going live it
          // drifts down a touch as it fades.
          transform: counting ? "translateY(calc(-50% - 80px + 16px))" : "translateY(calc(-50% - 80px))",
          opacity: counting ? 0 : 1,
          transition: "opacity 0.8s ease, transform 0.8s ease",
          zIndex: 2, pointerEvents: "none", maxWidth: 560,
        }}
      >
        <p style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.5, textAlign: "left", textShadow: "0 2px 18px rgba(8,30,18,0.6)" }}>
          {t("cobreathe.sync_quote", { defaultValue: "By paying attention, especially to the beauty of the world and to the suffering of others, we open the possibility for God to reach us, beginning the process of change whereby we allow ourselves to be decreated from egotists to lovers of God by loving the neighbor as ourselves." })}
        </p>
        <p style={{ color: "rgba(182,210,188,0.62)", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", marginTop: 16, textAlign: "left" }}>
          {t("cobreathe.sync_quote_author", { defaultValue: "Sallie McFague" })}
        </p>
      </div>

      {/* Title + Synced + participation — top, LEFT-ALIGNED to the "Breathe In"
          text below (same 28px left inset). */}
      <div className="flex flex-col items-start" style={{ position: "relative", alignSelf: "flex-start", marginLeft: 28 }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(182,210,188,0.55)", fontFamily: SPACE_GROTESK }}>
          🌬️ {t("cobreathe.title", { defaultValue: "Cobreathe" })}
        </p>
        {/* Live indicator — pulsing red dot + "Synced", on its OWN line UNDER the
            title (left-aligned to it). Appears once the session joins the global
            breath (counting). */}
        {counting && (
          <span className="inline-flex items-center gap-1 mt-1 text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: SPACE_GROTESK }}>
            <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: "#E5484D", boxShadow: "0 0 6px rgba(229,72,77,0.8)" }} />
            <span style={{ color: "#E58A8D", letterSpacing: "0.16em" }}>{t("cobreathe.synced", { defaultValue: "Synced" })}</span>
          </span>
        )}
        {/* The social "N breathed today" count is a distraction DURING the
            breath — keep the practice screen undistracted and let the count
            live on the idle/summary states only (not while counting). */}
        {!counting && todayCount != null && todayCount > 0 && (
          <p className="text-[12px] mt-1" style={{ color: TEXT_FAINT, fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.breathed_today_count", { count: todayCount, defaultValue: `${todayCount} ${todayCount === 1 ? "person has" : "people have"} breathed today` })}
          </p>
        )}
      </div>

      {/* Breath row — just the breathing word ("Breathe In" / "Breathe Out"),
          left-aligned with the other elements, dropped below the breath's
          vertical centre. The globe + rings were removed; the breath counter
          lives at the bottom (where the Cancel button used to be). */}
      <div
        style={{
          position: "absolute", left: 28, right: 40, top: BREATH_Y,
          transform: "translateY(calc(-50% + 70px))",
          display: "flex", alignItems: "center", justifyContent: "flex-start", zIndex: 2,
        }}
      >
        <div className="flex flex-col items-start">
          <div ref={labelRef} style={{ willChange: "transform, opacity" }}>
            <span
              style={{
                color: WARM, fontFamily: SPACE_GROTESK, fontSize: 27, fontWeight: 600,
                letterSpacing: "0.04em", textShadow: "0 2px 18px rgba(8,30,18,0.6)", whiteSpace: "nowrap",
              }}
            >
              {centerLabel}
            </span>
          </div>
        </div>

      </div>

      {/* Bottom — the breath counter (where the Cancel button used to be). Once
          the full set of twelve is kept, a Done pill appears beneath it to
          finish; before then there's no button here — the breath is a committed
          sit (the small ✕ top-right is the only way out, and backgrounding the
          app still ends it). */}
      <div className="flex flex-col items-start w-full" style={{ marginBottom: 24, gap: 14, paddingLeft: 28, paddingRight: 24 }}>
        <p className="text-[13px] text-left" style={{ color: reachedNow ? "rgba(126,210,140,0.95)" : TEXT_DIM, fontFamily: SPACE_GROTESK, maxWidth: 280 }}>
          {!counting
            ? t("cobreathe.finding_rhythm", { defaultValue: "Syncing with the global breath…" })
            : reachedNow
              ? t("cobreathe.breath_counter_past", { current: breathNum, defaultValue: `🌿 Breath ${breathNum} — keep going as long as you like` })
              : t("cobreathe.breath_counter", { current: breathNum, total: totalBreaths, defaultValue: `Breath ${breathNum} of ${totalBreaths}` })}
        </p>
        {reachedNow && (
          <button
            type="button"
            onClick={() => onEnd(Math.round((Date.now() - startRef.current) / 1000), reachedRef.current)}
            className="rounded-full active:scale-[0.98] transition-transform"
            style={{
              background: "rgba(46,107,64,0.85)", color: "#EAF6F4",
              border: "1px solid rgba(140,195,160,0.5)",
              fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600,
              padding: "10px 34px", cursor: "pointer",
            }}
          >
            {t("cobreathe.done", { defaultValue: "Done" })}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
