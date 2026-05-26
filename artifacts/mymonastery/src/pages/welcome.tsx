import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";

// Post-signup picker. Currently a single path — browse communities.
// (Climate used to be Path A here as a separate top-level feature with
// its own one-tap signup; it's now just one of many prayer feeds and
// subscribed to from /prayer-feeds, so this page stopped offering a
// dedicated climate button.) Skippable: "I'll explore on my own"
// drops the user on the dashboard.
export default function WelcomePage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col gap-8 pt-2 max-w-md mx-auto w-full">
        <div className="flex flex-col gap-2 text-center">
          <div className="text-5xl">🌿</div>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: "#F0EDE6",
              letterSpacing: "-0.03em",
            }}
          >
            {t("welcome.title")}
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("welcome.subtitle")}
          </p>
        </div>

        {/* Community. Request to join, admin approves. */}
        <Link
          href="/communities/browse"
          className="block text-left rounded-2xl px-5 py-5 transition-opacity hover:opacity-90"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.18)",
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🤝🏽</span>
            <div className="min-w-0">
              <p
                className="text-base font-semibold"
                style={{
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {t("welcome.find_community")}
              </p>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                {t("welcome.find_community_body")}
              </p>
              <p
                className="text-xs mt-2 font-semibold"
                style={{ color: "#A8C5A0" }}
              >
                {t("welcome.browse_cta")}
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard"
          className="text-xs text-center mt-2"
          style={{ color: "rgba(143,175,150,0.65)" }}
        >
          {t("welcome.explore_alone")}
        </Link>
      </div>
    </Layout>
  );
}
