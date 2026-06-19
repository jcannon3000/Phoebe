import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { PartnerExchange } from "@/components/PartnerExchange";
import { PartnerPairing } from "@/components/PartnerPairing";
import { useDailyPrayerToday, useStartHeartToHeart } from "@/hooks/useDailyPrayer";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', sans-serif";
const G = "46,107,64";

type Fellow = { userId: number; name: string | null; avatarUrl: string | null; streak: number };

function firstName(n: string | null | undefined) { return (n ?? "").trim().split(/\s+/)[0] || (n ?? "Someone"); }

function Avatar({ url, name, size = 44 }: { url: string | null; name: string | null; size?: number }) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  if (url) return <img src={url} alt={name ?? ""} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, border: "1.5px solid #1A4A2E" }} />;
  return <div className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ width: size, height: size, fontSize: size * 0.4, background: "#1A4A2E", color: "#A8C5A0" }}>{initial}</div>;
}

// StartWithFellows — your fellows you haven't started a Heart to Heart with yet.
// Each has a "Start" pill that opens a "How can {name} pray for you today?"
// slide; sending it begins the back-and-forth (the fellow then appears as an
// ongoing Heart to Heart above).
function StartWithFellows() {
  const { t } = useTranslation();
  const fellowsQ = useQuery<{ fellows: Fellow[] }>({ queryKey: ["/api/fellows"], queryFn: () => apiRequest("GET", "/api/fellows") });
  const { data: today } = useDailyPrayerToday();
  const start = useStartHeartToHeart();
  const [composeFor, setComposeFor] = useState<Fellow | null>(null);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);

  const partnerIds = new Set((today?.partners ?? []).map((p) => p.partner?.id).filter((id): id is number => typeof id === "number"));
  const fellows = fellowsQ.data?.fellows ?? [];
  const unstarted = fellows.filter((f) => !partnerIds.has(f.userId));

  if (unstarted.length === 0) return null;

  const open = (f: Fellow) => { setDraft(""); setSent(false); start.reset(); setComposeFor(f); };
  const send = () => {
    const body = draft.trim();
    if (!body || !composeFor || start.isPending) return;
    start.mutate({ partnerUserId: composeFor.userId, body }, {
      onSuccess: () => { setSent(true); setComposeFor(null); setDraft(""); },
    });
  };

  const first = firstName(composeFor?.name);

  return (
    <div className="mt-8">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: FAINT, fontFamily: FONT }}>
        {t("prayer_partner.start_with_fellow", { defaultValue: "Start a Heart to Heart" })}
      </p>
      {sent && (
        <p className="text-[12.5px] mb-2" style={{ color: "#A8C5A0", fontFamily: FONT }}>
          🌿 Your Heart to Heart is on its way.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {unstarted.map((f) => (
          <div key={f.userId} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: `rgba(${G},0.09)`, border: `1px solid rgba(${G},0.24)` }}>
            <Avatar url={f.avatarUrl} name={f.name} />
            <p className="flex-1 min-w-0 text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{f.name ?? "Someone"}</p>
            <button
              type="button"
              onClick={() => open(f)}
              className="rounded-full px-5 py-1.5 text-[13px] font-semibold active:scale-[0.98]"
              style={{ background: `rgba(${G},0.9)`, color: WARM, border: "1px solid rgba(110,180,130,0.5)", fontFamily: FONT }}
            >
              {t("prayer_partner.start", { defaultValue: "Start" })}
            </button>
          </div>
        ))}
      </div>

      {/* "How can {name} pray for you today?" slide. */}
      <AnimatePresence>
        {composeFor && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[280] flex flex-col"
            style={{
              background: "radial-gradient(130% 95% at 50% 22%, #163524 0%, #0C1F12 52%, #06120C 100%)",
              paddingTop: "calc(var(--safe-top) + 14px)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
            }}>
            <div className="px-5">
              <button
                type="button"
                onClick={() => setComposeFor(null)}
                aria-label={t("common.cancel", { defaultValue: "Cancel" })}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] active:scale-[0.95]"
                style={{ background: `rgba(${G},0.18)`, border: `1px solid rgba(${G},0.35)`, color: "#C8D4C0", fontFamily: FONT }}
              >×</button>
            </div>

            <div className="flex-1 flex flex-col w-full max-w-lg mx-auto px-8 overflow-y-auto">
              <div className="flex flex-col items-center text-center mt-1 mb-5">
                <Avatar url={composeFor.avatarUrl} name={composeFor.name} size={64} />
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mt-3" style={{ color: FAINT, fontFamily: FONT }}>
                  {t("prayer_partner.page_title", { defaultValue: "Heart to Heart" })}
                </p>
                <h1 className="text-[22px] font-semibold mt-1" style={{ color: WARM, fontFamily: FONT, lineHeight: 1.3 }}>
                  {t("prayer_partner.how_can_pray", { name: first, defaultValue: `How can ${first} pray for you today?` })}
                </h1>
              </div>

              <textarea
                autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
                placeholder={t("prayer_partner.how_can_pray_placeholder", { defaultValue: "Share what you're carrying…" })}
                className="flex-1 min-h-[120px] bg-transparent outline-none resize-none w-full"
                style={{ color: "#E8E4D8", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 21, lineHeight: 1.55, textShadow: "0 1px 12px rgba(8,30,18,0.5)" }}
              />
            </div>

            <div className="w-full max-w-lg mx-auto px-8 flex flex-col items-center gap-2.5">
              {start.isError && (
                <p className="text-[13px]" style={{ color: "#E0A87E", fontFamily: FONT }}>
                  {t("prayer_partner.send_error", { defaultValue: "Couldn't send just now — please try again." })}
                </p>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || start.isPending}
                className="w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40 active:scale-[0.99]"
                style={{ background: `rgba(${G},0.92)`, color: WARM, border: "1px solid rgba(140,195,160,0.45)", fontFamily: FONT }}
              >
                {start.isPending ? t("prayer_partner.sending", { defaultValue: "Sending…" }) : t("prayer_partner.send_to", { name: first, defaultValue: `Send to ${first}` })}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// /prayer-partner — the full Heart to Hearts experience: your ongoing exchanges
// (PartnerExchange, hidden when you have none so there's no dead-end), then your
// fellows you can start one with, then pairing (incoming invites + invite link).
export default function PrayerPartnerPage() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4">
        <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: SAGE }}>
          ← {t("common.home", { defaultValue: "Home" })}
        </Link>
        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("prayer_partner.page_title", { defaultValue: "Heart to Hearts" })}
        </h1>
        <p className="text-sm mb-6" style={{ color: SAGE }}>
          {t("prayer_partner.page_subtitle", { defaultValue: "Share what's on your heart each day — and hold each other in prayer, back and forth." })}
        </p>
        <PartnerExchange hideWhenEmpty />
        <StartWithFellows />
        <div className="mt-8">
          <PartnerPairing />
        </div>
      </div>
    </Layout>
  );
}
