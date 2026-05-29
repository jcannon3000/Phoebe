import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "#091A10" }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-6">✉️</div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("not_found.title")}
        </h1>
        <p className="text-base mb-8" style={{ color: "#8FAF96" }}>
          {t("not_found.body")}
        </p>
        <button
          onClick={() => setLocation("/dashboard")}
          className="px-6 py-3 rounded-xl font-semibold text-sm"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {t("not_found.back")}
        </button>
      </div>
    </div>
  );
}
