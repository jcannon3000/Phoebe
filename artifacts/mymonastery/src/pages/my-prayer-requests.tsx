import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";

export default function MyPrayerRequestsPage() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-6 transition-opacity hover:opacity-80"
          style={{ color: "#8FAF96" }}
        >
          <ChevronLeft size={14} />
          {t("my_prayer_requests.back")}
        </Link>

        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "#F0EDE6", letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {t("my_prayer_requests.title")}
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(200,212,192,0.6)" }}>
          {t("my_prayer_requests.subtitle")}
        </p>

        <PrayerSection
          filterMode="own"
          hideHeader
          hideEntry
          emptyText={t("my_prayer_requests.empty")}
        />
      </div>
    </Layout>
  );
}
