import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { MenuHub, type MenuHubGroup } from "@/components/MenuHub";
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
  const officesOnly = user?.accessTier === "offices-only";

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
  // New community gratitudes the viewer hasn't seen → a dot on the Gratitude card.
  const { data: gratUnseen } = useQuery<{ count: number }>({
    queryKey: ["/api/gratitude/unseen-count"],
    queryFn: () => apiRequest("GET", "/api/gratitude/unseen-count"),
    enabled: !!user && !officesOnly && rawIsBeta,
    staleTime: 60_000,
  });
  const hasNewGratitude = (gratUnseen?.count ?? 0) > 0;

  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
  const showLetters = isCommunityAdmin;
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
      // header (small phones), or when it's turned off in Settings.
      { emoji: "📿", label: t("menu.daily_progress", { defaultValue: "Daily progress" }), sub: t("menu.daily_progress_sub", { defaultValue: "Today's rhythm at a glance" }), onClick: () => go("/daily-progress") },
      { emoji: "📖", label: t("menu.bcp"), sub: t("menu.bcp_sub"), onClick: () => go("/menu/bcp") },
      { emoji: "🕯️", label: t("menu.practices"), sub: t("menu.practices_sub"), onClick: () => go("/menu/practices") },
      { emoji: "🌅", label: t("menu.reflections"), sub: t("menu.reflections_sub"), onClick: () => go("/menu/reflections") },
      { emoji: "🎧", label: t("menu.podcasts", { defaultValue: "Podcasts" }), sub: t("menu.podcasts_sub", { defaultValue: "The full library" }), onClick: () => go("/podcasts") },
      // Prayer List — a personal list of who & what you're holding in prayer,
      // prayed through in a quiet slideshow; shareable to a community / circle.
      { emoji: "🕊️", label: t("menu.prayer_list", { defaultValue: "Prayer List" }), sub: t("menu.prayer_list_sub", { defaultValue: "Your own list of who & what you're praying for" }), onClick: () => go("/intentions") },
      // Gratitude — its own surface (journal + the community garden). The dot
      // lights when a fellow has shared a new thanksgiving you haven't seen.
      ...(rawIsBeta ? [{ emoji: "🙏", label: t("menu.gratitude", { defaultValue: "Gratitude" }), sub: t("menu.gratitude_sub", { defaultValue: "Give thanks · see your community's" }), badge: t("menu.beta_badge"), dot: hasNewGratitude, onClick: () => go("/gratitude") }] : []),
    ],
  });

  // El Jardín — study + formation tools (beta only).
  if (rawIsBeta) {
    groups.push({
      header: "El Jardín",
      items: [
        { emoji: "🌿", label: "El Jardín", sub: "Bible study, sermon notes, and more", onClick: () => go("/menu/jardin") },
      ],
    });
  }

  // Explore — community + reference content.
  const explore: MenuHubGroup = { header: t("menu.hdr_explore"), items: [] };
  if (!officesOnly) {
    explore.items.push({ emoji: "🏘️", label: t("menu.communities"), sub: t("menu.communities_sub"), onClick: () => go("/communities") });
    explore.items.push({ emoji: "📅", label: t("menu.events", { defaultValue: "Events" }), sub: t("menu.events_sub", { defaultValue: "Services, gatherings & practices" }), onClick: () => go("/events") });
  }
  explore.items.push({ emoji: "📚", label: t("menu.resources"), sub: t("menu.resources_sub"), onClick: () => go("/menu/resources") });
  // Prayer Feeds — discover + subscribe to daily intercession feeds (e.g. the
  // Diocese of New York's Calendar of Intercession). Public feeds are open to
  // every tier, including offices-only, so this is unconditional.
  explore.items.push({ emoji: "🌍", label: t("menu.prayer_feeds", { defaultValue: "Prayer Feeds" }), sub: t("menu.prayer_feeds_sub", { defaultValue: "Pray for the world, one day at a time" }), onClick: () => go("/prayer-feeds") });
  if (showLetters) explore.items.push({ emoji: "📮", label: t("menu.letters"), badge: t("menu.beta_badge"), onClick: () => go("/letters") });
  if (rawIsBeta) explore.items.push({ emoji: "✉️", label: t("menu.messages"), badge: t("menu.beta_badge"), onClick: () => go("/messages") });
  groups.push(explore);

  // Account.
  const account: MenuHubGroup = {
    header: t("menu.hdr_account"),
    items: [{ emoji: "⚙️", label: t("menu.settings"), onClick: () => go("/settings") }],
  };
  if (showAdminTools) account.items.push({ emoji: "🔧", label: t("menu.admin_tools"), onClick: () => go("/admin/tools") });
  if (rawIsBeta) {
    account.items.push({ emoji: "🏛️", label: t("menu.phoebe_parish"), badge: t("menu.beta_badge"), onClick: () => go(user?.parishFeedId ? "/parish" : "/parish/onboarding") });
  }
  account.items.push({ emoji: "ℹ️", label: t("menu.about"), onClick: () => go("/church-deck") });
  account.items.push({ emoji: "🚪", label: t("menu.sign_out"), onClick: () => logout() });
  groups.push(account);

  return (
    <MenuHub
      title={t("menu.title")}
      subtitle={user?.name ? t("menu.signed_in_as", { name: user.name }) : undefined}
      groups={groups}
    />
  );
}
