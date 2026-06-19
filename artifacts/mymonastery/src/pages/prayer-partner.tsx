import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
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

// /prayer-partner — the Heart to Hearts home: your fellows. Ongoing exchanges
// open the back-and-forth thread; fellows you haven't started with get a "Start"
// pill → a "How can {name} pray for you today?" slide → the thread. Then pairing
// (incoming invites + invite link) for bringing in someone new.
export default function PrayerPartnerPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const fellowsQ = useQuery<{ fellows: Fellow[] }>({ queryKey: ["/api/fellows"], queryFn: () => apiRequest("GET", "/api/fellows") });
  const { data: today } = useDailyPrayerToday();
  const start = useStartHeartToHeart();
  const [composeFor, setComposeFor] = useState<Fellow | null>(null);
  const [draft, setDraft] = useState("");

  const fellows = fellowsQ.data?.fellows ?? [];
  const partners = today?.partners ?? [];
  const partnerById = new Map(partners.filter((p) => p.partner).map((p) => [p.partner!.id, p]));
  const ongoing = fellows.filter((f) => partnerById.has(f.userId));
  const toStart = fellows.filter((f) => !partnerById.has(f.userId));

  const openThread = (id: number) => setLocation(`/prayer-partner/${id}`);
  const openCompose = (f: Fellow) => { setDraft(""); start.reset(); setComposeFor(f); };
  const send = () => {
    const body = draft.trim();
    if (!body || !composeFor || start.isPending) return;
    const id = composeFor.userId;
    start.mutate({ partnerUserId: id, body }, {
      onSuccess: () => { setComposeFor(null); setDraft(""); openThread(id); },
    });
  };
  const first = firstName(composeFor?.name);

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4">
        <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: SAGE }}>
          ← {t("common.home", { defaultValue: "Home" })}
        </Link>
        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          {t("prayer_partner.page_title", { defaultValue: "Heart to Hearts" })}
        </h1>
        <p className="text-sm mb-6" style={{ color: SAGE }}>
          {t("prayer_partner.page_subtitle", { defaultValue: "Share what's on your heart each day — and hold each other in prayer, back and forth." })}
        </p>

        {/* Ongoing Heart to Hearts — tap to open the back-and-forth. */}
        {ongoing.length > 0 && (
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("prayer_partner.ongoing", { defaultValue: "Your Heart to Hearts" })}
            </p>
            <div className="flex flex-col gap-2.5">
              {ongoing.map((f) => {
                const p = partnerById.get(f.userId)!;
                const isNew = p.isNew;
                const sub = isNew
                  ? t("prayer_partner.new_prayer", { defaultValue: "🙏 New prayer — tap to open" })
                  : p.streak > 0
                    ? t("prayer_partner.streak_days", { count: p.streak, defaultValue: `🔥 ${p.streak}-day streak` })
                    : t("prayer_partner.page_subtitle_short", { defaultValue: "A daily back-and-forth of prayer." });
                return (
                  <button key={f.userId} type="button" onClick={() => openThread(f.userId)}
                    className="w-full text-left rounded-2xl p-3 flex items-center gap-3 active:scale-[0.99]"
                    style={{ background: `rgba(${G},${isNew ? 0.18 : 0.09})`, border: `1px solid rgba(${G},${isNew ? 0.45 : 0.24})` }}>
                    <div className="relative">
                      <Avatar url={f.avatarUrl} name={f.name} />
                      {isNew && <span className="absolute -top-0.5 -right-0.5 rounded-full" style={{ width: 12, height: 12, background: "#A8C5A0", border: "2px solid #0C1F12" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15.5px] font-bold truncate" style={{ color: WARM, fontFamily: FONT }}>{f.name ?? "Someone"}</p>
                      <p className="text-[12.5px] truncate" style={{ color: isNew ? "#A8C5A0" : SAGE, fontFamily: FONT }}>{sub}</p>
                    </div>
                    <span aria-hidden style={{ color: SAGE }}>→</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Fellows you can start a Heart to Heart with. */}
        {toStart.length > 0 && (
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("prayer_partner.start_with_fellow", { defaultValue: "Start a Heart to Heart" })}
            </p>
            <div className="flex flex-col gap-2.5">
              {toStart.map((f) => (
                <div key={f.userId} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: `rgba(${G},0.09)`, border: `1px solid rgba(${G},0.24)` }}>
                  <Avatar url={f.avatarUrl} name={f.name} />
                  <p className="flex-1 min-w-0 text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{f.name ?? "Someone"}</p>
                  <button type="button" onClick={() => openCompose(f)}
                    className="rounded-full px-5 py-1.5 text-[13px] font-semibold active:scale-[0.98]"
                    style={{ background: `rgba(${G},0.9)`, color: WARM, border: "1px solid rgba(110,180,130,0.5)", fontFamily: FONT }}>
                    {t("prayer_partner.start", { defaultValue: "Start" })}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {fellows.length === 0 && (
          <p className="text-[14px] mb-7" style={{ color: SAGE, fontFamily: FONT }}>
            {t("prayer_partner.no_fellows", { defaultValue: "Add a fellow below to start a Heart to Heart." })}
          </p>
        )}

        <PartnerPairing />
      </div>

      {/* "How can {name} pray for you today?" slide — begins the exchange. */}
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
              <button type="button" onClick={() => setComposeFor(null)} aria-label={t("common.cancel", { defaultValue: "Cancel" })}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] active:scale-[0.95]"
                style={{ background: `rgba(${G},0.18)`, border: `1px solid rgba(${G},0.35)`, color: "#C8D4C0", fontFamily: FONT }}>×</button>
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
              <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
                placeholder={t("prayer_partner.how_can_pray_placeholder", { defaultValue: "Share what you're carrying…" })}
                className="flex-1 min-h-[120px] bg-transparent outline-none resize-none w-full"
                style={{ color: "#E8E4D8", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 21, lineHeight: 1.55, textShadow: "0 1px 12px rgba(8,30,18,0.5)" }} />
            </div>
            <div className="w-full max-w-lg mx-auto px-8 flex flex-col items-center gap-2.5">
              {start.isError && (
                <p className="text-[13px]" style={{ color: "#E0A87E", fontFamily: FONT }}>
                  {t("prayer_partner.send_error", { defaultValue: "Couldn't send just now — please try again." })}
                </p>
              )}
              <button type="button" onClick={send} disabled={!draft.trim() || start.isPending}
                className="w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40 active:scale-[0.99]"
                style={{ background: `rgba(${G},0.92)`, color: WARM, border: "1px solid rgba(140,195,160,0.45)", fontFamily: FONT }}>
                {start.isPending ? t("prayer_partner.sending", { defaultValue: "Sending…" }) : t("prayer_partner.send_to", { name: first, defaultValue: `Send to ${first}` })}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
