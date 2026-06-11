/**
 * A compact ES | EN language toggle. Persists to users.locale (PATCH
 * /api/auth/me/locale) and flips i18next + localStorage immediately, mirroring
 * the Settings language control — but small enough to drop into a header
 * (e.g. the El Jardín hub, which defaults to Spanish).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import i18n from "@/i18n";

const FONT = "'Space Grotesk', system-ui, sans-serif";

export function LanguageToggle() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const current: "en" | "es" =
    user?.locale === "es" ? "es"
    : user?.locale === "en" ? "en"
    : (i18n.language?.startsWith("es") ? "es" : "en");

  const save = useMutation({
    mutationFn: (locale: "en" | "es") => apiRequest("PATCH", "/api/auth/me/locale", { locale }),
    onSuccess: (_d, locale) => {
      try { localStorage.setItem("phoebe:locale", locale); } catch { /* private mode */ }
      void i18n.changeLanguage(locale);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const opt = (value: "es" | "en", label: string) => {
    const active = current === value;
    return (
      <button
        type="button"
        onClick={() => { if (!active) save.mutate(value); }}
        aria-pressed={active}
        className="px-3 py-1 text-xs font-semibold transition-colors"
        style={{
          background: active ? "rgba(46,107,64,0.45)" : "transparent",
          color: active ? "#F0EDE6" : "rgba(143,175,150,0.7)",
          border: "none",
          cursor: active ? "default" : "pointer",
          fontFamily: FONT,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="inline-flex rounded-full overflow-hidden"
      style={{ border: "1px solid rgba(46,107,64,0.35)", opacity: save.isPending ? 0.6 : 1 }}
    >
      {opt("es", "ES")}
      <span style={{ width: 1, background: "rgba(46,107,64,0.35)" }} />
      {opt("en", "EN")}
    </div>
  );
}
