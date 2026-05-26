import { useEffect } from "react";
import i18n from "@/i18n";
import { useAuth } from "@/hooks/useAuth";

// Keep i18next + localStorage in sync with the user's persisted locale on
// the server. The i18n module is initialised from localStorage at boot
// (so the first render isn't a flash of English), but once /api/auth/me
// lands we re-sync from the canonical server value — covering account
// switches on the same device, and any case where another device updated
// the user's language.
//
// Mounted once at the top of the tree (inside QueryClientProvider so
// useAuth can run). The body returns null — pure side effect.
export function LocaleSync() {
  const { user } = useAuth();
  useEffect(() => {
    const serverLocale = user?.locale;
    if (!serverLocale) return;
    if (i18n.language !== serverLocale) {
      void i18n.changeLanguage(serverLocale);
    }
    try {
      if (localStorage.getItem("phoebe:locale") !== serverLocale) {
        localStorage.setItem("phoebe:locale", serverLocale);
      }
    } catch {
      /* private mode — non-fatal; i18n still switches in-memory */
    }
  }, [user?.locale]);
  return null;
}
