import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, ChevronRight, ChevronDown } from "lucide-react";
import { useBetaStatus } from "@/hooks/useDemo";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { triggerCategoryTransition } from "@/components/PageFadeOverlay";
import { playOpeningSwell } from "@/lib/amenFeedback";
import { hasReadCacToday, hasReadFddToday, hasReadSsjeToday } from "@/lib/cacReadState";
import { useRhythmState } from "@/hooks/useRhythmState";
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

            {/* ── Prayer list ── moved here from the header pill (which now
                opens the Way of Love drawer). Sits above Communities; hidden
                for offices-only, who have no personal list. */}
            {!officesOnly && !jardinShell && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                <MenuRow emoji="🙏" label={t("menu.prayer_list", { defaultValue: "Prayer list" })} onClick={() => navigate("/prayer-list")} />
              </div>
            )}

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
                {/* People — find and connect with people. Moved here from the
                    former header pill; lives under the user's communities. */}
                <MenuRow
                  emoji="👥"
                  label={t("header.people")}
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
                  <MenuRow emoji="🎧" label={t("menu.audio", { defaultValue: "Audio" })} onClick={() => goCategory("/menu/audio")} />
                  {showLetters && (
                    <MenuRow emoji="📮" label={t("menu.letters")} badge={t("menu.beta")} onClick={() => navigate("/letters")} />
                  )}
                  {/* Beta Messages — unlimited 1:1 messaging between beta
                      users. Beta-gated (the server 403s non-beta anyway). */}
                  {rawIsBeta && (
                    <MenuRow emoji="✉️" label={t("menu.messages", { defaultValue: "Messages" })} badge={t("menu.beta")} onClick={() => navigate("/messages")} />
                  )}
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
              style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
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
  const { morningDone, reflectDone, silenceDone, eveningDone, gratitudeActive, examenActive, gratitudeDone, examenDone } = useRhythmState();
  // Four core anchors, plus a dot for each optional practice the user added.
  const dots = [
    morningDone, reflectDone, silenceDone, eveningDone,
    ...(gratitudeActive ? [gratitudeDone] : []),
    ...(examenActive ? [examenDone] : []),
  ];
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
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {dots.map((done, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              display: "inline-block",
              background: done ? "rgba(110,180,130,0.95)" : "transparent",
              border: done ? "none" : "1px solid rgba(143,175,150,0.5)",
            }}
          />
        ))}
      </span>
    </Link>
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
            <span className="text-3xl font-bold transition-colors" style={{ letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-2">
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
