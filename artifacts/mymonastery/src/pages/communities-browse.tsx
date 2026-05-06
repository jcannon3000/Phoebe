import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

interface PublicGroup {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  emoji: string | null;
  isPrayerCircle: boolean;
  memberCount: number;
  myStatus: "member" | "pending" | "none";
}

interface PublicGroupsResponse {
  groups: PublicGroup[];
}

// Community discovery. Lists every group flagged is_public=true.
// Tapping a card calls /api/groups/:slug/request-join — the request
// queues until the community admin accepts (admin gets a push). When
// they accept, the requester gets a push back.
export default function CommunitiesBrowsePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const { data, isLoading: groupsLoading } = useQuery<PublicGroupsResponse>({
    queryKey: ["/api/groups/public"],
    queryFn: () => apiRequest("GET", "/api/groups/public"),
    enabled: !!user,
  });

  const requestJoin = useMutation({
    mutationFn: (slug: string) =>
      apiRequest<{ ok: boolean; status: "pending" | "already_member"; groupSlug: string }>(
        "POST",
        `/api/groups/${slug}/request-join`,
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/groups/public"] });
      // If the user was already a member (e.g. they were re-tapping),
      // route them straight in. Otherwise stay on the browse page so
      // they can see the "Pending" pill flip on the card.
      if (result.status === "already_member" && result.groupSlug) {
        setLocation(`/communities/${result.groupSlug}`);
      }
    },
  });

  if (isLoading || !user) return null;

  const groups = data?.groups ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 max-w-2xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
                letterSpacing: "-0.03em",
              }}
            >
              Find a community 🤝🏽
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
              Pick a community on Phoebe. A leader will let you in.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            ← Dashboard
          </Link>
        </div>

        {groupsLoading ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>
            Loading communities…
          </p>
        ) : groups.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-8 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.2)",
            }}
          >
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No public communities yet.
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
              Check back as more parishes join Phoebe.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const pending = g.myStatus === "pending";
              const member = g.myStatus === "member";
              const requesting = requestJoin.isPending && requestJoin.variables === g.slug;
              return (
                <div
                  key={g.id}
                  className="relative flex rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    border: "1px solid rgba(46,107,64,0.25)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="w-1 flex-shrink-0" style={{ background: "#2E6B40" }} />
                  <div className="flex-1 p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold"
                        style={{
                          color: "#F0EDE6",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        {g.emoji ?? "🏘️"} {g.name}
                      </p>
                      {g.description && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "#8FAF96" }}>
                          {g.description}
                        </p>
                      )}
                      <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      {member ? (
                        <Link
                          href={`/communities/${g.slug}`}
                          className="text-[10px] font-semibold rounded-full px-3 py-1.5 inline-block"
                          style={{
                            background: "rgba(46,107,64,0.4)",
                            color: "#F0EDE6",
                            letterSpacing: "0.06em",
                          }}
                        >
                          OPEN
                        </Link>
                      ) : pending ? (
                        <span
                          className="text-[10px] font-semibold rounded-full px-3 py-1.5"
                          style={{
                            background: "rgba(200,180,80,0.18)",
                            color: "#D4C078",
                            border: "1px solid rgba(200,180,80,0.3)",
                            letterSpacing: "0.06em",
                          }}
                        >
                          PENDING
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestJoin.mutate(g.slug)}
                          disabled={requesting}
                          className="text-[10px] font-semibold rounded-full px-3 py-1.5 disabled:opacity-50"
                          style={{
                            background: "#2D5E3F",
                            color: "#F0EDE6",
                            letterSpacing: "0.06em",
                            fontFamily: "'Space Grotesk', sans-serif",
                          }}
                        >
                          {requesting ? "REQUESTING…" : "REQUEST"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-center" style={{ color: "rgba(143,175,150,0.5)" }}>
          Requests are reviewed by a community leader. You'll get a notification when you're in.
        </p>
      </div>
    </Layout>
  );
}
