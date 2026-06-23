/**
 * Fellows page — the dedicated "add a fellow" surface, reached from the People
 * page's "Add a fellow" pill. Hosts the full FellowsConnect manage card (search
 * + contacts + incoming requests + your fellows with remove), keeping the People
 * page itself clean (just your fellows + the pill).
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { FellowsConnect } from "@/components/FellowsConnect";
import { useBetaStatus } from "@/hooks/useDemo";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function FellowsPage() {
  const { t } = useTranslation();
  const { rawIsBeta } = useBetaStatus();
  // Leaf backdrop — matches the Community page; FellowsConnect's cards are
  // already frosted glass (FROST_BLUR) so they read over the foliage.
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  return (
    <Layout bgPhoto={leafBg}>
      <div className="max-w-2xl mx-auto w-full pb-20">
        <Link href="/people" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("people.title", { defaultValue: "People" })}
        </Link>
        <div className="mb-4">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("fellows_page.eyebrow", { defaultValue: "Fellows" })}
          </p>
          <h1 style={{ color: WARM, fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT }}>
            {t("fellows_page.title", { defaultValue: "Add a fellow" })}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>
            {t("fellows_page.subtitle", { defaultValue: "Search for someone, find them from your contacts, or accept a request. Fellows pray with you and see each other's requests." })}
          </p>
        </div>
        <FellowsConnect variant="manage" canManage={rawIsBeta} />
      </div>
    </Layout>
  );
}
