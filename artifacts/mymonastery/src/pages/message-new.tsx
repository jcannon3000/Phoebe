import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ── /messages/new — pick a beta user to message ─────────────────────────
//
// Lists every other beta user (with a Phoebe account). Tapping one
// starts (or reuses) a 1:1 conversation and drops into the thread.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type BetaUser = { id: number; name: string; email: string; avatarUrl: string | null };

function Avatar({ name, email, url, size = 40 }: { name: string; email: string; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const initials = (name || email || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: Math.round(size * 0.38), fontFamily: FONT }}
    >
      {initials}
    </div>
  );
}

export default function MessageNewPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, isBeta, authLoading, betaLoading, setLocation]);

  const { data, isLoading } = useQuery<{ users: BetaUser[] }>({
    queryKey: ["/api/beta-messages/users"],
    queryFn: () => apiRequest("GET", "/api/beta-messages/users"),
    enabled: !!user && isBeta,
  });

  const start = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", "/api/beta-messages/conversations", { userId }),
    onSuccess: (res: { conversationId: number }) => {
      setLocation(`/messages/${res.conversationId}`);
    },
  });

  if (authLoading || betaLoading || !user) return null;

  const all = data?.users ?? [];
  const q = query.trim().toLowerCase();
  const users = q
    ? all.filter((u) => (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : all;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link href="/messages" className="text-sm inline-block mb-3" style={{ color: SAGE }}>← Messages</Link>
        <h1 className="text-2xl font-bold mb-4" style={{ color: WARM, fontFamily: FONT }}>New message</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the beta…"
          className="w-full rounded-xl px-3.5 py-2.5 text-[15px] mb-5"
          style={{ background: "rgba(15,40,24,0.6)", border: "1px solid rgba(46,107,64,0.4)", color: WARM, fontFamily: FONT, outline: "none" }}
        />

        {isLoading ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(143,175,150,0.6)" }}>Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: SAGE }}>
            {all.length === 0 ? "No other beta users yet." : "No one matches that search."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={start.isPending}
                onClick={() => start.mutate(u.id)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)", cursor: start.isPending ? "wait" : "pointer" }}
              >
                <Avatar name={u.name} email={u.email} url={u.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{u.name || u.email}</p>
                  {u.name && <p className="text-[12px] truncate" style={{ color: SAGE }}>{u.email}</p>}
                </div>
                <span style={{ color: "rgba(143,175,150,0.6)", fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
