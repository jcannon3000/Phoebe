import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

/**
 * APP-WIDE SWITCHES, flipped in Admin Tools (server: routes/app-settings.ts).
 *
 * The first is "andrewsPublic". Andrew's Version used to be gated on
 * isSuperAdmin in SIX places (the home card, the Reflections page's queries
 * and row, This Sunday's commentary card, the customizer's row, the
 * customize-home add-list, and the push) — and making it public meant
 * editing all six and reverting all six the same evening. Every one of them
 * reads useAndrewsVisible() now, so the switch reaches them all at once and
 * none can drift.
 */
export type AppSettings = { andrewsPublic: boolean };
const DEFAULTS: AppSettings = { andrewsPublic: false };
export const APP_SETTINGS_KEY = ["/api/app-settings"] as const;

export function useAppSettings(): AppSettings {
  const q = useQuery<AppSettings>({
    queryKey: APP_SETTINGS_KEY,
    queryFn: async () => ({ ...DEFAULTS, ...((await apiRequest("GET", "/api/app-settings")) as Partial<AppSettings> | null ?? {}) }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return q.data ?? DEFAULTS;
}

/** Is Andrew's Version on offer to THIS person — a super admin always, and
 *  everyone once the switch is on. The one computation behind every gate. */
export function useAndrewsVisible(): boolean {
  const { user } = useAuth();
  const { andrewsPublic } = useAppSettings();
  return !!(user as { isSuperAdmin?: boolean } | null | undefined)?.isSuperAdmin || andrewsPublic;
}

/** Admin Tools: flip one switch. Optimistic on the cached settings, then the
 *  server's answer replaces it (or the cache reverts on failure). */
export function useSetAppSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: keyof AppSettings; value: boolean }) =>
      (await apiRequest("PUT", `/api/admin/app-settings/${key}`, { value })) as AppSettings,
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: APP_SETTINGS_KEY });
      const before = qc.getQueryData<AppSettings>(APP_SETTINGS_KEY);
      qc.setQueryData<AppSettings>(APP_SETTINGS_KEY, { ...DEFAULTS, ...(before ?? {}), [key]: value });
      return { before };
    },
    onError: (_e, _v, ctx) => { if (ctx?.before) qc.setQueryData(APP_SETTINGS_KEY, ctx.before); },
    onSuccess: (data) => { qc.setQueryData(APP_SETTINGS_KEY, { ...DEFAULTS, ...data }); },
  });
}
