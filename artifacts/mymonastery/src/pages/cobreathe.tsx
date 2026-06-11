import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { writeMindfulSession } from "@/lib/appleHealth";
import { CobreatheBreath } from "@/components/CobreatheBreath";

// Cobreathe (beta) — from "conspire", con + spirare, to breathe together.
// A short daily guided breath held as embodied prayer for justice: not
// synchronized in time, but everyone who keeps the practice on a given day
// shares one count, and the closing screen tells you how many people you
// breathed with — including the faces of people in your garden. Drawn from
// Laurel Kearns, "Con-spiring Together: Breathing for Justice" — ruach as
// the one breath animating all creation, reciprocal respiration with the
// green world, and "I can't breathe" as the cry that binds Earth justice to
// social justice.
//
// A finished cobreath is also logged as a contemplation prayer_session (and
// mirrored to Apple Health), so the two minutes count toward the daily
// contemplation goal like any other silence.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// The week's intention — who this week's breath is held for. Rotates by
// week-of-year so the whole community holds the same focus at the same time.
const WEEKLY_FOCI: Array<{ emoji: string; key: string; title: string; line: string }> = [
  { emoji: "🏭", key: "clean_air", title: "Clean air", line: "for those who live beside the highways, refineries, and incinerators — whose neighborhoods were made into sacrifice zones." },
  { emoji: "✊🏾", key: "breath_taken", title: "Those whose breath is taken", line: "for every person whose 'I can't breathe' went unheard, and for an end to the violence that silences breath." },
  { emoji: "🌳", key: "green_world", title: "The green world", line: "for the forests and the phytoplankton — every second breath you take is their gift." },
  { emoji: "🌊", key: "climate", title: "A heating planet", line: "for those losing homes, harvests, and homelands to a changing climate — and for the courage to act." },
  { emoji: "🫁", key: "the_sick", title: "The sick", line: "for those breathing with asthma, COPD, or a ventilator's help — and for the air that made many of them sick." },
  { emoji: "👷🏽", key: "workers", title: "Those who breathe for us", line: "for the workers who breathe dust, fumes, and fields so the rest of us can eat and build and live." },
  { emoji: "🕊️", key: "displaced", title: "The displaced", line: "for refugees and migrants breathing unfamiliar air, far from home, and for the welcome they deserve." },
  { emoji: "🌍", key: "creation", title: "The whole creation", line: "groaning as in labor — and the ruach that has hovered over the waters since the beginning." },
];

// Local calendar day, YYYY-MM-DD (en-CA locale formats exactly that way).
function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Week-of-year for rotating the weekly focus. Everyone on the same calendar
// week holds the same intention.
function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
}

type Companion = { userId: number; name: string | null; avatarUrl: string | null };
type BreathState = {
  done: boolean;
  count: number;
  companions: Companion[];
  companionCount: number;
  myDays: number;
  allBreaths: number;
};

// Two-letter fallback for a companion with no avatar.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

// First names, prose-joined: "Maria", "Maria and James", "Maria, James, and 3 others".
function companionLine(companions: Companion[], totalCount: number): string {
  const names = companions.map((c) => (c.name ?? "").trim().split(/\s+/)[0]).filter(Boolean).slice(0, 2);
  if (names.length === 0) return "";
  const extra = totalCount - names.length;
  if (extra <= 0) return names.join(" and ");
  return `${names.join(", ")}, and ${extra} other${extra === 1 ? "" : "s"}`;
}

// Overlapping face row for garden members who cobreathed today.
function Faces({ companions }: { companions: Companion[] }) {
  if (companions.length === 0) return null;
  return (
    <div className="flex items-center">
      {companions.slice(0, 6).map((c, i) => (
        <div
          key={c.userId}
          className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{
            marginLeft: i === 0 ? 0 : -8,
            border: "1.5px solid #0F2818",
            background: "rgba(62,124,122,0.45)",
            zIndex: 10 - i,
          }}
        >
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
          ) : (
            <span style={{ color: WARM, fontSize: 10, fontWeight: 700, fontFamily: SPACE_GROTESK }}>
              {initials(c.name ?? "")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CobreathePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const day = localDay();
  const focus = WEEKLY_FOCI[weekOfYear(new Date()) % WEEKLY_FOCI.length];

  const [mode, setMode] = useState<"intro" | "breathing" | "done">("intro");
  // State returned by the POST — fresher than the GET cache on the done screen.
  const [doneState, setDoneState] = useState<BreathState | null>(null);
  // "From the essay" quote card — collapsed to its first lines by default.
  const [quoteOpen, setQuoteOpen] = useState(false);

  const { data: today } = useQuery<BreathState>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
  });

  const record = useMutation({
    mutationFn: (seconds: number) =>
      apiRequest<BreathState & { ok: boolean }>("POST", "/api/breath/today", { day, seconds }),
    onSuccess: (resp) => {
      setDoneState(resp);
      queryClient.invalidateQueries({ queryKey: ["/api/breath/today", day] });
    },
  });

  // Reaching the 12th breath records the day's breath right away — so the
  // count climbs and companions appear while they keep breathing. The breath
  // itself keeps going; nothing stops here.
  const handleReachTarget = useCallback((secondsKept: number) => {
    record.mutate(secondsKept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finishing (or backing out). Bailed before the target → straight back to
  // the intro, nothing logged. Finished → record (idempotent) and log the
  // time as a contemplation sit (daily goal, history, companions + Health).
  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    if (!reached) { setMode("intro"); return; }
    setMode("done");
    record.mutate(secondsKept);
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
    if (secondsKept >= 5) {
      void apiRequest("POST", "/api/prayer-sessions", {
        surface: "contemplation",
        durationSeconds: secondsKept,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        isPrivate: false,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
        })
        .catch(() => { /* best-effort */ });
      void writeMindfulSession(startedAt, endedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefer the POST's snapshot once it lands; fall back to the GET while in
  // flight. The count includes me once recorded.
  const state = doneState ?? today ?? null;
  // "N other people" — subtract the caller once they're in the count.
  const others = Math.max(0, (state?.count ?? 0) - (state?.done ? 1 : 0));
  const withLine = state ? companionLine(state.companions, state.companionCount) : "";

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🌬️
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.title", { defaultValue: "Cobreathe" })}
              </h1>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "rgba(193,127,36,0.18)", border: "1px solid rgba(193,127,36,0.45)", color: "#D9A45B", fontFamily: SPACE_GROTESK }}
              >
                {t("common.beta", { defaultValue: "Beta" })}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              {t("cobreathe.subtitle", { defaultValue: "An embodied prayer for justice" })}
            </p>
          </div>
        </div>

        {mode === "breathing" && (
          <CobreatheBreath
            othersToday={others}
            onReachTarget={handleReachTarget}
            onEnd={handleEnd}
          />
        )}

        {mode === "intro" && (
          <>
            {/* ── Stats hero — who has breathed today, leading the page.
                The big number is the practice's heartbeat; faces make the
                "we" concrete; the small row underneath carries your own
                days and the all-time count. */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.30)" }}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🫁</span>
                <div className="flex-1 min-w-0">
                  <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 34, fontWeight: 700 }}>
                    {state?.count ?? 0}
                  </p>
                  <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {today?.done
                      ? others === 0
                        ? t("cobreathe.stats_done_first", { defaultValue: "breathed today — you were the first breath of the day" })
                        : t("cobreathe.stats_done", { count: others, defaultValue: `breathed today, you among them — with ${others} other ${others === 1 ? "person" : "people"}` })
                      : (state?.count ?? 0) === 0
                        ? t("cobreathe.stats_none_yet", { defaultValue: "have breathed yet today — yours can be the first breath" })
                        : t("cobreathe.stats_count", { defaultValue: "breathed today — join your breath to theirs" })}
                  </p>
                </div>
              </div>
              {state && state.companions.length > 0 && (
                <div className="flex items-center gap-2 mt-3.5">
                  <Faces companions={state.companions} />
                  <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.including", { names: withLine, defaultValue: `including ${withLine}` })}
                  </p>
                </div>
              )}
              {state && (state.myDays > 0 || state.allBreaths > 0) && (
                <div className="flex gap-3 mt-4 pt-3.5" style={{ borderTop: "1px solid rgba(46,107,64,0.22)" }}>
                  <div className="flex-1">
                    <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 19, fontWeight: 700 }}>
                      {state.myDays}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      {t("cobreathe.stats_my_days", { defaultValue: "days you've breathed" })}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 19, fontWeight: 700 }}>
                      {state.allBreaths.toLocaleString()}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      {t("cobreathe.stats_all", { defaultValue: "breaths held across Phoebe" })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── CTA — right under the stats, above the teaching. */}
            <button
              type="button"
              onClick={() => setMode("breathing")}
              className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)",
                fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, cursor: "pointer",
              }}
            >
              {today?.done
                ? t("cobreathe.begin_again", { defaultValue: "Breathe again" })
                : t("cobreathe.begin", { defaultValue: "Cobreathe — twelve breaths" })}
            </button>

            <p className="text-[12px] mt-3 mb-6 text-center px-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF, fontStyle: "italic" }}>
              {t("cobreathe.caption", { defaultValue: "About two and a half minutes — it counts toward your contemplation goal. Sit comfortably; let the circle pace you." })}
            </p>

            {/* ── Information — the weekly intention, then the teaching. */}

            {/* This week's intention */}
            <div
              className="rounded-2xl p-4 mb-4 flex gap-3"
              style={{ background: "rgba(193,127,36,0.08)", border: "1px solid rgba(193,127,36,0.28)" }}
            >
              <span className="text-2xl leading-none mt-0.5">{focus.emoji}</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#D9A45B", fontFamily: SPACE_GROTESK }}>
                  {t("cobreathe.this_week", { defaultValue: "This week we breathe for" })}
                </p>
                <p className="text-[14px] font-bold mb-0.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t(`cobreathe.focus.${focus.key}.title`, { defaultValue: focus.title })}
                </p>
                <p className="text-[13px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
                  {t(`cobreathe.focus.${focus.key}.line`, { defaultValue: focus.line })}
                </p>
              </div>
            </div>

            {/* Framing card */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: "rgba(62,124,122,0.10)", border: "1px solid rgba(62,124,122,0.28)" }}
            >
              <p className="text-[15px] leading-relaxed mb-3" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
                {t("cobreathe.framing_1", { defaultValue: "To conspire — con spirare — is, literally, to breathe together." })}
              </p>
              <p className="text-[13.5px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF }}>
                {t("cobreathe.framing_2", { defaultValue: "Once a day, hold twelve slow breaths in one shared rhythm — the circle is paced by the same clock for everyone, so anyone breathing in that moment is breathing with you. When you finish, you'll learn how many people kept the breath today: a small, bodily recognition that we are interconnected, and that the work of justice is work we can only do together." })}
              </p>
            </div>

            {/* From the essay — the opening of Kearns' chapter, quoted
                verbatim up to where she previews the rest of the essay.
                Collapsed to the first lines; tap to read the whole
                introduction. */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.20)" }}
            >
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.essay_label", { defaultValue: "From the essay" })}
              </p>
              <blockquote className="text-[14px] leading-relaxed" style={{ color: WARM, fontFamily: SERIF, margin: 0 }}>
                {quoteOpen ? (
                  <>
                    <p className="mb-3">
                      Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air
                      depends on it. The average human takes between 17,280 and 23,040 breaths a day, twelve to
                      sixteen per minute resting. The giant tortoise only takes four per minute; the hummingbird,
                      250. No matter how frequent, simply understood, each breath involves inhaling air, converting
                      the oxygen, and exhaling carbon dioxide. But it is not just we animals that breathe; plants
                      breathe in their own way, taking in the air, and through photosynthesis, breaking it down so
                      they can use the carbon dioxide, and exhaling most of the oxygen produced. This process is
                      called transpiration; for animals, it is called respiration. Basically, all living creatures
                      need each other in order for this exchange that creates our air to work; plants and animals,
                      humans and trees, con-spiring.
                    </p>
                    <p className="mb-3">
                      This is a new/old way to understand conspire: to breathe together, stemming from the same
                      Latin root, <em>spirare</em>, to breathe, as in respire/respiration and plant transpiration.
                      But it also means to work together. Thus we conspire, respire, inspire, breathe together, a
                      potent symbol of reciprocity and communion, and of what living in a planetary context demands.
                      Not only do plants and animals breathe, but the planet also breathes, building up carbon
                      concentrations in the winter months when the leaves are off the trees, and ideally absorbing
                      it all when they leaf out in the spring. Yet that balance has been disrupted; the planet can
                      no longer “clear” its “lungs.” Climate change and air pollution bring the need for conspiring,
                      among humans, and with the planet, into an even sharper focus.
                    </p>
                  </>
                ) : (
                  <p className="mb-3">
                    Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air
                    depends on it…
                  </p>
                )}
              </blockquote>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SERIF, fontStyle: "italic" }}>
                  — Laurel Kearns, “Con-spiring Together: Breathing for Justice”
                </p>
                <button
                  type="button"
                  onClick={() => setQuoteOpen((v) => !v)}
                  className="text-[12px] font-semibold flex-shrink-0"
                  style={{ color: SAGE, fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {quoteOpen
                    ? t("cobreathe.essay_less", { defaultValue: "Show less" })
                    : t("cobreathe.essay_more", { defaultValue: "Read the opening →" })}
                </button>
              </div>
            </div>

            {/* Why breath? — the justice grounding, kept short */}
            <div className="mt-4">
              <h2 className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.why_title", { defaultValue: "Why breath?" })}
              </h2>
              <div className="space-y-3">
                {[
                  { emoji: "🌿", key: "why_ruach", text: "In Hebrew scripture, ruach is one word for breath, wind, and Spirit — the same breath of God animating all creation. Air is not empty; it is shared." },
                  { emoji: "🌳", key: "why_trees", text: "Plants breathe out what we breathe in, and we return the gift. Every breath rehearses our dependence on the green world — and on each other." },
                  { emoji: "✊🏾", key: "why_justice", text: "\"I can't breathe\" names both police violence and the polluted air poor communities and communities of color are made to live in. To breathe freely is a justice issue. We breathe with those who cannot." },
                ].map((row) => (
                  <div
                    key={row.key}
                    className="rounded-xl p-4 flex gap-3"
                    style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.18)" }}
                  >
                    <span className="text-xl leading-none mt-0.5">{row.emoji}</span>
                    <p className="text-[13px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF }}>
                      {t(`cobreathe.${row.key}`, { defaultValue: row.text })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === "done" && (() => {
          const s = doneState;
          const othersDone = Math.max(0, (s?.count ?? 1) - 1);
          const line = s ? companionLine(s.companions, s.companionCount) : "";
          // The breath POST failed and we never got a count back. Without
          // this branch the screen sits on "Breath held" forever and the
          // breath silently never recorded — offer a retry (re-sends the
          // same seconds) and a way out.
          if (!s && record.isError) {
            return (
              <div className="flex flex-col items-center text-center flex-1 justify-center py-10">
                <div className="text-5xl mb-5">🌬️</div>
                <h2 className="text-[1.4rem] font-bold mb-3 px-4" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t("cobreathe.save_failed", { defaultValue: "Your breath didn't save" })}
                </h2>
                <p className="text-[14px] leading-relaxed px-6 mb-8" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
                  {t("cobreathe.save_failed_sub", { defaultValue: "The breath you kept is real — we just couldn't reach the server to count it. Try again." })}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => record.mutate(record.variables ?? 0)}
                    disabled={record.isPending}
                    className="rounded-xl py-3 px-8"
                    style={{
                      background: "rgba(62,124,122,0.22)", color: WARM, border: "1px solid rgba(62,124,122,0.5)",
                      fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: record.isPending ? "default" : "pointer", opacity: record.isPending ? 0.6 : 1,
                    }}
                  >
                    {record.isPending
                      ? t("common.saving", { defaultValue: "Saving…" })
                      : t("common.try_again", { defaultValue: "Try again" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("intro")}
                    className="rounded-xl py-3 px-6"
                    style={{
                      background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.4)",
                      fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {t("common.not_now", { defaultValue: "Not now" })}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div className="flex flex-col items-center text-center flex-1 justify-center py-10">
              <div className="text-5xl mb-5">🌬️</div>
              <h2 className="text-[1.4rem] font-bold mb-3 px-4" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {!s
                  ? t("cobreathe.done_counting", { defaultValue: "Breath held" })
                  : othersDone === 0
                    ? t("cobreathe.done_first", { defaultValue: "You are the first breath today" })
                    : t("cobreathe.done_with", { count: othersDone, defaultValue: `You cobreathed with ${othersDone} other ${othersDone === 1 ? "person" : "people"}` })}
              </h2>
              {s && s.companions.length > 0 && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Faces companions={s.companions} />
                  <p className="text-[13px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.including", { names: line, defaultValue: `including ${line}` })}
                  </p>
                </div>
              )}
              <p className="text-[14px] leading-relaxed px-6 mb-2" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
                {othersDone === 0 && s
                  ? t("cobreathe.done_first_sub", { defaultValue: "Others will join their breath to yours as the day goes on." })
                  : t("cobreathe.done_sub", { defaultValue: "Not at the same hour — but one body, one breath, held across the day." })}
              </p>
              <p className="text-[13px] px-6 mb-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
                {t("cobreathe.done_focus", { focus: t(`cobreathe.focus.${focus.key}.title`, { defaultValue: focus.title }).toLowerCase(), defaultValue: `Held this week for ${t(`cobreathe.focus.${focus.key}.title`, { defaultValue: focus.title }).toLowerCase()}.` })}
              </p>
              <p className="text-[13px] px-6 mb-8" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
                {t("cobreathe.done_charge", { defaultValue: "Now let the conspiring continue — breathing together is how working together begins." })}
              </p>
              <button
                type="button"
                onClick={() => setMode("intro")}
                className="rounded-xl py-3 px-8"
                style={{
                  background: "rgba(46,107,64,0.20)", color: WARM, border: "1px solid rgba(46,107,64,0.45)",
                  fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                {t("common.done", { defaultValue: "Done" })}
              </button>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
