import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft } from "lucide-react";

type MutedUser = { userId: number; name: string; email: string };

export default function MutedUsersPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ muted: MutedUser[] }>({
    queryKey: ["/api/mutes"],
    queryFn: () => apiRequest("GET", "/api/mutes"),
  });

  const unmuteMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/mutes/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mutes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const muted = data?.muted ?? [];
  const filtered = search.trim()
    ? muted.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase())
      )
    : muted;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full py-8">

        {/* Back + title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/settings")}
            className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            <ChevronLeft size={16} />
            Settings
          </button>
        </div>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Muted People
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          Their prayer requests won't appear in your list.
        </p>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-6"
          style={{
            background: "rgba(200,212,192,0.05)",
            border: "1px solid rgba(46,107,64,0.25)",
            color: "#F0EDE6",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.55)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.25)"; }}
        />

        {/* List */}
        {isLoading && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        )}

        {!isLoading && muted.length === 0 && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            No one muted. You can mute someone from their prayer request.
          </p>
        )}

        {!isLoading && muted.length > 0 && filtered.length === 0 && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>No results for "{search}".</p>
        )}

        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(200,212,192,0.04)",
                border: "1px solid rgba(46,107,64,0.15)",
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{m.name}</p>
                <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
              </div>
              <button
                onClick={() => unmuteMutation.mutate(m.userId)}
                disabled={unmuteMutation.isPending}
                className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{
                  background: "rgba(46,107,64,0.15)",
                  color: "#A8C5A0",
                  border: "1px solid rgba(46,107,64,0.25)",
                }}
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
