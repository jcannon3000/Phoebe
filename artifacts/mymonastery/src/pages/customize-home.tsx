import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Reorder } from "framer-motion";
import { ChevronLeft, Eye, EyeOff, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, type AuthUser } from "@/hooks/useAuth";

// Customize home screen — reached from the "Customize" pill at the
// bottom of the dashboard. Lets the viewer reorder the home modules,
// show/hide them, choose what leads (the top one), and pick which feed
// gets the big card. Saves immediately: order/hidden via
// PUT /api/me/home-layout, featured feed via PUT /api/me/feed-first-home.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Keep this list in sync with HOME_MODULES in dashboard.tsx AND
// HOME_MODULE_KEYS in api-server/src/routes/prayer.ts — keys not in
// the server's allowlist are silently dropped from saved layouts.
const HOME_MODULES = ["office", "feeds", "contemplation", "gratitude", "examen", "cac", "requests"] as const;
type HomeModule = typeof HOME_MODULES[number];

// Prayer requests always leads the home — it can't be hidden or reordered.
const PINNED: HomeModule = "requests";

// Module display metadata. Built inside the component via useModuleMeta()
// so the labels/subs localize live; a module-level const would freeze the
// language at module load.
function useModuleMeta(): Record<HomeModule, { label: string; emoji: string; sub: string }> {
  const { t } = useTranslation();
  return {
    office: { label: t("customize_home.module_office"), emoji: "📖", sub: t("customize_home.module_office_sub") },
    feeds: { label: t("customize_home.module_feeds"), emoji: "🌿", sub: t("customize_home.module_feeds_sub") },
    contemplation: { label: t("menu.contemplation"), emoji: "🕯️", sub: t("customize_home.module_contemplation_sub") },
    gratitude: { label: t("gratitude.title"), emoji: "🌾", sub: t("customize_home.module_gratitude_sub") },
    examen: { label: t("menu.examen"), emoji: "🤔", sub: t("customize_home.module_examen_sub") },
    // CAC label is intentionally NOT i18n'd — "CAC Daily Reflection"
    // is a proper-noun product name the Center for Action &
    // Contemplation publishes in English. We can localize the
    // description sub later if/when CAC offers a Spanish edition.
    cac: { label: "CAC Daily Reflection", emoji: "🌅", sub: "Today's reflection from the Center for Action & Contemplation" },
    requests: { label: t("customize_home.module_requests"), emoji: "🙏🏽", sub: t("customize_home.module_requests_sub") },
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
  for (const k of HOME_MODULES) if (!seen.has(k)) out.push(k);
  // Prayer requests always leads — pin it to the front regardless of the
  // saved order.
  return [PINNED, ...out.filter((k) => k !== PINNED)];
}

// Gate on the auth user being loaded before mounting the stateful inner
// component. Critical: the inner initializes its order/hidden state from
// user.homeLayout in a useState initializer, which only runs once — if it
// ran while user was still loading (hard refresh / direct nav), it would
// seed the DEFAULT layout and a subsequent edit would clobber the user's
// saved layout. Mounting only once user is present avoids that.
export default function CustomizeHomePage() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full pb-24" />
      </Layout>
    );
  }
  return <CustomizeHomeInner user={user} />;
}

function CustomizeHomeInner({ user }: { user: AuthUser }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const MODULE_META = useModuleMeta();
  const [, setLocation] = useLocation();

  // Feed-led default mirrors the dashboard: feed-led users lead with
  // feeds, everyone else leads with the office. Computed from the user
  // fields directly so it doesn't wait on the feeds query.
  const feedLed = !!(user?.feedFirstHome && user?.homeFeedId != null);
  const fallbackOrder: HomeModule[] = feedLed
    ? ["requests", "feeds", "office", "contemplation", "gratitude", "examen", "cac"]
    : ["requests", "office", "feeds", "contemplation", "gratitude", "examen", "cac"];

  const [order, setOrder] = useState<HomeModule[]>(() => buildOrder(user?.homeLayout?.order, fallbackOrder));
  const [hidden, setHidden] = useState<Set<string>>(() => {
    // First customization (no homeLayout row) hides the secondary
    // practices by default so the home doesn't feel cluttered out of
    // the gate. Once savedHidden exists, trust it — we used to ALSO
    // re-hide every module missing from saved order, which silently
    // un-did the user's "show Gratitude" toggle whenever their saved
    // order pre-dated the new module.
    const savedHidden = user?.homeLayout?.hidden;
    const savedOrder = user?.homeLayout?.order;
    const s = new Set<string>(savedHidden ?? ["contemplation", "gratitude", "examen", "cac"]);
    // CAC reflection is opt-in for EVERYONE (new and existing users)
    // per product decision — it's an optional Resources surface, not
    // a default-on practice. For new users this is covered by the
    // default-hidden array above; for existing users whose saved
    // layout pre-dates CAC, we add it to hidden if it's not already
    // in their saved order (i.e. they've never explicitly toggled it
    // on). Once they enable it via the eye, "cac" appears in
    // savedOrder and this guard becomes a no-op.
    if (savedOrder && !savedOrder.includes("cac")) {
      s.add("cac");
    }
    s.delete(PINNED); // Prayer requests can never be hidden.
    return s;
  });

  const { data: subsData } = useQuery<{ subscriptions: Array<{ feed: { id: number; title: string; coverEmoji: string | null } }> }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed") as Promise<{ subscriptions: Array<{ feed: { id: number; title: string; coverEmoji: string | null } }> }>,
    enabled: !!user,
  });
  const feeds = subsData?.subscriptions.map((s) => s.feed) ?? [];

  const saveLayout = useMutation({
    mutationFn: (layout: { order: string[]; hidden: string[] }) =>
      apiRequest("PUT", "/api/me/home-layout", layout),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
  const persist = (nextOrder: HomeModule[], nextHidden: Set<string>) => {
    setOrder(nextOrder);
    setHidden(new Set(nextHidden));
    saveLayout.mutate({ order: nextOrder, hidden: [...nextHidden] });
  };

  // The draggable rows — everything except the pinned lead. Reordering
  // these writes back a full order with the pinned module still first.
  const movable = order.filter((k) => k !== PINNED);
  const reorder = (next: HomeModule[]) => persist([PINNED, ...next], hidden);

  const toggleHidden = (k: HomeModule) => {
    if (k === PINNED) return; // pinned — always visible
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else {
      // Keep at least one module visible.
      if (hidden.size >= order.length - 1) return;
      next.add(k);
    }
    persist(order, next);
  };

  // Featured-feed picker (which feed gets the big card when feeds lead).
  const setFeed = useMutation({
    mutationFn: (feedId: number | null) => apiRequest("PUT", "/api/me/feed-first-home", { feedId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
    },
  });
  // Featured-feed selection. When the viewer hasn't explicitly chosen one,
  // default to Creation Care (if they follow it) rather than "No featured
  // feed" — it's the house feed we lead with.
  const creationCareId = feeds.find((f) => /creation\s*care/i.test(f.title))?.id ?? null;
  const selectedFeedId = (user?.feedFirstHome && user?.homeFeedId != null && feeds.some((f) => f.id === user.homeFeedId))
    ? user.homeFeedId
    : creationCareId;

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

        {/* Pinned lead — Prayer requests always sits at the top, set apart
            from the draggable list below. It can't be moved or hidden. */}
        {(() => {
          const meta = MODULE_META[PINNED];
          return (
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-3"
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
                <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
                  {meta.sub}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Draggable rows — everything below the pinned lead. */}
        <p className="text-[11px] mt-4 mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
          {t("customize_home.drag_hint")}
        </p>
        <Reorder.Group as="div" axis="y" values={movable} onReorder={reorder} className="flex flex-col gap-2">
          {movable.map((key) => {
            const meta = MODULE_META[key];
            const isHidden = hidden.has(key);
            return (
              <Reorder.Item
                key={key}
                as="div"
                value={key}
                className="flex items-center gap-3 rounded-xl px-3 py-3 select-none"
                style={{
                  background: isHidden ? "rgba(46,107,64,0.04)" : "rgba(46,107,64,0.10)",
                  border: "1px solid rgba(46,107,64,0.22)",
                  opacity: isHidden ? 0.6 : 1,
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
                  <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
                    {meta.sub}
                  </p>
                </div>
                {/* Show / hide. stopPropagation on pointer-down so tapping
                    the eye doesn't begin a drag. */}
                <button
                  type="button"
                  aria-label={isHidden ? t("customize_home.show") : t("customize_home.hide")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleHidden(key)}
                  className="transition-opacity hover:opacity-80"
                  style={{ color: isHidden ? "rgba(143,175,150,0.6)" : "#A8C5A0", cursor: "pointer", lineHeight: 0, padding: 4 }}
                >
                  {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>

        {/* Featured feed — which feed gets the big card when Prayer feeds
            lead. Only shown when the viewer follows at least one feed. */}
        {feeds.length > 0 && (
          <>
            <h2
              className="text-[10px] uppercase tracking-[0.16em] font-semibold mt-8 mb-2"
              style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}
            >
              {t("customize_home.featured_feed")}
            </h2>
            <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {t("customize_home.featured_feed_blurb")}
            </p>
            <div
              className="rounded-xl px-3"
              style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
            >
              {[{ id: null as number | null, label: t("customize_home.no_featured"), sub: t("customize_home.no_featured_sub") },
                ...feeds.map((f) => ({ id: f.id as number | null, label: `${f.title} ${f.coverEmoji ?? "🌿"}`.trim(), sub: t("customize_home.featured_sub") }))]
                .map((row, idx) => {
                  const isSel = selectedFeedId === row.id;
                  return (
                    <button
                      key={row.id ?? "none"}
                      type="button"
                      onClick={() => setFeed.mutate(row.id)}
                      className="w-full flex items-center gap-3 py-2.5 text-left"
                      style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(200,212,192,0.12)", background: "transparent", cursor: "pointer" }}
                    >
                      <div
                        style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: `2px solid ${isSel ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                          background: isSel ? "#A8C5A0" : "transparent",
                          flexShrink: 0,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px]" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>{row.label}</p>
                        <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>{row.sub}</p>
                      </div>
                    </button>
                  );
                })}
            </div>
          </>
        )}

        <Link
          href="/dashboard"
          className="block text-center mt-8 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ color: "#A8C5A0", fontFamily: SPACE_GROTESK }}
        >
          {t("customize_home.done")}
        </Link>
      </div>
    </Layout>
  );
}
