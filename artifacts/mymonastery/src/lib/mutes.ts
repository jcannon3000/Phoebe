import { apiRequest } from "@/lib/queryClient";

// Muting — stopping seeing a specific person's prayer requests without
// blocking or reporting them. Server enforces auth + ownership; these are
// thin wrappers so Settings and prayer-request-detail.tsx share one path.

export type MutedPerson = { userId: number; name: string | null; avatarUrl: string | null };

export function muteUser(mutedUserId: number): Promise<{ ok: true }> {
  return apiRequest("POST", "/api/mutes", { mutedUserId });
}

export function unmuteUser(mutedUserId: number): Promise<{ ok: true }> {
  return apiRequest("DELETE", `/api/mutes/${mutedUserId}`);
}
