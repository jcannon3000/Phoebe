import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, ChevronUp } from "lucide-react";

type WaitlistEntry = {
  id: number;
  email: string;
  name: string;
  reason: string | null;
  source: string;
  createdAt: string;
};

export default function WaitlistAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Non-admins can't see the waitlist. Send them home.
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isAdmin) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, betaLoading, isAdmin, setLocation]);

  const { data, isLoading } = useQuery<{ entries: WaitlistEntry[] }>({
    queryKey: ["/api/waitlist"],
    queryFn: () => apiRequest("GET", "/api/waitlist"),
    enabled: !!user && isAdmin,
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/waitlist/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/beta/users"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/waitlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] }),
  });

  if (authLoading || betaLoading || !user || !isAdmin) return null;

  const entries = data?.entries ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            Pilot admin
          </p>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Waitlist
          </h1>
          <p className="text-sm mt-2" style={{ color: "#8FAF96" }}>
            People who've asked to join Phoebe. Promote moves them into the pilot
            (adds to beta_users and removes from this list).
          </p>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="rounded-xl px-6 py-10 text-center" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
            <div className="text-3xl mb-3">🌿</div>
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No one waiting right now.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="rounded-xl px-4 py-3.5"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                    {entry.name}
                  </p>
                  <p className="text-xs" style={{ color: "#8FAF96" }}>
                    <a href={`mailto:${entry.email}`} className="hover:underline">{entry.email}</a>
                    <span style={{ color: "rgba(143,175,150,0.4)" }}>
                      {" · "}{new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}{entry.source}
                    </span>
                  </p>
                  {entry.reason && (
                    <p
                      className="text-sm mt-2 italic leading-relaxed"
                      style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
                    >
                      "{entry.reason}"
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      if (window.confirm(`Promote ${entry.name} to pilot? They'll be added to beta_users and removed from the waitlist.`)) {
                        promoteMutation.mutate(entry.id);
                      }
                    }}
                    disabled={promoteMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    <ChevronUp size={11} /> Promote
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${entry.name} from the waitlist? This doesn't notify them.`)) {
                        removeMutation.mutate(entry.id);
                      }
                    }}
                    disabled={removeMutation.isPending}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: "rgba(200,212,192,0.06)", color: "rgba(143,175,150,0.7)", border: "1px solid rgba(46,107,64,0.2)" }}
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
