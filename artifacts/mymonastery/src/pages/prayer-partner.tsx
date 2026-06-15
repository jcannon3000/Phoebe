import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PartnerExchange } from "@/components/PartnerExchange";
import { PartnerPairing } from "@/components/PartnerPairing";

// /prayer-partner — the full prayer-dialogue experience: your prayer for the
// day + your partner threads (PartnerExchange), then pairing (invites + add).
// Also the deep-link target for the "shared their prayer" / invite pushes.
export default function PrayerPartnerPage() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4">
        <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
          ← {t("common.home", { defaultValue: "Home" })}
        </Link>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("prayer_partner.page_title", { defaultValue: "Prayer partners" })}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          {t("prayer_partner.page_subtitle", { defaultValue: "Share a prayer each day and hold each other in it." })}
        </p>
        <PartnerExchange />
        <div className="mt-8">
          <PartnerPairing />
        </div>
      </div>
    </Layout>
  );
}
