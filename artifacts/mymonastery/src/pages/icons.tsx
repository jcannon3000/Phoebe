/**
 * Praying with Icons — choose a sacred image by NAME, and sit with it.
 *
 * Owner: "an icon feature that uses the pictures in our catalogue: they open
 * the feature, they can search by name through the catalog of icons, they
 * select one and it goes to another page where they set a timer or no timer
 * — one to five minutes — and it goes down the page with the picture just
 * like the Visio Divina slideshow. Below the picture it has a countdown and
 * the timer. Then they complete it, and the final card shows the most recent
 * three icons they've done."
 *
 * The deliberate INVERSION of Visio Divina: there the day chooses the image
 * (everyone sees the same work), here the PERSON chooses it — an icon you
 * return to is the whole tradition of icon prayer. So this page shares
 * Visio's visual language (the leaf backdrop, the lifted picture, the museum
 * label, the frosted closing cards) but none of its selection machinery: no
 * lectionary, no chooseArtwork, no shared day.
 *
 * The timer is the practice's only structure. With one set, the picture is
 * held: the countdown runs under the work and Complete arrives when it ends
 * — the same "the one thing you cannot do quickly is look slowly" reasoning
 * as Visio's 12-second hold, stretched to a sit. With no timer, Complete is
 * simply there.
 *
 * Completion writes only the device-local icon history (the closing cards'
 * record) — this is a practice you can visit, not a card in the daily rhythm,
 * so it touches no completion flags and no dots.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ICON_CATALOGUE, type IconArtwork } from "@/lib/iconCatalogue";
import { ACT_CATALOGUE } from "@/lib/visioCatalogue";
import { isActHidden, actIconOn, actIconOff, ACT_OVERRIDES_EVENT } from "@/lib/actOverrides";
import { weekIconId, lastWeekIconId, setWeekIcon, suggestedForWeek, suggestionReason } from "@/lib/iconWeek";
import { IconHowToIntro, iconHowtoSeen, markIconHowtoSeen } from "@/components/IconHowToIntro";
import { getIconHistory, recordIconPrayed, getPhysicalIconLogs, recordPhysicalIcon } from "@/lib/iconHistory";
import { FROST_BLUR } from "@/lib/frost";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Same tidy-ups the Visio deck applies to ACT's records. */
function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}
function tidyArtist(a: string): string {
  return tidyDate(a.replace(/(^|[,\s])-\s*(\d{3,4})/g, "$1d. $2"));
}

/** Case/diacritic-insensitive haystack for the name search. */
function norm(s: string): string {
  try {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return s.toLowerCase();
  }
}

/** How many results the search shows at once — a screenful, not an archive. */
const RESULT_CAP = 24;

/**
 * The pool this page actually searches: the harvested icon catalogue minus
 * the admin tool's deletions and icon-toggle-OFFs, plus any library work the
 * owner toggled icon-ON (mapped down to the icon shape). Recomputed when the
 * overrides change (ACT_OVERRIDES_EVENT), so an admin edit shows without a
 * reload.
 */
function iconPool(): IconArtwork[] {
  const base = ICON_CATALOGUE.filter((a) => !isActHidden(a.id) && !actIconOff(a.id));
  const seen = new Set(base.map((a) => a.id));
  const added: IconArtwork[] = ACT_CATALOGUE
    .filter((a) => actIconOn(a.id) && !isActHidden(a.id) && !seen.has(a.id))
    // refs/days/subjects carry straight through rather than being blanked:
    // a library work toggled icon-ON is then eligible for the week's
    // reading-suggested icon exactly like a harvested one.
    .map((a) => ({ id: a.id, title: a.title, artist: a.artist, date: a.date, where: a.where, img: a.img, people: a.people, refs: a.refs, days: a.days, subjects: a.subjects, act: a.act, licence: a.licence, attribution: a.attribution }));
  return [...base, ...added];
}

/**
 * "week" is the first screen of a NEW week — the three doors. Every other
 * phase is unchanged; once an icon is chosen for the week the practice opens
 * straight into it, which is the whole point of choosing one.
 */
/** One of the week's doors — the icon, its name, and why it is being offered. */
function WeekDoor({ art, label, note, onClick }: {
  art: IconArtwork; label: string; note: string | null; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        userSelect: "none", WebkitTapHighlightColor: "transparent",
        display: "flex", alignItems: "center", gap: 14, textAlign: "left",
        borderRadius: 16, padding: 12,
        background: "rgba(240,237,230,0.06)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(200,212,192,0.18)",
      }}
    >
      <img
        src={art.img}
        alt=""
        aria-hidden
        decoding="async"
        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ color: "rgba(143,175,150,0.9)", fontFamily: FONT, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>
          {art.title}
        </span>
        {note && (
          <span style={{ color: "rgba(200,212,192,0.7)", fontFamily: FONT, fontSize: 12, lineHeight: 1.45 }}>
            {note}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * "open" — THE OPENING SLIDE, between choosing an icon and sitting with it.
 *
 * Owner: "after you have chosen the icon for the week you dont get the
 * opening slide." There wasn't one: choosing went straight to "how long will
 * you sit with it?", so the first thing after a considered choice was a
 * duration picker. The icon you are about to pray with was never actually
 * presented — no title, no writer, no invitation, the way Visio Divina opens
 * on the work before asking anything of you.
 *
 * It is also where a settled week now LANDS, so returning mid-week meets the
 * icon again rather than a form.
 */
type Phase = "week" | "open" | "search" | "timer" | "pray" | "done" | "log" | "log-done";

export default function IconsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  /**
   * OPENS ON THE WEEK'S ICON once there is one (owner: "once they choose it,
   * that's the one that comes up"). Only a week with no choice yet shows the
   * three doors, and only then does the catalogue search appear at all.
   */
  const [phase, setPhase] = useState<Phase>(() => {
    /**
     * OPEN ON THE LAST ONE. Owner: "have the one they used yesterday be the
     * one by default on the opening page and then have an option that says
     * choose another icon."
     *
     * Not a weekly lock — that was the previous design and the owner asked
     * for it out ("lets not set it for the week"): nothing is pinned, and
     * choosing another is one tap from the opening slide. The default is just
     * the obvious one, because returning to the same icon is what this
     * practice is for.
     *
     * With no history at all — a first visit — there is nothing to default
     * to, so the chooser leads instead.
     */
    try { return getIconHistory().length > 0 ? "open" : "week"; } catch { return "week"; }
  });
  const [showHowto, setShowHowto] = useState<boolean>(() => {
    try { return !iconHowtoSeen(); } catch { return false; }
  });
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<IconArtwork | null>(null);
  /** Minutes, 1–5 — or null for "no timer". */
  const [minutes, setMinutes] = useState<number | null>(null);
  /**
   * The sit's END as a wall-clock timestamp, not a decrementing counter — a
   * backgrounded tab coalesces timers (this repo's own testing notes), and a
   * count that ticks only while the screen is watched would hold someone past
   * their five minutes. Remaining time is recomputed from the clock each tick.
   */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  /** Read once at mount, like Visio's — this session's own completion joins
   *  it in state so the closing cards update without a re-read. */
  const [history, setHistory] = useState(() => getIconHistory());
  /** Bumped when the admin overrides change, re-deriving the pool below. */
  const [ovVersion, setOvVersion] = useState(0);
  useEffect(() => {
    const on = () => setOvVersion((v) => v + 1);
    window.addEventListener(ACT_OVERRIDES_EVENT, on);
    return () => window.removeEventListener(ACT_OVERRIDES_EVENT, on);
  }, []);
  const catalogue = useMemo(iconPool, [ovVersion]);
  const byId = useMemo(() => new Map(catalogue.map((a) => [a.id, a])), [catalogue]);

  /**
   * The opening slide's default: the last icon this person actually prayed
   * with. Seeded here rather than in useState's initialiser because it needs
   * `byId`, which is declared above this line and not before it.
   *
   * Runs once and only while nothing is chosen, so it can't overwrite a
   * choice made in this visit. A history entry whose work has since been
   * hidden leaves `chosen` null, and the opening slide's own guard sends the
   * person to the chooser instead.
   */
  useEffect(() => {
    if (chosen) return;
    try {
      const last = getIconHistory()[0];
      if (last) setChosen(byId.get(last.id) ?? null);
    } catch { /* no history — the chooser leads */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId]);
  /**
   * The week's icon, restored.
   *
   * `byId` is the pool AFTER the admin tool's deletions and icon-toggles, so
   * an icon deleted mid-week simply isn't found and the week falls back to
   * choosing again — rather than a work the owner removed reappearing every
   * day until Sunday, which is the tombstone bug class this app has had
   * before.
   */
  useEffect(() => {
    if (chosen) return;
    const id = weekIconId();
    if (id == null) return;
    const art = byId.get(id);
    if (art) setChosen(art);
    else setPhase("week");
  }, [byId, chosen]);
  /** The three doors — resolved against the same pool, for the same reason. */
  const weekDoors = useMemo(() => {
    const last = lastWeekIconId();
    const suggestion = suggestedForWeek();
    const lastArt = last != null ? byId.get(last) ?? null : null;
    const sugArt = suggestion ? byId.get(suggestion.id) ?? null : null;
    return {
      last: lastArt,
      // Collapse to two doors when the suggestion IS last week's icon —
      // the same work under two labels reads as a bug, not a choice.
      suggested: sugArt && sugArt.id !== lastArt?.id ? sugArt : null,
      reason: suggestionReason(suggestion),
    };
  }, [byId]);
  /** Choosing sets the week's icon and opens ON it — see Phase's note. */
  const chooseForWeek = (art: IconArtwork) => {
    setChosen(art);
    setLoadedSrc(null);
    setImageFailed(false);
    try { setWeekIcon(art.id); } catch { /* non-fatal */ }
    setPhase("open");
  };
  /** The PHYSICAL icons this person has logged — the "choose from previous
   *  logs" list on the log screen (owner, after the Audio Divina pattern). */
  const [physicalLogs, setPhysicalLogs] = useState(() => getPhysicalIconLogs());
  const [logName, setLogName] = useState("");
  const [loggedName, setLoggedName] = useState("");
  const logPhysical = (name: string) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const ymd = new Date().toLocaleDateString("en-CA");
    try { recordPhysicalIcon(clean, ymd); } catch { /* non-fatal */ }
    setPhysicalLogs((l) => [{ name: clean, ymd }, ...l.filter((v) => v.name.toLowerCase() !== clean.toLowerCase())]);
    setLoggedName(clean);
    setLogName("");
    setPhase("log-done");
  };

  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  /**
   * THE BROWSE — a shuffle of the whole library, spread across its artists.
   *
   * Owner: "make sure the library on the first icon screen is a shuffle of all
   * the icons … make sure its always a variety of the artists."
   *
   * It used to browse the catalogue in FILE ORDER and stop at 24, and the file
   * is grouped as it was harvested — so the first screen was the same two dozen
   * icons every time, most of them from one group, while the other ~100 could
   * only be reached by already knowing what to search for. A library you can
   * only see the front of isn't a library.
   *
   * Two moves, and the second is the one that matters. Shuffling alone doesn't
   * give variety here: 123 icons share just 13 artists, and a straight shuffle
   * of a pool that lopsided still deals the big groups over and over. So the
   * pool is grouped by artist, each group shuffled, the groups themselves
   * shuffled, and then dealt ROUND-ROBIN — one from each artist in turn. The
   * 24 on screen come from as many different hands as there are hands to draw
   * from, in a different order each time the page opens, and every icon in the
   * library is reachable by reopening rather than only by searching.
   *
   * Unattributed works are one group of their own, so they take a turn like
   * anyone else instead of flooding the top (they are the largest group).
   */
  const browse = useMemo(() => {
    const shuffled = <T,>(xs: T[]): T[] => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };
    const byArtist = new Map<string, IconArtwork[]>();
    for (const a of catalogue) {
      const key = norm(a.artist ?? "") || "\u0000unattributed";
      const bucket = byArtist.get(key);
      if (bucket) bucket.push(a);
      else byArtist.set(key, [a]);
    }
    const queues = shuffled([...byArtist.values()]).map(shuffled);
    const out: IconArtwork[] = [];
    for (let round = 0; out.length < catalogue.length; round++) {
      let dealt = false;
      for (const q of queues) {
        const next = q[round];
        if (next) { out.push(next); dealt = true; }
      }
      // Every queue is past its end — nothing left to deal.
      if (!dealt) break;
    }
    return out;
    // Keyed on the catalogue alone: re-shuffling as someone types, or each
    // time their history changes, would move icons out from under a finger.
    // A fresh order per visit is the intent; a fresh order per keystroke isn't.
  }, [catalogue]);

  /**
   * The search. Empty query browses (see above): recent icons first, since
   * those are the ones a person returns to, then the shuffle. A query matches
   * title OR artist, word-by-word, so "rublev trinity" and "trinity" both
   * land on the icon.
   */
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) {
      const recent = history
        .map((h) => byId.get(h.id))
        .filter((a): a is IconArtwork => !!a);
      const rest = browse.filter((a) => !recent.some((r) => r.id === a.id));
      return [...recent, ...rest].slice(0, RESULT_CAP);
    }
    const words = q.split(/\s+/).filter(Boolean);
    return catalogue
      .filter((a) => {
        // The PEOPLE tags are searched too — "teresa" must find an icon whose
        // title is only "St. Teresa of Avila" or whose tag carries the name
        // (the owner's own failed search, against ACT's People facet).
        const hay = norm(`${a.title} ${a.artist ?? ""} ${a.people.join(" ")}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, RESULT_CAP);
  }, [query, history, catalogue, byId, browse]);

  const choose = (a: IconArtwork) => {
    setChosen(a);
    setMinutes(null);
    setLoadedSrc(null);
    setImageFailed(false);
    // Picking from the catalogue IS picking for the week — the search is one
    // of the three doors, not a way round them. Without this, "choose a new
    // one" would sit you with an icon today and offer the doors again
    // tomorrow, which is the opposite of what the week is for.
    try { setWeekIcon(a.id); } catch { /* non-fatal */ }
    setPhase("timer");
  };

  const begin = () => {
    if (!chosen) return;
    setEndsAt(minutes != null ? Date.now() + minutes * 60_000 : null);
    // Prime the remaining time IN THE SAME UPDATE. Left stale (its initial 0,
    // or 0 from a finished earlier sit), the pray phase's first render saw
    // timerDone=true — a one-frame tappable "Complete", and worse, the
    // arrival-haptic effect read that frame's closure and buzzed at BEGIN,
    // marking itself done so the real end arrived in silence.
    setRemainingMs(minutes != null ? minutes * 60_000 : 0);
    setPhase("pray");
  };

  /** The countdown itself — clock-derived, see endsAt above. */
  useEffect(() => {
    if (phase !== "pray" || endsAt == null) return;
    const tick = () => setRemainingMs(Math.max(0, endsAt - Date.now()));
    tick();
    const iv = window.setInterval(tick, 250);
    return () => window.clearInterval(iv);
  }, [phase, endsAt]);

  const timerDone = endsAt == null || remainingMs <= 0;
  /**
   * The release, felt — same medium haptic Visio's hold ends with, and for
   * the same reason: after minutes of looking your eyes are not on the
   * button, so the arrival has to be feelable.
   */
  const buzzed = useRef(false);
  useEffect(() => {
    if (phase !== "pray") { buzzed.current = false; return; }
    // The clock is the truth, not the mirrored state — remainingMs can lag a
    // render behind endsAt (see begin's priming), and a stale 0 here is
    // exactly the frame that buzzed at Begin.
    if (endsAt != null && remainingMs <= 0 && Date.now() >= endsAt && !buzzed.current) {
      buzzed.current = true;
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
    }
  }, [phase, endsAt, remainingMs]);

  const complete = () => {
    if (!chosen) return;
    const ymd = new Date().toLocaleDateString("en-CA");
    try { recordIconPrayed(chosen.id, ymd); } catch { /* non-fatal */ }
    setHistory((h) => [{ id: chosen.id, ymd }, ...h.filter((v) => v.id !== chosen.id)]);
    setPhase("done");
  };

  /** "The most recent three they've done" (owner) — the one just finished
   *  is already at the front of history by the time this renders. */
  const recentCards = useMemo(
    () =>
      history
        .map((h) => byId.get(h.id))
        .filter((a): a is IconArtwork => !!a)
        .slice(0, 3),
    [history],
  );

  const mmss = (ms: number): string => {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  /** Header Back steps phases; ✕ leaves for the Practices menu it came from. */
  const back = () => {
    /**
     * WHERE BACK GOES DEPENDS ON WHETHER THE WEEK IS SETTLED.
     *
     * The doors screen offers last week's icon, a suggestion, and the
     * catalogue — but NOT the icon you are currently sitting with, and every
     * forward path from it calls setWeekIcon, overwriting this week's choice.
     * So sending someone there mid-week, from the sit, showed them a screen
     * with no way back to their own icon and three ways to lose it. (The
     * ternary that stood here returned "week" on both branches — a
     * half-finished edit whose comment described the behaviour it lacked.)
     *
     * Once the week HAS an icon, Back from the sit leaves the practice, the
     * way Back from any settled practice does. Before it does, Back returns
     * to the doors, which is exactly where the choice is still open.
     */
    // Back always returns to the choice — it is open every visit now, so
    // there is no settled week to strand anyone in.
    const leave = () => setLocation("/menu/practices");
    const toStart = () => setPhase("week");
    // Back from the catalogue returns where you came FROM: the intro slide
    // when there was already an icon on it (the "choose another" door), the
    // three suggestions when there wasn't.
    if (phase === "search") { setPhase(chosen ? "open" : "week"); setQuery(""); return; }
    if (phase === "open") { toStart(); return; }
    // Back from the timer returns to the opening slide — one step, not out.
    if (phase === "timer") { setPhase("open"); return; }
    if (phase === "log") { toStart(); return; }
    if (phase === "log-done") { toStart(); return; }
    if (phase === "pray") { setPhase("timer"); return; }
    if (phase === "done") { setPhase("week"); setQuery(""); return; }
    leave();
  };
  const close = () => setLocation("/menu/practices");

  const frosted: React.CSSProperties = {
    background: "rgba(240,237,230,0.06)",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${BORDER}`,
  };

  /**
   * The tutorial, in FRONT of the practice on a first visit — the same shape
   * Visio uses. Rendered before the screen rather than over it, so nothing
   * behind it is running while it is being read.
   */
  if (showHowto) {
    return (
      <IconHowToIntro
        photos={LEAF_PHOTOS}
        onDone={() => { markIconHowtoSeen(); setShowHowto(false); }}
      />
    );
  }


  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* The shared backdrop treatment — identical to visio/guided-prayer/
          examen: one still landscape at 0.22 under the dark wash, absolute
          (never position:fixed — the iOS flash rule). */}
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto} alt="" aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 0.22 }} transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      {/* Header — Back / title / close, the office's reader chrome. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
        <button
          type="button" onClick={back}
          style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {t("icons.title", { defaultValue: "Praying with Icons" })}
        </span>
        <button
          type="button" onClick={close} aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 20px calc(env(safe-area-inset-bottom) + 20px)" }}>
        {/* Keyed fade-in on phase, not AnimatePresence mode="wait" — the same
            backgrounded-rAF freeze Visio's deck documents. */}
        <motion.div
          key={phase}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          {/* THE THREE DOORS — the one you sat with last, one suggested from
              Sunday's readings, and the whole catalogue. Shown EVERY time the
              practice opens: the owner asked that the icon not be set for the
              week ("lets not set it for the week"), so this is a choice, not
              a one-off commitment you then live with until Sunday. */}
          {phase === "week" && (
            <>
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 20, fontWeight: 600, textAlign: "center", margin: "10px 0 0", lineHeight: 1.4 }}>
                {t("icons.week_heading", { defaultValue: "Choose an icon to sit with" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.week_sub", { defaultValue: "Stay with one for a while, or begin somewhere new." })}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                {weekDoors.last && (
                  <WeekDoor
                    art={weekDoors.last}
                    label={t("icons.week_continue", { defaultValue: "The one you sat with last" })}
                    note={null}
                    onClick={() => chooseForWeek(weekDoors.last!)}
                  />
                )}
                {weekDoors.suggested && (
                  <WeekDoor
                    art={weekDoors.suggested}
                    label={t("icons.week_suggested", { defaultValue: "Suggested" })}
                    /* Only when the reason is real — see suggestionReason. A
                       same-book match is not a reason worth stating. */
                    note={weekDoors.reason}
                    onClick={() => chooseForWeek(weekDoors.suggested!)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setPhase("search")}
                  style={{
                    userSelect: "none", WebkitTapHighlightColor: "transparent",
                    borderRadius: 16, padding: "16px 18px", fontSize: 15, fontWeight: 600,
                    color: WARM, fontFamily: FONT, textAlign: "left", ...frosted,
                  }}
                >
                  {t("icons.week_new", { defaultValue: "Choose a new one →" })}
                </button>
                <button
                  type="button"
                  onClick={() => setShowHowto(true)}
                  style={{
                    userSelect: "none", WebkitTapHighlightColor: "transparent", background: "transparent",
                    border: "none", color: SAGE, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                    padding: "6px 8px", marginTop: 2,
                  }}
                >
                  {t("icons.tutorial_pill", { defaultValue: "How this works" })}
                </button>
              </div>
            </>
          )}

          {phase === "search" && (
            <>
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 20, fontWeight: 600, textAlign: "center", margin: "10px 0 0", lineHeight: 1.4 }}>
                {t("icons.search_heading", { defaultValue: "Choose an icon to pray with" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.search_sub", { defaultValue: "Search the catalogue by name or artist, or browse below." })}
              </p>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Every suggested example actually LANDS in the catalogue —
                // "Good Shepherd" was here first and found nothing.
                placeholder={t("icons.search_placeholder", { defaultValue: "Search — “Teresa”, “Trinity”, “Pantocrator”…" })}
                inputMode="search"
                aria-label={t("icons.search_heading", { defaultValue: "Choose an icon to pray with" })}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 16, padding: "13px 16px",
                  borderRadius: 14, outline: "none", color: WARM, fontFamily: FONT, ...frosted,
                }}
              />
              {/* The pill under the search (owner): the door for an icon that
                  lives in THEIR space, not the catalogue — prayed away from
                  the app and logged here, the way Audio Divina logs music.
                  Hidden the moment a search is typed (owner: "when they
                  search, it'll just hide this") — searching means they're
                  here for the catalogue. */}
              {query.trim() === "" && (
                <button
                  type="button"
                  onClick={() => setPhase("log")}
                  style={{
                    userSelect: "none", WebkitTapHighlightColor: "transparent",
                    borderRadius: 999, padding: "11px 20px", fontSize: 13.5, fontWeight: 600,
                    fontFamily: FONT, cursor: "pointer", color: WARM,
                    background: "rgba(46,107,64,0.28)", border: "1px solid rgba(143,175,150,0.4)",
                  }}
                >
                  {t("icons.log_pill", { defaultValue: "🕯️ Log your own icon" })}
                </button>
              )}
              <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {results.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => choose(a)}
                    style={{
                      userSelect: "none", WebkitTapHighlightColor: "transparent",
                      display: "flex", flexDirection: "column", gap: 8, padding: 10,
                      // minWidth 0: a grid item's default min-width is its
                      // content, and one nowrap artist line ("Lorenzetti,
                      // Ambrogio, 1285–approximately 1348") pushed the whole
                      // grid off the right edge of the screen.
                      minWidth: 0, overflow: "hidden",
                      borderRadius: 14, cursor: "pointer", textAlign: "left", ...frosted,
                    }}
                  >
                    <img
                      src={a.img} alt="" loading="lazy" decoding="async"
                      style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 9, boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: WARM, fontFamily: SERIF, fontSize: 13.5, fontStyle: "italic", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {a.title}
                      </span>
                      {a.artist && (
                        <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {tidyArtist(a.artist)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {results.length === 0 && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: "12px 0 0" }}>
                  {t("icons.search_none", { defaultValue: "Nothing by that name — try one word, or an artist." })}
                </p>
              )}
              {/* Only when a search is actually running — browsing always
                  fills the cap, and "keep typing" under an empty field asked
                  for typing nobody had started. */}
              {results.length === RESULT_CAP && query.trim() !== "" && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, textAlign: "center", margin: 0 }}>
                  {t("icons.search_more", { defaultValue: "Keep typing to narrow the search." })}
                </p>
              )}
            </>
          )}

          {/**
            * THE OPENING SLIDE — the icon, named, before anything is asked.
            *
            * Deliberately quiet: the work, its title, who wrote it, and the
            * one line that says what this week is for. No controls except
            * the way on. The duration question keeps its own screen, where
            * it belongs — after you have actually looked at the thing.
            */}
          {phase === "open" && chosen && (
            <>
              <img
                src={chosen.img} alt="" decoding="async"
                style={{ width: 208, height: 208, objectFit: "cover", borderRadius: 14, marginTop: 8, boxShadow: "0 22px 60px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.45)" }}
              />
              <div style={{ textAlign: "center", maxWidth: 420 }}>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 22, fontStyle: "italic", margin: 0, lineHeight: 1.3 }}>{chosen.title}</p>
                {chosen.artist && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, margin: "8px 0 0" }}>{tidyArtist(chosen.artist)}</p>
                )}
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14.5, margin: "18px 0 0", lineHeight: 1.6 }}>
                  {t("icons.open_body", { defaultValue: "Stay here a moment before you begin. You can come back to this one as often as you like — what you notice the third time will not be what you noticed the first." })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase("timer")}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 10, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("icons.open_sit", { defaultValue: "Sit with it" })}
              </button>
              {/**
                * THE LAST OPTION ON THE SLIDE, and it opens the CATALOGUE.
                *
                * Owner: "the choose another should be under it… as the last
                * option on the intro slide", and "it would go to that search
                * we made before with the assortment of icons."
                *
                * So it goes to "search", not "week". The doors screen offers
                * three suggestions; this is the person saying they want to
                * look, and the browse view is what they mean — the search
                * field with the full assortment under it.
                */}
              <button
                type="button"
                onClick={() => { setQuery(""); setPhase("search"); }}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent",
                  background: "transparent", border: "none", color: "rgba(200,212,192,0.72)",
                  fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  padding: "12px 8px 0",
                }}
              >
                {t("icons.open_choose_other", { defaultValue: "Choose another icon" })}
              </button>
            </>
          )}

          {phase === "timer" && chosen && (
            <>
              <img
                src={chosen.img} alt="" decoding="async"
                style={{ width: 148, height: 148, objectFit: "cover", borderRadius: 12, marginTop: 8, boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.4)" }}
              />
              <div style={{ textAlign: "center" }}>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0, lineHeight: 1.35 }}>{chosen.title}</p>
                {chosen.artist && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>{tidyArtist(chosen.artist)}</p>
                )}

              </div>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, textAlign: "center", margin: "8px 0 0", lineHeight: 1.55 }}>
                {t("icons.timer_ask", { defaultValue: "How long will you sit with it?" })}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {[null, 1, 2, 3, 4, 5].map((m) => {
                  const selected = minutes === m;
                  return (
                    <button
                      key={m ?? "none"}
                      type="button"
                      onClick={() => setMinutes(m)}
                      aria-pressed={selected}
                      style={{
                        userSelect: "none", WebkitTapHighlightColor: "transparent",
                        borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 600,
                        fontFamily: FONT, cursor: "pointer",
                        background: selected ? "rgba(46,107,64,0.6)" : "rgba(240,237,230,0.06)",
                        border: selected ? "1px solid rgba(143,175,150,0.65)" : `1px solid ${BORDER}`,
                        color: WARM,
                      }}
                    >
                      {m == null
                        ? t("icons.timer_none", { defaultValue: "No timer" })
                        : t("icons.timer_min", { defaultValue: "{{n}} min", n: m })}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={begin}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 8, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("common.begin", { defaultValue: "Begin" })}
              </button>
            </>
          )}

          {phase === "pray" && chosen && (
            <>
              {/* The picture, exactly as Visio lifts it: drop shadow off the
                  wash, fade-in keyed by the loaded src (a cached image never
                  fires onLoad — the ref covers it). An unreachable image says
                  so rather than holding an empty sit. */}
              {!imageFailed ? (
                <img
                  src={chosen.img}
                  alt={`${chosen.title}${chosen.artist ? ` — ${chosen.artist}` : ""}`}
                  decoding="async"
                  // The src WE ASKED FOR, not the browser's resolved
                  // `currentSrc` — that comes back percent-encoded, so a
                  // filename with a space or an apostrophe never matched the
                  // gate below and the icon sat at opacity 0 forever. Same bug
                  // Visio had; these two lift the picture the same way, so they
                  // had it identically.
                  ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedSrc(chosen.img); }}
                  onLoad={() => setLoadedSrc(chosen.img)}
                  onError={() => setImageFailed(true)}
                  style={{
                    maxWidth: "100%", maxHeight: "56vh", objectFit: "contain", borderRadius: 10, marginTop: 6,
                    boxShadow: "0 26px 74px rgba(0,0,0,0.66), 0 4px 14px rgba(0,0,0,0.45)",
                    opacity: loadedSrc === chosen.img ? 1 : 0, transition: "opacity 420ms ease-out",
                  }}
                />
              ) : (
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, textAlign: "center", margin: "24px 0", lineHeight: 1.6 }}>
                  {t("icons.image_failed", { defaultValue: "The image couldn't load right now — you can still keep the sit, or go back and choose another." })}
                </p>
              )}
              <div style={{ textAlign: "center" }}>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 17, fontStyle: "italic", margin: 0 }}>{chosen.title}</p>
                {chosen.artist && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "5px 0 0" }}>{tidyArtist(chosen.artist)}</p>
                )}
                {/* Who the icon depicts, in ACT's own words — beside the
                    picture on the sit, not on the chooser (owner). */}
                {chosen.people.length > 0 && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
                    {chosen.people.join(" · ")}
                  </p>
                )}
              </div>

              {/* THE COUNTDOWN, under the picture (owner). Tabular digits so
                  the clock doesn't shiver as it counts. */}
              {endsAt != null && (
                <p
                  aria-live="off"
                  style={{
                    color: timerDone ? SAGE : WARM, fontFamily: FONT, fontVariantNumeric: "tabular-nums",
                    fontSize: 30, fontWeight: 600, letterSpacing: "0.04em", margin: "2px 0 0",
                  }}
                >
                  {timerDone ? t("icons.timer_up", { defaultValue: "Amen" }) : mmss(remainingMs)}
                </p>
              )}

              {/**
                * ALWAYS TAPPABLE — the timer is an invitation, not a lock.
                *
                * Owner: "just like contemplation, let them advance on the icon
                * even if they hadn't fully finished the time." This used to
                * ignore the tap until the clock ran out and sat at 0.55 opacity
                * saying "Sit with the icon", which reads as a broken button to
                * anyone who is simply done praying. A sit you cannot leave is
                * not stillness, it's a countdown holding you.
                *
                * Contemplation's End pill is the pattern: live the whole way
                * through, worded for where you are — "End" before the bell,
                * "Complete" after it. The prayer is recorded either way; this
                * practice logs THAT the icon was prayed with, not for how long,
                * so an early end costs nothing.
                */}
              <button
                type="button"
                onClick={complete}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 4, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                  // Still quieter before the bell, so the clock stays the focus
                  // while it runs — quieter, not unavailable.
                  opacity: timerDone ? 1 : 0.72, transition: "opacity 420ms ease-out",
                }}
              >
                {timerDone
                  ? t("common.complete", { defaultValue: "Complete" })
                  : t("icons.end", { defaultValue: "End" })}
              </button>
            </>
          )}

          {phase === "done" && (
            <>
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "14px 0 2px", textAlign: "center" }}>
                {t("icons.done_eyebrow", { defaultValue: "Icon prayer complete" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.done_sub", { defaultValue: "The icons you've been praying with lately." })}
              </p>
              {/* The most recent three (owner) — the one just finished leads.
                  Tappable back into the timer step, because an icon you return
                  to is the point of keeping them. */}
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                {recentCards.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => choose(a)}
                    style={{
                      userSelect: "none", WebkitTapHighlightColor: "transparent",
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: 10, borderRadius: 14, cursor: "pointer", textAlign: "left", ...frosted,
                    }}
                  >
                    <img
                      src={a.img} alt="" loading="lazy" decoding="async"
                      style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15.5, fontStyle: "italic", lineHeight: 1.3 }}>{a.title}</span>
                      <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                        {[tidyArtist(a.artist ?? ""), tidyDate(a.date ?? "")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {/* The attribution ACT asks for — and the CC-licensed works
                  REQUIRE — for the work just prayed with, exactly where the
                  Visio deck carries its own. */}
              {chosen && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "4px 0 0", textAlign: "center" }}>
                  {chosen.attribution}
                  {chosen.where ? ` ${chosen.where}.` : ""}
                  {chosen.licence ? ` ${chosen.licence}.` : ""}
                </p>
              )}
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 6, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("common.done", { defaultValue: "Done" })}
              </button>
            </>
          )}

          {/* LOG YOUR OWN — a physical icon in their space, prayed away from
              the app (owner). Plain text in, save; the last three logs sit
              underneath to re-log with a tap. */}
          {phase === "log" && (
            <>
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 20, fontWeight: 600, textAlign: "center", margin: "10px 0 0", lineHeight: 1.4 }}>
                {t("icons.log_heading", { defaultValue: "Who is your icon of?" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.log_sub", { defaultValue: "For an icon you prayed with in your own space." })}
              </p>
              <input
                value={logName}
                onChange={(e) => setLogName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") logPhysical(logName); }}
                placeholder={t("icons.log_placeholder", { defaultValue: "St. Teresa of Avila, Christ Pantocrator…" })}
                maxLength={80}
                autoFocus
                aria-label={t("icons.log_heading", { defaultValue: "Who is your icon of?" })}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 16, padding: "13px 16px",
                  borderRadius: 14, outline: "none", color: WARM, fontFamily: FONT, ...frosted,
                }}
              />
              <button
                type="button"
                onClick={() => logPhysical(logName)}
                aria-disabled={logName.trim() === ""}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: logName.trim() === "" ? "default" : "pointer",
                  opacity: logName.trim() === "" ? 0.55 : 1, transition: "opacity 300ms ease-out",
                }}
              >
                {t("icons.log_cta", { defaultValue: "Log it" })}
              </button>
              {physicalLogs.length > 0 && (
                <>
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "10px 0 0", textAlign: "center" }}>
                    {t("icons.log_prev", { defaultValue: "Your icons" })}
                  </p>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                    {physicalLogs.slice(0, 3).map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => logPhysical(v.name)}
                        style={{
                          userSelect: "none", WebkitTapHighlightColor: "transparent",
                          display: "flex", alignItems: "center", gap: 10, width: "100%",
                          padding: "12px 14px", borderRadius: 14, cursor: "pointer", textAlign: "left", ...frosted,
                        }}
                      >
                        <span aria-hidden style={{ fontSize: 18, flexShrink: 0 }}>🕯️</span>
                        <span style={{ color: WARM, fontFamily: SERIF, fontSize: 15, fontStyle: "italic", flex: 1, minWidth: 0 }}>{v.name}</span>
                        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, flexShrink: 0 }}>{v.ymd}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {phase === "log-done" && (
            <>
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "14px 0 2px", textAlign: "center" }}>
                {t("icons.log_done_eyebrow", { defaultValue: "Icon prayer logged" })}
              </p>
              <span aria-hidden style={{ fontSize: 40 }}>🕯️</span>
              <p style={{ color: WARM, fontFamily: SERIF, fontSize: 21, fontStyle: "italic", textAlign: "center", margin: 0, lineHeight: 1.35 }}>
                {loggedName}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.log_done_sub", { defaultValue: "Kept ✓ — prayed in your own space." })}
              </p>
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 10, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("common.done", { defaultValue: "Done" })}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
