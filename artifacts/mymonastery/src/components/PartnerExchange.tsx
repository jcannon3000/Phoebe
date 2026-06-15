import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useDailyPrayerToday, useShareDailyPrayer, type PartnerThreadSummary, type ShareReceipt } from "@/hooks/useDailyPrayer";
import { PrayerAttentionView } from "@/components/PrayerAttentionView";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', sans-serif";
const G = "46,107,64"; // home/office green

function Avatar({ url, name, size = 40 }: { url: string | null | undefined; name: string | null; size?: number }) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  if (url) return <img src={url} alt={name ?? ""} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, border: "1.5px solid #1A4A2E" }} />;
  return <div className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ width: size, height: size, fontSize: size * 0.4, background: "#1A4A2E", color: "#A8C5A0" }}>{initial}</div>;
}

function firstName(n: string | null | undefined) { return (n ?? "").trim().split(/\s+/)[0] || (n ?? "Someone"); }

// PartnerExchange — replaces the old home prayer list. Your prayer for the day
// (compose, or shared + receipts) above your prayer-partner threads.
export function PartnerExchange() {
  const { t } = useTranslation();
  const { data, isLoading } = useDailyPrayerToday();
  const share = useShareDailyPrayer();
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attend, setAttend] = useState<{ id: number; body: string; name: string; avatar: string | null } | null>(null);

  if (isLoading || !data) return null;

  // No partner yet → a gentle invitation to pair.
  if (data.status === "none") {
    return (
      <Link href="/prayer-partner" className="block">
        <div className="rounded-3xl px-5 py-6 text-center" style={{ background: `rgba(${G},0.10)`, border: `1px solid rgba(${G},0.30)` }}>
          <div className="text-[30px] mb-2">💛</div>
          <p className="text-[16px] font-bold" style={{ color: WARM, fontFamily: FONT }}>{t("prayer_partner.empty_title", { defaultValue: "Start a Heart to Heart" })}</p>
          <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>{t("prayer_partner.empty_blurb", { defaultValue: "Share what's on your heart each day — and hold each other in prayer, back and forth." })}</p>
        </div>
      </Link>
    );
  }

  const submitShare = () => {
    const body = draft.trim();
    if (!body || share.isPending) return;
    share.mutate(body, { onSuccess: () => { setDraft(""); setComposeOpen(false); } });
  };

  return (
    <div>
      {/* ── Your prayer for the day ─────────────────────────────────── */}
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: FAINT, fontFamily: FONT }}>
        💛 {t("prayer_partner.your_prayer_eyebrow", { defaultValue: "What's on your heart" })}
      </p>

      {data.mine ? (
        <div className="rounded-3xl px-5 py-4 mb-6" style={{ background: `rgba(${G},0.12)`, border: `1px solid rgba(${G},0.32)` }}>
          <p style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 17, lineHeight: 1.5 }}>{data.mine.body}</p>
          <Receipts receipts={data.shareReceipts} t={t} />
        </div>
      ) : (
        <button
          onClick={() => setComposeOpen(true)}
          className="w-full text-left rounded-3xl px-5 py-4 mb-6 active:scale-[0.99] transition-transform"
          style={{ background: data.shouldPromptSendBack ? `rgba(${G},0.20)` : `rgba(${G},0.10)`, border: `1px solid rgba(${G},${data.shouldPromptSendBack ? 0.5 : 0.28})` }}
        >
          <p className="text-[16px] font-bold" style={{ color: WARM, fontFamily: FONT }}>
            {data.shouldPromptSendBack
              ? t("prayer_partner.send_back_title", { defaultValue: "Share what's on your heart back" })
              : t("prayer_partner.share_title", { defaultValue: "Share what's on your heart" })}
          </p>
          <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>
            {t("prayer_partner.share_blurb", { defaultValue: "One prayer a day, heart to heart." })} →
          </p>
        </button>
      )}

      {/* ── Partner threads ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: FAINT, fontFamily: FONT }}>
          {t("prayer_partner.partners_eyebrow", { defaultValue: "Heart to Hearts" })}
        </p>
        <Link href="/prayer-partner" className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>{t("common.manage", { defaultValue: "Manage" })}</Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {data.partners.map((p) => (
          <PartnerCard key={p.partner?.id ?? Math.random()} p={p} t={t}
            onOpen={() => p.theirLatest && p.partner && setAttend({ id: p.theirLatest.id, body: p.theirLatest.body, name: p.partner.name ?? "", avatar: p.partner.avatarUrl })}
          />
        ))}
      </div>

      {/* ── Compose modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {composeOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[280] flex flex-col" style={{ background: "rgba(9,26,16,0.96)", paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}>
            <div className="flex items-center justify-between px-5 mb-4">
              <button onClick={() => setComposeOpen(false)} className="text-[15px]" style={{ color: SAGE, fontFamily: FONT }}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
              <button onClick={submitShare} disabled={!draft.trim() || share.isPending}
                className="rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-40"
                style={{ background: `rgba(${G},0.9)`, color: WARM, fontFamily: FONT }}>
                {t("prayer_partner.share_cta", { defaultValue: "Share" })}
              </button>
            </div>
            <p className="px-6 text-[13px] mb-3" style={{ color: SAGE, fontFamily: FONT }}>{t("prayer_partner.compose_prompt", { defaultValue: "What's on your heart today?" })}</p>
            <textarea
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
              placeholder={t("prayer_partner.compose_placeholder", { defaultValue: "Lord, today I'm carrying…" })}
              className="flex-1 bg-transparent outline-none resize-none px-6"
              style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 21, lineHeight: 1.5 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Attention overlay ───────────────────────────────────────── */}
      <AnimatePresence>
        {attend && (
          <PrayerAttentionView
            dailyPrayerId={attend.id} body={attend.body} partnerName={attend.name} partnerAvatarUrl={attend.avatar}
            alreadyCounted={false} canSendBack={data.canShareToday}
            onClose={() => setAttend(null)}
            onSendBack={() => { setAttend(null); setComposeOpen(true); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Receipts({ receipts, t }: { receipts: ShareReceipt[]; t: (k: string, o?: Record<string, unknown>) => string }) {
  const prayed = receipts.filter((r) => r.counted);
  if (receipts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(143,175,150,0.14)" }}>
      <div className="flex -space-x-2">
        {receipts.slice(0, 5).map((r, i) => <Avatar key={i} url={r.partner?.avatarUrl} name={r.partner?.name ?? null} size={24} />)}
      </div>
      <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
        {prayed.length > 0
          ? t("prayer_partner.prayed_by_n", { count: prayed.length, defaultValue: `Prayed by ${prayed.length}` })
          : t("prayer_partner.shared_with_partners", { defaultValue: "Shared with your partners" })}
      </p>
    </div>
  );
}

function PartnerCard({ p, onOpen, t }: { p: PartnerThreadSummary; onOpen: () => void; t: (k: string, o?: Record<string, unknown>) => string }) {
  const has = !!p.theirLatest;
  const name = firstName(p.partner?.name);
  return (
    <button onClick={onOpen} disabled={!has}
      className="w-full text-left rounded-2xl p-3.5 flex items-center gap-3.5 transition-transform active:scale-[0.99] disabled:opacity-70"
      style={{ background: p.isNew ? `rgba(${G},0.18)` : `rgba(${G},0.09)`, border: `1px solid rgba(${G},${p.isNew ? 0.45 : 0.24})` }}>
      <div className="relative">
        <Avatar url={p.partner?.avatarUrl} name={p.partner?.name ?? null} size={46} />
        {p.isNew && <span className="absolute -top-0.5 -right-0.5 rounded-full" style={{ width: 12, height: 12, background: "#A8C5A0", border: "2px solid #0C1F12" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[15.5px] font-bold truncate" style={{ color: WARM, fontFamily: FONT }}>{name}</p>
          {p.streak > 0 && <span className="text-[12px] flex-shrink-0" style={{ color: "#D4A046", fontFamily: FONT }}>🔥 {p.streak}</span>}
        </div>
        <p className="text-[13px] truncate mt-0.5" style={{ color: p.isNew ? "#A8C5A0" : SAGE, fontFamily: FONT, fontStyle: has ? "italic" : "normal" }}>
          {has
            ? (p.myAttention.counted ? `✓ ${t("prayer_partner.you_prayed", { defaultValue: "You prayed this" })}` : p.theirLatest!.body)
            : t("prayer_partner.no_prayer_yet", { defaultValue: "Hasn't shared today" })}
        </p>
      </div>
      {has && !p.myAttention.counted && <span style={{ color: SAGE }} aria-hidden>→</span>}
    </button>
  );
}
