import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { usePrayerThread, useDailyPrayerToday, useShareDailyPrayer } from "@/hooks/useDailyPrayer";

// /prayer-partner/:partnerId — the actual Heart to Heart: the back-and-forth
// with one fellow. Their prayers + yours, oldest → newest; you pray theirs (a
// receipt they see) and share your own back. The volley cadence: one prayer a
// day each, sealed until the next morning.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const G = "46,107,64";

function firstName(n: string | null | undefined) { return (n ?? "").trim().split(/\s+/)[0] || (n ?? "Someone"); }

function Avatar({ url, name, size = 40 }: { url: string | null | undefined; name: string | null; size?: number }) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  if (url) return <img src={url} alt={name ?? ""} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, border: "1.5px solid #1A4A2E" }} />;
  return <div className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ width: size, height: size, fontSize: size * 0.4, background: "#1A4A2E", color: "#A8C5A0" }}>{initial}</div>;
}

export default function PrayerThreadPage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/prayer-partner/:partnerId");
  const partnerId = params?.partnerId ? Number(params.partnerId) : NaN;
  const valid = Number.isFinite(partnerId);
  const qc = useQueryClient();

  const { data: thread, isLoading } = usePrayerThread(valid ? partnerId : null);
  const { data: today } = useDailyPrayerToday();
  const share = useShareDailyPrayer();
  const [draft, setDraft] = useState("");

  const partner = thread?.partner ?? null;
  const first = firstName(partner?.name);
  const items = thread?.items ?? [];
  const streak = thread?.streak ?? 0;

  // You share one prayer a day (it volleys to your fellow next morning). Once
  // you've shared today, the composer rests until tomorrow.
  const sharedToday = !!today?.mine;
  const canShare = today?.canShareToday !== false && !sharedToday;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/prayer-thread/${partnerId}`] });
    qc.invalidateQueries({ queryKey: ["/api/daily-prayer/today"] });
  };
  const pray = (id: number) => {
    void apiRequest("POST", `/api/daily-prayer/${id}/attention`, { seconds: 3 }).then(invalidate).catch(() => { /* best-effort */ });
  };
  const send = () => {
    const body = draft.trim();
    if (!body || share.isPending) return;
    share.mutate(body, { onSuccess: () => { setDraft(""); invalidate(); } });
  };

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-28 px-4">
        <Link href="/prayer-partner" className="text-sm mb-3 inline-block" style={{ color: SAGE }}>
          ← {t("prayer_partner.page_title", { defaultValue: "Heart to Hearts" })}
        </Link>

        {/* Who you're praying with. */}
        <div className="flex items-center gap-3 mb-5">
          <Avatar url={partner?.avatarUrl} name={partner?.name ?? null} size={46} />
          <div className="flex-1 min-w-0">
            <p className="text-[18px] font-bold truncate" style={{ color: WARM, fontFamily: FONT }}>{partner?.name ?? first}</p>
            <p className="text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>
              {streak > 0
                ? t("prayer_partner.streak_days", { count: streak, defaultValue: `🔥 ${streak}-day Heart to Heart` })
                : t("prayer_partner.page_subtitle_short", { defaultValue: "A daily back-and-forth of prayer." })}
            </p>
          </div>
        </div>

        {/* The exchange. */}
        {isLoading ? (
          <p className="text-[14px] py-6 text-center" style={{ color: SAGE, fontFamily: FONT }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl px-5 py-8 text-center mb-5" style={{ background: `rgba(${G},0.08)`, border: `1px solid rgba(${G},0.22)` }}>
            <div className="text-[26px] mb-2">💚</div>
            <p className="text-[14px]" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
              {t("prayer_partner.thread_empty", { name: first, defaultValue: `Begin your Heart to Heart with ${first} — share what's on your heart below.` })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-5">
            {items.map((it) => {
              const mine = it.isMine;
              const prayed = !!it.attention?.counted;
              const dateStr = it.createdAt ? new Date(it.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
              return (
                <div key={it.id} className={`w-full flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{
                      maxWidth: "85%",
                      background: mine ? `rgba(${G},0.20)` : "rgba(143,175,150,0.10)",
                      border: `1px solid ${mine ? `rgba(${G},0.4)` : "rgba(143,175,150,0.22)"}`,
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-1" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
                      {mine ? t("prayer_partner.you", { defaultValue: "You" }) : first} {dateStr && `· ${dateStr}`}
                    </p>
                    <p style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 16.5, lineHeight: 1.5 }}>{it.body}</p>
                    {/* Receipt / pray action. For MY prayers, whether THEY prayed it;
                        for THEIRS, whether I have — with a one-tap "pray this". */}
                    {mine ? (
                      prayed && (
                        <p className="text-[12px] mt-2" style={{ color: "#A8C5A0", fontFamily: FONT }}>🕊️ {t("prayer_partner.they_prayed", { name: first, defaultValue: `${first} prayed this` })}</p>
                      )
                    ) : prayed ? (
                      <p className="text-[12px] mt-2" style={{ color: "#A8C5A0", fontFamily: FONT }}>🕊️ {t("prayer_partner.you_prayed_this", { defaultValue: "You prayed this" })}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pray(it.id)}
                        className="mt-2.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold active:scale-[0.98]"
                        style={{ background: `rgba(${G},0.85)`, color: WARM, border: "1px solid rgba(110,180,130,0.5)", fontFamily: FONT }}
                      >
                        🙏 {t("prayer_partner.pray_this", { defaultValue: "Pray this" })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Your turn — share today's prayer (it reaches {first} in the morning). */}
        {canShare ? (
          <div className="rounded-2xl p-3 mt-1" style={{ background: `rgba(${G},0.10)`, border: `1px solid rgba(${G},0.3)` }}>
            <p className="text-[13px] mb-2" style={{ color: SAGE, fontFamily: FONT }}>
              {t("prayer_partner.how_can_pray", { name: first, defaultValue: `How can ${first} pray for you today?` })}
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("prayer_partner.how_can_pray_placeholder", { defaultValue: "Share what you're carrying…" })}
              className="w-full bg-transparent outline-none resize-none rounded-xl px-3 py-2.5"
              style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.5, border: "1px solid rgba(46,107,64,0.3)" }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || share.isPending}
              className="w-full rounded-full py-3 mt-2 text-[14px] font-semibold disabled:opacity-40 active:scale-[0.99]"
              style={{ background: `rgba(${G},0.92)`, color: WARM, border: "1px solid rgba(140,195,160,0.45)", fontFamily: FONT }}
            >
              {share.isPending ? t("prayer_partner.sending", { defaultValue: "Sending…" }) : t("prayer_partner.share_cta", { defaultValue: "Share" })}
            </button>
          </div>
        ) : sharedToday ? (
          <p className="text-[12.5px] text-center mt-2" style={{ color: SAGE, fontFamily: FONT }}>
            🌅 {t("prayer_partner.shared_today_note", { name: first, defaultValue: `You've shared today — ${first} will receive it in the morning.` })}
          </p>
        ) : null}
      </div>
    </Layout>
  );
}
