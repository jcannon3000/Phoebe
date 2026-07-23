import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";

// i18n setup for Phoebe.
//
// The app is English-only (owner). The i18next scaffolding is kept so the
// existing `t("path.to.key")` call sites keep working and new copy can be
// added centrally.
//
// Adding more strings:
//   1. Drop the English copy into `en.ts` under a dotted key path.
//   2. Replace the hardcoded JSX with `t("path.to.key")` (or use
//      <Trans>...</Trans> when interpolating React children).

export const SUPPORTED_LOCALES = ["en"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

// Cheap pre-mount lookup so the initial render doesn't flash before the
// React effect that reads /api/auth/me lands. The app is English-only, so
// this always returns "en".
function readInitialLocale(): SupportedLocale {
  return "en";
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
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
