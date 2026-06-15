import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { usePartnerInvites, useAcceptInvite, useDeclineInvite, useInvitePartner } from "@/hooks/useDailyPrayer";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', sans-serif";
const G = "46,107,64";

type UserHit = { id: number; name: string | null; avatarUrl: string | null; status: string };

function Avatar({ url, name, size = 38 }: { url: string | null; name: string | null; size?: number }) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  if (url) return <img src={url} alt={name ?? ""} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, border: "1.5px solid #1A4A2E" }} />;
  return <div className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ width: size, height: size, fontSize: size * 0.4, background: "#1A4A2E", color: "#A8C5A0" }}>{initial}</div>;
}

// Pairing — incoming invites + a people search to invite a new prayer partner.
export function PartnerPairing() {
  const { t } = useTranslation();
  const { data: invites } = usePartnerInvites();
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();
  const invite = useInvitePartner();
  const [q, setQ] = useState("");
  const [invited, setInvited] = useState<Set<number>>(new Set());

  const { data: search } = useQuery<{ users: UserHit[] }>({
    queryKey: ["/api/fellows/search", q],
    queryFn: () => apiRequest("GET", `/api/fellows/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Incoming invites */}
      {invites && invites.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
            {t("prayer_partner.invites_eyebrow", { defaultValue: "Partner requests" })}
          </p>
          <div className="flex flex-col gap-2.5">
            {invites.map((inv) => (
              <div key={inv.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: `rgba(${G},0.12)`, border: `1px solid rgba(${G},0.32)` }}>
                <Avatar url={inv.inviterAvatarUrl} name={inv.inviterName} />
                <p className="flex-1 min-w-0 text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{inv.inviterName ?? "Someone"}</p>
                <button onClick={() => accept.mutate(inv.id)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, fontFamily: FONT }}>
                  {t("prayer_partner.accept", { defaultValue: "Accept" })}
                </button>
                <button onClick={() => decline.mutate(inv.id)} aria-label="Decline" className="px-2 text-[18px]" style={{ color: SAGE }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add a partner */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
          {t("prayer_partner.add_eyebrow", { defaultValue: "Add a prayer partner" })}
        </p>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("prayer_partner.search_placeholder", { defaultValue: "Search by name or email" })}
          className="w-full rounded-2xl px-4 py-3 outline-none text-[15px]"
          style={{ background: "rgba(143,175,150,0.08)", border: "1px solid rgba(143,175,150,0.2)", color: WARM, fontFamily: FONT }}
        />
        <div className="flex flex-col gap-2 mt-2.5">
          {(search?.users ?? []).map((u) => {
            const done = invited.has(u.id) || u.status === "requested";
            return (
              <div key={u.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.2)" }}>
                <Avatar url={u.avatarUrl} name={u.name} />
                <p className="flex-1 min-w-0 text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{u.name ?? "Someone"}</p>
                <button
                  onClick={() => { invite.mutate(u.id); setInvited((s) => new Set(s).add(u.id)); }}
                  disabled={done}
                  className="rounded-full px-4 py-1.5 text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: done ? "rgba(143,175,150,0.15)" : `rgba(${G},0.9)`, color: done ? SAGE : WARM, fontFamily: FONT }}
                >
                  {done ? t("prayer_partner.requested", { defaultValue: "Requested" }) : t("prayer_partner.invite", { defaultValue: "Invite" })}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
