import { useQuery, useQueryClient } from "@tanstack/react-query";

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
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
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
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
    window.location.href = "/";
  };
}
