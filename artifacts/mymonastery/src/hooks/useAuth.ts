import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearPersistentToken,
  ensurePersistentToken,
  getPersistentToken,
  tryExchangePersistentToken,
} from "@/lib/persistentAuth";

// Phoebe Parish — derived server-side from beta_users + group_members
// + users.parish_feed_id + users.offices_only. "full" sees everything
// (the historical experience), "parish-only" sees a stripped UI (BCP +
// parish dash + settings), "offices-only" is the public /pray sign-up
// tier (offices only, no parish identity), "unassigned" hasn't picked
// anything yet (gets routed to parish onboarding).
export type AccessTier = "full" | "parish-only" | "offices-only" | "unassigned";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  googleId: string | null;
  showPresence: boolean;
  correspondenceImprintCompleted: boolean;
  gatheringImprintCompleted: boolean;
  onboardingCompleted: boolean;
  dailyBellTime: string | null;
  prayerInviteLastShownDate: string | null;
  prayerInviteLastShownAt: string | null;
  // Display form of the phone number the user entered. The server
  // also stores a normalized E.164 + a SHA-256 hash for the
  // contact-discovery match endpoint, but we only surface the raw
  // form to the UI for editing.
  phoneNumber: string | null;
  climateEnrolled: boolean;
  climateOnboardingCompleted: boolean;
  climateOnly: boolean;
  parishId: number | null;
  bellEnabled: boolean;
  // Phoebe Parish — see AccessTier comment above.
  accessTier: AccessTier;
  parishFeedId: number | null;
  parishSlug: string | null;
  // Feed-first home — the feed (if any) to feature in the big primary
  // home-screen slot, and whether that layout is currently switched on.
  // Set at signup for portal sign-ups; toggled in Settings → Home screen.
  homeFeedId: number | null;
  feedFirstHome: boolean;
  // Home-screen layout (Customize page). null = not customized; the
  // dashboard derives a default from feedFirstHome.
  homeLayout: { order: string[]; hidden: string[] } | null;
  // Master notifications switch (Settings → Notifications).
  pushEnabled: boolean;
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  // 401 → session cookie is missing or expired. Before declaring the
  // user logged-out, try the durable persistent token: on iOS upgrades
  // the WKWebView cookie jar can lose state while the localStorage
  // mirror (→ Capacitor Preferences / App Group container) survives.
  // If exchange succeeds the server has re-issued a session cookie and
  // a fresh /auth/me will land authenticated.
  if (res.status === 401) {
    if (!getPersistentToken()) return null;
    const recovered = await tryExchangePersistentToken();
    if (!recovered) return null;
    const retry = await fetch("/api/auth/me", { credentials: "include" });
    if (retry.status === 401) return null;
    if (!retry.ok) throw new Error("Failed to fetch user");
    const user = (await retry.json()) as AuthUser;
    return user;
  }
  if (!res.ok) throw new Error("Failed to fetch user");
  const user = (await res.json()) as AuthUser;
  // First-time authenticated load on this device — stash a durable token
  // so we can recover from a future cookie loss. No-op on subsequent
  // loads (helper short-circuits when a token is already stored).
  ensurePersistentToken().catch(() => {});
  return user;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return { user: user ?? null, isLoading };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    // Send our device's persistent token so the server can revoke just
    // this device. Other signed-in devices keep their tokens; only this
    // one stops being able to recover its session.
    const persistentToken = getPersistentToken();
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(persistentToken ? { persistentToken } : {}),
    });
    clearPersistentToken();
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
    window.location.href = "/";
  };
}
