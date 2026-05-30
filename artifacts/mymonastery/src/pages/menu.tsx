import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { MenuHub, type MenuHubGroup } from "@/components/MenuHub";

// ── /menu — the top-level navigation page (replaces the drawer) ─────────────
//
// Lists the categories as cards. Group categories (Book of Common Prayer,
// Practices, Reflections, Audio, Resources) open their own list page; leaf
// categories go straight to their destination. Gating mirrors the old drawer
// exactly: offices-only hides community/social surfaces; beta gates Way of
// Love / Home / Messages / Parish; Letters + Admin Tools follow their roles.

export default function MenuPage() {
  const [, setLocation] = useLocation();
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
        { emoji: "🌿", label: "Your Way of Love", sub: "Your seven practices", onClick: () => go("/daily-practice") },
        { emoji: "🏠", label: "Home (beta)", sub: "Your Way of Love, day by day", onClick: () => go("/home-beta") },
      ],
    });
  }

  // Pray — the daily-rhythm surfaces.
  groups.push({
    header: "Pray",
    items: [
      { emoji: "📖", label: "Book of Common Prayer", sub: "Daily Offices, Prayers, Psalter, Collects", onClick: () => go("/menu/bcp") },
      { emoji: "🕯️", label: "Practices", sub: "Contemplation, Gratitude, Journal, Examen", onClick: () => go("/menu/practices") },
      { emoji: "🌅", label: "Reflections", sub: "Forward Day by Day, CAC, SSJE", onClick: () => go("/menu/reflections") },
      { emoji: "🎧", label: "Audio", sub: "Offices read aloud + podcasts", onClick: () => go("/menu/audio") },
    ],
  });

  // Explore — community + reference content.
  const explore: MenuHubGroup = { header: "Explore", items: [] };
  if (!officesOnly) {
    explore.items.push({ emoji: "🏘️", label: "Communities", sub: "Your communities", onClick: () => go("/communities") });
  }
  explore.items.push({ emoji: "📚", label: "Resources", sub: "Lectionary, Find a Church, Saints, Building Faith", onClick: () => go("/menu/resources") });
  if (showLetters) explore.items.push({ emoji: "📮", label: "Letters", badge: "Beta", onClick: () => go("/letters") });
  if (rawIsBeta) explore.items.push({ emoji: "✉️", label: "Messages", badge: "Beta", onClick: () => go("/messages") });
  groups.push(explore);

  // Account.
  const account: MenuHubGroup = {
    header: "Account",
    items: [{ emoji: "⚙️", label: "Settings", onClick: () => go("/settings") }],
  };
  if (showAdminTools) account.items.push({ emoji: "🔧", label: "Admin Tools", onClick: () => go("/admin/tools") });
  if (rawIsBeta) {
    account.items.push({ emoji: "🏛️", label: "Phoebe Parish", badge: "Beta", onClick: () => go(user?.parishFeedId ? "/parish" : "/parish/onboarding") });
  }
  account.items.push({ emoji: "ℹ️", label: "About", onClick: () => go("/church-deck") });
  account.items.push({ emoji: "🚪", label: "Sign out", onClick: () => logout() });
  groups.push(account);

  return (
    <MenuHub
      title="Menu"
      subtitle={user?.name ? `Signed in as ${user.name}` : undefined}
      groups={groups}
    />
  );
}
