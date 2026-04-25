import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, ChevronRight } from "lucide-react";
import { useBetaStatus, useCommunityAdminToggle } from "@/hooks/useDemo";

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
  const { isAdmin: isBetaAdmin, betaViewEnabled, toggleBetaView, rawIsAdmin, rawIsBeta } = useBetaStatus();
  const [communityAdminView, toggleCommunityAdminView] = useCommunityAdminToggle();
  const { data: groupsData } = useQuery<{ groups: Array<{ id: number; name: string; slug: string; emoji: string | null; memberCount: number; myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });

  function navigate(path: string) {
    onClose();
    setLocation(path);
  }

  const navItems: Array<{ emoji: string; label: string; path: string; badge?: string; count?: number } | { divider: true }> = [
    // Practices used to have its own top-level entry that deep-linked into
    // the dashboard's filter; removed — the dashboard itself is the home
    // surface, and the Practices pill there is the canonical way to narrow.
    { emoji: "🙏🏽", label: "Manage Prayer List", path: "/prayer-list" },
    { emoji: "🤝🏽", label: "Gatherings",  path: "/gatherings"  },
    { emoji: "👥", label: "People",      path: "/people" },
    { emoji: "📖", label: "BCP Prayers", path: "/bcp/intercessions" },
    { divider: true },
    { emoji: "📮", label: "Letters",     path: "/letters",    badge: "beta" },
    { emoji: "⚙️", label: "Settings",    path: "/settings"    },
    { emoji: "💬", label: "Feedback",    path: "/feedback"    },
    ...(isBetaAdmin ? [
      { emoji: "🔐", label: "Pilot Users", path: "/beta" },
      { emoji: "📜", label: "Waitlist",    path: "/waitlist" },
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

              {/* Pilot view toggle — visible for all pilot users (even when toggled off) */}
              {rawIsBeta && (
                <button
                  onClick={toggleBetaView}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors mt-2"
                  style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.15)" }}
                >
                  <div className="text-left">
                    <p className="text-sm" style={{ color: "#8FAF96" }}>Pilot view {betaViewEnabled ? "on" : "off"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                      {betaViewEnabled ? "Seeing pilot features." : "Previewing regular user view."}
                    </p>
                  </div>
                  <div className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${betaViewEnabled ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${betaViewEnabled ? "left-[16px]" : "left-[2px]"}`} style={{ background: "#F0EDE6" }} />
                  </div>
                </button>
              )}

              {/* Community admin toggle — lets a community admin experience the app as a regular member */}
              {(groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin") && (
                <button
                  onClick={toggleCommunityAdminView}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors mt-2"
                  style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.15)" }}
                >
                  <div className="text-left">
                    <p className="text-sm" style={{ color: "#8FAF96" }}>Community admin {communityAdminView ? "on" : "off"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                      {communityAdminView ? "Seeing admin tools." : "Viewing as a member."}
                    </p>
                  </div>
                  <div className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${communityAdminView ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${communityAdminView ? "left-[16px]" : "left-[2px]"}`} style={{ background: "#F0EDE6" }} />
                  </div>
                </button>
              )}
            </div>

            {/* ── My Communities ── */}
            <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.4)" }}>
                My Communities
              </p>
              {(groupsData?.groups ?? []).length > 0 ? (
                <div className="space-y-1.5">
                  {groupsData!.groups.map((g) => (
                    <button
                      key={g.slug}
                      onClick={() => navigate(`/communities/${g.slug}`)}
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
                      <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)" }} />
                    </button>
                  ))}
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
      <header className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pt-5 pb-2 md:pt-6 md:pb-5 flex justify-between items-center" style={{ background: "#091A10" }}>
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            onClick={() => window.dispatchEvent(new CustomEvent("phoebe:reset-filter"))}
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
          >
            <span className="text-3xl font-bold transition-colors" style={{ letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
            {/* Header "beta" tag removed for App Store submission —
                Apple sometimes flags this in production builds, and
                "beta" lives in TestFlight, not on the app face. The
                Letters nav-item beta badge stays since that one
                feature is still actually pre-release. */}
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            {/* Top-right Prayer List pill removed — the primary
                "Begin your prayer list" action now lives under the
                feast on the dashboard. Menu is the only top-right
                control. */}
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
