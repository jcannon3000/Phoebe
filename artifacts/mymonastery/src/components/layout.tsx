import { ReactNode, useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, LogOut, LogIn, ChevronRight, ChevronDown, Plus } from "lucide-react";
import { FROST, FROST_DARK } from "@/lib/frost";
import { LEAF_PHOTOS, SPLASH_PHOTO } from "@/lib/earthPhotos";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePilotMode } from "@/hooks/usePilotMode";
import { usePrayerRequestsEnabled } from "@/hooks/usePrayerRequests";
import { useGuestMode } from "@/hooks/useGuestMode";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { isFirstOpen } from "@/lib/firstOpen";
import { FirstOpenOnboarding } from "@/components/FirstOpenOnboarding";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import splashForestPath from "@/assets/splash/forest-path.jpg";
import { triggerCategoryTransition } from "@/components/PageFadeOverlay";
import { playOpeningSwell } from "@/lib/amenFeedback";
import { hasReadCacToday, hasReadFddToday, hasReadSsjeToday } from "@/lib/cacReadState";
import { sortCardsByLearnedOrder } from "@/lib/practiceOrderLearning";
import { useRhythmState } from "@/hooks/useRhythmState";

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
  const prayerRequestsEnabled = usePrayerRequestsEnabled();
  const { isPilot } = usePilotMode();
  // PUBLIC no-login version: the guest drawer is the calm shell — no profile
  // block, no Community/Prayer-list/Events section (BCP · Practices ·
  // Reflections · Settings · About stay), and the footer becomes the QUIET
  // "Sign in" that is the public version's only auth surface (beta testers
  // reach the full app through it). See memory "project_public_no_login".
  const { isGuest } = useGuestMode();
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

  // Community membership drives which social rows show. (Fellows removed
  // 2026-07-23 — the 1:1 fellow graph, its request badge, and the 🙌
  // encouragement badge are gone; community membership is the only signal now.)
  const hasGroup = (groupsData?.groups?.length ?? 0) > 0;

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

            {/* ── Profile / Sign in ── an ACCOUNT-LESS session (signed out, or
                the anonymous device user — whose synthetic anon-…@device
                address must never show) gets a Sign in / Sign up block that
                names the reason: saving the rhythm. Real accounts keep the
                profile row. */}
            {(!user || user.isAnonymous) && (
              <div className="px-5 pb-5" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                <button
                  type="button"
                  onClick={() => navigate("/signin")}
                  className="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-80"
                  style={{ background: "transparent", cursor: "pointer" }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <LogIn size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("menu.sign_in_up", { defaultValue: "Sign in / Sign up" })}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                      {t("menu.sign_in_up_sub", { defaultValue: "Keep your rhythm and progress on every device." })}
                    </p>
                  </div>
                </button>
              </div>
            )}
            {!!user && !user.isAnonymous && (
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
            )}

            {/* Shape your routine (the rule-of-life / customizer). Daily progress
                is reached from the header pill again, so it's no longer a menu
                row. Same visibility: not the offices-only tier or pilot. */}
            {!officesOnly && !isPilot && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                <MenuRow
                  emoji="📜"
                  label={t("menu.shape_routine", { defaultValue: "Shape your routine" })}
                  onClick={() => navigate("/rule-of-life")}
                />
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
            {/* GUESTS have no social section at all — no Community/Fellows, no
                Prayer list, no Events (the public version carries none). */}
            {!officesOnly && !isGuest && (
              <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                {/* Community — the communities you're in. Hidden entirely in
                    pilot (personal-only) and until you've joined one. */}
                {!isPilot && hasGroup && (
                <MenuRow
                  emoji="🏘️"
                  label={t("menu.community", { defaultValue: "Community" })}
                  onClick={() => navigate("/communities")}
                />
                )}
                {/* Prayer list — others' requests to pray through. Hidden until
                    you're in a community (a solo new user has none). Pilot always
                    gets it — it's their personal list. Gated behind the
                    prayer-requests feature (pilot-group-only, 2026-07-22). */}
                {prayerRequestsEnabled && (hasGroup || isPilot) && (
                <MenuRow
                  // Medium skin tone (owner) — the app's own convention for
                  // this emoji everywhere else; this row was the bare one.
                  emoji="🙏🏽"
                  label={t("menu.prayer_list", { defaultValue: "Prayer list" })}
                  onClick={() => navigate("/prayer-list")}
                />
                )}
                {/* Events — the upcoming schedule. Hidden until you're in a
                    community (events come from your groups). Never in pilot. */}
                {hasGroup && !isPilot && (
                <MenuRow
                  emoji="📅"
                  label={t("menu.events", { defaultValue: "Events" })}
                  onClick={() => navigate("/events")}
                />
                )}
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
              <MenuRow emoji="📖" label={t("menu.bcp", { defaultValue: "Book of Common Prayer" })} onClick={() => goCategory("/menu/bcp")} />
              <MenuRow emoji="🕯️" label={t("menu.practices")} onClick={() => goCategory("/menu/practices")} />
              <MenuRow emoji="🌅" label={t("menu.reflections", { defaultValue: "Reflections" })} onClick={() => goCategory("/menu/reflections")} />
              {/* Novenas hidden for all users per owner request (2026-08-07)
                  — see useRhythmState.ts's NOVENAS_ENABLED comment. */}
              {/* Learn — the courses tab (Centering Prayer + The Spiritual
                  Journey on web; The Way of Love everywhere). Everyone sees
                  it, guests included — courses are part of the light
                  experience. */}
              <MenuRow emoji="🎓" label={t("menu.learn", { defaultValue: "Learn" })} onClick={() => goCategory("/menu/learn")} />
            </div>

            {/* ── Account + info footer ── */}
            <div className="px-5 py-3 space-y-1" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              {/* Invite — everyone sees it, guests included; sharing Phoebe
                  doesn't need an account. */}
              <MenuRow
                emoji="💌"
                label={t("menu.invite", { defaultValue: "Invite" })}
                onClick={() => navigate("/invite/share")}
              />
              <MenuRow emoji="⚙️" label={t("menu.settings")} onClick={() => navigate("/settings")} />
              {showAdminTools && (
                <MenuRow emoji="🔧" label={t("menu.admin_tools")} onClick={() => navigate("/admin/tools")} />
              )}
              {/* El Jardín is NOT a main-menu entry — it lives as an option
                  INSIDE the Admin Tools page (/admin/tools). */}
              <MenuRow emoji="ℹ️" label={t("menu.about")} onClick={() => navigate("/about")} />
            </div>

            {/* ── Sign out / (signed-out guest) quiet Sign in ── the guest row
                is the public version's ONLY auth surface — a beta tester's
                door into the full app, styled exactly as quietly as Sign out.
                Keyed on `user` too, so a widened SIGNED-IN guest keeps Sign
                out. */}
            <div className="px-5 py-4 flex-1 flex flex-col justify-end">
              {/* Account-less sessions (signed out OR the anonymous device
                  user) have nothing to sign OUT of — the quiet row is a second
                  Sign in / Sign up door instead. */}
              {!user || user.isAnonymous ? (
                <button
                  onClick={() => navigate("/signin")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm"
                  style={{ color: "#8FAF96" }}
                  onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
                >
                  <LogIn size={15} />
                  {t("menu.sign_in_up", { defaultValue: "Sign in / Sign up" })}
                </button>
              ) : (
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
              )}
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
  const hasRuleOfLife = Object.keys(wolQ.data?.selections ?? {}).length > 0;

  const turnDone = true; // opening the app counts as turning toward God today
  const learnDone = officePrayedToday || reflectionReadToday;
  const prayDone = officePrayedToday || contemplationDoneToday;
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

// Header pill that links to /daily-progress and shows dots — one per daily
// anchor (Morning · Reflect · Silence · Evening, plus every optional/custom
// practice the reader added) — filled as each is kept. Owner: "make the top
// pill be Daily Progress with dots again" (reverting an earlier "no more
// dots, just the label" simplification). Self-contained so the rhythm
// queries only fire when the pill is actually rendered (signed-in).
function DailyProgressPill() {
  const { t } = useTranslation();
  const { morningDone, eveningDone, morningActive, eveningActive, morningContemplationActive, morningContemplationDone, eveningContemplationActive, eveningContemplationDone, silenceGoalCardActive, silenceGoalCardDone, reflections, examenActive, examenDone, listeningActive, listeningDone, readingActive, readingDone, podcastsActive, podcastsDone, walkActive, walkDone, complineActive, complineDone, cobreatheStandaloneActive, cobreatheDone, visioActive, visioDone, prayerListDone, intentionsTotalCount, customAnchors, novenaActive, novenaDone, novenaReplacesMorning, novenaReplacesEvening, morningExtraLevel, eveningExtraLevel, morningExtraDone, eveningExtraDone } = useRhythmState();
  // The pill can be turned off in Settings → Home display ("Daily progress
  // dots"). Read the flag and react to live toggles (same-tab custom event +
  // cross-tab storage event) so flipping it in settings updates the header at
  // once, no reload.
  const [pillHidden, setPillHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("phoebe:hide-daily-progress-pill") === "1"; } catch { return false; }
  });
  useEffect(() => {
    const sync = () => { try { setPillHidden(localStorage.getItem("phoebe:hide-daily-progress-pill") === "1"); } catch { /* ignore */ } };
    window.addEventListener("phoebe:prefs-changed", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("phoebe:prefs-changed", sync); window.removeEventListener("storage", sync); };
  }, []);
  // The core anchors the user keeps (morning/reflection/contemplation/evening —
  // each dropped when its pref is off), plus a dot for each optional practice
  // they added (examen, the prayer-list card) and each user-defined
  // custom practice. Keyed so the "just completed" pulse below tracks the right
  // dot even as the set changes.
  // Custom-practice dots sit in their time-of-day SLOT (not lumped at the end) —
  // a morning custom rides next to Morning, etc. — and a "not today" custom drops
  // out entirely, matching the cards + the reduced count.
  const cDots = (slot: string) =>
    customAnchors.filter((a) => a.slot === slot && !a.skipped).map((a) => ({ key: `custom-${a.id}`, done: a.done }));
  // The prayer-list dot — always "anytime", like the card: the list left the
  // morning/evening sides (owner, 2026-08-26).
  const prayerListSlot = "anytime";
  const plDot = (slot: string) =>
    intentionsTotalCount > 0 && prayerListSlot === slot
      // Same signal the card uses — walking the slideshow, not a per-prayer
      // tally. Counting here would have re-created the disagreement the card
      // just lost: a dot stuck at "not yet" after a complete walk that skipped
      // one prayer.
      ? [{ key: "prayer-list", done: prayerListDone }]
      : [];

  const dotDefsBuilt = [
    // A novena in "replace" mode takes over this slot's dot entirely — mirrors
    // DailyProgressBody's rawCards replace-mode entries (same gates).
    ...(novenaReplacesMorning && novenaActive ? [{ key: "novena-morning", done: novenaDone }] : []),
    ...(morningActive && !novenaReplacesMorning ? [{ key: "morning", done: morningDone }] : []),
    /**
     * The side's EXTRA practice — the fourth instance of this list drifting
     * behind the home's cards, caught by audit rather than a screenshot this
     * time: DailyProgressBody renders extra-morning/extra-evening cards
     * whenever a side carries a second practice, and this pill had no dot for
     * either. Same gate the cards use (a non-null level; extraModesFor already
     * suppressed mode collisions upstream in useRhythmState).
     */
    ...(morningExtraLevel ? [{ key: "extra-morning", done: morningExtraDone }] : []),
    // Reflection is the DEFAULT second dot (right after Morning) — ahead of any
    // custom morning practice — unless the user reorders their rhythm.
    ...reflections.map((r) => ({ key: `reflect-${r.source}`, done: r.done })),
    ...cDots("morning"),
    // Contemplation is PER SIDE (a Morning + an Evening sit) — one dot each,
    // matching the two home cards, not a single aggregate "silence" dot (that
    // under-counted: 2 dots for 3 cards). Morning sits here; evening near Evening.
    ...(morningContemplationActive ? [{ key: "contemplation-morning", done: morningContemplationDone }] : []),
    ...plDot("morning"),
    // The silence GOAL card exactly as the home renders it — the solo card, OR
    // the goal-progress card riding alongside per-side Creation Prayer cards
    // (whose own dots are the per-side entries above).
    ...(silenceGoalCardActive ? [{ key: "silence", done: silenceGoalCardDone }] : []),
    // Prayer List DOES get a dot. That exclusion was written when the list had
    // its own dedicated block at the bottom of the home; that block was removed
    // and the Next/Done row is now the only surface it has — so leaving it out
    // here under-counted the pill by one (reported: five dots, six practices).
    // Gated on intentionsTotalCount, exactly as the card is, rather than on
    // prayerListActive, so the dot and the card can't disagree.
    // The active novena rides "anytime" alongside custom anytime anchors —
    // matches DailyProgressBody's rawCards entry (same novenaActive/Done).
    ...(novenaActive && !novenaReplacesMorning && !novenaReplacesEvening ? [{ key: "novena", done: novenaDone }] : []),
    ...plDot("anytime"),
    ...cDots("anytime"),
    ...cDots("midday"),
    ...(examenActive ? [{ key: "examen", done: examenDone }] : []),
    // Standalone Co-Breathe only — when per-side Creation Prayer cards replace
    // the standalone card, its dot would have no card (theirs are above).
    ...(cobreatheStandaloneActive ? [{ key: "cobreathe", done: cobreatheDone }] : []),
    ...(listeningActive ? [{ key: "listening", done: listeningDone }] : []),
    /**
     * Visio Divina was MISSING from this list entirely — a kept Visio card on
     * the home with no dot in the pill. Owner, with a screenshot: "it only has
     * three filled in yet there are four." Third recurrence of the same
     * hand-copied-mirror hole (weeklyGrid and turn-learn-pray each grew their
     * visio entry the same way); this pill is the third mirror of "which
     * practices exist", and it drifted the same direction.
     */
    ...(visioActive ? [{ key: "visio", done: visioDone }] : []),
    ...(readingActive ? [{ key: "reading", done: readingDone }] : []),
    ...(podcastsActive ? [{ key: "podcasts", done: podcastsDone }] : []),
    ...(walkActive ? [{ key: "walk", done: walkDone }] : []),
    ...cDots("afternoon"),
    ...(eveningActive && !novenaReplacesEvening ? [{ key: "evening", done: eveningDone }] : []),
    ...(novenaReplacesEvening && novenaActive ? [{ key: "novena-evening", done: novenaDone }] : []),
    ...(eveningExtraLevel ? [{ key: "extra-evening", done: eveningExtraDone }] : []),
    ...(eveningContemplationActive ? [{ key: "contemplation-evening", done: eveningContemplationDone }] : []),
    ...plDot("evening"),
    // Compline closes the day — its own dot, after Evening Prayer. Its own
    // done-flag too: praying Evening Prayer must not fill this dot (they're
    // two distinct offices; see useRhythmState's complineDone).
    ...(complineActive ? [{ key: "compline", done: complineDone }] : []),
    ...cDots("evening"),
  ];
  /**
   * THE PERSON'S OWN ORDER (owner: "the daily progress dots need to be in
   * the order of the routine") — the same sortCardsByUserOrder the home's
   * card list runs, over the same card keys these dots deliberately carry.
   * Unknown keys (the novena's replace-mode dots) keep the built order after
   * the ranked ones, so nothing can vanish.
   */
  // The dots read the same learned order the cards do, or the pill and the
  // list disagree about the shape of the day.
  const dotDefs = sortCardsByLearnedOrder(dotDefsBuilt);

  // Per-dot "just completed" pulse: when an activity flips done, its dot glows
  // for ~2 minutes — then settles. We stamp the completion time per local day in
  // localStorage (so it survives the Layout remount on navigation) the moment a
  // dot flips, then pulse only while now − stamp < PULSE_MS. There is NO
  // persistent "all done" glow — each stop glows just after its own practice.
  const PULSE_MS = 2 * 60 * 1000;
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
  const anyPulsing = dotDefs.some((d) => recentlyDone(d.key));
  useEffect(() => {
    if (!anyPulsing) return;
    const id = setInterval(() => bumpPulse((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [anyPulsing]);

  // Turned off in Settings → Home display.
  if (pillHidden) return null;

  return (
    <Link
      href="/daily-progress"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        letterSpacing: "-0.01em",
        ...FROST_DARK,
        color: "#C8D4C0",
        border: "1px solid rgba(200,212,192,0.18)",
      }}
      aria-label={t("header.daily_progress", { defaultValue: "Daily Progress" })}
    >
      <span className="whitespace-nowrap">{t("header.daily_progress", { defaultValue: "Daily Progress" })}</span>
      {(() => {
        // Past 8 anchors a single row gets cramped — shrink the dots and wrap
        // them into two balanced rows so the pill stays tidy.
        const many = dotDefs.length > 8;
        const sz = many ? 5 : 6;
        const renderDot = (d: { key: string; done: boolean }, i: number) => {
          // Dots no longer glow/pulse — kept anchors are simply filled (settled);
          // everything still to do — INCLUDING the next one — stays dark/faint.
          // Position, not a tally, and no animation drawing the eye.
          const tone = d.done
            ? { background: "rgba(110,180,130,0.5)", border: "none" as const }
            : { background: "transparent", border: "1px solid rgba(143,175,150,0.28)" };
          return (
            <span
              key={d.key}
              style={{
                width: sz,
                height: sz,
                borderRadius: 999,
                display: "inline-block",
                ...tone,
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

// OpeningSplash — the native app-open moment. Stripped down (owner): no
// greeting, no "what's next" card, no faces, no quote, no routine nudge —
// just the leaf backdrop and the Phoebe app icon, held for a beat, then
// faded straight into the home. Native app only — never on web — and only
// once per app launch, never for logged-out visitors.
function OpeningSplash() {
  const { user, isLoading: authLoading } = useAuth();
  const native = isNativeShell();
  const [phase, setPhase] = useState<"in" | "out" | "gone">(() => {
    if (typeof window === "undefined") return "gone";
    // Brand-new user (very first launch on this device): NO app-open splash —
    // land straight on the home with the seeded routine already there.
    if (isFirstOpen()) return "gone";
    try { return sessionStorage.getItem("phoebe:splash-shown") ? "gone" : "in"; } catch { return "in"; }
  });
  // Splash backdrop — ONE fixed leaf photo (owner), not a random pick: the
  // splash is the first thing the app shows, so it should look the same every
  // launch, and a known URL is what lets us preload it. Falls back to the old
  // forest shot only if the asset glob somehow came back empty.
  const splashLeafPhoto = SPLASH_PHOTO || splashForestPath;

  // Start the auto-dismiss once auth has resolved (user present) — NOT on a
  // bare mount. On a native cold start `user` is null while /api/auth/me
  // loads; stamping the once-per-launch flag then would burn the splash
  // before it ever renders (the render guard needs `user`). startedRef makes
  // it fire exactly once, the moment user first appears.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || phase === "gone" || !native || !user) return;
    startedRef.current = true;
    try { sessionStorage.setItem("phoebe:splash-shown", "1"); } catch { /* ignore */ }
    // Nothing to read anymore — just the icon — so this is a beat, not a hold.
    const id = setTimeout(() => setPhase((cur) => (cur === "in" ? "out" : cur)), 1200);
    return () => clearTimeout(id);
  }, [user, phase, native]);
  /**
   * Failsafe dismissal — the reason the splash gets stuck.
   *
   * The auto-dismiss above only arms once `user` is present, because the
   * once-per-launch flag must not be burned before the splash renders. But
   * that makes /api/auth/me a GATE: if it hangs (cold start on a bad
   * connection, a request that never settles), nothing ever schedules the
   * fade and the splash sits there over an app that is otherwise fine.
   *
   * Same class as the blank-screen rule this codebase already keeps — a fetch
   * that gates the UI needs a timeout. Six seconds is far past a healthy
   * launch (the normal hold is 1.2s) and far short of the "is this app
   * broken?" threshold.
   */
  useEffect(() => {
    if (phase !== "in" || !native) return;
    const id = setTimeout(() => {
      // Stamp on the way out, exactly as the normal path does. Without it the
      // once-per-launch flag is never written, and a remount later this
      // session would read "not shown yet" and put the splash back up — the
      // stuck screen returning after we'd just escaped it.
      startedRef.current = true;
      try { sessionStorage.setItem("phoebe:splash-shown", "1"); } catch { /* ignore */ }
      setPhase((cur) => (cur === "in" ? "out" : cur));
    }, 6000);
    return () => clearTimeout(id);
  }, [phase, native]);

  /**
   * The manual way out. Owner: "have an Enter button at the bottom ... in case
   * that would close this splash screen, because sometimes it just gets stuck
   * and doesn't close."
   *
   * Held back until the splash has outstayed a healthy launch. A button that
   * appeared instantly would flash for a few hundred milliseconds on EVERY
   * normal open — the fade starts at 1.2s — which is a worse first moment than
   * the one it's insuring against. At 1.6s the fade has already begun on any
   * healthy launch (phase is no longer "in"), so this only ever appears when
   * something is actually wrong.
   */
  const [showEnter, setShowEnter] = useState(false);
  useEffect(() => {
    if (phase !== "in" || !native) { setShowEnter(false); return; }
    const id = setTimeout(() => setShowEnter(true), 1600);
    return () => clearTimeout(id);
  }, [phase, native]);

  // Dismiss by hand, down the SAME path as the automatic one: stamp the
  // once-per-launch flag (so a remount this session doesn't show it again) and
  // fade out, which fires splash-done and lets the home start its cascade.
  // Jumping straight to "gone" would skip that and leave the home un-cascaded.
  const enterNow = () => {
    startedRef.current = true;
    try { sessionStorage.setItem("phoebe:splash-shown", "1"); } catch { /* ignore */ }
    setPhase((cur) => (cur === "in" ? "out" : cur));
  };

  // Unmount is driven by the fade-out's onAnimationComplete (below) so it lands
  // exactly when opacity hits 0 — not a racing timeout that could snap the
  // splash back to visible for a frame (the "flash" on close). This timeout is
  // only a safety net in case the animation callback never fires.
  useEffect(() => {
    if (phase !== "out") return;
    const id = setTimeout(() => setPhase("gone"), 900);
    return () => clearTimeout(id);
  }, [phase]);

  // Tell the home it can start its card cascade only AFTER the splash has
  // faded down. Fires on every transition to "gone" (incl. never-shown —
  // harmless, the home only waits when the splash actually showed).
  useEffect(() => {
    if (phase === "gone") {
      // Stamp a DONE flag (distinct from "splash-shown", which is set at the
      // splash's START) so a home mounting later this session knows the splash
      // has actually FADED — and starts its cascade immediately rather than
      // re-waiting. The event covers the live first-load case.
      try { sessionStorage.setItem("phoebe:splash-done-once", "1"); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("phoebe:splash-done"));
    }
  }, [phase]);

  // Show the opaque splash from the FIRST native paint — including while
  // /api/auth/me is still in flight. Gating on `user` used to return null during
  // that window, so the home rendered underneath and then the splash appeared
  // over it: the "home flashes before the splash" on a cold open / fresh
  // install. Only bail once auth has RESOLVED to no user (web / logged out).
  if (!native || phase === "gone" || (!user && !authLoading)) return null;

  return (
    <motion.div
      // The backdrop is opaque from the very first frame — so the leaf photo
      // is the first thing shown (no flash of the home behind it). Only the
      // fade-OUT animates.
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "out" ? 0 : 1 }}
      transition={{ duration: phase === "out" ? 0.7 : 0, ease: "easeInOut" }}
      onAnimationComplete={() => { if (phase === "out") setPhase("gone"); }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "#0C1F12", zIndex: 200, isolation: "isolate", pointerEvents: "none" }}
    >
      <img
        src={splashLeafPhoto}
        alt=""
        aria-hidden
        // Anchor the crop to the BOTTOM of the photo — a tall landscape shot
        // center-cropped left the screen's lower half a dark, empty void with
        // all the visible detail bunched at the top.
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom", zIndex: -1 }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, zIndex: -1,
          background: "linear-gradient(180deg, rgba(8,18,12,0.5) 0%, rgba(8,18,12,0.38) 45%, rgba(8,18,12,0.66) 100%)",
          backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <motion.img
        src="/phoebe-app-icon.png"
        alt=""
        aria-hidden
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: 96, height: 96, borderRadius: 22, boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}
      />
      {showEnter && (
        <motion.button
          type="button"
          onClick={enterNow}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            position: "absolute",
            // Centred by auto margins, NOT translateX(-50%).
            //
            // This is a motion.button animating `y`, and Framer Motion writes
            // the element's `transform` to do that — overwriting the inline
            // translateX and leaving the button's LEFT EDGE at the midpoint, so
            // it sat half its own width to the right of centre. Margins can't
            // be clobbered by an animated transform.
            left: 0,
            right: 0,
            marginInline: "auto",
            width: "fit-content",
            // Clear of the home indicator on a notched phone, and of the
            // screen edge on one without.
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
            // The splash root is pointerEvents:none so it never swallows taps
            // meant for the home underneath. This button is the one thing on it
            // that must be tappable — without re-enabling it here, the escape
            // hatch would render and do nothing.
            pointerEvents: "auto",
            minWidth: 180,
            padding: "15px 34px",
            borderRadius: 999,
            background: "rgba(9,26,16,0.55)",
            backdropFilter: "blur(11.34px)",
            WebkitBackdropFilter: "blur(11.34px)",
            border: "1px solid rgba(168,197,160,0.45)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: "pointer",
          }}
        >
          Enter
        </motion.button>
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

// Full-bleed page backdrop — fades UP once the photo decodes (no flash/pop), and
// sits z-index:-1 within the Layout root's isolation:isolate context so it stays put.
function LayoutBackdrop({ photo, opacity }: { photo: string; opacity: number }) {
  // Owner report: the home's backdrop always faded in from opacity 0, even
  // when it's the SAME photo the opening splash just showed a beat earlier
  // (splash and home now share one fixed leaf photo) — the browser already
  // has it decoded, but `loaded` still started false, so it visibly dipped
  // and re-faded instead of just staying put. Check synchronously whether
  // an <img> at this src is already complete (decoded, in cache) and skip
  // the redundant fade-in when it is.
  const [loaded, setLoaded] = useState(() => {
    if (typeof Image === "undefined") return false;
    const probe = new Image();
    probe.src = photo;
    return probe.complete;
  });
  // Photo AND its wash fade UP together once the image decodes — so the
  // backdrop eases in as one piece rather than the dark wash flashing on
  // instantly while the photo is still loading behind it.
  return (
    <>
      <img src={photo} alt="" aria-hidden onLoad={() => setLoaded(true)} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? opacity : 0, transition: "opacity 0.8s ease", zIndex: -1 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, opacity: loaded ? 1 : 0, transition: "opacity 0.8s ease", background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
    </>
  );
}

export function Layout({ children, bgPhoto, bgOpacity = 0.4, chromeless = false, onClose, blueShade = false }: { children: ReactNode; bgPhoto?: string | null; bgOpacity?: number; chromeless?: boolean; onClose?: () => void; blueShade?: boolean }) {
  // Signals native-shell.ts's splash hider (scheduleSplashHide) that the JS
  // app has actually painted its first frame — including OpeningSplash's own
  // copy of the native launch-image photo. native-shell used to hide the
  // native splash on a blind short timer, which on a real device sometimes
  // beat React's mount, leaving a bare-background gap before OpeningSplash's
  // image painted — reading as the photo "reloading". Double rAF: the first
  // schedules the next frame, the second only fires once that frame is
  // actually on screen. Web builds still dispatch this harmlessly (nothing
  // there is listening for it).
  useEffect(() => {
    const id1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new Event("phoebe:app-first-paint")); } catch { /* ignore */ }
      });
    });
    return () => cancelAnimationFrame(id1);
  }, []);
  const { user } = useAuth();
  // Water home theme: tint the browser toolbar / status bar blue to match the
  // page (the meta must be a literal hex — CSS var() is ignored there). Restore
  // the app green when the theme is off / on unmount.
  useEffect(() => {
    if (!blueShade) return undefined;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute("content") ?? "#102816";
    meta?.setAttribute("content", "#0A1826");
    return () => { meta?.setAttribute("content", prev); };
  }, [blueShade]);
  // Guest SHAPE — light users get no "+" create FAB (its entries are all
  // full-app prayer features).
  const { isGuest } = useGuestMode();
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
  // Pilot has no /daily-progress dashboard (replaced by /pilot/home) — the
  // header pill would dead-end, so hide it for pilot.
  const { isPilot: headerIsPilot } = usePilotMode();

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-guard" style={{ background: "#091A10", isolation: "isolate" }}>
      <LoadReveal />
      <OpeningSplash />
      {/* First-open (iOS) prayer-setup splash — picks a prayer method + a daily
          reading and seeds the routine, then dismisses onto the home. Self-gates
          (native + first launch); renders nothing otherwise. */}
      <FirstOpenOnboarding />
      {/* Optional full-bleed page backdrop — fixed (edge to edge, behind the header
          AND the content gutters), z-index:-1 within this isolation:isolate root so
          it renders reliably (never position:fixed without isolation — that flashes
          then vanishes in the iOS WebView; see reference_page_backdrop_pattern). */}
      {bgPhoto && <LayoutBackdrop photo={bgPhoto} opacity={bgOpacity} />}
      {/* Chromeless mode (e.g. the Rule-of-Life customizer) drops the full Phoebe
          top bar in favour of a single X-out, so the builder reads as a focused
          sheet rather than a page. */}
      {chromeless && onClose && (
        <div
          className="sticky top-0 z-20 px-4 sm:px-6 md:px-8 flex justify-end"
          style={{ background: "transparent", paddingTop: "var(--top-chrome)", pointerEvents: "none" }}
        >
          <button
            onClick={onClose}
            aria-label={t("common.close", { defaultValue: "Close" })}
            className="inline-flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              pointerEvents: "auto",
              width: 36,
              height: 36,
              borderRadius: 9999,
              ...FROST_DARK,
              color: "#C8D4C0",
              border: "1px solid rgba(200,212,192,0.18)",
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {!chromeless && <header
        // NOT sticky. It carried sticky top-0 for ages while the container's
        // overflow-x:hidden quietly disabled it (one hidden axis makes the
        // other compute to auto — the root became the scrollport and never
        // scrolled). Yesterday's overflow-x:clip fix for the customizer's
        // floating Continue re-armed it, and a TRANSPARENT header suddenly
        // floating over scrolled content is the owner's "something is messed
        // up with the scroll on web". The header belongs to the page flow.
        className="z-10 px-4 sm:px-6 md:px-8 pb-2 md:pb-5 flex justify-between items-center"
        style={{
          // No bar over a backdrop photo — the image runs all the way to the top;
          // the wordmark + pills sit directly on the washed photo. Solid otherwise.
          background: bgPhoto ? "transparent" : "#091A10",
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
            {/* Full 2.0625rem (33px) on normal phones and up; only genuinely
                narrow widths (≲390px — iPhone SE/mini, small Android, where the
                daily-progress pill starts to crowd) shrink it. 8.5vw keeps the
                wordmark pinned at the 33px cap down to ~388px, then eases down
                (never below 1.5rem). Was a flat 7vw, which shrank it on EVERY
                phone (7vw only reaches 33px at a 471px viewport). */}
            <span className="font-bold transition-colors" style={{ fontSize: "clamp(1.5rem, 8.5vw, 2.0625rem)", letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
          </Link>
        </div>

        {/* Render the header pills IMMEDIATELY when the public version is on —
            gating on `user` made both pills (and the Menu button!) wait out
            the /auth/me round-trip, which read as "the menu takes a while to
            load" (and a signed-out guest got NO menu at all until the
            anonymous session landed). The pills are local-first; nothing in
            them needs the account. */}
        {(user || PHOEBE_GUEST_ENABLED) && (
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            {/* Daily-progress pill (the "Daily Progress" label + the row of
                rhythm dots, one per anchor). Back in the header per owner. */}
            <DailyProgressPill />
            {/* Menu pill — opens the side drawer. */}
            {(
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
                    ...FROST_DARK,
                    color: "#C8D4C0",
                    border: "1px solid rgba(200,212,192,0.18)",
                  }}
                >
                  {t("header.menu")}
                </span>
              </button>
            )}
          </div>
        )}
      </header>}

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Chromeless drops the main's horizontal gutter so the inner shell's own
          px-4 is the ONLY padding (otherwise the customizer cards were inset
          twice and sat narrower than the home cards on iOS). */}
      <main className={`flex-1 flex flex-col pb-12 max-w-7xl mx-auto w-full ${chromeless ? "pt-2" : "pt-2 px-4 sm:px-6 md:px-8"}`}>
        <motion.div
          // The page rises up over the backdrop on entry. Deliberately gentle —
          // a slower, taller rise reads as the new page lifting into place over
          // what was there, rather than a quick snap.
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>

      {/* Create "+" FAB, bottom-right (Menu lives top-right in the header).
          FULL app only — every entry it opens (prayer request, community
          intercession, event) is closed to light users, so they get no dead
          plus button. */}
      {/* The bottom-right "+" create FAB was removed — its primary action was
          creating a prayer request, which is now off for everyone. */}

      {/* EXPERIMENTAL "Water" home theme (super-admin toggle, see lib/homeTheme).
          A mix-blend-mode:color wash recolors the whole home's green to blue —
          hue/saturation from this layer, luminance kept from below — so cards,
          accents, and the (water) backdrop all read blue without re-theming the
          dashboard's many hardcoded greens. Last child so it composites over
          everything in this isolated root; pointer-events:none so it never
          intercepts taps. Modals/drawer paint above it and stay untinted. */}
      {blueShade && (
        <>
          {/* Recolor every hue toward the office Water theme's calm, DESATURATED
              deep blue (hue+saturation from this wash, luminance kept from below),
              so the greens on cards/buttons/accents read blue without going vivid. */}
          <div
            aria-hidden
            style={{
              position: "fixed", inset: 0, zIndex: 45, pointerEvents: "none",
              background: "#33567C", mixBlendMode: "color", opacity: 0.72,
            }}
          />
          {/* Lift the darker accents (buttons, pills) toward a lighter blue.
              `screen` brightens dark areas far more than already-light text, so
              the accents lighten while the body copy stays put. */}
          <div
            aria-hidden
            style={{
              position: "fixed", inset: 0, zIndex: 46, pointerEvents: "none",
              background: "#5A86BE", mixBlendMode: "screen", opacity: 0.22,
            }}
          />
        </>
      )}
    </div>
  );
}

// The create entry points shared by the mobile nav "+" and the desktop FAB:
// a prayer request for everyone, plus community intercession + event for group
// admins (a soft client gate; the server enforces the real permissions).
function CreateOptionButtons({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const isAdminOfAny = (groupsData?.groups ?? []).some((g) => g.myRole === "admin" || g.myRole === "hidden_admin");
  const go = (href: string) => { onPick(); navigate(href); };
  const optionStyle: CSSProperties = {
    ...FROST, border: "1px solid rgba(200,212,192,0.28)", minWidth: 248,
    boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)",
    borderRadius: 16, padding: "12px 16px", textAlign: "left", cursor: "pointer",
  };
  return (
    <>
      <button type="button" onClick={() => go("/pray-request/new?kind=request")} style={optionStyle}>
        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏🏽 {t("home_fab.prayer_request")}</p>
        <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.prayer_request_sub")}</p>
      </button>
      {isAdminOfAny && (
        <button type="button" onClick={() => go("/moment/new?template=intercession")} style={optionStyle}>
          <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🕯️ {t("home_fab.community_intercession")}</p>
          <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.community_intercession_sub")}</p>
        </button>
      )}
      {isAdminOfAny && (
        <button type="button" onClick={() => go("/tradition/new")} style={optionStyle}>
          <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>📅 {t("home_fab.event", { defaultValue: "Event" })}</p>
          <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.event_sub", { defaultValue: "Put a gathering on your community's calendar." })}</p>
        </button>
      )}
    </>
  );
}

// A full-screen "Create" sheet — styled like an office's opening slide: a leaf
// backdrop under a dark wash, a centered "Create" title, and the create options
// as frosted cards. Fades up on open. Opened by the bottom-bar "+".
function CreateSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const isAdminOfAny = (groupsData?.groups ?? []).some((g) => g.myRole === "admin" || g.myRole === "hidden_admin");
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const go = (href: string) => { onClose(); navigate(href); };
  const FONT = "'Space Grotesk', system-ui, sans-serif";
  const card = (emoji: string, title: string, sub: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl transition-opacity hover:opacity-90 active:scale-[0.99]"
      style={{ ...FROST, border: "1px solid rgba(200,225,210,0.22)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
    >
      <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="block" style={{ color: "#F0EDE6", fontFamily: FONT, fontSize: 17, fontWeight: 600 }}>{title}</span>
        <span className="block" style={{ color: "#8FAF96", fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{sub}</span>
      </span>
      <span aria-hidden style={{ color: "#8FAF96" }}>→</span>
    </button>
  );
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0"
      style={{
        zIndex: 80, backgroundColor: "#091A10", display: "flex", flexDirection: "column",
        ...(leafBg ? { backgroundImage: `linear-gradient(rgba(8,22,15,0.62), rgba(8,22,15,0.82)), url(${leafBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
      }}
    >
      {/* X close — top-right. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close", { defaultValue: "Close" })}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 16, width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", ...FROST, border: "1px solid rgba(200,212,192,0.3)", color: "#F0EDE6", cursor: "pointer", zIndex: 1 }}
      >
        <X size={18} />
      </button>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col items-center justify-center px-6 text-center"
      >
        <h1 style={{ color: "#F0EDE6", fontFamily: FONT, fontWeight: 700, fontSize: "clamp(40px, 11vw, 56px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 28 }}>
          {t("create_sheet.title", { defaultValue: "Create" })}
        </h1>
        <div className="w-full flex flex-col gap-3" style={{ maxWidth: 460 }}>
          {card("🙏🏽", t("home_fab.prayer_request"), t("home_fab.prayer_request_sub"), () => go("/pray-request/new?kind=request"))}
          {isAdminOfAny && card("🕯️", t("home_fab.community_intercession"), t("home_fab.community_intercession_sub"), () => go("/moment/new?template=intercession"))}
          {isAdminOfAny && card("📅", t("home_fab.event", { defaultValue: "Event" }), t("home_fab.event_sub", { defaultValue: "Put a gathering on your community's calendar." }), () => go("/tradition/new"))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Create FAB ──────────────────────────────────────────────────────────────
// The bottom-right "+" circle, frosted with an outline, on every page. Opens the
// create options (prayer request / — for admins — intercession + event). The
// Menu pill lives top-right in the header.
function CreateFab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Tap-catcher closes the popover. */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0"
            style={{ zIndex: 29 }}
          />
        )}
      </AnimatePresence>
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2" style={{ zIndex: 30 }}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-2 mb-1 items-stretch"
            >
              <CreateOptionButtons onPick={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ ...FROST, border: "1px solid rgba(200,212,192,0.35)", color: "#F0EDE6", cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
          aria-label={open ? t("home_fab.close_menu") : t("home_fab.new_prayer")}
        >
          <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus size={26} strokeWidth={2.2} />
          </motion.div>
        </button>
      </div>
    </>
  );
}
