import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ── /messages — Beta Messages inbox ─────────────────────────────────────
//
// Letters-style list of 1:1 conversations, but unlimited (no cadence).
// Beta-only. Mirrors the Letters BarCard look (left accent bar, soft
// green card, Space Grotesk) so it reads as a sibling surface.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Conversation = {
  id: number;
  lastMessageAt: string;
  otherUser: { id: number; name: string; email: string; avatarUrl: string | null };
  lastMessagePreview: string | null;
  unreadCount: number;
};

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

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, isBeta, authLoading, betaLoading, setLocation]);

  const { data, isLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/beta-messages/conversations"],
    queryFn: () => apiRequest("GET", "/api/beta-messages/conversations"),
    enabled: !!user && isBeta,
    refetchInterval: 30_000,
  });

  if (authLoading || betaLoading || !user) return null;

  const conversations = data?.conversations ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <div className="flex items-center justify-between gap-3 mb-1 mt-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>Messages 📨</h1>
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", letterSpacing: "0.1em" }}
            >
              Beta
            </span>
          </div>
          <Link
            href="/messages/new"
            className="text-sm font-semibold px-3.5 py-1.5 rounded-full transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}
          >
            New +
          </Link>
        </div>
        <p className="text-sm mb-6" style={{ color: SAGE }}>
          Write back and forth with others in the beta — as often as you like.
        </p>

        {isLoading ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(143,175,150,0.6)" }}>Loading…</p>
        ) : conversations.length === 0 ? (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
          >
            <p className="text-3xl mb-3">✉️</p>
            <p className="text-sm mb-5" style={{ color: SAGE }}>No conversations yet.</p>
            <Link
              href="/messages/new"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}
            >
              Start a conversation →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => (
              <Link key={c.id} href={`/messages/${c.id}`} className="block">
                <div
                  className="relative flex rounded-xl overflow-hidden cursor-pointer"
                  style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.28)" }}
                >
                  <div className="w-1 flex-shrink-0" style={{ background: c.unreadCount > 0 ? "#5C8A5F" : "#2E6B40" }} />
                  <div className="flex-1 px-4 py-3 min-w-0 flex items-center gap-3">
                    <Avatar name={c.otherUser.name} email={c.otherUser.email} url={c.otherUser.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>
                          {c.otherUser.name || c.otherUser.email}
                        </p>
                        <span className="text-[11px] shrink-0" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                          {formatWhen(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p
                          className="text-[13px] truncate"
                          style={{ color: c.unreadCount > 0 ? "#C8D4C0" : SAGE, fontWeight: c.unreadCount > 0 ? 600 : 400 }}
                        >
                          {c.lastMessagePreview ?? "No messages yet"}
                        </p>
                        {c.unreadCount > 0 && (
                          <span
                            className="shrink-0 inline-flex items-center justify-center text-[11px] font-bold rounded-full"
                            style={{ background: "#2D5E3F", color: WARM, minWidth: 20, height: 20, padding: "0 6px", fontFamily: FONT }}
                          >
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
