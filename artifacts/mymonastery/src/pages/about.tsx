import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function AboutPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("about.title")}
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("about.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl px-5 py-5"
            style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.18)" }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
              {t("about.p1")}
            </p>
            <p className="text-sm leading-relaxed mt-3" style={{ color: "#C8D4C0" }}>
              {t("about.p2")}
            </p>
            <p className="text-sm leading-relaxed mt-3" style={{ color: "#C8D4C0" }}>
              {t("about.p3")}
            </p>
          </div>

          <div
            className="rounded-xl px-5 py-4 text-center"
            style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}
          >
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
              {t("about.built_with_care")}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
