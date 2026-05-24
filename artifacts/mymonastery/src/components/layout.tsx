import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, ChevronRight } from "lucide-react";
import { useBetaStatus } from "@/hooks/useDemo";

// ─── Color palette (all greens) ───────────────────────────────────────────────
const SECTION_COLORS = {
  letters:    "#8E9E42",   // warm olive-green
  practices:  "#2E6B40",   // deep forest-green
  gatherings: "#6FAF85",   // light sage-green
  people:     "#4A9E84",   // muted teal-green
  prayer:     "#5A8C72",   // mid-sage
};

// ─── Hamburger Drawer ─────────────────────────────────────────────────────────

function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { isAdmin: isBetaAdmin, rawIsAdmin, rawIsBeta } = useBetaStatus();
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

  const navItems: Array<{ emoji: string; label: string; path: string; badge?: string; count?: number } | { divider: true }> = [
    // Practices used to have its own top-level entry that deep-linked into
    // the dashboard's filter; removed — the dashboard itself is the home
    // surface, and the Practices pill there is the canonical way to narrow.
    ...(officesOnly ? [] : [{ emoji: "🙏🏽", label: "Prayer List", path: "/prayer-list" }]),
    // Gatherings + Prayer Feeds tabs are intentionally kept off the
    // side menu — both pages still live at /gatherings and
    // /prayer-feeds for direct deep-link access, but day-to-day
    // discovery happens through the slideshow / community pages.
    ...(officesOnly ? [] : [{ emoji: "👥", label: "People",      path: "/people" }]),
    // Skip the leading divider for offices-only — both items above
    // are filtered out, so a divider here would sit alone at the top
    // of the menu separating nothing.
    ...(officesOnly ? [] : [{ divider: true as const }]),
    // Liturgy section — book of common prayer reference content.
    // Daily Office (Morning + Evening Prayer Rite II) and the
    // Daily Devotions (BCP pp. 137 + 139, the abbreviated morning +
    // early-evening forms) are now visible to every signed-in user.
    // Lessons render as references for readers to open in their own
    // bible; the Office cache is content-addressable so the load is
    // cheap.
    // Daily Offices leads the liturgy section — it's the daily-rhythm
    // surface. Houses all four liturgies (Morning/Evening Prayer + the
    // two short Devotions) behind one picker, so the separate Daily
    // Devotions entry is gone.
    { emoji: "🌅", label: "Daily Offices", path: "/bcp/daily-office" },
    { emoji: "📖", label: "BCP Prayers", path: "/bcp/intercessions" },
    { emoji: "📜", label: "Psalter",     path: "/bcp/psalter" },
    // Contemplation — a silent-prayer timer (bell to begin, bell to
    // close) with its own time-in-stillness stats. Open to every tier.
    { emoji: "🕯️", label: "Contemplation", path: "/contemplation" },
    // The Daily Examen — Ignatian end-of-day reflective prayer. Open
    // to every signed-in user.
    { emoji: "🤔", label: "Ignatian Examen", path: "/examen" },
    // Gratitude — a daily thanksgiving journal (private, optionally
    // shared to the garden). Open to every tier.
    { emoji: "🌾", label: "Gratitude", path: "/gratitude" },
    { divider: true },
    // Letters is an admin-driven surface — only community admins (or
    // hidden admins) ever author rounds. Members in a community where
    // an admin starts a round get their write-window push notification
    // and can write from there directly; surfacing the menu entry to
    // every signed-in user just exposed a feature they can't actually
    // use until an admin opens a round. Gate on at least one
    // community-admin role (same check the Admin Tools entry uses).
    ...((groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin") ? [
      { emoji: "📮", label: "Letters", path: "/letters", badge: "beta" },
    ] : []),
    // "Manage Prayer Feeds" only renders for users who actually
    // admin a feed — single-feed admins land directly on that
    // feed's manage page; multi-feed admins land on the browse
    // page where their feeds carry an admin badge.
    { emoji: "⚙️", label: "Settings",    path: "/settings"    },
    // Admin Tools — visible to beta users (pilot view toggle), community
    // admins (community admin toggle), prayer-feed creators, and beta admins.
    ...((rawIsBeta || rawIsAdmin || myFeeds.length > 0 || (groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin")) ? [
      { emoji: "🔧", label: "Admin Tools", path: "/admin/tools" },
    ] : []),
    { emoji: "ℹ️", label: "About",       path: "/church-deck"  },
  ];

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
              <div className="flex items-center gap-3 mb-3">
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
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {user?.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#8FAF96" }}>{user?.email}</p>
                </div>
              </div>

              {/* Pilot view / community admin toggles moved to Admin Tools page */}
            </div>

            {/* ── My Communities ── offices-only tier has no
                communities by construction, so the section is hidden
                entirely (rather than rendering with an empty state). */}
            {!officesOnly && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.4)" }}>
                  My Communities
                </p>
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
                              <p className="text-[10px]" style={{ color: "rgba(143,175,150,0.55)" }}>{g.memberCount} {g.memberCount === 1 ? "member" : "members"}</p>
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
                    <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>No communities yet</p>
                    {rawIsAdmin && (
                      <button onClick={() => navigate("/communities/new")} className="text-xs font-semibold mt-1" style={{ color: "#A8C5A0" }}>
                        Create one →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
                Navigate
              </p>
              <nav className="space-y-1">
                {navItems.map((item, i) => {
                  if ("divider" in item) {
                    return <div key={`divider-${i}`} className="my-2" style={{ height: 1, background: "rgba(46,107,64,0.18)" }} />;
                  }
                  const { emoji, label, path, badge, count } = item as { emoji: string; label: string; path: string; badge?: string; count?: number };
                  const handleNavClick = () => {
                    navigate(path);
                  };
                  return (
                    <button
                      key={path}
                      onClick={handleNavClick}
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
                })}
              </nav>
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
                Sign out
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
  // Offices-only tier: no personal prayer requests + no garden. The
  // header "Prayer list" pill links into a surface they can't use, so
  // we hide it for that tier. Drawer filtering happens above.
  const officesOnly = user?.accessTier === "offices-only";

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
        className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pt-5 pb-2 md:pt-6 md:pb-5 flex justify-between items-center"
        style={{ background: "#091A10" }}
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
                Prayer list
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
                Menu
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
