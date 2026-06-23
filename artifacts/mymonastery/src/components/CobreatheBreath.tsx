import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { playBreathTone, primeAudio } from "@/lib/amenFeedback";
import { buildCanonical, photoForGlobalIndex, randomSeed, type Canonical } from "@/lib/cobreatheOrder";
import { syncedNow, ensureClockSynced } from "@/lib/serverClock";
import { CobreatheMap } from "@/components/CobreatheMap";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

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

// Breath pacing — a simple in / out breath, 6s each: a slow inhale and an
// equally slow exhale, no holds (five breaths a minute). 12s per cycle; twelve
// cycles ≈ 2:24. The synced schedule below is derived from CYCLE_MS, so changing
// these here re-times the global breath for everyone at once.
const INHALE_MS = 6000;
// Inhale and exhale are equal — a symmetric 6s in / 6s out. The scale + ring
// fills below derive from INHALE_MS/EXHALE_MS separately, so this stays correct.
const EXHALE_MS = 6000;
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

// Per-breath haptic. The exhale ("out") is EXACTLY 1.618× as strong as the
// inhale ("in") — the golden ratio, felt. Uses the native Core-Haptics plugin
// (PhoebeAudio.smoothSwell, which takes a numeric peak intensity) so the ratio
// is precise; falls back to Capacitor's discrete impact (light vs medium) on
// web / older shells where only fixed styles exist.
const HAPTIC_IN = 0.44;                       // inhale intensity (0–1) — 20% softer
const HAPTIC_OUT = Math.min(1, HAPTIC_IN * 1.618); // exhale — 1.618× stronger (also 20% softer)
function breathHaptic(out: boolean): void {
  const peak = out ? HAPTIC_OUT : HAPTIC_IN;
  try {
    const audio = (window as unknown as {
      Capacitor?: { Plugins?: { PhoebeAudio?: { smoothSwell?: (o: { durationMs: number; peak: number; sharpness: number }) => Promise<unknown> } } };
    }).Capacitor?.Plugins?.PhoebeAudio;
    if (audio?.smoothSwell) {
      const r = audio.smoothSwell({ durationMs: 150, peak, sharpness: 0.5 });
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
      return;
    }
  } catch { /* fall through to discrete impact */ }
  try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: out ? "medium" : "light" } })); } catch { /* web — silent */ }
}
// Vertical centre of the breath text — lowered toward the bottom third of the
// screen so the breath sits low and there's room above.
const BREATH_Y = "63%";

// The world turns between these three globes — one held per session, rotating
// across sessions.
const GLOBES = ["🌍", "🌎", "🌏"] as const;

// The sync-screen quotes — one chosen per sit (see shortQuoteRef). Text + author
// live in the render (they go through t()); this just fixes the set + order.
type QuoteKind = "weil" | "merton" | "mlk" | "teresa";
const QUOTE_KINDS: readonly QuoteKind[] = ["weil", "merton", "mlk", "teresa"];
// Outer per-breath ring around the globe: the lighter green fills clockwise on
// the inhale and HOLDS through the exhale; the darker green sweeps over it on
// the exhale. Resets each cycle.
const RING_IN = "#86C79B";
const RING_OUT = "#2E6B40";
const RING_R = 58;                       // outer ring radius (viewBox 128)
const RING_CIRC = 2 * Math.PI * RING_R;
const RING_SW = 3.36;                    // stroke width — 30% thinner; inner ring matches it (same thickness)
// Inner blue SESSION ring — ONE slow circle filling once across the whole set
// of breaths. Radius is 10% smaller than the old 47, and its thickness matches
// the outer ring (RING_SW). The globe takes on a blue glow when the set is kept.
const SESSION_BLUE = "#5B9DEF";
const SESSION_R = RING_R / 1.618;         // inner radius — the outer (RING_R) is 1.618× (golden ratio) bigger
const SESSION_CIRC = 2 * Math.PI * SESSION_R;

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
  coffeePhotos,
  topic = "planet",
  followSeed,
  followStartEpochMs,
  onSession,
  nearbyCount = 0,
  nearbyFellows = [],
  mapFellows = [],
  myLoc = null,
  coBreathingFellows = [],
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
  // The "Coffee" topic — instead of swapping the whole library, we KEEP the
  // planet photos and sprinkle coffee in: every three breaths shows 1 coffee
  // then 2 planet. These are the coffee-only images for that 1-in-3 slot.
  coffeePhotos?: string[];
  topic?: "planet" | "coffee";
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
  // "Same air" (opt-in, beta) — how many others are breathing in your coarse
  // area right now, and any Fellows among them (first name + avatar). Revealed
  // quietly mid-breath; 0 → nothing shown (falls back to the global count).
  nearbyCount?: number;
  nearbyFellows?: Array<{ userId: number; name: string; avatarUrl: string | null; band: string }>;
  // "Breathing together" map (in-person opt-in) — Fellows breathing now who
  // shared precise coords, plus my own anchor. Drives the across-distance map.
  mapFellows?: Array<{ userId: number; name: string; avatarUrl: string | null; lat: number; lng: number }>;
  myLoc?: { lat: number; lng: number } | null;
  // Fellows breathing RIGHT NOW (live) — shown as faces near the top, refreshed
  // ONCE per breath and fading in/out with the breath.
  coBreathingFellows?: Array<{ userId: number; name: string | null; avatarUrl: string | null }>;
}) {
  const { t } = useTranslation();
  // Entrance fade-up: false on mount, flipped on the next frame so the root
  // eases from translateY(14px)/opacity 0 to rest — a smooth rise when arriving
  // from the contemplation card (or an office slide) instead of a hard cut.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // The breath is a draggable centre globe (🌍) ringed by CONCENTRIC progress
  // circles (outer breath ring + inner blue session ring, golden ratio apart)
  // over a softly breathing photo field — see the SVG in the render below.
  const labelRef = useRef<HTMLDivElement>(null);
  // Globe + the rings around it (driven from the rAF clock below).
  const globeRef = useRef<HTMLDivElement>(null);
  const ringInRef = useRef<SVGCircleElement>(null);
  const ringOutRef = useRef<SVGCircleElement>(null);
  const sessionRingRef = useRef<SVGCircleElement>(null);
  // The globe is chosen ONCE per session and held for the whole sit; a
  // localStorage counter rotates 🌍 → 🌎 → 🌏 across sessions.
  const sessionGlobeRef = useRef<string | null>(null);
  if (sessionGlobeRef.current === null) {
    let gi = 0;
    try { gi = ((parseInt(localStorage.getItem("phoebe:cobreathe-globe") || "0", 10) || 0) % GLOBES.length + GLOBES.length) % GLOBES.length; } catch { /* ignore */ }
    sessionGlobeRef.current = GLOBES[gi];
    try { localStorage.setItem("phoebe:cobreathe-globe", String((gi + 1) % GLOBES.length)); } catch { /* ignore */ }
  }
  // Which sync quote this session shows — Weil · Merton · King · Teresa, chosen
  // once per sit so the slot isn't always the same line.
  const shortQuoteRef = useRef<QuoteKind | null>(null);
  if (shortQuoteRef.current === null) {
    shortQuoteRef.current = QUOTE_KINDS[Math.floor(Math.random() * QUOTE_KINDS.length)];
  }
  // A leaf rests behind the SYNC ("loading") screen — picked once per sit. It
  // fades out as the breath goes live and the rotating breath photos take over.
  const sessionLeafRef = useRef<string | null>(null);
  if (sessionLeafRef.current === null && LEAF_PHOTOS.length > 0) {
    sessionLeafRef.current = LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]!;
  }
  // ── Draggable globe ──────────────────────────────────────────────────────
  // The globe cluster can be dragged anywhere on screen (kept 24px clear of the
  // edges + the top title and bottom labels). Released near its home (centre),
  // it springs back with a soft haptic. The chosen spot persists across sits.
  // Always START perfectly centred (on 50% / 61.8%). We no longer restore a
  // persisted drag offset — a stale offset from a prior sit was leaving the
  // globe + rings off-centre on open. Dragging still works within the sit.
  const [globeOffset, setGlobeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [globeSnapping, setGlobeSnapping] = useState(false);
  // Globe box size in px. On MOBILE the page width is 2.61× the OUTER ring's
  // diameter — i.e. outer diameter = viewport width / 2.61. The outer ring is
  // 2·RING_R of the 128 viewBox, so the box (the full viewBox) = outer·128/116.
  // Desktop keeps the fixed 158 box.
  const globeBoxPx = (vw: number): number => {
    if (vw > 0 && vw <= 600) {
      const outer = vw / 2.61;
      return Math.round(outer * (128 / (2 * RING_R)));
    }
    return 158;
  };
  const [globePx, setGlobePx] = useState<number>(() => {
    try { return globeBoxPx(window.innerWidth); } catch { return 158; }
  });
  useEffect(() => {
    const onResize = () => { try { setGlobePx(globeBoxPx(window.innerWidth)); } catch { /* ignore */ } };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const globeCellRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Captured at pointer-down: start pointer, offset at start, and the clamp
  // bounds (from the cell's natural rect + the title/bottom content edges).
  const globeDragRef = useRef<{ px: number; py: number; ox: number; oy: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  // Re-clamp the (persisted) offset to the CURRENT viewport on mount + on
  // resize/rotate — a value saved on a larger screen could otherwise strand the
  // globe off-view or over the title/labels with no way back but a blind drag.
  useEffect(() => {
    const clamp = () => {
      const cell = globeCellRef.current; if (!cell) return;
      const rect = cell.getBoundingClientRect();
      setGlobeOffset((cur) => {
        const natLeft = rect.left - cur.x, natTop = rect.top - cur.y;
        const titleBottom = titleRef.current?.getBoundingClientRect().bottom ?? 0;
        const bottomTop = bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight;
        let minX = 24 - natLeft, maxX = (window.innerWidth - 24) - (natLeft + rect.width);
        let minY = (titleBottom + 24) - natTop, maxY = (bottomTop - 24) - (natTop + rect.height);
        if (minX > maxX) minX = maxX = (minX + maxX) / 2;   // screen too narrow → lock to centre
        if (minY > maxY) minY = maxY = (minY + maxY) / 2;   // too short → lock to centre
        const nx = Math.min(maxX, Math.max(minX, cur.x));
        const ny = Math.min(maxY, Math.max(minY, cur.y));
        return (nx === cur.x && ny === cur.y) ? cur : { x: nx, y: ny };
      });
    };
    clamp();
    window.addEventListener("resize", clamp);
    window.addEventListener("orientationchange", clamp);
    return () => { window.removeEventListener("resize", clamp); window.removeEventListener("orientationchange", clamp); };
  }, []);
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
  // "Coffee" topic: a separate canonical for the coffee-only images, plus a live
  // mirror of the chosen topic, both read inside the rAF loop below.
  const coffeeCanonicalRef = useRef<Canonical | null>(null);
  if (coffeeCanonicalRef.current === null && coffeePhotos && coffeePhotos.length > 0) {
    coffeeCanonicalRef.current = buildCanonical(coffeePhotos);
  }
  const topicRef = useRef(topic);
  topicRef.current = topic;
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
  // runs on until the user chooses to finish. Anchored to the SERVER clock
  // (syncedNow) — never the device's own clock — so every device's breath rides
  // the same global schedule and two people are inhaling together to the ms.
  const startRef = useRef(syncedNow());
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

  // Lock onto the SERVER clock before the count begins. On a warm load the
  // offset is already known and the anchors above are already correct, so this
  // is a no-op; on a cold open (offset still settling) it re-anchors to the
  // accurate server time during the pre-roll — but never once the count has
  // started (frozenRef), so a sync landing mid-sit can never jolt the rhythm.
  useEffect(() => {
    let cancelled = false;
    ensureClockSynced().then(() => {
      if (cancelled || frozenRef.current) return;
      const n = syncedNow();
      startRef.current = n;
      countStartRef.current = Math.ceil(n / CYCLE_MS) * CYCLE_MS;
    }).catch(() => { /* offline — fall back to the device clock */ });
    return () => { cancelled = true; };
  }, []);

  // A rAF loop writes transforms straight to the DOM from the global clock —
  // no React re-render per frame, perfectly synced for everyone, and only
  // transform/opacity (GPU-composited) so the swell stays glass-smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = syncedNow();
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
          // A haptic on each phase turn; the exhale is 1.618× the inhale.
          breathHaptic(phase === "out");
          // Sound ONLY on the inhale (the start of each breath), not the
          // exhale — one tone per breath, rising through the three lower slide
          // octaves (0,1,2) from a per-session counter that starts at 0.
          if (phase === "in") {
            // Start on the lowest octave, then rotate 0,1,2 per breath.
            const octave = inhaleToneCountRef.current % 3;
            inhaleToneCountRef.current += 1;
            try { playBreathTone(octave); } catch { /* audio locked — non-fatal */ }
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
        // Photo for a given breath index. Planet topic: straight through the
        // canonical sequence. Coffee topic: every third breath (i % 3 === 0) is a
        // coffee image; the other two are planet — so each trio is 1 coffee + 2
        // planet. Each source advances on its own ordinal so neither repeats early.
        const coffeeCanon = coffeeCanonicalRef.current;
        const useCoffee = topicRef.current === "coffee" && !!coffeeCanon && coffeeCanon.rest.length > 0;
        const photoAt = (i: number): string => {
          if (useCoffee && coffeeCanon) {
            if (i % 3 === 0) return photoForGlobalIndex(coffeeCanon, seed, Math.floor(i / 3) + 1);
            return photoForGlobalIndex(canonical, seed, i - Math.floor(i / 3));
          }
          return photoForGlobalIndex(canonical, seed, i);
        };
        const a = photoARef.current;
        const b = photoBRef.current;
        // New breath: the incoming layer was preloaded last cycle; make sure it
        // holds the right photo (covers the very first breath, where it wasn't,
        // and the follower's snap from its opening photo to the leader's).
        if (idx !== photoLastIdxRef.current) {
          photoLastIdxRef.current = idx;
          const incoming = (idx % 2 === 0) ? a : b;
          const url = photoAt(idx);
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
        // of every breath (and before sync), rising to a fuller ~0.82 peak at
        // the top of the inhale so the photo reads clearly. The slight ease
        // (pAnim^1.25) pulls the lower range down faster so the photo is truly
        // GONE at the bottom of the exhale — no lingering as the next one rises.
        if (photoGroupRef.current) photoGroupRef.current.style.opacity = (Math.pow(pAnim, 1.25) * 0.82).toFixed(4);
        // Preload the NEXT photo onto the now-hidden previous layer so it's
        // decoded before its turn (it becomes the active layer next breath).
        if (photoPreloadedRef.current !== idx && prevEl) {
          const nextUrl = photoAt(idx + 1);
          if (prevEl.getAttribute("src") !== nextUrl) prevEl.src = nextUrl;
          photoPreloadedRef.current = idx;
        }
      }
      // The phase word — "Breathe In" / "Breathe Out" — fades UP from nothing at
      // the start of each phase, peaks mid-phase, and fades DOWN to nothing at
      // the turn (so the word swap happens while invisible). The word stays a
      // CONSTANT SIZE — no scale ride (it was reading as the text growing and
      // shrinking). Before sync, the "Syncing" label holds at full opacity.
      if (labelRef.current) {
        const f = pos < INHALE_MS ? pos / INHALE_MS : (pos - INHALE_MS) / EXHALE_MS;
        labelRef.current.style.opacity = isCounting ? Math.sin(Math.PI * f).toFixed(4) : "1";
      }
      // Globe GREEN glow crossfades with the breath — darker at the bottom of the
      // exhale (pAnim→0), lighter at the top of the inhale (pAnim→1). Skipped once
      // the set is complete, so the declarative blue glow takes over.
      if (globeRef.current && !reachedRef.current) {
        const gr = Math.round(46 + (134 - 46) * pAnim);
        const gg = Math.round(107 + (199 - 107) * pAnim);
        const gb = Math.round(64 + (155 - 64) * pAnim);
        const blur = (10 + pAnim * 13).toFixed(1);
        const alpha = (0.42 + pAnim * 0.42).toFixed(2);
        globeRef.current.style.filter =
          `drop-shadow(0 0 ${blur}px rgba(${gr},${gg},${gb},${alpha})) drop-shadow(0 3px 14px rgba(8,30,18,0.6))`;
      }
      // Breath-progress rings: the lighter ring fills over the inhale + holds; the
      // darker ring sweeps over it on the exhale; both reset each cycle. The inner
      // blue ring fills once, slowly, across the whole set of breaths.
      {
        const inhale = pos < INHALE_MS;
        // Both strokes draw in the SAME clockwise direction. The light green
        // fills over the inhale and HOLDS full; on the exhale the dark green
        // sweeps FORWARD over it (same direction — it never recedes backwards),
        // settling the ring back to the dark base by full exhale. Both reset
        // under the static dark base at the cycle turn, so there's no jump.
        // Two colors. The light-green ring draws FORWARD over the inhale and
        // HOLDS full; on the exhale a dark-green stroke (the SAME green as the
        // base) draws FORWARD in the same direction over the light, settling the
        // ring back to dark — never rewinding.
        const fIn = isCounting ? (inhale ? pos / INHALE_MS : 1) : 0;
        const fOut = isCounting ? (inhale ? 0 : (pos - INHALE_MS) / EXHALE_MS) : 0;
        if (ringInRef.current) ringInRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fIn)).toFixed(2);
        if (ringOutRef.current) ringOutRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fOut)).toFixed(2);
        if (sessionRingRef.current) {
          const sFrac = isCounting ? Math.min(1, Math.max(0, (now - countStartRef.current) / (totalBreaths * CYCLE_MS))) : 0;
          sessionRingRef.current.style.strokeDashoffset = (SESSION_CIRC * (1 - sFrac)).toFixed(2);
        }
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
      const now = syncedNow();
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
        try { playBreathTone(); } catch { /* audio locked — non-fatal */ }
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
    // Synced elapsed (s) at the moment we last went hidden, so a sit interrupted
    // by backgrounding ENDS at the breaths kept before leaving — they still
    // count — and background time is never counted as breathing.
    let hiddenElapsed = 0;
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        hiddenAt = Date.now();
        hiddenElapsed = Math.round((syncedNow() - startRef.current) / 1000);
      } else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (away > 1200 && !reachedRef.current) invalidRef.current = true;
        if (invalidRef.current && !reachedRef.current && !endedRef.current) {
          endedRef.current = true;
          // End at the breaths kept BEFORE backgrounding — never voided, never
          // inflated by the time away; the breaths already breathed are received.
          onEnd(hiddenElapsed, false);
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

  const now = syncedNow();
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
  // A gentle haptic the moment the breath SYNCS (pre-roll → live), so joining
  // the global breath is felt. Fires once per sit. "success" routes to the
  // smooth native swell (native-shell wireHaptics).
  const syncedHapticRef = useRef(false);
  useEffect(() => {
    if (counting && !syncedHapticRef.current) {
      syncedHapticRef.current = true;
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } })); } catch { /* web */ }
    }
  }, [counting]);
  // While syncing (before the count begins), the centre word reads "Syncing"
  // with an animated ellipsis instead of "Breathe in / out".
  const syncDots = ".".repeat(Math.floor(now / 450) % 4);
  const centerLabel = counting ? phaseLabel : `${t("cobreathe.syncing", { defaultValue: "Syncing to the global breath" })}${syncDots}`;
  const completed = counting ? Math.floor(sinceCount / CYCLE_MS) : 0;
  const breathNum = completed + 1;
  const reachedNow = counting && completed >= totalBreaths;
  // Live co-breathing fellows, snapshotted ONCE PER BREATH (not continuously) so
  // the faces settle with the rhythm. coFacesRef always holds the latest; the
  // effect copies it into state each time the breath number ticks over.
  const coFacesRef = useRef(coBreathingFellows);
  coFacesRef.current = coBreathingFellows;
  const [breathFaces, setBreathFaces] = useState(coBreathingFellows);
  useEffect(() => { setBreathFaces(coFacesRef.current); }, [breathNum]);
  const intention = counting ? INTENTIONS[(breathNum - 1) % INTENTIONS.length] : null;
  // The session globe (held for the whole sit).
  const globe = sessionGlobeRef.current ?? GLOBES[0];
  // The sync-screen quote for this sit — one of QUOTE_KINDS, fixed per sit by
  // shortQuoteRef. A short, punchy line on belonging / one another.
  const quoteKind: QuoteKind = shortQuoteRef.current ?? "weil";
  const SYNC_QUOTES: Record<QuoteKind, { text: string; author: string }> = {
    weil: {
      text: t("cobreathe.sync_quote_weil", { defaultValue: "Attention is the rarest and purest form of generosity." }),
      author: t("cobreathe.sync_quote_weil_author", { defaultValue: "Simone Weil" }),
    },
    merton: {
      text: t("cobreathe.sync_quote_merton", { defaultValue: "What I wear is pants.\nWhat I do is live.\nHow I pray is breathe." }),
      author: t("cobreathe.sync_quote_merton_author", { defaultValue: "Thomas Merton" }),
    },
    mlk: {
      text: t("cobreathe.sync_quote_mlk", { defaultValue: "We must all learn to live together as brothers—or we will all perish together as fools." }),
      author: t("cobreathe.sync_quote_mlk_author", { defaultValue: "Martin Luther King Jr." }),
    },
    teresa: {
      text: t("cobreathe.sync_quote_teresa", { defaultValue: "If we have no peace, it is because we have forgotten that we belong to each other." }),
      author: t("cobreathe.sync_quote_teresa_author", { defaultValue: "Mother Teresa" }),
    },
  };
  const syncQuote = SYNC_QUOTES[quoteKind];

  // Soft sage tones that sit calmly on the deep-green field.
  const TEXT_DIM = "rgba(182,210,188,0.72)";
  const TEXT_FAINT = "rgba(182,210,188,0.48)";

  // Drag-the-globe handlers (Pointer Events → touch + mouse). Bounds keep it
  // 24px clear of the screen edges and the top/bottom text; releasing within
  // 44px of home springs it back to centre with a soft haptic.
  const onGlobeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const cell = globeCellRef.current; if (!cell) return;
    try { cell.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    setGlobeSnapping(false);
    const rect = cell.getBoundingClientRect();
    const natLeft = rect.left - globeOffset.x, natTop = rect.top - globeOffset.y;
    const titleBottom = titleRef.current?.getBoundingClientRect().bottom ?? 0;
    const bottomTop = bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    let minX = 24 - natLeft, maxX = (window.innerWidth - 24) - (natLeft + rect.width);
    let minY = (titleBottom + 24) - natTop, maxY = (bottomTop - 24) - (natTop + rect.height);
    if (minX > maxX) minX = maxX = (minX + maxX) / 2;   // screen too narrow → lock X to centre
    if (minY > maxY) minY = maxY = (minY + maxY) / 2;   // too short → lock Y to centre
    globeDragRef.current = { px: e.clientX, py: e.clientY, ox: globeOffset.x, oy: globeOffset.y, minX, maxX, minY, maxY };
  };
  const onGlobeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = globeDragRef.current; if (!d) return;
    setGlobeOffset({
      x: Math.min(d.maxX, Math.max(d.minX, d.ox + (e.clientX - d.px))),
      y: Math.min(d.maxY, Math.max(d.minY, d.oy + (e.clientY - d.py))),
    });
  };
  const onGlobeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = globeDragRef.current; if (!d) return;
    globeDragRef.current = null;
    try { globeCellRef.current?.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    setGlobeOffset((cur) => {
      if (Math.hypot(cur.x, cur.y) < 44) {
        setGlobeSnapping(true);
        try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* web */ }
        try { localStorage.removeItem("phoebe:cobreathe-globe-offset"); } catch { /* ignore */ }
        return { x: 0, y: 0 };
      }
      try { localStorage.setItem("phoebe:cobreathe-globe-offset", JSON.stringify(cur)); } catch { /* ignore */ }
      return cur;
    });
  };

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
            }
          : {
              background: counting ? FIELD_LIVE : FIELD_DIM,
            }),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        paddingTop: "calc(var(--safe-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        // Entrance — the whole breath fades + slides up gently on mount, so
        // arriving from the contemplation card (or an office slide) is a smooth
        // rise rather than a hard cut. Combined into one transition with the
        // slower background cross-fade so neither clobbers the other.
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 0.55s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), ${backgroundImage ? "background-image" : "background-color"} 1.6s ease`,
        willChange: "opacity, transform",
      }}
    >
      {/* A leaf rests behind the SYNC ("loading") screen, under a dark wash for
          legibility. It fades out the moment the breath goes live, handing off to
          the rotating breath photos below. */}
      {sessionLeafRef.current && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
            opacity: counting ? 0 : 1, transition: "opacity 1.4s ease",
            backgroundImage: `linear-gradient(rgba(4,13,8,0.62), rgba(4,13,8,0.78)), url(${sessionLeafRef.current})`,
            backgroundSize: "cover", backgroundPosition: "center",
          }}
        />
      )}
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

      {/* Top-right control: a quick-close ✕ during the breath, which MORPHS into a
          green "Done" pill the moment the set is complete (the only finish control —
          no separate centred Done button mid-screen). */}
      <button
        type="button"
        aria-label={reachedNow ? t("common.done", { defaultValue: "Done" }) : t("common.cancel", { defaultValue: "Cancel" })}
        onClick={() => onEnd(Math.round((syncedNow() - startRef.current) / 1000), reachedNow ? true : reachedRef.current)}
        style={{
          position: "absolute", top: "calc(var(--safe-top) + 16px)", right: 16,
          borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: SPACE_GROTESK, fontWeight: 600, lineHeight: 1, cursor: "pointer", zIndex: 2,
          transition: "background 0.6s ease, border-color 0.6s ease, color 0.6s ease, padding 0.4s ease, box-shadow 0.6s ease",
          height: 38,
          ...(reachedNow
            ? { background: "rgba(46,107,64,0.95)", border: "1px solid rgba(110,180,130,0.6)", color: "#EAF6F4", fontSize: 15, padding: "0 22px", boxShadow: "0 5px 22px rgba(8,30,18,0.45)" }
            : { background: "rgba(0,0,0,0.4)", border: "1px solid rgba(200,225,210,0.28)", color: "#EAF6F4", fontSize: 17, width: 38, padding: 0 }),
        }}
      >
        {reachedNow ? t("common.done", { defaultValue: "Done" }) : "✕"}
      </button>

      {/* While SYNCING, a quote rests in the upper third — centred. A short wait
          (< 5s) shows the brief Simone Weil line; a longer wait shows the fuller
          Sallie McFague one (more time to read). It FADES + drifts down into the
          practice once the breath goes live, so the hand-off is smooth. */}
      <div
        aria-hidden={counting}
        style={{
          position: "absolute", left: 28, right: 28, top: "26%",
          transform: counting ? "translateY(16px)" : "translateY(0)",
          opacity: counting ? 0 : 1,
          transition: "opacity 0.8s ease, transform 0.8s ease",
          zIndex: 2, pointerEvents: "none", maxWidth: 540, marginLeft: "auto", marginRight: "auto",
        }}
      >
        <p style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: "clamp(20px, 5.8vw, 25px)", lineHeight: 1.5, textAlign: "center", textShadow: "0 2px 18px rgba(8,30,18,0.6)", whiteSpace: "pre-line" }}>
          {syncQuote.text}
        </p>
        <p style={{ color: "rgba(182,210,188,0.62)", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", marginTop: 16, textAlign: "center" }}>
          {syncQuote.author}
        </p>
      </div>

      {/* Title + Synced + participation — TOP-LEFT, left-aligned to counter-
          balance the top-right Cancel / Done control (the Synced line + count
          sit left-aligned under it, as the design always intended). */}
      <div ref={titleRef} className="flex flex-col items-start" style={{ position: "relative", width: "100%", paddingLeft: 20, paddingRight: 96 }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(182,210,188,0.55)", fontFamily: SPACE_GROTESK }}>
          {t("cobreathe.title", { defaultValue: "Co-Breathe" })} 🌍
        </p>
        {/* Live indicator — "Synced" + a pulsing red dot to its RIGHT, on its
            OWN line UNDER the title (left-aligned to it). Appears once the
            session joins the global breath (counting). */}
        {counting && (
          <span className="inline-flex items-center gap-1 mt-1 text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: SPACE_GROTESK }}>
            <span style={{ color: "#E58A8D", letterSpacing: "0.16em" }}>{t("cobreathe.synced", { defaultValue: "Synced" })}</span>
            <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: "#E5484D", boxShadow: "0 0 6px rgba(229,72,77,0.8)" }} />
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

      {/* Fellows breathing with you RIGHT NOW — faces, refreshed once per breath
          and breathing in/out with the rhythm (opacity tied to the phase). */}
      {counting && breathFaces.length > 0 && (
        <div
          className="w-full flex justify-center"
          style={{ paddingLeft: 20, paddingRight: 20, marginTop: 10, opacity: phase === "in" ? 0.95 : 0.32, transition: "opacity 3s ease-in-out" }}
        >
          <div className="flex items-center">
            {breathFaces.slice(0, 5).map((f, i) => (
              f.avatarUrl ? (
                <img key={f.userId} src={f.avatarUrl} alt={f.name ?? ""} style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", border: "2px solid rgba(8,30,18,0.85)", marginLeft: i === 0 ? 0 : -8 }} />
              ) : (
                <span key={f.userId} style={{ width: 34, height: 34, borderRadius: 999, background: "#1A4A2E", color: "#A8C5A0", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(8,30,18,0.85)", marginLeft: i === 0 ? 0 : -8, fontFamily: SPACE_GROTESK }}>
                  {((f.name ?? "?").trim()[0] ?? "?").toUpperCase()}
                </span>
              )
            ))}
            {breathFaces.length > 5 && (
              <span style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(46,107,64,0.5)", color: "#C8D4C0", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(8,30,18,0.85)", marginLeft: -8, fontFamily: SPACE_GROTESK }}>+{breathFaces.length - 5}</span>
            )}
          </div>
        </div>
      )}

      {/* Globe + rings — CENTRED, the still point of the screen, but DRAGGABLE:
          grab it anywhere on screen (24px clear of the edges + the top/bottom
          text); let go near home and it springs back to centre. The outer ring
          breathes (lighter green in, darker green out); the inner blue ring fills
          once across the whole set. */}
      <div
        ref={globeCellRef}
        onPointerDown={onGlobeDown}
        onPointerMove={onGlobeMove}
        onPointerUp={onGlobeUp}
        onPointerCancel={onGlobeUp}
        style={{
          // Positioned absolutely so the globe's CENTRE sits at 61.8% of the
          // screen height (golden ratio) — lower than the old flex-centre. The
          // −50%/−50% centres the box on that point; the drag offset composes on
          // top (onGlobeDown/Move recover the natural position by subtracting the
          // offset from the measured rect, so the drag clamp still bounds it).
          position: "absolute", left: "50%", top: "61.8%",
          width: globePx, height: globePx, zIndex: 3,
          transform: `translate(-50%, -50%) translate(${globeOffset.x}px, ${globeOffset.y}px)`,
          transition: globeSnapping ? "transform 0.4s cubic-bezier(0.34, 1.3, 0.64, 1)" : "none",
          touchAction: "none", cursor: "grab",
        }}
      >
        <svg
          aria-hidden="true"
          width={globePx} height={globePx} viewBox="0 0 128 128"
          style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none", filter: "drop-shadow(0 2px 10px rgba(8,30,18,0.5))" }}
        >
          {/* TWO colors only. Dark green BASE ring — the resting state, a full
              dark-green circle the breath starts and ends on. */}
          <circle cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW} strokeOpacity={0.9}
            style={{ filter: "drop-shadow(0 0 4px rgba(46,107,64,0.7))" }} />
          {/* Light green progress — draws FORWARD over the dark base on the
              inhale and holds full. */}
          <circle ref={ringInRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.85}
            style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, willChange: "stroke-dashoffset", filter: "drop-shadow(0 0 5px rgba(134,199,155,0.85))" }} />
          {/* Exhale sweep — the SAME dark green as the base (still two colors),
              drawing FORWARD in the same direction over the light on the exhale,
              settling the ring back to dark. Never rewinds. */}
          <circle ref={ringOutRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.9}
            style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, willChange: "stroke-dashoffset", filter: "drop-shadow(0 0 4px rgba(46,107,64,0.7))" }} />
          {/* inner blue session ring — visible track (so the two rings read as
              concentric even at rest) + slow fill, thickness matched to the outer */}
          <circle cx={64} cy={64} r={SESSION_R} fill="none" stroke="rgba(91,157,239,0.34)" strokeWidth={RING_SW} />
          <circle ref={sessionRingRef} cx={64} cy={64} r={SESSION_R} fill="none" stroke={SESSION_BLUE} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.8}
            style={{ strokeDasharray: SESSION_CIRC, strokeDashoffset: SESSION_CIRC, willChange: "stroke-dashoffset", filter: "drop-shadow(0 0 5px rgba(91,157,239,0.85))" }} />
        </svg>
        <div
          ref={globeRef}
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            // Flex-centre the emoji over the rings box. SVG <text> positioning
            // follows the glyph's FONT metrics (which sit off-centre for the
            // globe emoji), so it drifted up-left of the rings; flex centring of
            // the line box reads as truly concentric, as it did originally.
            display: "flex", alignItems: "center", justifyContent: "center",
            // Symmetric glow (no downward Y offset) so the shadow doesn't pull the
            // globe's visual weight below the rings' centre.
            filter: reachedNow
              ? "drop-shadow(0 0 18px rgba(91,157,239,0.9)) drop-shadow(0 0 10px rgba(8,30,18,0.5))"
              : "drop-shadow(0 0 13px rgba(90,150,110,0.55)) drop-shadow(0 0 14px rgba(8,30,18,0.6))",
            transition: reachedNow ? "filter 1.2s ease" : "none",
          }}
        >
          <span style={{ fontSize: Math.round(globePx * 0.5), lineHeight: 1 }}>{globe}</span>
        </div>
      </div>

      {/* "Breathing together" map — when you opted into an in-person session and
          Fellows are breathing with you (precise coords), show where they are with
          a line from you to each. Fades in mid-breath like the "same air" line and
          takes its place when present. */}
      {counting && breathNum >= 3 && myLoc && mapFellows.length > 0 && (
        <div
          className="w-full flex flex-col items-center"
          style={{ paddingLeft: 28, paddingRight: 28, marginBottom: 10, opacity: phase === "in" ? 0.96 : 0.62, transition: "opacity 2.4s ease-in-out" }}
        >
          <p style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 14.5, textAlign: "center", marginBottom: 8, textShadow: "0 2px 18px rgba(8,30,18,0.6)" }}>
            {mapFellows.length === 1 ? "breathing together, miles apart" : "breathing together, across the miles"}
          </p>
          <div style={{ width: "100%", maxWidth: 264 }}>
            <CobreatheMap me={myLoc} fellows={mapFellows} />
          </div>
        </div>
      )}

      {/* "Same air" — a quiet realization that arrives mid-breath (breath ≥ 3),
          fading IN with the inhale so the count feels inhaled, not displayed.
          Strangers stay an anonymous count; Fellows get a first name. Hidden when
          the map (above) is showing. */}
      {counting && breathNum >= 3 && nearbyCount > 0 && !(myLoc && mapFellows.length > 0) && (
        <div
          className="w-full flex flex-col items-center"
          style={{
            paddingLeft: 28, paddingRight: 28, marginBottom: 10,
            opacity: phase === "in" ? 0.92 : 0.5,
            transition: "opacity 2.4s ease-in-out",
          }}
        >
          <p style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 15, letterSpacing: "0.01em", textAlign: "center", textShadow: "0 2px 18px rgba(8,30,18,0.6)" }}>
            {nearbyFellows.length > 0
              ? `breathing the same air as ${nearbyFellows[0].name}${nearbyCount > 1 ? ` and ${nearbyCount - 1} ${nearbyCount - 1 === 1 ? "other" : "others"} near you` : " near you"}`
              : `breathing the same air as ${nearbyCount} ${nearbyCount === 1 ? "person" : "people"} near you`}
          </p>
          {nearbyFellows.length > 0 && (
            <div className="flex items-center" style={{ marginTop: 8 }}>
              {nearbyFellows.slice(0, 4).map((f, i) => (
                f.avatarUrl ? (
                  <img key={f.userId} src={f.avatarUrl} alt={f.name} style={{ width: 26, height: 26, borderRadius: 999, objectFit: "cover", border: "1.5px solid rgba(12,36,23,0.9)", marginLeft: i === 0 ? 0 : -6 }} />
                ) : (
                  <span key={f.userId} style={{ width: 26, height: 26, borderRadius: 999, background: "#1A4A2E", color: "#A8C5A0", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(12,36,23,0.9)", marginLeft: i === 0 ? 0 : -6, fontFamily: SPACE_GROTESK }}>
                    {(f.name[0] ?? "?").toUpperCase()}
                  </span>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* No End/Discard controls on the breath itself — the breath is a calm,
          undistracted field. The quick-close ✕ (top-right) is the only exit; it
          counts the sit once the 12 are kept, and discards otherwise. (The
          labelled End/Discard belong to the silent ContemplationTimer, not here.) */}

      {/* Bottom — the breathing word in the LEFT corner + the breath
          count in the RIGHT corner. The quick-close ✕ lives top-right. */}
      <div ref={bottomRef} className="w-full" style={{ paddingLeft: 28, paddingRight: 28, marginBottom: 8 }}>
        <div className="flex items-end" style={{ gap: 14 }}>
          {/* LEFT — Breathe In / Breathe Out. */}
          <div ref={labelRef} className="flex-1 min-w-0" style={{ willChange: "transform, opacity" }}>
            <span
              style={{
                color: WARM, fontFamily: SPACE_GROTESK, fontSize: 15.2, fontWeight: 600,
                letterSpacing: "0.04em", textShadow: "0 2px 18px rgba(8,30,18,0.6)", whiteSpace: "nowrap",
              }}
            >
              {centerLabel}
            </span>
          </div>
          {/* RIGHT — just "n of 12" (no leading "Breath"), once counting. */}
          {counting && (
            <p className="flex-1 text-right" style={{ color: reachedNow ? "rgba(126,210,140,0.95)" : TEXT_DIM, fontFamily: SPACE_GROTESK, fontSize: 15.2, fontWeight: 600, letterSpacing: "0.04em" }}>
              {reachedNow
                ? t("cobreathe.breath_counter_past", { current: breathNum, defaultValue: `🌿 ${breathNum}` })
                : t("cobreathe.breath_counter", { current: breathNum, total: totalBreaths, defaultValue: `${breathNum} of ${totalBreaths}` })}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
