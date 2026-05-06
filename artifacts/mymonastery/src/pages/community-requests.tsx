import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

interface JoinRequest {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  requestedAt: string;
}

interface RequestsResponse {
  requests: JoinRequest[];
}

interface GroupResponse {
  group: {
    id: number;
    name: string;
    slug: string;
    emoji: string | null;
    myRole: string;
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRequestedAt(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Admin-only requests panel. Reached via push deep-link
// (sendCommunityJoinRequestPush → /communities/:slug/requests) and via
// the community-settings page's "Join requests" link. Lists pending
// requests with one-tap Accept / Decline actions.
export default function CommunityRequestsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const groupQ = useQuery<GroupResponse>({
    queryKey: [`/api/groups/${slug}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });
  const group = groupQ.data?.group ?? null;
  const isAdmin = group?.myRole === "admin" || group?.myRole === "hidden_admin";

  // Bounce non-admins to the community detail page — we don't show
  // them the requests panel even on a deep-link.
  useEffect(() => {
    if (groupQ.isFetched && group && !isAdmin) {
      setLocation(`/communities/${slug}`);
    }
  }, [groupQ.isFetched, group, isAdmin, slug, setLocation]);

  const requestsQ = useQuery<RequestsResponse>({
    queryKey: [`/api/groups/${slug}/join-requests`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/join-requests`),
    enabled: !!group && isAdmin,
  });
  const requests = requestsQ.data?.requests ?? [];

  const accept = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/groups/${slug}/join-requests/${id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/join-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/pending-join-request-counts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}`] });
    },
  });

  const reject = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/groups/${slug}/join-requests/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/join-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/pending-join-request-counts"] });
    },
  });

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 max-w-2xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Admin
            </p>
            <h1
              className="text-2xl font-bold mt-1"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
                letterSpacing: "-0.03em",
              }}
            >
              Join requests
            </h1>
            {group && (
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                {group.emoji ?? "🏘️"} {group.name}
              </p>
            )}
          </div>
          <Link
            href={`/communities/${slug}`}
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            ← Community
          </Link>
        </div>

        {requestsQ.isLoading ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>
            Loading…
          </p>
        ) : requests.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-8 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.2)",
            }}
          >
            <p className="text-sm" style={{ color: "#8FAF96" }}>No pending requests.</p>
            <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
              You'll get a notification when someone wants to join.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => {
              const accepting = accept.isPending && accept.variables === r.id;
              const rejecting = reject.isPending && reject.variables === r.id;
              const busy = accepting || rejecting;
              return (
                <div
                  key={r.id}
                  className="rounded-xl px-4 py-3.5 flex items-start gap-3"
                  style={{
                    background: "rgba(46,107,64,0.10)",
                    border: "1px solid rgba(46,107,64,0.22)",
                  }}
                >
                  {r.userAvatarUrl ? (
                    <img
                      src={r.userAvatarUrl}
                      alt={r.userName}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      style={{ border: "1px solid rgba(46,107,64,0.3)" }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        background: "#1A4A2E",
                        color: "#A8C5A0",
                        border: "1px solid rgba(46,107,64,0.3)",
                      }}
                    >
                      {initials(r.userName) || "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{
                        color: "#F0EDE6",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {r.userName}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "#8FAF96" }}>
                      {r.userEmail}
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "rgba(143,175,150,0.55)" }}
                    >
                      Requested {formatRequestedAt(r.requestedAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => accept.mutate(r.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      style={{
                        background: "#2D5E3F",
                        color: "#F0EDE6",
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {accepting ? "ACCEPTING…" : "ACCEPT"}
                    </button>
                    <button
                      onClick={() => reject.mutate(r.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      style={{
                        background: "transparent",
                        color: "rgba(232,155,155,0.85)",
                        border: "1px solid rgba(232,155,155,0.3)",
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {rejecting ? "DECLINING…" : "DECLINE"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
