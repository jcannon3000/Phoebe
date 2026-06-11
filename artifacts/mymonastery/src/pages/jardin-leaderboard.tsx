import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Friend = { id: number; username: string; displayName: string; streak: number; lastDate: string | null };
type LeaderboardData = {
  self: { id: number; username: string; streak: number; lastDate: string | null };
  friends: Friend[];
};

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return dateStr === new Date().toISOString().slice(0, 10);
}

export default function JardinLeaderboardPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [addError, setAddError] = useState("");
  const [confirm, setConfirm] = useState<number | null>(null);

  const streakLabel = (n: number): string =>
    n === 0 ? t("jardin.streak_none") : n === 1 ? t("jardin.streak_one") : t("jardin.streak_other", { count: n });

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/jardin/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/jardin/leaderboard"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/jardin/leaderboard"] });

  const add = useMutation({
    mutationFn: (u: string) => apiRequest("POST", "/api/jardin/friends", { username: u }),
    onSuccess: () => { invalidate(); setUsername(""); setAddError(""); },
    onError: (e: any) => setAddError(e?.message ?? t("jardin.user_not_found")),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jardin/friends/${id}`),
    onSuccess: () => { invalidate(); setConfirm(null); },
  });

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };

  const allEntries: Array<Friend | { id: number; username: string; streak: number; lastDate: string | null; isSelf: true }> = data
    ? [{ ...data.self, isSelf: true as const }, ...data.friends]
    : [];
  allEntries.sort((a, b) => b.streak - a.streak);

  const friends = data?.friends ?? [];

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/menu/jardin")}
          style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
          ← El Jardín
        </button>

        <p style={{ ...eyebrow, margin: "4px 0 2px" }}>El Jardín</p>
        <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: "0 0 20px", lineHeight: 1.25 }}>{t("jardin.leaderboard")}</h1>

        {/* Leaderboard */}
        {isLoading && <p style={{ color: SAGE_DIM, fontFamily: FONT }}>{t("common.loading")}</p>}
        {!isLoading && allEntries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {allEntries.map((entry, idx) => {
              const isSelf = "isSelf" in entry;
              const name = isSelf ? `${entry.username} (${t("jardin.you_paren")})` : ((entry as Friend).displayName || entry.username);
              const hot = isToday(entry.lastDate);
              return (
                <div key={entry.id} style={{ background: isSelf ? "rgba(46,107,64,0.18)" : CARD,
                  border: `1px solid ${isSelf ? "rgba(168,197,160,0.4)" : CARD_B}`, borderRadius: 14, padding: "12px 15px",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: SAGE_DIM, fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: "center" }}>
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: WARM, fontSize: 14, fontWeight: isSelf ? 700 : 500, margin: 0, fontFamily: FONT }}>{name}</p>
                    <p style={{ color: SAGE, fontSize: 12, margin: "2px 0 0", fontFamily: FONT }}>
                      {streakLabel(entry.streak)}{hot ? " 🔥" : ""}
                    </p>
                  </div>
                  <span style={{ color: WARM, fontSize: 20, fontWeight: 700 }}>{entry.streak}</span>
                  {!isSelf && (
                    confirm === entry.id
                      ? <span>
                          <button type="button" onClick={() => remove.mutate(entry.id)}
                            style={{ background: "none", border: "none", color: "#E07070", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>{t("jardin.remove_q")}</button>
                          <button type="button" onClick={() => setConfirm(null)}
                            style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 12, cursor: "pointer", fontFamily: FONT, marginLeft: 6 }}>{t("common.cancel")}</button>
                        </span>
                      : <button type="button" onClick={() => setConfirm(entry.id)}
                          style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 18, cursor: "pointer" }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && friends.length === 0 && (
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 14, marginBottom: 20 }}>
            {t("jardin.add_friends_hint")}
          </p>
        )}

        {/* Add friend */}
        <p style={{ ...eyebrow, margin: "0 0 8px" }}>{t("jardin.add_a_friend")}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={username} onChange={(e) => { setUsername(e.target.value); setAddError(""); }}
            onKeyDown={(e) => e.key === "Enter" && username.trim() && add.mutate(username.trim())}
            placeholder={t("jardin.username_placeholder")}
            style={{ flex: 1, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
          <button type="button" onClick={() => add.mutate(username.trim())}
            disabled={!username.trim() || add.isPending}
            style={{ padding: "10px 18px", borderRadius: 12, background: username.trim() ? CTA : CARD,
              border: "1px solid rgba(168,197,160,0.35)", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700,
              cursor: username.trim() ? "pointer" : "default", opacity: add.isPending ? 0.6 : 1 }}>
            {t("jardin.add")}
          </button>
        </div>
        {addError && <p style={{ color: "#E07070", fontSize: 13, margin: "8px 0 0", fontFamily: FONT }}>{addError}</p>}

        <p style={{ color: SAGE_DIM, fontSize: 12, marginTop: 16, lineHeight: 1.5, fontFamily: FONT }}>
          {t("jardin.streak_footnote")}
        </p>
      </div>
    </Layout>
  );
}
