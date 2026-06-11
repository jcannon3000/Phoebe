/**
 * Group streak leaderboard — ranks the members of an El Jardín group by their
 * daily-prayer streak. A group-scoped alternative to the friend-list board.
 */

import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Member = { userId: number; name: string | null; avatarUrl: string | null; streak: number; lastDate: string | null; isMe: boolean };

function isToday(d: string | null): boolean {
  return !!d && d === new Date().toISOString().slice(0, 10);
}

export default function GroupLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: [`/api/groups/${slug}/leaderboard`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/leaderboard`),
  });
  const streakLabel = (n: number): string =>
    n === 0 ? t("jardin.streak_none") : n === 1 ? t("jardin.streak_one") : t("jardin.streak_other", { count: n });
  const members = data?.members ?? [];

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0" style={{ fontFamily: FONT }}>
        <Link href={`/communities/${slug}`} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("forum.back", { defaultValue: "Back to group" })}
        </Link>
        <h1 className="text-2xl font-bold mb-5" style={{ color: WARM }}>{t("jardin.leaderboard")}</h1>

        {isLoading ? (
          <p className="text-sm" style={{ color: SAGE_DIM }}>{t("common.loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-sm" style={{ color: SAGE_DIM }}>{t("jardin.add_friends_hint")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m, idx) => {
              const hot = isToday(m.lastDate);
              return (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{
                    background: m.isMe ? "rgba(46,107,64,0.18)" : CARD,
                    border: `1px solid ${m.isMe ? "rgba(168,197,160,0.4)" : CARD_B}`,
                  }}
                >
                  <span style={{ color: SAGE_DIM, fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: "center" }}>{idx + 1}</span>
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name ?? ""} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(46,107,64,0.3)", color: "#A8C5A0", fontSize: 12, fontWeight: 700 }}>
                      {(m.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate" style={{ color: WARM }}>
                      {m.name ?? "—"}{m.isMe ? ` (${t("jardin.you_paren")})` : ""}
                    </p>
                    <p className="text-[12px]" style={{ color: SAGE }}>{streakLabel(m.streak)}{hot ? " 🔥" : ""}</p>
                  </div>
                  <span style={{ color: WARM, fontSize: 20, fontWeight: 700 }}>{m.streak}</span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[12px] mt-4 leading-relaxed" style={{ color: SAGE_DIM }}>
          {t("jardin.streak_footnote")}
        </p>
      </div>
    </Layout>
  );
}
