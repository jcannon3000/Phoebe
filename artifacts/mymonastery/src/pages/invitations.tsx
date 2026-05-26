import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

export default function InvitationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("invitations.title")} 📩
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("invitations.subtitle")}
          </p>
        </div>

        {/* Empty state */}
        <div
          className="rounded-xl px-5 py-8 text-center"
          style={{ background: "transparent", border: "1px dashed rgba(46,107,64,0.3)" }}
        >
          <p className="text-2xl mb-3">📩</p>
          <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>
            {t("invitations.empty_title")}
          </p>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("invitations.empty_body")}
          </p>
        </div>
      </div>
    </Layout>
  );
}
