import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { ChevronLeft } from "lucide-react";

type MutedUser = { userId: number; name: string; email: string };
type GardenPerson = { name: string; email: string };

const INPUT_STYLE = {
  background: "rgba(200,212,192,0.05)",
  border: "1px solid rgba(46,107,64,0.25)",
  color: "#F0EDE6",
};

export default function MutedUsersPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [muteSearch, setMuteSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Current mute list
  const { data, isLoading } = useQuery<{ muted: MutedUser[] }>({
    queryKey: ["/api/mutes"],
    queryFn: () => apiRequest("GET", "/api/mutes"),
  });

  // Garden people for "add" search
  const { data: gardenData } = useQuery<GardenPerson[]>({
    queryKey: ["/api/people", user?.id],
    queryFn: () => apiRequest("GET", `/api/people?ownerId=${user!.id}`),
    enabled: !!user && showAdd,
  });

  const unmuteMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/mutes/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mutes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const addMuteMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/mutes/by-email", { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mutes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setAddSearch("");
    },
  });

  const muted = data?.muted ?? [];
  const mutedEmails = new Set(muted.map(m => m.email.toLowerCase()));

  const filteredMuted = muteSearch.trim()
    ? muted.filter(m =>
        m.name.toLowerCase().includes(muteSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(muteSearch.toLowerCase())
      )
    : muted;

  const gardenPeople = (gardenData ?? []).filter(
    p => !mutedEmails.has(p.email.toLowerCase())
  );
  const filteredGarden = addSearch.trim()
    ? gardenPeople.filter(p =>
        p.name.toLowerCase().includes(addSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(addSearch.toLowerCase())
      )
    : gardenPeople;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full py-8">

        {/* Back */}
        <div className="mb-6">
          <button
            onClick={() => setLocation("/settings")}
            className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            <ChevronLeft size={16} />
            Settings
          </button>
        </div>

        <div className="flex items-center justify-between mb-1">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Muted People
          </h1>
          <button
            onClick={() => { setShowAdd(v => !v); setAddSearch(""); }}
            className="text-sm font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
            style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
          >
            {showAdd ? "Done" : "+ Add"}
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          Their prayer requests and Lectio reflections won't appear in your view.
        </p>

        {/* ── Add section ── */}
        {showAdd && (
          <div className="mb-6 rounded-xl px-4 py-4" style={{ background: "rgba(200,212,192,0.03)", border: "1px solid rgba(46,107,64,0.2)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
              Mute someone from your garden
            </p>
            <input
              type="text"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3"
              style={INPUT_STYLE}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.55)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.25)"; }}
            />
            {filteredGarden.length === 0 && addSearch.trim() && (
              <p className="text-sm" style={{ color: "#8FAF96" }}>No one found.</p>
            )}
            {filteredGarden.length === 0 && !addSearch.trim() && (
              <p className="text-sm" style={{ color: "#8FAF96" }}>Everyone in your garden is unmuted.</p>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredGarden.map(p => (
                <div key={p.email} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{p.name}</p>
                    <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{p.email}</p>
                  </div>
                  <button
                    onClick={() => addMuteMutation.mutate(p.email)}
                    disabled={addMuteMutation.isPending}
                    className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: "rgba(194,92,92,0.1)", color: "#C25C5C", border: "1px solid rgba(194,92,92,0.25)" }}
                  >
                    🔇 Mute
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Search muted list ── */}
        <input
          type="text"
          value={muteSearch}
          onChange={e => setMuteSearch(e.target.value)}
          placeholder="Search muted people…"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-4"
          style={INPUT_STYLE}
          onFocus={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.55)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.25)"; }}
        />

        {isLoading && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        )}
        {!isLoading && muted.length === 0 && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            No one muted. Tap "+ Add" above or mute someone from their prayer request.
          </p>
        )}
        {!isLoading && muted.length > 0 && filteredMuted.length === 0 && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>No results for "{muteSearch}".</p>
        )}

        <div className="space-y-2">
          {filteredMuted.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: "rgba(200,212,192,0.04)", border: "1px solid rgba(46,107,64,0.15)" }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{m.name}</p>
                <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
              </div>
              <button
                onClick={() => unmuteMutation.mutate(m.userId)}
                disabled={unmuteMutation.isPending}
                className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
              >
                Unmute
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
