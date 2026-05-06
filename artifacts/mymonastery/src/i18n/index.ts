import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { es } from "./es";

// i18n setup for Phoebe.
//
// Currently bilingual (en + es) with English as the fallback for any
// missing key. Spanish is gated to beta users via the settings toggle —
// non-beta accounts always see English. The user's choice is persisted
// server-side on `users.locale` and locally in localStorage so it
// hydrates immediately on next launch (no flash of English).
//
// Adding more strings:
//   1. Drop the English copy into `en.ts` under a dotted key path.
//   2. Drop the Spanish copy into `es.ts` under the same key.
//   3. Replace the hardcoded JSX with `t("path.to.key")` (or use
//      <Trans>...</Trans> when interpolating React children).
// Missing Spanish keys fall back to English at render time so a
// half-translated UI doesn't break — beta users may see mixed-language
// surfaces while we expand coverage. That's intentional and documented.
//
// Adding a new locale:
//   1. Create `src/i18n/<code>.ts` with the same shape.
//   2. Import it here, register under `resources`, and (if needed)
//      add to the LOCALE_OPTIONS list in settings.

export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

// Cheap pre-mount lookup so the initial render doesn't flash English
// before the React effect that reads /api/auth/me lands. localStorage
// is the source of truth on the client; server returns the same value
// on /me which we then re-sync via i18n.changeLanguage().
function readInitialLocale(): SupportedLocale {
  try {
    const raw = localStorage.getItem("phoebe:locale");
    if (raw === "es") return "es";
    return "en";
  } catch {
    return "en";
  }
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: readInitialLocale(),
    fallbackLng: "en",
    interpolation: {
      // React already escapes; double-escaping breaks emoji + smart
      // quotes in our copy.
      escapeValue: false,
    },
    // Don't throw / log when a key is missing — we expect partial
    // coverage during the rollout and graceful fallback to English.
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
