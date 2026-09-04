import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePilotMode } from "@/hooks/usePilotMode";
import { useGuestMode } from "@/hooks/useGuestMode";
import { usePrayerListEnabled } from "@/hooks/usePrayerRequests";
import { MenuHub, type MenuHubGroup } from "@/components/MenuHub";
import { isNativeShell } from "@/lib/isNativeShell";
import { useTranslation } from "react-i18next";

// ── /menu — the top-level navigation page (replaces the drawer) ─────────────
//
// Lists the categories as cards. Group categories (Book of Common Prayer,
// Practices, Reflections, Audio, Resources) open their own list page; leaf
// categories go straight to their destination. Gating mirrors the old drawer
// exactly: offices-only hides community/social surfaces; beta gates Way of
// Love / Home / Messages / Parish; Letters + Admin Tools follow their roles.

export default function MenuPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const logout = useLogout();
  const { rawIsBeta, rawIsAdmin } = useBetaStatus();
  const { isPilot } = usePilotMode();
  // PUBLIC no-login version: guests see Pray (BCP · Practices · Reflections ·
  // Daily progress) + Resources + Settings/About, with a QUIET "Sign in" in
  // place of Sign out — no community/events/feeds/letters/messages (the
  // beta-gated rows are already off since guests aren't beta).
  const { isGuest } = useGuestMode();
  const officesOnly = user?.accessTier === "offices-only";
  const signedUp = !!user && !user.isAnonymous;
  const prayerListEnabled = usePrayerListEnabled();

  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user && !officesOnly,
  });
  const { data: myFeedsData } = useQuery<{ feeds: Array<{ slug: string }> }>({
    queryKey: ["/api/prayer-feeds/mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/mine"),
    enabled: !!user && !officesOnly,
  });
  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
  const showAdminTools = rawIsBeta || rawIsAdmin || (myFeedsData?.feeds.length ?? 0) > 0 || isCommunityAdmin;

  const go = (p: string) => setLocation(p);
  const groups: MenuHubGroup[] = [];

  // Beta entry cards — Way of Love + the day-by-day home.
  if (rawIsBeta) {
    groups.push({
      items: [
        { emoji: "🌿", label: t("menu.daily_practice"), sub: t("menu.daily_practice_sub"), onClick: () => go("/daily-practice") },
        { emoji: "🏠", label: t("menu.home_beta"), sub: t("menu.home_beta_sub"), onClick: () => go("/home-beta") },
      ],
    });
  }

  // Pray — the daily-rhythm surfaces.
  groups.push({
    header: t("menu.hdr_pray"),
    items: [
      // Daily progress — the same surface the header "Daily progress" pill opens.
      // Also here in the menu so it's reachable when the pill doesn't fit the
      // header (small phones), or when it's turned off in Settings. Hidden in
      // pilot — the full daily-progress dashboard is replaced by /pilot/home.
      ...(!isPilot ? [{ emoji: "📿", label: t("menu.daily_progress", { defaultValue: "Daily Progress" }), sub: t("menu.daily_progress_sub", { defaultValue: "Today's rhythm at a glance" }), onClick: () => go("/daily-progress") }] : []),
      // Basic 4-dropdown customizer — guests only (device-local, no account
      // needed); it has its own "Customize more fully" link into the real
      // wizard for anyone who wants to sign in and go deeper.
      ...(isGuest ? [{ emoji: "🎛️", label: t("menu.customize", { defaultValue: "Customize" }), sub: t("menu.customize_sub", { defaultValue: "Daily prayer, newsletter, silence, steps" }), onClick: () => go("/customize") }] : []),
      /**
       * THE "HOME SCREEN" ROW IS RETIRED (owner, 2026-09-02: "there is no use
       * for the customize home screen anymore").
       *
       * /customize-home offered drag-to-reorder and show/hide for every home
       * module. What a person actually keeps is now decided in the rule-of-life
       * customizer — which practices are on, and the slot each sits in — so a
       * second surface for the same decision was one more place for the two to
       * disagree. Its reorder handles were also easy to trigger by accident
       * while scrolling, which silently rewrote the saved order.
       *
       * The ROUTE and the page are left in place: they still hold the
       * feed-first-home picker and the NCMP card, which have no other home
       * yet, and a deep link should not 404. This removes the menu entry only,
       * so nothing routes people to it.
       */
      { emoji: "📖", label: t("menu.bcp"), sub: t("menu.bcp_sub"), onClick: () => go("/menu/bcp") },
      { emoji: "🕯️", label: t("menu.practices"), sub: t("menu.practices_sub"), onClick: () => go("/menu/practices") },
      { emoji: "🌅", label: t("menu.newsletters", { defaultValue: "Newsletters" }), sub: t("menu.newsletters_sub", { defaultValue: "Daily words and publications" }), onClick: () => go("/menu/newsletters") },
      // Prayer List — a private list of who & what you're holding in prayer,
      // prayed through in a quiet slideshow; optionally shareable to a
      // community / circle. Account-scoped data, so hidden for guests.
      ...(signedUp && prayerListEnabled ? [{ emoji: "🕊️", label: t("menu.prayer_list", { defaultValue: "Prayer List" }), sub: t("menu.prayer_list_sub", { defaultValue: "Your own list of who & what you're praying for" }), onClick: () => go("/intentions") }] : []),
      // Novenas hidden for all users per owner request (2026-08-07) — see
      // useRhythmState.ts's NOVENAS_ENABLED comment for why.
    ],
  });

  // Learn — guided courses. Centering Prayer (public, no sign-in) and the deeper
  // Spiritual Journey are YouTube video courses → WEB ONLY. The Way of Love
  // (Bishop Budde) rides the podcast library, so it's the ONE course that also
  // works on iOS. So: three courses on the web, only one (Way of Love) on iOS.
  // Courses belong to the LIGHT experience too — their routes are in the guest
  // allowlist and the home's Learn band starts the Way of Love for a fresh
  // guest — so there's no guest gating here, only the platform rule.
  const learn: MenuHubGroup = { header: "Learn", items: [] };
  if (!isNativeShell()) {
    learn.items.push({ emoji: "🕯️", label: "Centering Prayer", sub: "Learn the practice with Fr. Keating", onClick: () => go("/centering-prayer") });
    learn.items.push({ emoji: "🎓", label: "The Spiritual Journey", sub: "Keating's full contemplative series", onClick: () => go("/journey") });
  }
  learn.items.push({ emoji: "❤️", label: "The Way of Love", sub: "Bishop Budde on a rule of life", onClick: () => go("/way-of-love-course") });
  groups.push(learn);

  // Explore — community + reference content.
  const explore: MenuHubGroup = { header: t("menu.hdr_explore"), items: [] };
  // Community + Events — hidden in pilot AND guest (personal-only, no community).
  if (!officesOnly && !isPilot && !isGuest) {
    explore.items.push({ emoji: "🏘️", label: t("menu.communities"), sub: t("menu.communities_sub"), onClick: () => go("/communities") });
    explore.items.push({ emoji: "📅", label: t("menu.events", { defaultValue: "Events" }), sub: t("menu.events_sub", { defaultValue: "Services, gatherings & practices" }), onClick: () => go("/events") });
  }
  explore.items.push({ emoji: "📚", label: t("menu.resources"), sub: t("menu.resources_sub"), onClick: () => go("/menu/resources") });
  // Prayer Feeds — discover + subscribe to daily intercession feeds (e.g. the
  // Diocese of New York's Calendar of Intercession). Public feeds are open to
  // every signed-in tier, including offices-only — but NOT the no-login guest
  // (subscribing needs an account; the public version carries no feeds).
  if (!isPilot && !isGuest) explore.items.push({ emoji: "🌍", label: t("menu.prayer_feeds", { defaultValue: "Prayer Feeds" }), sub: t("menu.prayer_feeds_sub", { defaultValue: "Pray for the world, one day at a time" }), onClick: () => go("/prayer-feeds") });
  groups.push(explore);

  // Account.
  // Settings is only for people who've actually made an account — not the
  // no-login guest or the anonymous device user. (There's nothing to configure
  // until you sign up; the rhythm lives in Customize, reachable above.)
  const account: MenuHubGroup = {
    header: t("menu.hdr_account"),
    items: signedUp
      ? [{ emoji: "⚙️", label: t("menu.settings"), onClick: () => go("/settings") }]
      : [],
  };
  if (showAdminTools) account.items.push({ emoji: "🔧", label: t("menu.admin_tools"), onClick: () => go("/admin/tools") });
  // About opens the deck first; finishing the deck (exitTo) lands on /about.
  account.items.push({ emoji: "ℹ️", label: t("menu.about"), onClick: () => go("/about-deck") });
  // Signed-out guests get the QUIET "Sign in" (the public version's only auth
  // surface — beta testers' door into the full app) where Sign out normally
  // sits. Keyed on `user` too, so a widened SIGNED-IN guest keeps Sign out.
  if (isGuest && !user) {
    account.items.push({ emoji: "🚪", label: t("menu.sign_in", { defaultValue: "Sign in" }), onClick: () => go("/signin") });
  } else {
    account.items.push({ emoji: "🚪", label: t("menu.sign_out"), onClick: () => logout() });
  }
  groups.push(account);

  return (
    <MenuHub
      title={t("menu.title")}
      subtitle={user?.name ? t("menu.signed_in_as", { name: user.name }) : undefined}
      groups={groups}
    />
  );
}
