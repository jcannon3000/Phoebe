import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

interface Parish {
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
}

interface ParishesResponse {
  parishes: Parish[];
}

// Parish picker for climate-enrolled users. Sets users.parish_id, which
// drives the parish counter on the slideshow's closing slide. Parish
// association is purely additive — staying unparished is a first-class
// state, so this page also lets a user clear their selection.
export default function ClimateParishPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && (!user || !user.climateEnrolled)) {
      setLocation("/climate");
    }
  }, [user, isLoading, setLocation]);

  const { data, isLoading: parishesLoading } = useQuery<ParishesResponse>({
    queryKey: ["/api/climate/parishes"],
    queryFn: () => apiRequest("GET", "/api/climate/parishes"),
    enabled: !!user?.climateEnrolled,
  });

  const setParishMutation = useMutation({
    mutationFn: (parishId: number | null) =>
      apiRequest("PATCH", "/api/climate/me/parish", { parishId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/climate/today"] });
      setLocation("/climate");
    },
  });

  if (isLoading || !user?.climateEnrolled) {
    return <Layout><div /></Layout>;
  }

  const parishes = data?.parishes ?? [];
  const currentParishId = user.parishId;

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 max-w-md mx-auto w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Phoebe Climate
            </p>
            <h1
              className="text-2xl font-bold"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
                letterSpacing: "-0.03em",
              }}
            >
              Your parish
            </h1>
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              Connecting to a parish adds a second counter on the closing
              slide — how many people from your parish prayed today.
            </p>
          </div>
          <Link
            href="/climate"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            ← Back
          </Link>
        </div>

        {parishesLoading ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>
            Loading…
          </p>
        ) : parishes.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-6 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.2)",
            }}
          >
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No parishes are set up yet.
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
              You can keep praying without one — the global counter still works.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {parishes.map((p) => {
              const isSelected = p.id === currentParishId;
              return (
                <button
                  key={p.id}
                  onClick={() => setParishMutation.mutate(p.id)}
                  disabled={setParishMutation.isPending}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl transition-colors text-left"
                  style={{
                    background: isSelected
                      ? "rgba(46,107,64,0.28)"
                      : "rgba(46,107,64,0.10)",
                    border: `1px solid ${isSelected ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.18)"}`,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0">
                      {p.emoji ?? "⛪"}
                    </span>
                    <p
                      className="text-sm font-semibold truncate"
                      style={{
                        color: "#F0EDE6",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {p.name}
                    </p>
                  </div>
                  {isSelected && (
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold flex-shrink-0"
                      style={{ color: "#A8C5A0" }}
                    >
                      ✓ Yours
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Skip / clear option — being unparished is a valid choice. */}
        {currentParishId !== null && (
          <button
            onClick={() => setParishMutation.mutate(null)}
            disabled={setParishMutation.isPending}
            className="text-xs text-center mt-2"
            style={{ color: "rgba(143,175,150,0.7)" }}
          >
            Disconnect from parish
          </button>
        )}
        {currentParishId === null && (
          <Link
            href="/climate"
            className="text-xs text-center mt-2"
            style={{ color: "rgba(143,175,150,0.7)" }}
          >
            I'll skip for now
          </Link>
        )}
      </div>
    </Layout>
  );
}
