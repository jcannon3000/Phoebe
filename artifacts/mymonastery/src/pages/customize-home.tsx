import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Reorder } from "framer-motion";
import { ChevronLeft, GripVertical, Plus, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, type AuthUser } from "@/hooks/useAuth";

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
  "office", "contemplation", "gratitude", "examen",
  "cac", "fdd", "ssje", "ncmp", "podcasts", "requests",
] as const;
type HomeModule = typeof HOME_MODULES[number];

// Prayer requests always leads the home — it can't be moved or removed.
const PINNED: HomeModule = "requests";

function useModuleMeta(): Record<HomeModule, { label: string; emoji: string; sub: string }> {
  const { t } = useTranslation();
  return {
    office:       { label: t("customize_home.module_office"),    emoji: "📖", sub: t("customize_home.module_office_sub") },
    contemplation:{ label: t("menu.contemplation"),              emoji: "🕯️", sub: t("customize_home.module_contemplation_sub") },
    gratitude:    { label: t("gratitude.title"),                 emoji: "🌾", sub: t("customize_home.module_gratitude_sub") },
    examen:       { label: t("menu.examen"),                     emoji: "🤔", sub: t("customize_home.module_examen_sub") },
    cac:          { label: "CAC Daily Reflection",               emoji: "🌅", sub: "Today's reflection from the Center for Action & Contemplation" },
    fdd:          { label: "Forward Day by Day",                 emoji: "📖", sub: "Today's meditation from Forward Movement" },
    ssje:         { label: "SSJE Reflections",                   emoji: "✍🏽", sub: "Today's Brother, Give Us a Word" },
    ncmp:         { label: "National Cathedral Morning Prayer",  emoji: "📺", sub: "Weekday live broadcast · 7 AM ET" },
    podcasts:     { label: t("customize_home.module_podcasts", { defaultValue: "Podcasts" }), emoji: "🎧", sub: t("customize_home.module_podcasts_sub", { defaultValue: "Shows you've added · pick up where you left off" }) },
    requests:     { label: t("customize_home.module_requests"),  emoji: "🙏🏽", sub: t("customize_home.module_requests_sub") },
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
  return [PINNED, ...out.filter((k) => k !== PINNED)];
}

// ── Shared state hook used by both pages ─────────────────────────────────────

function useHomeLayout(user: AuthUser) {
  const queryClient = useQueryClient();
  const fallbackOrder: HomeModule[] = ["requests", "office", "contemplation", "gratitude", "examen", "cac", "fdd", "ssje", "ncmp", "podcasts"];

  const [order, setOrder] = useState<HomeModule[]>(() => buildOrder(user?.homeLayout?.order, fallbackOrder));
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const savedHidden = user?.homeLayout?.hidden;
    const savedOrder = user?.homeLayout?.order;
    const s = new Set<string>(savedHidden ?? ["contemplation", "gratitude", "examen", "cac", "fdd", "ssje", "ncmp"]);
    // Opt-in-only modules: add to hidden for existing users whose saved
    // order pre-dates the module (they've never explicitly toggled it on).
    for (const mod of ["cac", "fdd", "ssje", "ncmp", "podcasts"] as HomeModule[]) {
      if (savedOrder && !savedOrder.includes(mod)) s.add(mod);
    }
    s.delete(PINNED);
    return s;
  });

  const saveLayout = useMutation({
    mutationFn: (layout: { order: string[]; hidden: string[] }) =>
      apiRequest("PUT", "/api/me/home-layout", layout),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["/api/auth/me"] });
      const prev = queryClient.getQueryData(["/api/auth/me"]);
      queryClient.setQueryData(["/api/auth/me"], (curr: unknown) => {
        if (!curr || typeof curr !== "object") return curr;
        return { ...(curr as Record<string, unknown>), homeLayout: { order: vars.order, hidden: vars.hidden } };
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

  const persist = (nextOrder: HomeModule[], nextHidden: Set<string>) => {
    setOrder(nextOrder);
    setHidden(new Set(nextHidden));
    saveLayout.mutate({ order: nextOrder, hidden: [...nextHidden] });
  };

  const removeCard = (k: HomeModule) => {
    if (k === PINNED) return;
    const next = new Set(hidden);
    // Keep at least one visible card besides the pinned one.
    const visibleCount = order.filter(m => m !== PINNED && !hidden.has(m)).length;
    if (visibleCount <= 1) return;
    next.add(k);
    persist(order, next);
  };

  const addCard = (k: HomeModule) => {
    const next = new Set(hidden);
    next.delete(k);
    persist(order, next);
  };

  const reorder = (next: HomeModule[]) => persist([PINNED, ...next], hidden);

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
  const MODULE_META = useModuleMeta();
  const { order, hidden, removeCard, reorder } = useHomeLayout(user);

  // Visible modules (excluding the pinned Prayer requests).
  const visibleMovable = order.filter((k) => k !== PINNED && !hidden.has(k));
  const hiddenCount = order.filter((k) => k !== PINNED && hidden.has(k)).length
    + HOME_MODULES.filter((k) => k !== PINNED && !order.includes(k)).length;

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

        {/* Draggable visible cards. */}
        <p className="text-[11px] mt-3 mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
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
                {/* Remove — stop-propagation on pointer-down prevents drag start. */}
                <button
                  type="button"
                  aria-label={`Remove ${meta.label}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeCard(key)}
                  className="transition-opacity hover:opacity-80 rounded-full flex items-center justify-center"
                  style={{
                    color: "rgba(143,175,150,0.7)",
                    background: "rgba(143,175,150,0.10)",
                    border: "1px solid rgba(143,175,150,0.20)",
                    cursor: "pointer",
                    padding: 5,
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
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
  const { order, hidden, addCard } = useHomeLayout(user);

  // Track which modules the user just added this session so we can
  // show a checkmark before they navigate back.
  const [justAdded, setJustAdded] = useState<Set<HomeModule>>(new Set());

  const handleAdd = (k: HomeModule) => {
    addCard(k);
    setJustAdded((prev) => new Set([...prev, k]));
  };

  // Modules available to add: hidden ones + any not yet in order.
  const available = HOME_MODULES.filter(
    (k) => k !== PINNED && (hidden.has(k) || !order.includes(k)),
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
