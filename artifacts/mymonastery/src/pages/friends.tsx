/**
 * Friends (Phase 1) — one-to-one prayer friends: incoming requests, your
 * friend list, and search-to-add. Beta-gated server-side (/api/friends/*);
 * the menu entry that links here is also beta-gated, so non-beta users won't
 * normally reach it. Pure client of the friends API — no prayer-request
 * scoping yet (that's Phase 2).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BG = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.3)";

type Friend = { friendshipId: number; userId: number; name: string; avatarUrl: string | null; since: string };
type Request = { id: number; userId: number; name: string; avatarUrl: string | null; requestedAt: string };
type SearchUser = { id: number; name: string; avatarUrl: string | null; status: "none" | "friends" | "requested" | "incoming" };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: "1px solid rgba(46,107,64,0.3)" }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.32, fontFamily: FONT }}>
      {initials(name)}
    </div>
  );
}

function Pill({ label, onClick, kind = "solid", disabled }: { label: string; onClick?: () => void; kind?: "solid" | "ghost" | "muted"; disabled?: boolean }) {
  const styles = {
    solid: { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" },
    ghost: { background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" },
    muted: { background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" },
  }[kind];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="shrink-0 rounded-full text-[12.5px] font-semibold px-3.5 py-1.5 transition-opacity active:scale-[0.97]"
      style={{ ...styles, fontFamily: FONT, opacity: disabled ? 0.6 : 1 }}>
      {label}
    </button>
  );
}

export default function FriendsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const friendsQ = useQuery<{ friends: Friend[] }>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends"),
  });
  const requestsQ = useQuery<{ requests: Request[] }>({
    queryKey: ["/api/friends/requests"],
    queryFn: () => apiRequest("GET", "/api/friends/requests"),
  });
  const searchQ = useQuery<{ users: SearchUser[] }>({
    queryKey: ["/api/friends/search", q.trim()],
    queryFn: () => apiRequest("GET", `/api/friends/search?q=${encodeURIComponent(q.trim())}`),
    enabled: q.trim().length >= 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/friends"] });
    qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    qc.invalidateQueries({ queryKey: ["/api/friends/search"] });
  };

  const sendReq = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", "/api/friends/request", { userId }),
    onSuccess: invalidate,
  });
  const accept = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/friends/${id}/accept`),
    onSuccess: invalidate,
  });
  const decline = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/friends/${id}/decline`),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/friends/${userId}`),
    onSuccess: invalidate,
  });

  const requests = requestsQ.data?.requests ?? [];
  const friends = friendsQ.data?.friends ?? [];
  const results = searchQ.data?.users ?? [];

  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 mb-2 mt-6">
      <h3 className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{label}</h3>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
    </div>
  );

  const row = (name: string, url: string | null, right: React.ReactNode, key: string | number) => (
    <div key={key} className="relative flex items-center gap-3 rounded-2xl px-4 py-3 mb-2"
      style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
      <Avatar name={name} url={url} />
      <p className="flex-1 min-w-0 truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{name}</p>
      {right}
    </div>
  );

  return (
    <div className="dash-shell flex flex-col w-full pb-36">
      <button type="button" onClick={() => navigate("/dashboard")}
        className="inline-flex items-center gap-1 mb-4 text-[14px]" style={{ color: SAGE, fontFamily: FONT }}>
        <ChevronLeft size={18} /> {t("friends.home", { defaultValue: "Home" })}
      </button>

      <h1 className="mb-1" style={{ color: WARM, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: FONT }}>
        {t("friends.title", { defaultValue: "Prayer friends" })}
      </h1>
      <p className="mb-2" style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT }}>
        {t("friends.subtitle", { defaultValue: "Pray with people one-to-one, beyond your communities." })}
      </p>

      {/* Add a friend */}
      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("friends.search_placeholder", { defaultValue: "Search by name or email…" })}
          className="w-full rounded-full px-4 py-3 text-[15px] outline-none"
          style={{ background: "rgba(200,212,192,0.07)", border: `1px solid ${CARD_B}`, color: WARM, fontFamily: FONT }}
        />
        {q.trim().length >= 2 && (
          <div className="mt-2">
            {searchQ.isLoading ? (
              <p className="text-[13px] px-1 py-2" style={{ color: SAGE, fontFamily: FONT }}>{t("friends.searching", { defaultValue: "Searching…" })}</p>
            ) : results.length === 0 ? (
              <p className="text-[13px] px-1 py-2" style={{ color: SAGE, fontFamily: FONT }}>{t("friends.no_results", { defaultValue: "No one found." })}</p>
            ) : (
              results.map((u) =>
                row(u.name, u.avatarUrl,
                  u.status === "friends" ? <Pill label={t("friends.friends", { defaultValue: "Friends" })} kind="muted" disabled />
                  : u.status === "requested" ? <Pill label={t("friends.requested", { defaultValue: "Requested" })} kind="muted" disabled />
                  : u.status === "incoming" ? <Pill label={t("friends.accept", { defaultValue: "Accept" })} kind="solid" onClick={() => { const r = requests.find((x) => x.userId === u.id); if (r) accept.mutate(r.id); else sendReq.mutate(u.id); }} />
                  : <Pill label={t("friends.add", { defaultValue: "Add" })} kind="solid" onClick={() => sendReq.mutate(u.id)} disabled={sendReq.isPending} />,
                  `s-${u.id}`)
              )
            )}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {requests.length > 0 && (
        <>
          {sectionHeader(t("friends.requests", { defaultValue: "Requests" }))}
          {requests.map((r) =>
            row(r.name, r.avatarUrl,
              <div className="flex items-center gap-2 shrink-0">
                <Pill label={t("friends.accept", { defaultValue: "Accept" })} kind="solid" onClick={() => accept.mutate(r.id)} disabled={accept.isPending} />
                <Pill label={t("friends.decline", { defaultValue: "Decline" })} kind="muted" onClick={() => decline.mutate(r.id)} disabled={decline.isPending} />
              </div>,
              `r-${r.id}`)
          )}
        </>
      )}

      {/* Friends */}
      {sectionHeader(t("friends.your_friends", { defaultValue: "Your friends" }))}
      {friends.length === 0 ? (
        <p className="text-[13.5px] px-1 py-3" style={{ color: SAGE, fontFamily: FONT }}>
          {t("friends.empty", { defaultValue: "No friends yet — search above to send your first request." })}
        </p>
      ) : (
        friends.map((f) =>
          row(f.name, f.avatarUrl,
            <Pill label={t("friends.remove", { defaultValue: "Remove" })} kind="muted" onClick={() => { if (window.confirm(t("friends.remove_confirm", { defaultValue: "Remove this prayer friend?" }))) remove.mutate(f.userId); }} />,
            `f-${f.userId}`)
        )
      )}
    </div>
  );
}
