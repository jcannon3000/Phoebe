import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, ChevronRight, ChevronDown } from "lucide-react";
import { useBetaStatus } from "@/hooks/useDemo";
import { useTranslation } from "react-i18next";
import { openExternal } from "@/lib/openExternal";
import { FDD_TODAY_URL, markFddRead, SSJE_TODAY_URL, markSsjeRead, CAC_TODAY_URL, markCacRead } from "@/lib/cacReadState";
import { isNativeShell } from "@/lib/isNativeShell";

// ─── Color palette (all greens) ───────────────────────────────────────────────
const SECTION_COLORS = {
  letters:    "#8E9E42",   // warm olive-green
  practices:  "#2E6B40",   // deep forest-green
  gatherings: "#6FAF85",   // light sage-green
  people:     "#4A9E84",   // muted teal-green
  prayer:     "#5A8C72",   // mid-sage
};

// ─── Drawer building blocks ─────────────────────────────────────────────────

// A tappable menu row — a standalone link, or a child inside a section.
function MenuRow({
  emoji, label, badge, count, onClick,
}: {
  emoji: string; label: string; badge?: string; count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
      onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
      onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
    >
      <div className="flex items-center gap-3">
        <span className="text-base leading-none w-5 text-center">{emoji}</span>
        <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{label}</span>
        {badge && (
          <span className="text-[10px] font-medium" style={{ color: "rgba(143,175,150,0.45)" }}>{badge}</span>
        )}
        {!!count && count > 0 && (
          <span
            className="inline-flex items-center justify-center text-[10px] font-bold rounded-full"
            style={{ background: "#2D5E3F", color: "#F0EDE6", minWidth: 18, height: 18, padding: "0 5px" }}
          >
            {count}
          </span>
        )}
      </div>
      <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)" }} />
    </button>
  );
}

// A collapsible section: a header row with a caret that reveals its
// children (indented) when open. Manages its own open/closed state.
function MenuSection({
  emoji, label, defaultOpen = false, children,
}: {
  emoji: string; label: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
        onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
        onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
      >
        <div className="flex items-center gap-3">
          <span className="text-base leading-none w-5 text-center">{emoji}</span>
          <span className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{label}</span>
        </div>
        <ChevronDown
          size={15}
          style={{ color: "rgba(200,212,192,0.45)", transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && <div className="mt-0.5 mb-1 space-y-0.5" style={{ marginLeft: 8 }}>{children}</div>}
    </div>
  );
}

// ─── Hamburger Drawer ─────────────────────────────────────────────────────────

// (NcmpResourceRow used to live here, surfacing National Cathedral
// Morning Prayer as a Resources drawer entry. The cathedral broadcast
// is now an opt-in home card (NcmpHomeCard in pages/dashboard.tsx)
// the user enables from /customize-home, so the drawer entry was
// removed.)

function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { isAdmin: isBetaAdmin, rawIsAdmin, rawIsBeta } = useBetaStatus();
  const { t } = useTranslation();
  // Offices-only accounts 403 on /api/groups, /api/me/pending-…,
  // and /api/prayer-feeds/mine (requireBeta). Firing them on every
  // drawer open / Layout mount used to trip NetworkBanner's "flaky"
  // heuristic on the very first paint of the offices-only home —
  // user saw "Having trouble reaching the server" even though the
  // server was working as designed. The early `officesOnly` flag
  // below is repeated further down because it sits inside this
  // function and the queries are declared above their consumer.
  const earlyOfficesOnly = user?.accessTier === "offices-only";
  const { data: groupsData } = useQuery<{ groups: Array<{ id: number; name: string; slug: string; emoji: string | null; memberCount: number; myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user && !earlyOfficesOnly,
  });

  // Pending join-request counts per community the caller admins.
  // Drives a small badge next to the community name in the drawer
  // so an admin sees at a glance which communities have someone
  // waiting at the door, even before they tap the push notification.
  const { data: pendingCounts } = useQuery<{ total: number; byGroup: Record<number, number> }>({
    queryKey: ["/api/me/pending-join-request-counts"],
    queryFn: () => apiRequest("GET", "/api/me/pending-join-request-counts"),
    enabled: !!user && !earlyOfficesOnly,
    staleTime: 30_000,
  });

  // Prayer feeds the user created (admins). Drives whether the
  // "Manage Prayer Feeds" entry appears in the side menu — non-
  // creators don't see it. Uses /api/prayer-feeds/mine which
  // already gates on creatorUserId server-side. Offices-only
  // accounts can never be feed creators (beta-only feature), so
  // we skip the fetch for them.
  const { data: myFeedsData } = useQuery<{ feeds: Array<{ slug: string }> }>({
    queryKey: ["/api/prayer-feeds/mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/mine"),
    enabled: !!user && !earlyOfficesOnly,
    staleTime: 60_000,
  });
  const myFeeds = myFeedsData?.feeds ?? [];

  function navigate(path: string) {
    onClose();
    setLocation(path);
  }

  // Climate used to be a separate top-level feature with its own
  // climate-only carve-out (slim drawer hiding everything but Climate +
  // Settings + Feedback). It's now just a prayer feed (slug: phoebe-
  // climate); subscribers get its daily intention through the prayer-
  // feed plumbing like any other feed. The drawer therefore renders the
  // same items for everyone.
  // Offices-only tier: signed up via the public /pray or /feed/:slug
  // flow, no community + no garden of personal prayer requests. The
  // social surfaces (Prayer List, People, My Communities) are hidden
  // from the drawer so a tap can't land them on a page they can't use.
  // The full app's content gates already block the routes server-side;
  // this is the visual mirror so the menu doesn't dangle dead links.
  const officesOnly = user?.accessTier === "offices-only";

  // The drawer is organized into collapsible sections (Communities,
  // Offices, Practices, Resources) plus a footer. These flags gate the
  // entries that aren't open to every tier.
  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
  // Letters — community admins only. (Previously also surfaced to
  // offices-only users; turned off for non-admins per product direction.)
  const showLetters = isCommunityAdmin;
  // Admin Tools — beta users, community admins, feed creators, beta admins.
  const showAdminTools = rawIsBeta || rawIsAdmin || myFeeds.length > 0 || isCommunityAdmin;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Invisible tap-to-close area */}
          <div className="fixed inset-0 z-40" onClick={onClose} />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-y-auto"
            style={{ width: "min(340px, 90vw)", background: "#040D06", borderLeft: "1px solid rgba(46,107,64,0.18)" }}
          >
            {/* Close button. The drawer spans the full viewport height
                from top: 0, which on a notched iPhone puts this row
                under the status bar / camera housing — users reported
                the X was physically hard to tap. Pad the top by the
                larger of 1rem and env(safe-area-inset-top) so the
                button is always below the notch on native and stays
                sensible on non-notched devices + web. */}
            <div
              className="flex justify-end px-4 pb-2"
              style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
            >
              <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: "#8FAF96" }}>
                <X size={20} />
              </button>
            </div>

            {/* ── Profile ── */}
            <div className="px-5 pb-5" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              {/* Tapping the profile (avatar / name / email) opens
                  Settings — navigate() closes the drawer first. */}
              <button
                type="button"
                onClick={() => navigate("/settings")}
                aria-label="Open settings"
                className="w-full flex items-center gap-3 mb-3 text-left transition-opacity hover:opacity-80"
                style={{ background: "transparent", cursor: "pointer" }}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name ?? ""}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    style={{ border: "1px solid rgba(46,107,64,0.3)" }}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                    style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {user?.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#8FAF96" }}>{user?.email}</p>
                </div>
                <span aria-hidden className="flex-shrink-0" style={{ color: "rgba(143,175,150,0.6)", fontSize: 22, lineHeight: 1 }}>›</span>
              </button>

              {/* Pilot view / community admin toggles moved to Admin Tools page */}
            </div>

            {/* ── Communities ── collapsible; lists the user's
                communities. Offices-only tier has none, so it's hidden. */}
            {!officesOnly && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                <MenuSection emoji="🏘️" label={t("menu.communities")}>
                {(groupsData?.groups ?? []).length > 0 ? (
                  // Clamp to ~3.5 rows with a bottom fade once there
                  // are more than 3 communities — mirrors the Prayer
                  // List carousel on the dashboard so "scroll for
                  // more" reads the same everywhere. Each row is
                  // ~52px + 6px gap; 196px lands at 3 full + a half
                  // peek. Fade fades to the drawer bg (#040D06).
                  <div style={{ position: "relative" }}>
                    <div
                      className="space-y-1.5"
                      style={
                        (groupsData?.groups ?? []).length > 3
                          ? {
                              maxHeight: 196,
                              overflowY: "auto",
                              WebkitOverflowScrolling: "touch",
                              paddingBottom: 8,
                            }
                          : undefined
                      }
                    >
                    {groupsData!.groups.map((g) => {
                      const pendingCount = pendingCounts?.byGroup[g.id] ?? 0;
                      const isAdminOfThis = g.myRole === "admin" || g.myRole === "hidden_admin";
                      return (
                        <button
                          key={g.slug}
                          // Tap straight into the requests panel when there are
                          // pending join requests waiting on this admin —
                          // saves them a hop through community detail.
                          onClick={() => navigate(
                            isAdminOfThis && pendingCount > 0
                              ? `/communities/${g.slug}/requests`
                              : `/communities/${g.slug}`,
                          )}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
                          onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                          onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base leading-none">{g.emoji ?? "🏘️"}</span>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{g.name}</p>
                              <p className="text-[10px]" style={{ color: "rgba(143,175,150,0.55)" }}>{t("menu.members", { count: g.memberCount })}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isAdminOfThis && pendingCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center text-[10px] font-bold rounded-full"
                                style={{
                                  background: "#C58A2A",
                                  color: "#1A1208",
                                  minWidth: 18,
                                  height: 18,
                                  padding: "0 5px",
                                }}
                              >
                                {pendingCount}
                              </span>
                            )}
                            <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)" }} />
                          </div>
                        </button>
                      );
                    })}
                    </div>
                    {/* Bottom fade — only when the list scrolls.
                        Fades to the drawer panel bg so the partial
                        row reads as "more below". */}
                    {(groupsData?.groups ?? []).length > 3 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
                        style={{ background: "linear-gradient(to bottom, transparent 10%, #040D06)" }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl px-4 py-3 text-center" style={{ background: "rgba(200,212,192,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
                    <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>{t("menu.no_communities")}</p>
                    {rawIsAdmin && (
                      <button onClick={() => navigate("/communities/new")} className="text-xs font-semibold mt-1" style={{ color: "#A8C5A0" }}>
                        {t("menu.create_one")}
                      </button>
                    )}
                  </div>
                )}
                </MenuSection>
              </div>
            )}

            {/* ── Navigate ── collapsible sections: Offices stands alone,
                Practices and Resources group their members; Letters shows
                when the viewer has access. */}
            <div className="px-5 py-4 space-y-1" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              {/* Daily Offices — the 4 liturgies live behind one picker. */}
              <MenuRow emoji="🌅" label={t("menu.daily_offices")} onClick={() => navigate("/bcp/daily-office")} />
              <MenuSection emoji="🕯️" label={t("menu.practices")}>
                <MenuRow emoji="🕯️" label={t("menu.contemplation")} onClick={() => navigate("/contemplation")} />
                <MenuRow emoji="🌾" label={t("menu.gratitude")} onClick={() => navigate("/gratitude")} />
                <MenuRow emoji="🤔" label={t("menu.examen")} onClick={() => navigate("/examen")} />
              </MenuSection>
              <MenuSection emoji="📚" label={t("menu.resources")}>
                <MenuRow emoji="📖" label={t("menu.bcp_prayers")} onClick={() => navigate("/bcp/intercessions")} />
                <MenuRow emoji="🙏" label={t("menu.bcp_collects")} onClick={() => navigate("/bcp/collects")} />
                <MenuRow emoji="📜" label={t("menu.psalter")} onClick={() => navigate("/bcp/psalter")} />
                {/* CAC Daily Reflection — opens externally because CAC
                    is the canonical reader (paywalled formatting on the
                    article page). The /api/cac/today server route 302s
                    to today's permalink, cache-keyed to a 9 AM ET
                    publish day so users always land on the current
                    meditation. Close the drawer first so the SFSafari
                    presentation isn't fighting it for the screen. */}
                <MenuRow
                  emoji="🌅"
                  label={t("menu.cac_daily")}
                  onClick={() => { onClose(); openExternal("https://withphoebe.app/api/cac/today"); }}
                />
                {/* Forward Day by Day — Forward Movement's SPA at
                    prayer.forwardmovement.org/fdd resolves "today"
                    client-side, so a bare URL works every day. Tap
                    marks the FDD daily-read tracker so the home card
                    (if enabled) flips to "Read again" on return. */}
                <MenuRow
                  emoji="📔"
                  label={t("menu.fdd_daily")}
                  onClick={() => { onClose(); markFddRead(); openExternal(FDD_TODAY_URL); }}
                />
                {/* National Cathedral Morning Prayer used to live
                    here as a drawer row; moved to a home-screen card
                    (NcmpHomeCard in dashboard.tsx) the user opts
                    into from /customize-home. */}
                {rawIsBeta && (
                  <MenuRow emoji="😇" label={t("menu.saints")} badge={t("menu.beta")} onClick={() => navigate("/saints")} />
                )}
              </MenuSection>
              {showLetters && (
                <MenuRow emoji="📮" label={t("menu.letters")} badge={t("menu.beta")} onClick={() => navigate("/letters")} />
              )}
            </div>

            {/* ── Account + info footer ── */}
            <div className="px-5 py-3 space-y-1" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              <MenuRow emoji="⚙️" label={t("menu.settings")} onClick={() => navigate("/settings")} />
              {showAdminTools && (
                <MenuRow emoji="🔧" label={t("menu.admin_tools")} onClick={() => navigate("/admin/tools")} />
              )}
              {/* Phoebe Parish — moved here from the main nav so it
                  sits alongside Admin Tools as a privileged/preview
                  entry rather than competing with the daily-prayer
                  surfaces above. Still gated on rawIsBeta: Parish is
                  in private beta and the ParishGate normally bounces
                  full-tier users back to /dashboard, so the drawer
                  only surfaces it for beta_users who can walk the
                  picker + dashboard end-to-end. Routes to
                  /parish/onboarding if the user hasn't subscribed
                  yet, else /parish. */}
              {rawIsBeta && (
                <MenuRow
                  emoji="🏛️"
                  label={t("menu.phoebe_parish")}
                  badge={t("menu.beta")}
                  onClick={() => navigate(user?.parishFeedId ? "/parish" : "/parish/onboarding")}
                />
              )}
              <MenuRow emoji="ℹ️" label={t("menu.about")} onClick={() => navigate("/church-deck")} />
            </div>

            {/* ── Sign out ── */}
            <div className="px-5 py-4 flex-1 flex flex-col justify-end">
              <button
                onClick={() => { onClose(); logout(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm"
                style={{ color: "#8FAF96" }}
                onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
              >
                <LogOut size={15} />
                {t("menu.sign_out")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isBeta } = useBetaStatus();
  const [location] = useLocation();
  const { t } = useTranslation();
  // Offices-only tier: no personal prayer requests + no garden. The
  // header "Prayer list" pill links into a surface they can't use, so
  // we hide it for that tier. Drawer filtering happens above.
  const officesOnly = user?.accessTier === "offices-only";
  // On the communities surface (/communities + any /communities/...
  // subpath like /communities/browse) the People pill swaps to "Home"
  // and routes back to the dashboard. The reader is already inside
  // navigation; giving them a one-tap exit beats sending them deeper
  // into People-find.
  const onCommunitiesPage =
    location === "/communities" || location.startsWith("/communities/");

  // Personal streak = consecutive days I've finished a prayer-list slideshow.
  const { data: streakData } = useQuery<{ streak: number; lastPrayedDate: string | null }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const prayerStreak = streakData?.streak ?? 0;

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: "#091A10" }}>
      <header
        className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pb-2 md:pb-5 flex justify-between items-center"
        style={{
          background: "#091A10",
          // Native shell: Capacitor's StatusBar.setOverlaysWebView(false)
          // already places the WebView BELOW the system status bar, so
          // its strip is accounted for natively and the WebView itself
          // doesn't need to inset for it. Earlier we still added
          // env(safe-area-inset-top) here, which double-counted on
          // iPhones with a Dynamic Island and left an enormous black
          // gap above the "Phoebe" wordmark.
          // Web (Safari / PWA with the translucent status bar meta tag):
          // keep the safe-area math — there the WebView IS under the
          // notch and needs the inset.
          paddingTop: isNativeShell()
            ? "1.25rem"
            : "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
        }}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            onClick={() => window.dispatchEvent(new CustomEvent("phoebe:reset-filter"))}
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
          >
            <span className="text-3xl font-bold transition-colors" style={{ letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            {/* Home pill — only renders on the communities surface, where
                it replaces the People slot. Sits to the LEFT of Prayer
                list so it reads as the primary "back out" affordance.
                Routes to /dashboard. */}
            {!officesOnly && onCommunitiesPage && (
              <Link
                href="/dashboard"
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.01em",
                  background: "rgba(200,212,192,0.08)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {t("header.home")}
              </Link>
            )}
            {/* Prayer list pill — sits to the left of Menu, same
                height. Direct shortcut into the management view of
                everything the viewer is carrying (their own
                requests + their garden's). Hidden for the offices-only
                tier — they have no personal prayer requests and no
                garden, so the pill would land on an empty page. */}
            {!officesOnly && (
              <Link
                href="/prayer-list"
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.01em",
                  background: "rgba(200,212,192,0.08)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {t("header.prayer_list")}
              </Link>
            )}
            {/* People pill — sits between Prayer list and Menu. Same
                gating as the drawer entry it replaces: hidden for the
                offices-only tier, who have no community. Also hidden
                on the communities surface, where the Home pill above
                takes its slot (different position, different action). */}
            {!officesOnly && !onCommunitiesPage && (
              <Link
                href="/people"
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.01em",
                  background: "rgba(200,212,192,0.08)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {t("header.people")}
              </Link>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center justify-center transition-colors"
              style={{ background: "none", border: "none", padding: 0 }}
              aria-label="Open menu"
            >
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "-0.01em",
                  background: "rgba(200,212,192,0.08)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {t("header.menu")}
              </span>
            </button>
          </div>
        )}
      </header>

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="flex-1 flex flex-col pt-2 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
