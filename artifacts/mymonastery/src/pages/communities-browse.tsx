import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Search, MapPin } from "lucide-react";

interface PublicGroup {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  emoji: string | null;
  isPrayerCircle: boolean;
  city: string | null;
  state: string | null;
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
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Debounce the search box so we're not firing a request on every
  // keystroke — matches the server's own 2-char minimum (a 1-char query
  // is ignored there anyway, so no point round-tripping for it).
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // A second, independent search box for city/state — matches against
  // either column server-side (no geocoding, plain text match), same
  // 2-char minimum + debounce as the name search above.
  const [locationSearch, setLocationSearch] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedLocation(locationSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [locationSearch]);

  const { data, isLoading: groupsLoading } = useQuery<PublicGroupsResponse>({
    queryKey: ["/api/groups/public", debouncedSearch, debouncedLocation],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.length >= 2) params.set("q", debouncedSearch);
      if (debouncedLocation.length >= 2) params.set("location", debouncedLocation);
      const qs = params.toString();
      return apiRequest("GET", qs ? `/api/groups/public?${qs}` : "/api/groups/public");
    },
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
        return;
      }
      // Confirm the request landed — otherwise the only signal is the pill
      // quietly flipping to "Pending" after the refetch, which reads as nothing
      // happened on a slow connection.
      toast({
        title: t("communities_browse.request_sent", { defaultValue: "Request sent" }),
        description: t("communities_browse.request_sent_sub", { defaultValue: "The community's admin will review it. You'll be notified when you're in." }),
      });
    },
    onError: (err) => {
      // A rejected request (e.g. the 3-community follow cap) carries a
      // specific server message worth showing verbatim — everything else
      // falls back to the generic "check your connection" copy.
      const specific = err instanceof ApiError ? err.message : undefined;
      toast({
        title: specific ?? t("communities_browse.request_failed", { defaultValue: "Couldn't send your request" }),
        description: specific ? undefined : t("communities_browse.request_failed_sub", { defaultValue: "Please check your connection and try again." }),
        variant: "destructive",
      });
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
              {t("communities_browse.title")} 🤝🏽
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
              {t("communities_browse.subtitle")}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            {t("communities.back_dashboard")}
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "rgba(143,175,150,0.6)" }}
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("communities_browse.search_placeholder", { defaultValue: "Search communities by name" })}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
            />
          </div>
          <div className="relative flex-1">
            <MapPin
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "rgba(143,175,150,0.6)" }}
            />
            <input
              type="text"
              value={locationSearch}
              onChange={e => setLocationSearch(e.target.value)}
              placeholder={t("communities_browse.location_placeholder", { defaultValue: "City or state" })}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
            />
          </div>
        </div>

        {groupsLoading ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("communities_browse.loading")}
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
              {debouncedSearch.length >= 2 || debouncedLocation.length >= 2
                ? t("communities_browse.no_results", { defaultValue: "No communities match that search." })
                : t("communities_browse.empty_title")}
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
              {t("communities_browse.empty_body")}
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
                      {(g.city || g.state) && (
                        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "rgba(143,175,150,0.65)" }}>
                          <MapPin size={11} />
                          {[g.city, g.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {t("menu.members", { count: g.memberCount })}
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
                          {t("communities_browse.open")}
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
                          {t("communities_browse.pending")}
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
                          {requesting ? t("communities_browse.requesting") : t("communities_browse.request")}
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
          {t("communities_browse.footer")}
        </p>
      </div>
    </Layout>
  );
}
