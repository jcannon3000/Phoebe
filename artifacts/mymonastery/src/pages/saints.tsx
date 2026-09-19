import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import { allCommemorations, searchCommemorations, type Commemoration } from "@/lib/commemorations";
import { getSaintsRead, markSaintRead } from "@/lib/saintsRead";
import { pictureFor } from "@/lib/commemorationPictures";

// ── Meditating on the lives of the saints ───────────────────────────────────
//
// Owner, 2026-09-18: "what if you created a new contemplative practice, which
// was meditating on the life of the saints … there's first the either today's
// or an upcoming one suggested, or they can search through all of them. They
// click on it … there's a prompt first before it, it's kind of like Lectio
// Divina a little … 'As you read the life of this person, consider what
// touches your heart', then show it in the reader view, then a final page that
// says take a moment to bring to prayer anything God might have put on your
// heart through the reading of the saint, then have a closing slide that shows
// them all the saints they've read recently."
//
// Four beats, and the middle one is not ours: PROMPT → the life, opened in the
// in-app reader on Forward Movement's own page → PRAYER → the ones you have
// read lately. The reader is where the words are, and they stay there under
// their publisher's permission (lib/commemorations says why nothing is copied
// and nothing was scraped).
//
// The deck advances WHEN THE READER IS OPENED, not when it closes: an external
// reader gives us no reliable "finished" signal, and a practice that waits for
// one would strand someone on the prompt. So they come back to the prayer
// beat, which is exactly where they should be.
//
// IT CREDITS NOTHING, yet. This is a practice you can open and keep, but it is
// not wired into the rhythm — no card, no side, no contemplation minutes —
// because that plumbing (onKeys, home-layout, the customizer) is a separate
// decision the owner hasn't made. Reading a life here therefore doesn't mark
// the day's hagiography either; see the note in pages/commemorations' place
// in lib/commemorations.

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Beat = "pick" | "prompt" | "picture" | "prayer" | "recent";

/** Today's commemoration, or the next one coming — never nothing to open. */
function suggested(all: Commemoration[]): { c: Commemoration; today: boolean } | null {
  if (!all.length) return null;
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const exact = all.find((c) => c.month === m && c.day === d);
  if (exact) return { c: exact, today: true };
  const ahead = all.find((c) => c.month > m || (c.month === m && c.day > d));
  // Past December, the year turns over to January's first.
  return { c: ahead ?? all[0]!, today: false };
}

export default function SaintsPage() {
  const [, setLocation] = useLocation();
  const [beat, setBeat] = useState<Beat>("pick");
  const [chosen, setChosen] = useState<Commemoration | null>(null);
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const all = useMemo(() => allCommemorations(), []);
  const pick = useMemo(() => suggested(all), [all]);

  /**
   * ?d=<month>-<day> opens straight at the prompt for that saint — what the
   * home ticker's pills link to (owner: "if they click a pill, it would take
   * them to the first prompt, then show the bio, then the last prompt, then
   * the closing").
   *
   * Keyed on useSearch, not [], because a Link that changes only the query
   * does NOT remount this page: tapping a second pill from the closing beat
   * has to re-enter the deck rather than sit there (reference_query_only_navigation).
   */
  const search = useSearch();
  useEffect(() => {
    let d: string | null = null;
    try { d = new URLSearchParams(search).get("d"); } catch { return; }
    if (!d) return;
    const found = all.find((c) => `${c.month}-${c.day}` === d);
    if (!found) return;
    setChosen(found);
    setBrowsing(false);
    setBeat("prompt");
  }, [search, all]);
  const results = useMemo(() => searchCommemorations(query), [query]);
  // Read once per entry into the closing beat, so the list doesn't shuffle
  // under the reader as they look at it.
  const recent = useMemo(() => getSaintsRead(), [beat === "recent"]);

  const byMonth = useMemo(() => {
    const groups: Array<{ month: number; rows: Commemoration[] }> = [];
    for (const c of results) {
      const last = groups[groups.length - 1];
      if (last && last.month === c.month) last.rows.push(c);
      else groups.push({ month: c.month, rows: [c] });
    }
    return groups;
  }, [results]);

  const choose = (c: Commemoration) => { setChosen(c); setBeat("prompt"); };

  const readIt = () => {
    if (!chosen) return;
    markSaintRead({ id: `${chosen.month}-${chosen.day}`, name: chosen.name, when: chosen.when });
    void openExternal(chosen.url, { reader: true });
    // A face for the life, where there is one (owner: "if you find a picture
    // for that person, put it on a slide after the heigriohpy"). Only 216 of
    // the 277 have a picture we can show freely, so the beat is skipped
    // entirely rather than showing an empty frame.
    setBeat(pictureFor(chosen.month, chosen.day) ? "picture" : "prayer");
  };

  // Entrances fade IN PLACE — nothing rises (reference_page_rise_end_snap).
  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.28 },
  };

  const shell = (children: React.ReactNode, onBack?: () => void, eyebrow?: string) => (
    <div style={{ position: "relative", minHeight: "var(--app-dvh)", background: BG, isolation: "isolate" }}>
      <AnimatedBackground base={BG} variant="subtle" />
      <div
        style={{
          position: "relative", maxWidth: 620, margin: "0 auto",
          display: "flex", flexDirection: "column", minHeight: "var(--app-dvh)",
          padding: "calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 24px)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <button
            type="button"
            onClick={onBack ?? (() => setLocation("/menu/practices"))}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}
          >
            ←
          </button>
          <span style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {eyebrow ?? "The Saints"}
          </span>
          <span style={{ width: 24 }} />
        </div>
        {children}
      </div>
    </div>
  );

  // ── Beat: the one to sit with ─────────────────────────────────────────────
  if (beat === "pick") {
    if (browsing) {
      return shell(
        <motion.div {...fade} style={{ flex: "1 0 auto" }}>
          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 21, fontWeight: 600, margin: "0 0 12px" }}>
            All commemorations
          </h1>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or date…"
            inputMode="search"
            aria-label="Search commemorations"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 16, padding: "12px 14px",
              borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
              background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
            }}
          />
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "10px 0" }}>
            {query.trim() ? `${results.length} of ${all.length}` : `${all.length} commemorations`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {byMonth.map((g) => (
              <div key={g.month}>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 8px 2px" }}>
                  {MONTHS[g.month - 1]}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.rows.map((c) => (
                    <button
                      key={`${c.month}-${c.day}`}
                      type="button"
                      onClick={() => choose(c)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "11px 12px", borderRadius: 12, boxSizing: "border-box",
                        textAlign: "left", cursor: "pointer",
                        background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
                      }}
                    >
                      <span style={{ flex: "0 0 auto", minWidth: 26, textAlign: "right", color: SAGE, fontFamily: FONT, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {c.day}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 15, lineHeight: 1.3 }}>{c.name}</span>
                        {(c.life || c.major) && (
                          <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                            {c.major ? "Holy Day" : c.life}
                          </span>
                        )}
                      </span>
                      <span aria-hidden style={{ color: "rgba(143,175,150,0.6)", fontSize: 16, lineHeight: 1 }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              No one by that name or date.
            </p>
          )}
        </motion.div>,
        () => { setBrowsing(false); setQuery(""); },
        "All commemorations",
      );
    }

    return shell(
      <motion.div {...fade} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column" }}>
        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 23, fontWeight: 600, margin: "0 0 6px" }}>
          Hagiographies
        </h1>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 22px" }}>
          Sit with someone who has gone before you — read their life slowly, and let
          it ask something of yours.
        </p>

        {pick && (
          <>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 9px 2px" }}>
              {pick.today ? "Today" : "Coming up"}
            </p>
            <button
              type="button"
              onClick={() => choose(pick.c)}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                padding: "16px 16px", borderRadius: 16, boxSizing: "border-box",
                background: "rgba(46,107,64,0.28)", border: "1px solid rgba(143,175,150,0.55)",
              }}
            >
              <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>
                {pick.c.name}
              </span>
              <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 12.5, marginTop: 5 }}>
                {pick.c.when}{pick.c.life ? ` · ${pick.c.life}` : ""}
              </span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setBrowsing(true)}
          style={{
            width: "100%", borderRadius: 999, padding: "13px 10px", cursor: "pointer", marginTop: 12,
            background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)",
            color: "#A8C5A0", fontFamily: FONT, fontSize: 14, fontWeight: 600,
          }}
        >
          Search all {all.length}
        </button>

        {recent.length > 0 && (
          <button
            type="button"
            onClick={() => setBeat("recent")}
            style={{
              width: "100%", borderRadius: 999, padding: "13px 10px", cursor: "pointer", marginTop: 10,
              background: "none", border: "1px solid rgba(46,107,64,0.4)",
              color: FAINT, fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
            }}
          >
            The ones you've read
          </button>
        )}
      </motion.div>,
    );
  }

  // ── Beat: the prompt, before the life ─────────────────────────────────────
  if (beat === "prompt" && chosen) {
    return shell(
      <motion.div {...fade} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", paddingBottom: 40 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 14px" }}>
          {chosen.when}
        </p>
        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 24, fontWeight: 600, lineHeight: 1.3, margin: "0 0 26px", textWrap: "balance" }}>
          {chosen.name}
        </h1>
        <p style={{ color: "rgba(240,237,230,0.82)", fontFamily: FONT, fontSize: 16, lineHeight: 1.65, margin: "0 auto 34px", maxWidth: 380 }}>
          As you read the life of this person, consider what touches your heart.
        </p>
        <button
          type="button"
          onClick={readIt}
          style={{
            width: "100%", maxWidth: 380, margin: "0 auto", borderRadius: 999, padding: "14px 10px", cursor: "pointer",
            background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
            color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600,
          }}
        >
          Read the life
        </button>
      </motion.div>,
      () => setBeat("pick"),
      "Before you read",
    );
  }

  // ── Beat: a face for the life ─────────────────────────────────────────────
  if (beat === "picture" && chosen) {
    const pic = pictureFor(chosen.month, chosen.day);
    if (!pic) { setBeat("prayer"); return null; }
    return shell(
      <motion.div {...fade} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 30 }}>
        <div
          style={{
            width: "100%", maxWidth: 420, margin: "0 auto 18px", borderRadius: 16,
            overflow: "hidden", background: "rgba(9,26,16,0.55)", border: `1px solid ${BORDER}`,
          }}
        >
          <img
            src={pic.img}
            alt={chosen.name}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 600, textAlign: "center", lineHeight: 1.35, margin: "0 auto 6px", maxWidth: 400 }}>
          {chosen.name}
        </p>
        {/* THE CREDIT TRAVELS WITH THE PICTURE. Commons licences ask for
            attribution, and the file's own page is where the full terms live. */}
        <button
          type="button"
          onClick={() => { void openExternal(pic.page, { reader: false }); }}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            color: "rgba(143,175,150,0.5)", fontFamily: FONT, fontSize: 11,
            lineHeight: 1.5, textAlign: "center", margin: "0 auto 26px", maxWidth: 400,
          }}
        >
          {pic.artist ? `${pic.artist} · ` : ""}{pic.licence} · Wikimedia Commons
        </button>
        <button
          type="button"
          onClick={() => setBeat("prayer")}
          style={{
            width: "100%", maxWidth: 380, margin: "0 auto", borderRadius: 999, padding: "14px 10px", cursor: "pointer",
            background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
            color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600,
          }}
        >
          Continue
        </button>
      </motion.div>,
      () => setBeat("prompt"),
      chosen.when,
    );
  }

  // ── Beat: what it put on your heart ───────────────────────────────────────
  if (beat === "prayer" && chosen) {
    return shell(
      <motion.div {...fade} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", paddingBottom: 40 }}>
        <p style={{ color: "rgba(240,237,230,0.88)", fontFamily: FONT, fontSize: 17, lineHeight: 1.65, margin: "0 auto 14px", maxWidth: 400 }}>
          Take a moment to bring to prayer anything God may have put on your heart
          through the reading of this life.
        </p>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "0 auto 34px" }}>
          {chosen.name}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 380, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => setBeat("recent")}
            style={{
              borderRadius: 999, padding: "14px 10px", cursor: "pointer",
              background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
              color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600,
            }}
          >
            Amen
          </button>
          {/* The reader can be closed by accident, or the life re-read. */}
          <button
            type="button"
            onClick={() => { void openExternal(chosen.url, { reader: true }); }}
            style={{
              borderRadius: 999, padding: "12px 10px", cursor: "pointer",
              background: "none", border: "1px solid rgba(46,107,64,0.4)",
              color: FAINT, fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
            }}
          >
            Open the life again
          </button>
        </div>
      </motion.div>,
      () => setBeat("prompt"),
      "In prayer",
    );
  }

  // ── Beat: the company you have been keeping ───────────────────────────────
  return shell(
    <motion.div {...fade} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column" }}>
      <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>
        The ones you've read
      </h1>
      <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: "0 0 18px" }}>
        The company you've been keeping lately.
      </p>

      {recent.length === 0 ? (
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
          None yet — the first one you read will appear here.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.map((r) => {
            const c = all.find((x) => `${x.month}-${x.day}` === r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => { if (c) choose(c); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "11px 12px", borderRadius: 12, boxSizing: "border-box",
                  textAlign: "left", cursor: c ? "pointer" : "default",
                  background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
                }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 15, lineHeight: 1.3 }}>{r.name}</span>
                  <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>{r.when}</span>
                </span>
                {c && <span aria-hidden style={{ color: "rgba(143,175,150,0.6)", fontSize: 16, lineHeight: 1 }}>›</span>}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={() => { setChosen(null); setBeat("pick"); }}
          style={{
            borderRadius: 999, padding: "13px 10px", cursor: "pointer",
            background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)",
            color: "#A8C5A0", fontFamily: FONT, fontSize: 14, fontWeight: 600,
          }}
        >
          Read another
        </button>
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{
            borderRadius: 999, padding: "13px 10px", cursor: "pointer",
            background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
            color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600,
          }}
        >
          Finish
        </button>
      </div>

      <p style={{ color: "rgba(143,175,150,0.4)", fontFamily: FONT, fontSize: 11, lineHeight: 1.5, margin: "22px 0 0", textAlign: "center" }}>
        Lives published by Forward Movement, from Lesser Feasts and Fasts.
      </p>
    </motion.div>,
    () => setBeat("pick"),
    "Recently",
  );
}
