import { ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, ChevronRight, ChevronDown } from "lucide-react";
import { useBetaStatus } from "@/hooks/useDemo";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { triggerCategoryTransition } from "@/components/PageFadeOverlay";
import { playOpeningSwell } from "@/lib/amenFeedback";
import { hasReadCacToday, hasReadFddToday, hasReadSsjeToday } from "@/lib/cacReadState";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getSideLevel } from "@/lib/officePrefs";
import { isJardinSealed } from "@/lib/jardinMode";
import { useHealthMindfulToday, useSyncHealthMinutes } from "@/lib/appleHealth";

// ─── Drawer building blocks ─────────────────────────────────────────────────

// A tappable menu row — a standalone link, or a child inside a section.
// `sub` adds a small second line beneath the label (e.g. a podcast's
// publisher → show name); omit it for single-line rows.
function MenuRow({
  emoji, label, sub, badge, count, onClick,
}: {
  emoji: string; label: string; sub?: string; badge?: string; count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
      onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
      onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-base leading-none w-5 text-center">{emoji}</span>
        <span className="flex flex-col min-w-0 text-left">
          <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{label}</span>
          {sub && (
            <span className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>{sub}</span>
          )}
        </span>
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
      <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)", flexShrink: 0 }} />
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
  const { rawIsAdmin, rawIsBeta } = useBetaStatus();
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
    enabled: open && !!user && !earlyOfficesOnly,
  });

  // Pending join-request counts per community the caller admins.
  // Drives a small badge next to the community name in the drawer
  // so an admin sees at a glance which communities have someone
  // waiting at the door, even before they tap the push notification.
  const { data: pendingCounts } = useQuery<{ total: number; byGroup: Record<number, number> }>({
    queryKey: ["/api/me/pending-join-request-counts"],
    queryFn: () => apiRequest("GET", "/api/me/pending-join-request-counts"),
    enabled: open && !!user && !earlyOfficesOnly,
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
    enabled: open && !!user && !earlyOfficesOnly,
    staleTime: 60_000,
  });
  const myFeeds = myFeedsData?.feeds ?? [];

  // Incoming fellow requests → a count badge on the People menu row.
  // Beta-only capability, so gated on rawIsBeta to skip the 403 for everyone else.
  const { data: fellowReqData } = useQuery<{ count: number }>({
    queryKey: ["/api/fellows/requests/count"],
    queryFn: () => apiRequest("GET", "/api/fellows/requests/count"),
    enabled: open && !!user && rawIsBeta,
    staleTime: 30_000,
  });
  const fellowRequestCount = fellowReqData?.count ?? 0;

  // Something new from a friend (an unseen 🙌 encouragement) → adds to the
  // People row badge so you see there's a new one waiting.
  const { data: encData } = useQuery<{ encouragements: unknown[] }>({
    queryKey: ["/api/encouragements"],
    queryFn: () => apiRequest("GET", "/api/encouragements"),
    enabled: open && !!user && rawIsBeta,
    staleTime: 30_000,
  });
  const newFromFriends = encData?.encouragements?.length ?? 0;

  function navigate(path: string) {
    onClose();
    setLocation(path);
  }

  // Category rows fade the current page down, then the destination up (slower),
  // with a soft rising cue. Closes the drawer first so it slides away under
  // the cover.
  function goCategory(path: string) {
    onClose();
    triggerCategoryTransition(() => setLocation(path));
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
  // Sealed El Jardín shell: the user sees only the Jardín experience — the
  // drawer hides every non-Jardín surface (Communities, Prayer list, BCP,
  // Practices, Letters, Parish…), leaving El Jardín + Settings + Sign out.
  // Sealed for the eljardin subdomain, a jardinOnly account, OR a Jardín-origin
  // (enrolled) account that has joined a Jardín group — that last seal is live
  // and lifts when they leave. See isJardinSealed.
  const jardinShell = isJardinSealed(user);

  // The drawer is organized into collapsible sections (Communities,
  // Offices, Practices, Resources) plus a footer. These flags gate the
  // entries that aren't open to every tier.
  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
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
                larger of 1rem and var(--safe-top) so the
                button is always below the notch on native and stays
                sensible on non-notched devices + web. */}
            <div
              className="flex justify-end px-4 pb-2"
              style={{ paddingTop: "var(--top-chrome)" }}
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

            {/* ── Communities ── lists the user's communities.
                Offices-only tier has none, so the whole block is
                hidden. Rendering branches on count:
                  • 0 → empty-state card prompting to create one
                  • 1 → flat row at the top of the section (no
                    collapsible header — opening a folder for a
                    single item is unnecessary tap friction)
                  • 2+ → the original collapsible "Communities"
                    section with a scroll-clamped list inside.
                Single-community rendering still routes admins
                straight to the requests panel when there are
                pending joins waiting on them — same logic as the
                multi-community case. */}
            {!officesOnly && !jardinShell && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                {(() => {
                  const groups = groupsData?.groups ?? [];
                  if (groups.length === 1) {
                    const g = groups[0]!;
                    const pendingCount = pendingCounts?.byGroup[g.id] ?? 0;
                    const isAdminOfThis = g.myRole === "admin" || g.myRole === "hidden_admin";
                    return (
                      <button
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
                              style={{ background: "#C58A2A", color: "#1A1208", minWidth: 18, height: 18, padding: "0 5px" }}
                            >
                              {pendingCount}
                            </span>
                          )}
                          <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)" }} />
                        </div>
                      </button>
                    );
                  }
                  return (
                    <MenuSection emoji="🏘️" label={t("menu.communities")}>
                      {groups.length > 0 ? (
                        <div style={{ position: "relative" }}>
                          <div
                            className="space-y-1.5"
                            style={
                              groups.length > 3
                                ? {
                                    maxHeight: 196,
                                    overflowY: "auto",
                                    WebkitOverflowScrolling: "touch",
                                    paddingBottom: 8,
                                  }
                                : undefined
                            }
                          >
                            {groups.map((g) => {
                              const pendingCount = pendingCounts?.byGroup[g.id] ?? 0;
                              const isAdminOfThis = g.myRole === "admin" || g.myRole === "hidden_admin";
                              return (
                                <button
                                  key={g.slug}
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
                                        style={{ background: "#C58A2A", color: "#1A1208", minWidth: 18, height: 18, padding: "0 5px" }}
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
                          {groups.length > 3 && (
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
                  );
                })()}
                {/* People — find and connect with people, incl. Fellows
                    (1:1 connections + requests). The count badge shows incoming
                    fellow requests for beta users. */}
                <MenuRow
                  emoji="👥"
                  label={t("header.people")}
                  count={fellowRequestCount + newFromFriends}
                  onClick={() => navigate("/people")}
                />
                {/* Events — the upcoming schedule (services, gatherings,
                    practices), its own page now that it's off the home. */}
                <MenuRow
                  emoji="📅"
                  label={t("menu.events", { defaultValue: "Events" })}
                  onClick={() => navigate("/events")}
                />
              </div>
            )}

            {/* ── Navigate ── collapsible sections: Offices stands alone,
                Practices and Resources group their members; Letters shows
                when the viewer has access. */}
            <div className="px-5 py-4 space-y-1" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              {/* Book of Common Prayer — Phoebe-authored prayer-book
                  surfaces, all in-app. Daily Offices sits at the top
                  because the four liturgies are the primary entry
                  point users come back to; Prayers / Psalter /
                  Collects are reference texts they reach for less
                  often. The "BCP" prefix on the child labels is
                  redundant now that they live inside the BCP
                  section, so the i18n strings drop it. Promoted
                  above Practices since the office is the spine of
                  the daily rhythm — users open it first, the
                  contemplative practices are supplemental. */}
              {/* Each category is a single row that navigates to its own
                  list page (MenuHub style) rather than expanding inline. */}
              {!jardinShell && (
                <>
                  <MenuRow emoji="📖" label={t("menu.bcp", { defaultValue: "Book of Common Prayer" })} onClick={() => goCategory("/menu/bcp")} />
                  <MenuRow emoji="🕯️" label={t("menu.practices")} onClick={() => goCategory("/menu/practices")} />
                  <MenuRow emoji="🌅" label={t("menu.reflections", { defaultValue: "Reflections" })} onClick={() => goCategory("/menu/reflections")} />
                  {/* Podcasts content browser retired from the app — the daily
                      offices keep their audio; only the standalone Podcasts hub
                      is hidden. (Jardín's Spanish podcast stays below.) */}
                </>
              )}
              {/* El Jardín. For a SEALED Jardín account the drawer IS the El
                  Jardín experience — every Jardín feature is listed directly
                  (the hub, study tools, the Spanish Morning Prayer podcast,
                  groups, Bible lookup, leaderboard), since these are the only
                  surfaces a sealed account can use. A non-sealed beta user just
                  gets the single entry into the hub. */}
              {jardinShell ? (
                <>
                  <MenuRow emoji="🌿" label={t("jardin.title")} onClick={() => navigate("/menu/jardin")} />
                  <MenuRow emoji="📖" label={t("jardin.bible_study")} onClick={() => navigate("/jardin/bible-study")} />
                  <MenuRow emoji="👤" label={t("jardin.character_study")} onClick={() => navigate("/jardin/character-study")} />
                  <MenuRow emoji="🎤" label={t("jardin.sermon_notes")} onClick={() => navigate("/jardin/sermon-notes")} />
                  <MenuRow emoji="📅" label={t("jardin.next_sunday")} onClick={() => navigate("/jardin/next-sunday")} />
                  <MenuRow emoji="🎧" label={t("jardin.podcast")} onClick={() => navigate("/podcasts/show/jardin-oracion-matutina")} />
                  <MenuRow emoji="👥" label={t("jardin.groups")} onClick={() => navigate("/communities")} />
                  <MenuRow emoji="🔍" label={t("jardin.bible_lookup")} onClick={() => navigate("/jardin/bible")} />
                  <MenuRow emoji="🏆" label={t("jardin.leaderboard")} onClick={() => navigate("/jardin/leaderboard")} />
                </>
              ) : rawIsBeta ? (
                <MenuRow emoji="🌿" label="El Jardín" badge={t("menu.beta")} onClick={() => navigate("/menu/jardin")} />
              ) : null}
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
              {/* Phoebe Parish hidden from the menu per request. Restore by
                  removing the `false &&` guard. */}
              {false && rawIsBeta && !jardinShell && (
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

// ─── Way of Love drawer ──────────────────────────────────────────────────────
//
// A second slide-out drawer (opened from the header "Way of Love" pill) that
// shows progress across the seven practices as a checklist. Three DAILY cards
// (Turn, Learn, Pray) over four WEEKLY cards (Worship, Bless, Go, Rest). A done
// card is bordered + checked; an undone card is faded + unchecked. Each card
// taps through to that practice's detail sub-page (/home-beta/:section).
//
// Daily completion mirrors the Way of Love home's signals:
//   • Turn  — done whenever you've opened the app today (you're here).
//   • Learn — a scripture reading (an office, or a Forward/SSJE reflection) or
//             a CAC meditation read today.
//   • Pray  — an office or a contemplation sit today.
// Weekly completion = a logged practice-completion for that section this week.

function wolYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function wolSundayStart(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x;
}

function WayOfLoveDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const go = (path: string) => { onClose(); setLocation(path); };

  type CompletionRow = { section: string; localDate: string; weekStart: string };
  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user && open,
    staleTime: 15_000,
  });
  const officeQ = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled: !!user && open,
    staleTime: 30_000,
  });
  const contemplationQ = useQuery<{ todaySeconds?: number }>({
    queryKey: ["/api/me/contemplation-stats", wolYmd(new Date())],
    queryFn: () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(since.toISOString())}&tz=${encodeURIComponent(tz)}`);
    },
    enabled: !!user && open,
    staleTime: 60_000,
  });
  // Has the user set up a Rule of Life yet? (any saved Way of Love selections)
  const wolQ = useQuery<{ selections: Record<string, unknown> }>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol"),
    enabled: !!user && open,
    staleTime: 60_000,
  });

  const today = wolYmd(new Date());
  const weekStart = wolYmd(wolSundayStart(new Date()));
  const rows = compQ.data?.completions ?? [];
  const days = officeQ.data?.days ?? [];
  const lastOffice = days[days.length - 1];
  const officePrayedToday = !!lastOffice && lastOffice.ymd === today && (lastOffice.morning || lastOffice.evening);
  const reflectionReadToday = hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday();
  const contemplationDoneToday = (contemplationQ.data?.todaySeconds ?? 0) > 0;
  // iOS + Health connected: meditation logged in other apps (Insight Timer,
  // Calm, Apple Mindfulness) counts toward Pray too.
  const healthMindfulToday = useHealthMindfulToday();
  const hasRuleOfLife = Object.keys(wolQ.data?.selections ?? {}).length > 0;

  const turnDone = true; // opening the app counts as turning toward God today
  const learnDone = officePrayedToday || reflectionReadToday;
  const prayDone = officePrayedToday || contemplationDoneToday || healthMindfulToday;
  const weeklyDone = (section: string) => rows.some((r) => r.section === section && r.weekStart === weekStart);

  type WolCard = { key: string; emoji: string; label: string; done: boolean; route: string };
  const daily: WolCard[] = [
    { key: "turn", emoji: "🔄", label: t("wol.turn", { defaultValue: "Begin" }), done: turnDone, route: "/home-beta/turn" },
    { key: "learn", emoji: "📖", label: t("wol.learn", { defaultValue: "Learn" }), done: learnDone, route: "/home-beta/learn" },
    { key: "pray", emoji: "🙏", label: t("wol.pray", { defaultValue: "Pray" }), done: prayDone, route: "/home-beta/pray" },
  ];
  const weekly: WolCard[] = [
    { key: "worship", emoji: "⛪", label: t("wol.worship", { defaultValue: "Connect" }), done: weeklyDone("worship"), route: "/home-beta/worship" },
    { key: "bless", emoji: "🤲", label: t("wol.bless", { defaultValue: "Serve" }), done: weeklyDone("bless"), route: "/home-beta/bless" },
    { key: "go", emoji: "🌍", label: t("wol.go", { defaultValue: "Bridge" }), done: weeklyDone("go"), route: "/home-beta/go" },
    { key: "rest", emoji: "🌙", label: t("wol.rest", { defaultValue: "Rest" }), done: weeklyDone("rest"), route: "/home-beta/rest" },
  ];

  const renderCard = (c: WolCard) => (
    <button
      key={c.key}
      type="button"
      onClick={() => go(c.route)}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
      style={{
        background: c.done ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.06)",
        border: `1px solid ${c.done ? "rgba(168,197,160,0.7)" : "rgba(46,107,64,0.18)"}`,
        opacity: c.done ? 1 : 0.55,
      }}
    >
      <span className="text-lg leading-none w-6 text-center" aria-hidden>{c.emoji}</span>
      <span className="flex-1 text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{c.label}</span>
      <span
        aria-hidden
        style={{
          width: 20, height: 20, borderRadius: 999, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
          color: c.done ? "#0C1F12" : "transparent",
          background: c.done ? "#A8C5A0" : "transparent",
          border: c.done ? "none" : "1.5px solid rgba(143,175,150,0.4)",
        }}
      >
        {c.done ? "✓" : ""}
      </span>
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            key="wol-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-y-auto"
            style={{ width: "min(340px, 90vw)", background: "#040D06", borderLeft: "1px solid rgba(46,107,64,0.18)" }}
          >
            <div
              className="flex items-center justify-between px-5 pb-2"
              style={{ paddingTop: "var(--top-chrome)" }}
            >
              <span className="text-base font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
                {t("wol.title", { defaultValue: "Way of Love" })}
              </span>
              <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: "#8FAF96" }} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 pt-1 pb-8 space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {t("wol.daily", { defaultValue: "Daily" })}
                </p>
                {daily.map(renderCard)}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {t("wol.weekly", { defaultValue: "Weekly" })}
                </p>
                {weekly.map(renderCard)}
              </div>
              {/* A Rule of Life — the Way of Love's foundational commitment
                  (Bishop Michael Curry). Opens the in-app Rule of Life builder. */}
              <button
                type="button"
                onClick={() => go("/rule-of-life")}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.28)" }}
              >
                <span className="text-lg leading-none w-6 text-center" aria-hidden>📜</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {hasRuleOfLife
                      ? t("wol.rule_of_life", { defaultValue: "A Rule of Life" })
                      : t("wol.rule_of_life_setup", { defaultValue: "Set up your Rule of Life" })}
                  </span>
                  <span className="block text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {t("wol.rule_of_life_sub", { defaultValue: "Bishop Michael Curry" })}
                  </span>
                </span>
                <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.4)", flexShrink: 0 }} />
              </button>
              {/* The devotional — the 8-week Way of Love daily journey
                  (Scripture, a reflection question, a prayer for the day).
                  Beta-only by construction: this whole drawer opens only from
                  the beta "Way of Love" header pill. */}
              <button
                type="button"
                onClick={() => go("/way-of-love")}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.28)" }}
              >
                <span className="text-lg leading-none w-6 text-center" aria-hidden>🌱</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {t("wol.devotional", { defaultValue: "The devotional" })}
                  </span>
                  <span className="block text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {t("wol.devotional_sub", { defaultValue: "8-week journey" })}
                  </span>
                </span>
                <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.4)", flexShrink: 0 }} />
              </button>
              <button
                type="button"
                onClick={() => go("/home-beta")}
                className="w-full text-center text-xs font-semibold py-2 transition-opacity hover:opacity-80"
                style={{ color: "#A8C5A0", background: "none", border: "none", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("wol.open_home", { defaultValue: "Open your Way of Love →" })}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

// Header pill that replaces the old "Prayer list" pill: links to the
// /daily-progress page and shows four dots — one per daily anchor (Morning ·
// Reflect · Silence · Evening) — filled as each is kept. Self-contained so the
// rhythm queries only fire when the pill is actually rendered (signed-in).
// Prayer list now lives in the side Menu drawer.
function DailyProgressPill() {
  const { t } = useTranslation();
  const { morningDone, reflectDone, silenceDone, eveningDone, morningActive, reflectActive, silenceActive, eveningActive, gratitudeActive, examenActive, gratitudeDone, examenDone, stepsActive, stepsDone, customAnchors } = useRhythmState();
  // The core anchors the user keeps (morning/reflection/contemplation/evening —
  // each dropped when its pref is off), plus a dot for each optional practice
  // they added (gratitude, examen, the daily-steps goal) and each user-defined
  // custom practice. Keyed so the "just completed" pulse below tracks the right
  // dot even as the set changes.
  // Custom-practice dots sit in their time-of-day SLOT (not lumped at the end) —
  // a morning custom rides next to Morning, etc. — and a "not today" custom drops
  // out entirely, matching the cards + the reduced count.
  const cDots = (slot: string) =>
    customAnchors.filter((a) => a.slot === slot && !a.skipped).map((a) => ({ key: `custom-${a.id}`, done: a.done }));
  const dotDefs = [
    ...(morningActive ? [{ key: "morning", done: morningDone }] : []),
    ...cDots("morning"),
    ...(reflectActive ? [{ key: "reflect", done: reflectDone }] : []),
    ...(silenceActive ? [{ key: "silence", done: silenceDone }] : []),
    ...cDots("midday"),
    ...(gratitudeActive ? [{ key: "gratitude", done: gratitudeDone }] : []),
    ...(examenActive ? [{ key: "examen", done: examenDone }] : []),
    ...(stepsActive ? [{ key: "steps", done: stepsDone }] : []),
    ...cDots("afternoon"),
    ...(eveningActive ? [{ key: "evening", done: eveningDone }] : []),
    ...cDots("evening"),
  ];
  // Every practice for the day kept → ALL dots gently pulse colour (a staggered
  // "you held the whole day" wave).
  const allDone = dotDefs.length > 0 && dotDefs.every((d) => d.done);

  // Per-dot "just completed" pulse: when an activity flips done, its dot pulses
  // for ~5 minutes. We stamp the completion time per local day in localStorage
  // (so it survives the Layout remount on navigation) the moment a dot flips,
  // then pulse while now − stamp < PULSE_MS.
  const PULSE_MS = 5 * 60 * 1000;
  const today = new Date().toLocaleDateString("en-CA");
  const stampsRef = useRef<{ day: string; at: Record<string, number> } | null>(null);
  if (stampsRef.current === null) {
    let init: { day: string; at: Record<string, number> } = { day: today, at: {} };
    try {
      const raw = JSON.parse(localStorage.getItem("phoebe:dp-pulse") || "null");
      if (raw && raw.day === today && raw.at && typeof raw.at === "object") init = { day: today, at: raw.at };
    } catch { /* ignore */ }
    stampsRef.current = init;
  }
  const prevDoneRef = useRef<Record<string, boolean> | null>(null);
  const [, bumpPulse] = useState(0);
  const doneSig = dotDefs.map((d) => `${d.key}${d.done ? "1" : "0"}`).join("|");
  useEffect(() => {
    const st = stampsRef.current!;
    if (st.day !== today) { st.day = today; st.at = {}; }
    const prev = prevDoneRef.current;
    const cur: Record<string, boolean> = {};
    let changed = false;
    for (const d of dotDefs) {
      cur[d.key] = d.done;
      if (prev && d.done && prev[d.key] === false) { st.at[d.key] = Date.now(); changed = true; }
    }
    prevDoneRef.current = cur;
    if (changed) {
      try { localStorage.setItem("phoebe:dp-pulse", JSON.stringify(st)); } catch { /* ignore */ }
      bumpPulse((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSig, today]);

  const nowMs = Date.now();
  const recentlyDone = (key: string) => {
    const at = stampsRef.current?.at[key];
    return at != null && nowMs - at < PULSE_MS;
  };
  // While anything is pulsing, tick periodically so the pulse expires on its own.
  const anyPulsing = allDone || dotDefs.some((d) => recentlyDone(d.key));
  useEffect(() => {
    if (!anyPulsing) return;
    const id = setInterval(() => bumpPulse((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [anyPulsing]);

  return (
    <Link
      href="/daily-progress"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        letterSpacing: "-0.01em",
        background: "rgba(200,212,192,0.08)",
        color: "#C8D4C0",
        border: "1px solid rgba(46,107,64,0.3)",
      }}
      aria-label={t("header.daily_progress", { defaultValue: "Daily Progress" })}
    >
      {t("header.daily_progress", { defaultValue: "Daily Progress" })}
      {(() => {
        // Past 8 anchors a single row gets cramped — shrink the dots and wrap
        // them into two balanced rows so the pill stays tidy.
        const many = dotDefs.length > 8;
        const sz = many ? 5 : 6;
        const renderDot = (d: { key: string; done: boolean }, i: number) => {
          const pulse = allDone || recentlyDone(d.key);
          return (
            <span
              key={d.key}
              className={pulse ? "dp-dot-pulse" : undefined}
              style={{
                width: sz,
                height: sz,
                borderRadius: 999,
                display: "inline-block",
                background: d.done ? "rgba(110,180,130,0.95)" : "transparent",
                border: d.done ? "none" : "1px solid rgba(143,175,150,0.5)",
                animationDelay: allDone ? `${(i * 0.12).toFixed(2)}s` : undefined,
              }}
            />
          );
        };
        if (!many) {
          return <span className="inline-flex items-center gap-[3px]" aria-hidden>{dotDefs.map(renderDot)}</span>;
        }
        const mid = Math.ceil(dotDefs.length / 2);
        return (
          <span className="inline-flex flex-col" style={{ gap: 3 }} aria-hidden>
            <span className="inline-flex items-center gap-[3px]">{dotDefs.slice(0, mid).map((d, i) => renderDot(d, i))}</span>
            <span className="inline-flex items-center gap-[3px]">{dotDefs.slice(mid).map((d, i) => renderDot(d, mid + i))}</span>
          </span>
        );
      })()}
    </Link>
  );
}

// Has the user actually designed a daily routine? True once they've EITHER
// arranged their home (Customize → homeLayout) OR set up their offices via the
// daily-habit flow (/rule-of-life → office prefs, mirrored to getSideLevel).
// Drives the once-a-week "Design your daily routine" nudge on the splash —
// which stops for good the moment either is true.
function hasDesignedRoutine(u: { homeLayout?: unknown } | null | undefined): boolean {
  if (u?.homeLayout) return true;
  try { return getSideLevel("morning") !== null || getSideLevel("evening") !== null; }
  catch { return false; }
}
const ROUTINE_PROMPT_KEY = "phoebe:routine-prompt-last";
const ROUTINE_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // once a week

// Avatar base64 inlining is DISABLED. It stored each co-prayer's photo as a
// base64 data URL in localStorage to paint the face rail instantly on a cold
// open — but inlining several images bloats the entry to multiple MB, and
// parsing/holding + rendering that on every launch pressured WKWebView memory
// and was CRASHING the app on load. Faces now load from their URL (warmed via
// an <Image> preload, below). A future instant-paint approach should use a
// size-bounded native image cache, not localStorage base64.
async function fetchAvatarDataUrl(_url: string): Promise<string | null> {
  return null;
}

// OpeningSplash — the native app-open greeting. It's the EXACT same slide users
// see at the end of the slideshow (CommunityPrayedRecap: "you prayed for N
// people this week" + their faces), gently faded up, then faded out after 5s
// (or when you tap the arrow / anywhere). Native app only — never on web — and
// only once per app launch, never for logged-out visitors.
//
// One detour: a user who hasn't designed a daily routine gets a "Design your
// daily routine" slide AFTER the faces (Start → /rule-of-life, or Skip). It's
// shown at most once a week (ROUTINE_PROMPT_KEY) until they have a routine.
// Splash quote rotation — the third alternate (after the faces + "What's next").
// Each time the quote slide comes up it shows the next one in turn.
const SPLASH_QUOTES: Array<{ text: string; author: string }> = [
  { text: "You do not think yourself into a new way of living, you live yourself into a new way of thinking.", author: "Richard Rohr" },
  { text: "The proper habitat for truth is human relationships.", author: "Josef Pieper" },
  { text: "Attention is the rarest and purest form of generosity.", author: "Simone Weil" },
];

function OpeningSplash() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const native = isNativeShell();
  const [, splashGoTo] = useLocation();
  // The routine nudge sends people to /rule-of-life, which is beta-gated (it
  // bounces non-beta users to /dashboard). Match that gate exactly so the
  // "Design my routine" button never dead-ends.
  const { isBeta } = useBetaStatus();
  const [phase, setPhase] = useState<"in" | "routine" | "out" | "gone">(() => {
    if (typeof window === "undefined") return "gone";
    try { return sessionStorage.getItem("phoebe:splash-shown") ? "gone" : "in"; } catch { return "in"; }
  });
  const { data } = useQuery<{ people?: Array<{ id: number; name: string | null; avatarUrl: string | null; count?: number }>; total?: number }>({
    queryKey: ["/api/prayer-streak/community-prayed-month"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/community-prayed-month"),
    staleTime: 5 * 60_000,
    enabled: phase !== "gone" && !!user && native,
  });
  // Last session's faces, read SYNCHRONOUSLY from localStorage so the rail paints
  // INSTANTLY on a cold open — no waiting on the network or the React-Query
  // persister to rehydrate. The live query (above) refreshes them in the
  // background and the effect below re-saves the latest set for next launch.
  // Keyed by user id so a PREVIOUS account's faces can never flash for the next
  // person to sign in on a shared device (the cache outlives a no-logout close).
  type CachedFaces = { uid: number | null; people: Array<{ id: number; name: string | null; avatarUrl: string | null; avatarData?: string; count?: number }> };
  const [cachedFaces] = useState<CachedFaces>(() => {
    if (typeof window === "undefined") return { uid: null, people: [] };
    try {
      const rawStr = localStorage.getItem("phoebe:splash-faces");
      if (!rawStr) return { uid: null, people: [] };
      // A prior build inlined base64 avatar data here, which can bloat this entry
      // to several MB — parsing/holding that on every cold launch pressured
      // WKWebView memory and was crashing the app on load. Drop an oversized
      // entry (URL-only faces are ~1–2KB) and never carry base64 into the DOM.
      if (rawStr.length > 50_000) {
        try { localStorage.removeItem("phoebe:splash-faces"); } catch { /* ignore */ }
        return { uid: null, people: [] };
      }
      const raw = JSON.parse(rawStr);
      if (raw && typeof raw.uid === "number" && Array.isArray(raw.people)) {
        const people = raw.people.map((p: { id: number; name: string | null; avatarUrl: string | null; count?: number }) => (
          { id: p.id, name: p.name, avatarUrl: p.avatarUrl, count: p.count }
        ));
        return { uid: raw.uid, people };
      }
    } catch { /* ignore */ }
    return { uid: null, people: [] };
  });
  // The splash ALTERNATES between two blocks each app open — the faces and a
  // quote — instead of showing all at once. ("What's next" was the third block;
  // it was taken out of rotation because, when its card had nothing to show, it
  // fell back to the quote AFTER a settle delay, flashing the bare greeting
  // first.) A localStorage counter advances it; read + increment once on mount.
  const [splashOpenN] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem("phoebe:splash-alt") || "0");
      localStorage.setItem("phoebe:splash-alt", String(n + 1));
      return n;
    } catch { return 0; }
  });
  const splashVariant = splashOpenN % 3;     // 0 = faces, 1 = quote, 2 = fellows
  const hour = new Date().getHours();
  const showFaces = splashVariant === 0;
  // The quote shows IMMEDIATELY on its open — its content is a static line, ready
  // on the first render, so the greeting never flashes ahead of it and nothing
  // waits to "settle".
  const showQuote = splashVariant === 1;
  // Third in rotation: your fellows' progress for the day (faces + dots).
  const showFellows = splashVariant === 2;
  // The quote advances each time the quote slide comes up (every third open).
  const quote = SPLASH_QUOTES[Math.floor(splashOpenN / 3) % SPLASH_QUOTES.length]!;
  // Fellows' today progress — only fetched on the fellows variant.
  const { data: walkData } = useQuery<{ companions: Array<{ userId: number; name: string | null; avatarUrl: string | null; progress: { anchors: Array<{ key: string; done: boolean }>; keptCount: number; totalCount: number; allKept: boolean } | null; progressLocked?: boolean }> }>({
    queryKey: ["/api/walk"],
    queryFn: () => apiRequest("GET", "/api/walk"),
    staleTime: 60_000,
    enabled: phase !== "gone" && !!user && native && showFellows,
  });
  useEffect(() => {
    if (data === undefined) return;
    let cancelled = false;
    (async () => {
      const people = data.people ?? [];
      if (!user || people.length === 0) {
        try { localStorage.removeItem("phoebe:splash-faces"); } catch { /* ignore */ }
        return;
      }
      // Re-use any base64 we already inlined for the same avatar URL (avatars
      // rarely change), so we only fetch the ones we're missing.
      const have = new Map<string, string>();
      for (const p of cachedFaces.people) if (p.avatarUrl && p.avatarData) have.set(p.avatarUrl, p.avatarData);
      const enriched = await Promise.all(people.map(async (p) => {
        if (!p.avatarUrl) return { ...p, avatarData: undefined };
        const existing = have.get(p.avatarUrl);
        if (existing) return { ...p, avatarData: existing };
        const inlined = await fetchAvatarDataUrl(p.avatarUrl);
        return { ...p, avatarData: inlined ?? undefined };
      }));
      if (cancelled) return;
      try { localStorage.setItem("phoebe:splash-faces", JSON.stringify({ uid: user.id, people: enriched })); } catch { /* ignore (quota) */ }
    })();
    return () => { cancelled = true; };
  }, [data, user, cachedFaces]);
  // Warm the avatar images the moment the co-prayer data lands, so the face
  // rail doesn't flash white circles while each one downloads. The rendered
  // <img>s reuse the same in-flight/cached fetch (and carry a green placeholder
  // background as a belt-and-suspenders, so they never read as white).
  useEffect(() => {
    // Warm BOTH the cached faces (what paints on a cold open, instantly from
    // localStorage) and the live set the moment it lands — so neither flashes a
    // white circle. De-dup the urls so we don't kick off the same fetch twice.
    const urls = new Set<string>();
    for (const p of cachedFaces.people) if (p.avatarUrl) urls.add(p.avatarUrl);
    for (const p of data?.people ?? []) if (p.avatarUrl) urls.add(p.avatarUrl);
    for (const url of urls) { const img = new Image(); img.decoding = "async"; img.src = url; }
  }, [data, cachedFaces]);
  // Is the "Design your daily routine" nudge due? Only when the user has no
  // routine yet AND we haven't shown it in the last week.
  const routineDue = (): boolean => {
    // Disabled per request — no pop-up inviting users to configure their
    // routine. The splash fades straight to home; Customize lives on the Daily
    // progress page (top-right pill) for anyone who wants it.
    return false;
  };
  // Leaving the faces — detour to the routine slide if due (stamping the
  // week), otherwise fade out to the home as before. The functional updater
  // makes this a no-op once we've already left "in", so a late-firing timer
  // can't yank the routine slide away or re-stamp.
  const advanceFromFaces = () => {
    const due = routineDue();
    if (due) { try { localStorage.setItem(ROUTINE_PROMPT_KEY, String(Date.now())); } catch { /* ignore */ } }
    setPhase((cur) => (cur !== "in" ? cur : due ? "routine" : "out"));
  };

  // Start the 5s auto-dismiss once auth has resolved (user present) — NOT on a
  // bare mount. On a native cold start `user` is null while /api/auth/me loads;
  // stamping the once-per-launch flag then would burn the splash before it ever
  // renders (the render guard needs `user`). startedRef makes it fire exactly
  // once, the moment user first appears.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || phase === "gone" || !native || !user) return;
    startedRef.current = true;
    try { sessionStorage.setItem("phoebe:splash-shown", "1"); } catch { /* ignore */ }
    // Hold the greeting a beat longer (7.5s) so it doesn't snap away.
    const id = setTimeout(() => advanceFromFaces(), 7500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  // Unmount is driven by the fade-out's onAnimationComplete (below) so it lands
  // exactly when opacity hits 0 — not a racing timeout that could snap the
  // splash back to visible for a frame (the "flash" on close). This timeout is
  // only a safety net in case the animation callback never fires.
  useEffect(() => {
    if (phase !== "out") return;
    // Do NOT fire phoebe:home-reveal here: the splash's own green backdrop is
    // already fading to the home, so a second green LoadReveal curtain sliding
    // in on top just reads as a flash. The splash fade IS the reveal.
    const id = setTimeout(() => setPhase("gone"), 1400);
    return () => clearTimeout(id);
  }, [phase]);

  // Once the co-prayer query resolves with NOBODY, there's nothing to show —
  // dismiss right away rather than dwelling on a bare greeting. This also kills
  // the old "You are held in prayer" blessing that used to flash on every load
  // while the query was still in flight (people=[] during loading).
  useEffect(() => {
    // Once the live query RESOLVES with nobody, dismiss — even if we have cached
    // faces. The cache is only a cold-open instant-paint stand-in; the moment the
    // account-scoped query says "nobody this month", that's the truth, so we must
    // not dwell 5s on last session's stale faces (or a "prayed for you" line that
    // no longer holds). While data is still loading (undefined) the cache keeps
    // painting and the 5s timer runs as normal.
    // Only the FACES variant has nothing to show without co-prayers; the
    // "What's next" and quote variants always have their own content, so an
    // empty co-prayer query must NOT dismiss those.
    if (showFaces && phase === "in" && data !== undefined && (data.people?.length ?? 0) === 0) {
      advanceFromFaces();
    }
    // Fellows variant with no walking companions → nothing to show, dismiss.
    if (showFellows && phase === "in" && walkData !== undefined && (walkData.companions?.length ?? 0) === 0) {
      advanceFromFaces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, walkData, phase, showFaces, showFellows]);

  // Web (or logged out) → no splash at all.
  if (!native || !user || phase === "gone") return null;

  const greeting = hour < 12
    ? t("splash.morning", { defaultValue: "Good morning" })
    : hour < 17
      ? t("splash.afternoon", { defaultValue: "Good afternoon" })
      : t("splash.evening", { defaultValue: "Good evening" });
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "";

  return (
    <motion.div
      // Tapping the backdrop advances from the faces (to the routine slide or
      // home); on the routine slide itself only Start / Skip act, so a stray
      // tap can't dismiss it.
      onClick={() => { if (phase === "in") advanceFromFaces(); }}
      // The backdrop is opaque from the very first frame — so the recap is the
      // first thing shown (no flash of the home behind it). Only the fade-OUT
      // animates; the recap's own content gently rises in on top.
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "out" ? 0 : 1 }}
      transition={{ duration: phase === "out" ? 0.9 : 0, ease: "easeInOut" }}
      onAnimationComplete={() => { if (phase === "out") setPhase("gone"); }}
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{
        background: "#0C1F12", zIndex: 200, isolation: "isolate", pointerEvents: phase === "out" ? "none" : "auto",
        paddingTop: "calc(var(--safe-top) + 24px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)", overflowY: "auto",
      }}
    >
      <AnimatedBackground base="#0C1F12" variant="pronounced" />
      {phase === "routine" ? (
        // Design-your-daily-routine nudge — shown after the faces to users who
        // haven't set up a routine yet (once a week until they have one).
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative flex flex-1 flex-col items-center justify-center text-center w-full"
          style={{ maxWidth: 420 }}
        >
          <div className="text-5xl mb-5">🌿</div>
          <h2 className="px-4 mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {t("splash.routine_title", { defaultValue: "Design your daily routine" })}
          </h2>
          <p className="px-7 text-[15.5px] leading-relaxed mb-9" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
            {t("splash.routine_subtitle", { defaultValue: "A simple rhythm of prayer, shaped to your day — morning, evening, a moment of stillness. It takes about a minute." })}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPhase("out"); splashGoTo("/rule-of-life"); }}
            className="rounded-full px-9 py-3.5 text-[16px] font-semibold active:scale-[0.98]"
            style={{ background: "rgba(46,107,64,0.92)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("splash.routine_start", { defaultValue: "Design my routine" })} →
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPhase("out"); }}
            className="mt-5 text-[14px] font-medium active:opacity-70"
            style={{ background: "none", border: "none", color: "rgba(143,175,150,0.78)", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}
          >
            {t("splash.routine_skip", { defaultValue: "Skip for now" })}
          </button>
        </motion.div>
      ) : (
      <>
      {/* Greeting — on the faces variant only. The quote stands on its own (no
          "Good evening" flashing ahead of it). */}
      {!showQuote && (
        <p
          className="text-center px-8 mb-8 relative"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}
        >
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </p>
      )}
      {showFaces && (() => {
        // Prefer the live set; fall back to last session's cached faces so the
        // rail paints instantly on a cold open (no network wait) — but ONLY when
        // the cache belongs to THIS user (never flash a prior account's faces).
        const cached = cachedFaces.uid === user.id ? cachedFaces.people : [];
        const people = (data?.people && data.people.length > 0) ? data.people : cached;
        // Base64-inlined avatars from a prior cold open, keyed by URL — so even the
        // freshly-fetched live people paint from the cached photo (zero network
        // wait) when we already have it. New faces fall back to the live URL and
        // get inlined for next launch by the effect above.
        const base64ByUrl = new Map<string, string>();
        for (const p of cachedFaces.people) if (p.avatarUrl && p.avatarData) base64ByUrl.set(p.avatarUrl, p.avatarData);
        // Nothing yet (still loading) or nobody → render no content. The empty
        // case is handled by the dismiss effect above; we never flash the old
        // "held in prayer" blessing or a bare greeting here.
        if (people.length === 0) return null;
        const fn = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "Someone";
        const visible = people.slice(0, 7);
        const overflow = Math.max(0, people.length - visible.length);
        // Each face (and the total line) FADES UP in a gentle stagger — the
        // profile pictures rise in one after another rather than popping in.
        const faceVariant = {
          hidden: { opacity: 0, y: 14 },
          show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
        };
        return (
          <motion.div
            className="flex flex-col items-center w-full relative"
            style={{ maxWidth: 420 }}
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } } }}
          >
            {/* The garden members who prayed with you this month — a single
                horizontal overlapping rail (capped, with a +N chip), not a grid. */}
            <div className="flex items-center justify-center -space-x-3">
              {visible.map((p) => (
                p.avatarUrl ? (
                  <motion.img key={p.id} variants={faceVariant} src={base64ByUrl.get(p.avatarUrl) ?? p.avatarUrl} alt={fn(p.name)} loading="eager" decoding="async" onError={(e) => { const img = e.currentTarget; if (p.avatarUrl && img.src !== p.avatarUrl) img.src = p.avatarUrl; }} className="w-12 h-12 rounded-full object-cover" style={{ border: "2px solid #0C1F12", backgroundColor: "#1A4A2E" }} />
                ) : (
                  <motion.div key={p.id} variants={faceVariant} className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid #0C1F12" }}>
                    {(p.name ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?"}
                  </motion.div>
                )
              ))}
              {overflow > 0 && (
                <motion.div variants={faceVariant} className="w-12 h-12 rounded-full flex items-center justify-center text-[12px] font-semibold" style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", border: "2px solid #0C1F12" }}>
                  +{overflow}
                </motion.div>
              )}
            </div>
            <motion.p variants={faceVariant} className="text-[15px] mt-5 text-center" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
              {(() => {
                const n = data?.total ?? people.length;
                return t("splash.prayed_with_you_total", {
                  count: n,
                  defaultValue: `You prayed with ${n} ${n === 1 ? "person" : "people"} this month`,
                });
              })()}
            </motion.p>
          </motion.div>
        );
      })()}
      {/* Quote — the other alternate. A single contemplative line + attribution,
          centred; it rises in immediately on a quote open (no greeting flash,
          no settle delay). */}
      {showQuote && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full text-center"
          style={{ maxWidth: 460 }}
        >
          <p
            className="px-4"
            style={{ color: "#F0EDE6", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 23, lineHeight: 1.5 }}
          >
            “{quote.text}”
          </p>
          <p
            className="mt-5 text-[13px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {quote.author}
          </p>
        </motion.div>
      )}
      {/* Fellows' progress for the day — up to 5, each with picture, name + dots.
          Third in the splash rotation. */}
      {showFellows && (() => {
        const companions = (walkData?.companions ?? []).slice(0, 5);
        if (companions.length === 0) return null; // dismiss effect handles the empty case
        const fn = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "Someone";
        const rowV = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } } };
        return (
          <motion.div
            className="flex flex-col items-stretch w-full relative"
            style={{ maxWidth: 380 }}
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } } }}
          >
            <motion.p variants={rowV} className="text-center text-[12px] font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("splash.fellows_today", { defaultValue: "Your fellows today" })}
            </motion.p>
            {companions.map((c) => {
              const p = c.progress;
              return (
                <motion.div key={c.userId} variants={rowV} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 mb-2" style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.3)" }}>
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt={fn(c.name)} className="w-10 h-10 rounded-full object-cover shrink-0" style={{ border: "1.5px solid #0C1F12", backgroundColor: "#1A4A2E" }} />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0C1F12" }}>
                      {(c.name ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="flex-1 min-w-0 truncate text-[15px] font-medium" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{fn(c.name)}</span>
                  {p && p.anchors.length > 0 ? (
                    <span className="inline-flex items-center gap-[3px] shrink-0" aria-hidden>
                      {p.anchors.map((a) => (
                        <span key={a.key} style={{ width: 6, height: 6, borderRadius: 999, display: "inline-block", background: a.done ? "rgba(110,180,130,0.95)" : "transparent", border: a.done ? "none" : "1px solid rgba(143,175,150,0.5)" }} />
                      ))}
                    </span>
                  ) : (
                    <span className="text-[11px] shrink-0" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}>—</span>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        );
      })()}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); advanceFromFaces(); }}
        aria-label="Continue"
        style={{ position: "absolute", bottom: "6vh", background: "none", border: "none", cursor: "pointer", padding: 16, zIndex: 1 }}
      >
        <span style={{ color: "#8FAF96", fontSize: 30, lineHeight: 1 }}>→</span>
      </button>
      </>
      )}
    </motion.div>
  );
}

// One-time "green curtain" reveal on cold app load: a full-screen wash in the
// home's own green that fades AND slides DOWN as the content rises into view —
// smoothing the seam between the native launch ("Be together with Phoebe") and
// the home. Plays once per app session (the module flag resets on reload).
function LoadReveal() {
  const [show, setShow] = useState(false);
  const [token, setToken] = useState(0); // bump to (re)start the animation
  // No longer plays on arriving home — that green overlay fade on the home was
  // removed per request. It only plays when explicitly asked (phoebe:home-reveal).
  useEffect(() => {
    const play = () => { setShow(true); setToken((n) => n + 1); };
    window.addEventListener("phoebe:home-reveal", play);
    return () => window.removeEventListener("phoebe:home-reveal", play);
  }, []);
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => setShow(false), 475);
    return () => window.clearTimeout(id);
  }, [show, token]);
  if (!show) return null;
  return (
    <motion.div
      key={token}
      aria-hidden
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 0, y: "22%" }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0"
      style={{ zIndex: 150, pointerEvents: "none", background: "#091A10" }}
    />
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { t } = useTranslation();
  // Beta testers get the "Way of Love" header pill (opens the progress
  // drawer) in place of the "Prayer list" pill; everyone else keeps Prayer
  // list. Gated on isBeta so previewing the regular experience (beta-view
  // toggle off) falls back to the Prayer list pill and hides the Way of Love
  // entirely — non-beta users never see the pill.
  // Offices-only tier: no personal prayer requests + no garden. The
  // header "Prayer list" pill links into a surface they can't use, so
  // we hide it for that tier. Drawer filtering happens above.
  const officesOnly = user?.accessTier === "offices-only";
  // Jardín shell — hide Phoebe's daily-progress pill (the office/reflect/
  // silence rhythm) for portal accounts; it's not part of the Jardín day.
  const headerJardinShell = isJardinSealed(user);

  // Best-effort sync of today's external Apple Health mindful minutes to the
  // server from the app shell (so it runs on nearly every page), giving the
  // ~7pm contemplation-goal nudge a fresh value even when the user never opens
  // the Contemplation page. No-ops on web / when Health is unavailable.
  useSyncHealthMinutes();

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: "#091A10" }}>
      <LoadReveal />
      <OpeningSplash />
      <header
        className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pb-2 md:pb-5 flex justify-between items-center"
        style={{
          background: "#091A10",
          // Clear the status-bar clock, not the whole Dynamic Island. "Phoebe"
          // (left) + the controls (right) sit in the corners, away from the
          // centred Island, so they don't need the full safe-area-inset-top —
          // var(--top-chrome) caps it (see index.css) and reclaims the gap.
          paddingTop: "var(--top-chrome)",
        }}
      >
        <div className="flex items-center gap-6">
          <Link
            // The "Phoebe" wordmark is "home". For a signed-in user that's the
            // dashboard; for a signed-out visitor (who can still reach Layout-
            // wrapped public surfaces — /bcp, public prayer feeds, a /p/:token
            // share link) it's the welcome chooser at "/". Without this the
            // wordmark sent logged-out users to /dashboard, which only bounced
            // them back to "/" via Dashboard's own guard — a visible double hop.
            href={user ? "/dashboard" : "/"}
            onClick={() => window.dispatchEvent(new CustomEvent("phoebe:reset-filter"))}
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
          >
            <span className="text-3xl font-bold transition-colors" style={{ fontSize: "2.0625rem", letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            {/* Daily-progress pill — sits just left of Menu, replacing the
                old Prayer-list pill (which now lives in the Menu drawer). The
                four dots reflect today's rhythm; tapping opens /daily-progress.
                Hidden for the offices-only tier to match the prior pill. */}
            {!officesOnly && !headerJardinShell && <DailyProgressPill />}
            <button
              onClick={() => { playOpeningSwell(0); setDrawerOpen(true); }}
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
