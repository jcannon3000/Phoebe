import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Reorder } from "framer-motion";
import { ChevronLeft, GripVertical, Plus, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { saveHomeLayout } from "@/lib/homeLayoutCache";
import { getSideLevel, setSideLevel, type OfficeLevel, setSideContemplationKind } from "@/lib/officePrefs";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";

// Customize home screen — two pages:
//
//   /customize-home        — shows only your VISIBLE panels; drag to reorder,
//                            tap × to remove. "+ Add panel" goes to the add page.
//   /customize-home/add    — shows all hidden / never-added modules; tap + to
//                            add any of them to your home screen.
//
// Changes save immediately to PUT /api/me/home-layout.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Keep this list in sync with HOME_MODULES in dashboard.tsx AND
// HOME_MODULE_KEYS in api-server/src/routes/prayer.ts — keys not in
// the server's allowlist are silently dropped from saved layouts.
const HOME_MODULES = [
  // Must match HOME_MODULE_KEYS in api-server/src/routes/prayer.ts. "feeds" was
  // missing here, so saving from this page silently stripped it and the server
  // re-appended it at the end — quietly moving the user's feeds card. Keep in sync.
  "office", "feeds", "contemplation", "listening", "reading", "walk", "cobreathe", "compline", "examen", "visio", "taize", "chittister", "cathedral",
  "cac", "fdd", "ssje", "vts", "nouwen", "sojo", "grist", "ncmp", "podcasts", "requests",
] as const;
type HomeModule = typeof HOME_MODULES[number];

// Prayer requests always leads the home — it can't be moved or removed.
const PINNED: HomeModule = "requests";

// The Pray card ("office" module) is the second fixed anchor: it sits right
// under Prayer requests, isn't draggable or removable, and carries the
// Community / Devotions / Office pill below. Excluded from the reorderable
// list and the add page.
const PRAY_ANCHOR: HomeModule = "office";

// The things the Pray card can be — same mapping the Rule of Life "Pray"
// step uses (WayOfLoveRuleFlow.PRAY_LEVEL):
//   community → "intercessions" → the home shows "Pray Together"
//   cobreathe → "reflect-sit"   → contemplation, breathing together (style=cobreathe)
//   devotion  → "devotion"      → the shorter Daily Devotion
//   offices   → "office"        → full Morning & Evening Prayer
type PrayChoice = "cobreathe" | "devotion" | "offices";
const PRAY_LEVEL: Record<PrayChoice, OfficeLevel> = {
  cobreathe: "reflect-sit",
  devotion: "devotion",
  offices: "office",
};
// Cobreathe is contemplation (reflect-sit) with the shared-breath style — the
// only contemplation prayer offered here (silent contemplation lives in the
// Rule of Life). Stored in localStorage, same key the Rule of Life flow uses.
function getContemplationStyle(): "silent" | "cobreathe" {
  try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { return "silent"; }
}
// Pill labels — hardcoded English, matching the other hardcoded module labels
// (cac/fdd/ssje) so the i18n coverage guard stays green.
const PRAY_OPTIONS: { id: PrayChoice; pill: string }[] = [
  // "Community" removed — it wrote the `intercessions` level, which getSideLevel
  // now coerces to "office" (prayer requests are OFF app-wide), so the pill
  // snapped straight back to Office and could never stay selected.
  { id: "cobreathe", pill: "Creation Prayer" },
  { id: "devotion", pill: "Devotions" },
  { id: "offices", pill: "Office" },
];
// The anchor card's identity per choice — mirrors what the home actually
// renders for that level (community = the "Pray Together 🙏" card).
const PRAY_CARD: Record<PrayChoice, { emoji: string; label: string; sub: string }> = {
  cobreathe: { emoji: "🌍", label: "Creation Prayer", sub: "Breathing together with God's creation" },
  devotion: { emoji: "🛐", label: "Daily Devotion", sub: "A short morning & evening devotion" },
  offices: { emoji: "📖", label: "Daily Office", sub: "Morning & Evening Prayer" },
};
// Which choice is active. Mirrors PrayerOfficeCard's programmedLevel: any
// "office" signal wins, then "devotion", then explicit community —
// otherwise the Daily Devotion default.
function derivePrayChoice(defaultPrayerLevel: string | null | undefined): PrayChoice | null {
  const m = getSideLevel("morning");
  const e = getSideLevel("evening");
  // FDD / Psalms / Simple Guided Prayer / the Examen / a user's own named
  // practice are all per-side prayers chosen in the Rule of Life — they have
  // no pill in this both-sides chooser. Return null (no selection) so this
  // page can't misrepresent them (they used to silently fall through to
  // "Devotion") and a re-tap can't silently overwrite a per-side pick —
  // pickPray() below sets BOTH sides to whichever pill IS tapped, which would
  // destroy an intentional guided-prayer/examen pairing (the new default, per
  // owner 2026-07-26) — or a "Create your own" practice — the instant this
  // page pre-selected the wrong pill and someone tapped it to "confirm" it.
  if (m === "fdd" || e === "fdd" || m === "readings" || e === "readings" || m === "psalms" || e === "psalms" || m === "guided-prayer" || e === "guided-prayer" || m === "examen" || e === "examen" || m === "custom" || e === "custom") return null;
  if (defaultPrayerLevel === "office" || m === "office" || e === "office") return "offices";
  if (defaultPrayerLevel === "devotion" || m === "devotion" || e === "devotion") return "devotion";
  // A stale server-side "intercessions" default reads as the office now —
  // that level is retired (prayer requests are OFF) and getSideLevel coerces
  // it, so there is no "community" pill left for it to select.
  if (defaultPrayerLevel === "intercessions") return "offices";
  // reflect-sit IS contemplation; here that only ever means Cobreathe (gated on
  // the shared-breath style). Plain silent contemplation isn't a choice here.
  const isReflect = defaultPrayerLevel === "reflect-sit" || m === "reflect-sit" || e === "reflect-sit";
  if (isReflect && getContemplationStyle() === "cobreathe") return "cobreathe";
  return "devotion";
}

// Home-layout version. Bump to force a one-time global reset to the default
// below: the client ignores any saved layout whose `v` is older than this,
// then a re-save stamps the current version. No DB migration / data wipe.
// Keep in sync with HOME_LAYOUT_VERSION in dashboard.tsx.
const HOME_LAYOUT_VERSION = 2;
// The default home everyone starts at (and resets to on a version bump):
// requests (pinned) → community prayers (office) →
// Forward Day by Day. Everything else is hidden but addable.
const DEFAULT_ORDER: HomeModule[] = ["requests", "office", "fdd", "contemplation", "listening", "examen", "cac", "ssje", "vts", "ncmp", "podcasts"];
const DEFAULT_HIDDEN: HomeModule[] = ["contemplation", "listening", "reading", "walk", "cobreathe", "compline", "examen", "visio", "taize", "chittister", "cathedral", "cac", "ssje", "vts", "nouwen", "sojo", "grist", "ncmp", "podcasts"];

function useModuleMeta(): Record<HomeModule, { label: string; emoji: string; sub: string }> {
  const { t } = useTranslation();
  return {
    office:       { label: t("customize_home.module_office"),    emoji: "📖", sub: t("customize_home.module_office_sub") },
    contemplation:{ label: t("menu.contemplation"),              emoji: "🕯️", sub: t("customize_home.module_contemplation_sub") },
    listening:    { label: t("menu.listening", { defaultValue: "Audio Divina" }), emoji: "🎧", sub: t("customize_home.module_listening_sub", { defaultValue: "Music as a way of prayer" }) },
    cobreathe:    { label: t("rhythm.row_cobreathe", { defaultValue: "Creation Prayer" }), emoji: "🌍", sub: t("customize_home.module_cobreathe_sub", { defaultValue: "Breathing together with God's creation" }) },
    reading:      { label: t("rhythm.row_reading", { defaultValue: "Reading" }), emoji: "📚", sub: t("customize_home.module_reading_sub", { defaultValue: "Read by chapter, page, or time" }) },
    walk:         { label: t("rhythm.row_walk", { defaultValue: "Contemplative Walk" }), emoji: "🚶🏽", sub: t("customize_home.module_walk_sub", { defaultValue: "A prayerful walk, counted as you go" }) },
    visio:        { label: t("rhythm.row_visio", { defaultValue: "Visio Divina" }), emoji: "🖼️", sub: t("customize_home.module_visio_sub", { defaultValue: "Pray with the day's image, slowly" }) },
    compline:     { label: t("rhythm.card_compline", { defaultValue: "Compline" }), emoji: "🌙", sub: t("customize_home.module_compline_sub", { defaultValue: "The night office · available from 7pm" }) },
    taize:        { label: t("rhythm.card_taize", { defaultValue: "Taizé meditation" }), emoji: "🕯️", sub: t("customize_home.module_taize_sub", { defaultValue: "The newest meditation from Taizé · waits until you've read it" }) },
    chittister:   { label: t("rhythm.card_chittister", { defaultValue: "Vision and Viewpoint" }), emoji: "🌾", sub: t("customize_home.module_chittister_sub", { defaultValue: "Joan Chittister's weekly · waits until you've read it" }) },
    cathedral:    { label: t("rhythm.card_cathedral", { defaultValue: "Cathedral sermon" }), emoji: "⛪", sub: t("customize_home.module_cathedral_sub", { defaultValue: "Washington National Cathedral · read or listen" }) },
    examen:       { label: t("menu.examen"),                     emoji: "🤔", sub: t("customize_home.module_examen_sub") },
    cac:          { label: "CAC Daily Reflection",               emoji: "🌅", sub: "Today's reflection from the Center for Action & Contemplation" },
    fdd:          { label: "Forward Day by Day",                 emoji: "📖", sub: "Today's meditation from Forward Movement" },
    ssje:         { label: "SSJE Reflections",                   emoji: "✍🏽", sub: "Today's Brother, Give Us a Word" },
    vts:          { label: "VTS Dean's Commentary",              emoji: "🦩", sub: "Weekday commentary from Virginia Theological Seminary" },
    // Owner: "make sure all reflections are availble in the customizer."
    // These three were readable from the Reflections menu but could not be
    // chosen, so the menu offered six and the rhythm accepted four.
    nouwen:       { label: "Daily Henri Nouwen Quotes",          emoji: "😊", sub: "From the Henri Nouwen Society" },
    sojo:         { label: "Sojourner's Voice and Verse",        emoji: "🕊️", sub: "Verse, voice and prayer of the day" },
    grist:        { label: "Grist Climate News",                 emoji: "🌎", sub: "The day's climate reporting" },
    ncmp:         { label: "National Cathedral Morning Prayer",  emoji: "📺", sub: "Weekday live broadcast · 7 AM ET" },
    podcasts:     { label: t("customize_home.module_podcasts", { defaultValue: "Podcasts" }), emoji: "🎧", sub: t("customize_home.module_podcasts_sub", { defaultValue: "Shows you've added · pick up where you left off" }) },
    requests:     { label: t("customize_home.module_requests"),  emoji: "🙏🏽", sub: t("customize_home.module_requests_sub") },
    feeds:        { label: t("customize_home.module_feeds", { defaultValue: "Prayer feeds" }), emoji: "🌍", sub: t("customize_home.module_feeds_sub", { defaultValue: "Daily intentions from feeds you follow" }) },
  };
}

// Build a complete, valid order from a saved one (or a fallback),
// keeping known keys in order then appending any missing modules.
function buildOrder(saved: string[] | null | undefined, fallback: HomeModule[]): HomeModule[] {
  const seen = new Set<string>();
  const out: HomeModule[] = [];
  for (const k of saved ?? fallback) {
    if ((HOME_MODULES as readonly string[]).includes(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as HomeModule);
    }
  }
  // Append any module not yet in saved order (newly added modules).
  for (const k of HOME_MODULES) if (!seen.has(k)) out.push(k);
  // Two fixed anchors lead, in order: Prayer requests, then the Pray card.
  // Podcasts is retired — never surface it in the editor (only the standalone
  // Podcasts content module is hidden; the daily offices keep their audio).
  return [PINNED, PRAY_ANCHOR, ...out.filter((k) => k !== PINNED && k !== PRAY_ANCHOR && k !== "podcasts")];
}

// ── Shared state hook used by both pages ─────────────────────────────────────

function useHomeLayout(user: AuthUser) {
  const queryClient = useQueryClient();
  // Honor ANY saved layout regardless of version — a version mismatch must
  // never discard the user's customization (the "editing the customizer deletes
  // my practices" bug). buildOrder() reconciles new/removed modules, so an old
  // layout migrates forward; saving re-stamps the current version.
  const saved = user?.homeLayout ?? null;

  const [order, setOrder] = useState<HomeModule[]>(() => buildOrder(saved?.order, DEFAULT_ORDER));
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const s = new Set<string>(saved?.hidden ?? DEFAULT_HIDDEN);
    s.delete(PINNED);
    s.delete(PRAY_ANCHOR); // the Pray anchor is always shown
    return s;
  });

  const saveLayout = useMutation({
    // Durable: caches the layout locally + retries, so a dropped PUT (e.g. an
    // iOS WebView suspended right after saving) can't lose the change.
    mutationFn: (layout: { order: string[]; hidden: string[] }) =>
      saveHomeLayout({ ...layout, v: HOME_LAYOUT_VERSION }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["/api/auth/me"] });
      const prev = queryClient.getQueryData(["/api/auth/me"]);
      queryClient.setQueryData(["/api/auth/me"], (curr: unknown) => {
        if (!curr || typeof curr !== "object") return curr;
        return { ...(curr as Record<string, unknown>), homeLayout: { order: vars.order, hidden: vars.hidden, v: HOME_LAYOUT_VERSION } };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx && typeof ctx === "object" && "prev" in ctx) {
        queryClient.setQueryData(["/api/auth/me"], (ctx as { prev: unknown }).prev);
      }
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); },
  });

  // Saving is DEBOUNCED + driven off state. Adding two cards in quick succession
  // used to fire two racing PUTs to the same row; if the earlier (single-add)
  // payload happened to land last, one selection was silently dropped ("I picked
  // two newsletters, only one saved"). Now every edit just updates local state,
  // and ONE save fires shortly after the last change with the full latest layout
  // — and we flush on unmount so tapping Done / navigating away never loses it.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ order: string[]; hidden: string[] } | null>(null);
  const dirty = useRef(false);
  const flush = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (pending.current) { const p = pending.current; pending.current = null; saveLayout.mutate(p); }
  };
  useEffect(() => {
    if (!dirty.current) return; // skip the initial mount — nothing edited yet
    pending.current = { order, hidden: [...hidden] };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, hidden]);
  useEffect(() => () => flush(), []); // flush any pending save on unmount  // eslint-disable-line react-hooks/exhaustive-deps

  const removeCard = (k: HomeModule) => {
    if (k === PINNED || k === PRAY_ANCHOR) return;
    setHidden((prev) => {
      // Keep at least one visible card besides the pinned one.
      const visibleCount = order.filter((m) => m !== PINNED && !prev.has(m)).length;
      if (visibleCount <= 1) return prev;
      const next = new Set(prev);
      next.add(k);
      dirty.current = true;
      return next;
    });
  };

  const addCard = (k: HomeModule) => {
    setHidden((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      dirty.current = true;
      return next;
    });
  };

  const reorder = (next: HomeModule[]) => {
    dirty.current = true;
    setOrder([PINNED, PRAY_ANCHOR, ...next]);
  };

  return { order, hidden, removeCard, addCard, reorder };
}

// ── Gate component — waits for auth before mounting stateful inner ────────────

export default function CustomizeHomePage() {
  const { user } = useAuth();
  if (!user) return <Layout><div className="max-w-xl mx-auto w-full pb-24" /></Layout>;
  return <CustomizeHomeInner user={user} />;
}

export function CustomizeHomeAddPage() {
  const { user } = useAuth();
  if (!user) return <Layout><div className="max-w-xl mx-auto w-full pb-24" /></Layout>;
  return <CustomizeHomeAddInner user={user} />;
}

// ── Main list page ─────────────────────────────────────────────────────────

function CustomizeHomeInner({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const MODULE_META = useModuleMeta();
  const { order, hidden, removeCard, reorder } = useHomeLayout(user);

  // Visible modules (excluding the two fixed anchors: Prayer requests + Pray).
  const visibleMovable = order.filter((k) => k !== PINNED && k !== PRAY_ANCHOR && !hidden.has(k));
  const hiddenCount = order.filter((k) => k !== PINNED && k !== PRAY_ANCHOR && hidden.has(k)).length
    + HOME_MODULES.filter((k) => k !== PINNED && k !== PRAY_ANCHOR && k !== "podcasts" && !order.includes(k)).length;

  // Pray-card variant (Community / Devotions / Office). Read from the server
  // default + per-side local levels (same signals PrayerOfficeCard reads), and
  // set it lightweight: just switch the Pray card — no full home rewrite like
  // the Rule of Life "commit".
  const { data: officePrefs } = useQuery<{ defaultPrayerLevel?: OfficeLevel | null }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const prayChoice = derivePrayChoice(officePrefs?.defaultPrayerLevel ?? null);
  const savePray = useMutation({
    mutationFn: (level: OfficeLevel) => apiRequest("PUT", "/api/me/office-prefs", { defaultPrayerLevel: level }),
    onMutate: async (level) => {
      await queryClient.cancelQueries({ queryKey: ["/api/me/office-prefs"] });
      const prev = queryClient.getQueryData(["/api/me/office-prefs"]);
      queryClient.setQueryData(["/api/me/office-prefs"], (c: unknown) =>
        c && typeof c === "object" ? { ...(c as Record<string, unknown>), defaultPrayerLevel: level } : { defaultPrayerLevel: level });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx && typeof ctx === "object" && "prev" in ctx) queryClient.setQueryData(["/api/me/office-prefs"], (ctx as { prev: unknown }).prev);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }); },
  });
  const pickPray = (choice: PrayChoice) => {
    const level = PRAY_LEVEL[choice];
    // Per-side local levels + the server default together drive the home card.
    setSideLevel("morning", level);
    setSideLevel("evening", level);
    // Cobreathe is contemplation with the shared-breath style — mark it so the
    // home/contemplation card opens straight into the breath.
    // Write the PER-SIDE kind too, not only the global. An explicit per-side
    // key beats the global fallback, so a user who already had
    // contemplation-kind:morning = "silent" picked Creation Prayer here and
    // that side simply didn't change — the rule they just chose never took.
    // (Both sides, because this picker sets both side levels above.)
    if (choice === "cobreathe") {
      setSideContemplationKind("morning", "creation");
      setSideContemplationKind("evening", "creation");
    }
    savePray.mutate(level);
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-24">
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-6 transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "transparent", cursor: "pointer" }}
        >
          <ChevronLeft size={14} />
          {t("header.home")}
        </button>

        <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {t("customize_home.title")} 🪟
        </h1>
        <p className="text-sm mt-1 mb-5" style={{ color: SAGE }}>
          {t("customize_home.subtitle")}
        </p>

        {/* Pinned lead — always at top, can't be moved or removed. */}
        {(() => {
          const meta = MODULE_META[PINNED];
          return (
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-3 mb-1"
              style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
            >
              <span style={{ fontSize: 20 }}>{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                    {meta.label}
                  </p>
                  <span
                    className="text-[9px] font-semibold uppercase rounded-full px-2 py-0.5"
                    style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", letterSpacing: "0.1em" }}
                  >
                    {t("customize_home.leads")}
                  </span>
                </div>
                <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>{meta.sub}</p>
              </div>
            </div>
          );
        })()}

        {/* Pray anchor — second fixed card. Not draggable / removable; the
            pill below switches what the home's main prayer card shows. */}
        {(() => {
          if (!prayChoice) {
            // A per-side prayer (Forward Day by Day / Praying the Psalms) is set
            // in the Rule of Life — show it read-only, with NO pill, so this
            // both-sides chooser can't flatten/clobber a per-side pick.
            return (
              <div className="rounded-xl px-3 py-3 mb-1" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 20 }}>📿</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>Your daily prayer</p>
                    <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>Set per-side in your Rule of Life.</p>
                  </div>
                </div>
              </div>
            );
          }
          const card = PRAY_CARD[prayChoice];
          return (
            <div
              className="rounded-xl px-3 py-3 mb-1"
              style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 20 }}>{card.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                    {card.label}
                  </p>
                  <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>{card.sub}</p>
                </div>
              </div>
              {/* Community Prayers / Devotions / Office pill. */}
              <div
                className="flex gap-1 rounded-full p-1 mt-3"
                style={{ background: "rgba(9,26,16, 0.495)", border: "1px solid rgba(46,107,64,0.22)" }}
              >
                {PRAY_OPTIONS.map((opt) => {
                  const active = prayChoice === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pickPray(opt.id)}
                      className="flex-1 rounded-full transition-all"
                      style={{
                        padding: "6px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: SPACE_GROTESK,
                        background: active ? "rgba(46,107,64,0.45)" : "transparent",
                        color: active ? WARM : "rgba(143,175,150,0.75)",
                        border: active ? "1px solid rgba(46,107,64,0.55)" : "1px solid transparent",
                        cursor: "pointer",
                      }}
                    >
                      {opt.pill}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Draggable visible cards. */}
        <p className="text-[11px] mt-4 mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
          {t("customize_home.drag_hint")}
        </p>
        <Reorder.Group as="div" axis="y" values={visibleMovable} onReorder={reorder} className="flex flex-col gap-2">
          {visibleMovable.map((key) => {
            const meta = MODULE_META[key];
            return (
              <Reorder.Item
                key={key}
                as="div"
                value={key}
                className="flex items-center gap-3 rounded-xl px-3 py-3 select-none"
                style={{
                  background: "rgba(46,107,64,0.10)",
                  border: "1px solid rgba(46,107,64,0.22)",
                  cursor: "grab",
                }}
                whileDrag={{ cursor: "grabbing", scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
              >
                <GripVertical size={16} style={{ color: "rgba(143,175,150,0.5)", flexShrink: 0 }} />
                <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                    {meta.label}
                  </p>
                  <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>{meta.sub}</p>
                </div>
                {/* Remove — stop-propagation on pointer-down prevents drag start.
                    Disabled (visibly) on the last remaining card: you must keep
                    at least one panel besides the pinned ones, so the X would
                    otherwise look tappable but silently do nothing. */}
                {(() => {
                  const cannotRemove = visibleMovable.length <= 1;
                  return (
                    <button
                      type="button"
                      aria-label={cannotRemove ? `Keep at least one card on your home` : `Remove ${meta.label}`}
                      title={cannotRemove ? t("customize_home.keep_one", { defaultValue: "Keep at least one card on your home" }) : undefined}
                      disabled={cannotRemove}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeCard(key)}
                      className="transition-opacity rounded-full flex items-center justify-center"
                      style={{
                        color: "rgba(143,175,150,0.7)",
                        background: "rgba(143,175,150,0.10)",
                        border: "1px solid rgba(143,175,150,0.20)",
                        cursor: cannotRemove ? "not-allowed" : "pointer",
                        opacity: cannotRemove ? 0.4 : 1,
                        padding: 5,
                        flexShrink: 0,
                      }}
                    >
                      <X size={14} />
                    </button>
                  );
                })()}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>

        {/* Add card CTA. */}
        <button
          type="button"
          onClick={() => setLocation("/customize-home/add")}
          className="w-full flex items-center justify-center gap-2 rounded-xl mt-3 transition-opacity hover:opacity-80"
          style={{
            padding: "13px 16px",
            background: "transparent",
            border: "1px dashed rgba(143,175,150,0.35)",
            color: SAGE,
            fontFamily: SPACE_GROTESK,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
          Add panel{hiddenCount > 0 ? ` · ${hiddenCount} available` : ""}
        </button>

        <Link href="/dashboard" className="block text-center mt-8 text-sm font-semibold transition-opacity hover:opacity-80" style={{ color: "#A8C5A0", fontFamily: SPACE_GROTESK }}>
          {t("customize_home.back_to_home", { defaultValue: "← Back to home" })}
        </Link>
        <p className="block text-center mt-2 text-[11px]" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
          {t("customize_home.auto_save_hint", { defaultValue: "Changes save automatically." })}
        </p>
      </div>
    </Layout>
  );
}

// ── Add-a-card page ───────────────────────────────────────────────────────────

function CustomizeHomeAddInner({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const MODULE_META = useModuleMeta();
  const entitlements = useEntitlements();
  const { order, hidden, addCard } = useHomeLayout(user);

  // Track which modules the user just added this session so we can
  // show a checkmark before they navigate back.
  const [justAdded, setJustAdded] = useState<Set<HomeModule>>(new Set());

  const handleAdd = (k: HomeModule) => {
    addCard(k);
    setJustAdded((prev) => new Set([...prev, k]));
  };

  // Modules available to add: hidden ones + any not yet in order. The two
  // fixed anchors (Prayer requests + Pray) are never in this list.
  // VTS is feed-gated — it isn't offerable until the viewer follows the VTS
  // feed (useEntitlements). Note this only filters the ADD list: if it's
  // already on their home (because they were entitled when they added it)
  // it keeps rendering and stays removable, so unfollowing never strands a
  // card they can't get rid of.
  const available = HOME_MODULES.filter(
    (k) => k !== PINNED && k !== PRAY_ANCHOR && k !== "podcasts"
      && (k !== "vts" || entitlements.vts)
      && (hidden.has(k) || !order.includes(k)),
  );

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-24">
        <button
          type="button"
          onClick={() => setLocation("/customize-home")}
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-6 transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "transparent", cursor: "pointer" }}
        >
          <ChevronLeft size={14} />
          {t("customize_home.title")}
        </button>

        <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          Add a panel
        </h1>
        <p className="text-sm mt-1 mb-5" style={{ color: SAGE }}>
          Choose what to show on your home screen.
        </p>

        {available.length === 0 ? (
          <div className="text-center mt-16">
            <p style={{ fontSize: 32 }}>✅</p>
            <p className="mt-3 text-sm" style={{ color: SAGE }}>{t("customize_home.all_added", { defaultValue: "All panels are already on your home screen." })}</p>
            <button
              type="button"
              onClick={() => setLocation("/customize-home")}
              className="mt-5 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: "#A8C5A0", background: "transparent", cursor: "pointer" }}
            >
              ← Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {available.map((key) => {
              const meta = MODULE_META[key];
              const added = justAdded.has(key);
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-xl px-3 py-3"
                  style={{
                    background: added ? "rgba(46,107,64,0.16)" : "rgba(46,107,64,0.07)",
                    border: `1px solid ${added ? "rgba(46,107,64,0.40)" : "rgba(46,107,64,0.18)"}`,
                    transition: "background 0.2s, border-color 0.2s",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                      {meta.label}
                    </p>
                    <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
                      {meta.sub}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={added ? `${meta.label} added` : `Add ${meta.label}`}
                    onClick={() => !added && handleAdd(key)}
                    className="rounded-full flex items-center justify-center transition-all"
                    style={{
                      width: 32,
                      height: 32,
                      background: added ? "#A8C5A0" : "rgba(143,175,150,0.12)",
                      border: `1px solid ${added ? "#A8C5A0" : "rgba(143,175,150,0.30)"}`,
                      color: added ? "#091A10" : SAGE,
                      cursor: added ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {added ? <Check size={15} strokeWidth={2.5} /> : <Plus size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Done — navigate back after adding. */}
        {justAdded.size > 0 && (
          <button
            type="button"
            onClick={() => setLocation("/customize-home")}
            className="w-full mt-6 rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.45)", color: "#A8C5A0", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            Done — back to my panels
          </button>
        )}
      </div>
    </Layout>
  );
}
