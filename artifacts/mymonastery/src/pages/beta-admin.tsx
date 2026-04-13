import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Shield } from "lucide-react";

type BetaUser = {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
};

export default function BetaAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Redirect non-admins to dashboard
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isAdmin) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, betaLoading, isAdmin, setLocation]);

  const { data: betaUsersData } = useQuery<{ users: BetaUser[] }>({
    queryKey: ["/api/beta/users"],
    queryFn: () => apiRequest("GET", "/api/beta/users"),
    enabled: !!user && isAdmin,
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/beta/users", {
      email: newEmail,
      name: newName || undefined,
    }),
    onSuccess: () => {
      setNewEmail("");
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["/api/beta/users"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/beta/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/beta/users"] });
    },
  });

  if (authLoading || betaLoading || !user || !isAdmin) return null;

  const betaUsers = betaUsersData?.users ?? [];

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
        <div className="mb-6">
          <button
            onClick={() => setLocation("/dashboard")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            ← Dashboard
          </button>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Beta Users
            </h1>
            <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(46,107,64,0.25)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.4)" }}>
              Admin
            </span>
          </div>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Manage who has access to beta features like Communities.
          </p>
        </div>

        <div className="h-px mb-5" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Add user form */}
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
            Add Beta User
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Email"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
              onKeyDown={e => { if (e.key === "Enter" && newEmail.includes("@")) addMutation.mutate(); }}
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newEmail.includes("@") || addMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 shrink-0"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {addMutation.isError && (
            <p className="text-xs mt-2" style={{ color: "#E57373" }}>Failed to add user.</p>
          )}
        </div>

        {/* User list */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
            {betaUsers.length} Beta {betaUsers.length === 1 ? "User" : "Users"}
          </p>
          {betaUsers.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "rgba(143,175,150,0.5)" }}>
              No beta users yet. Add someone above.
            </p>
          ) : (
            <div className="space-y-1.5">
              {betaUsers.map(bu => (
                <div
                  key={bu.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
                        {bu.name || bu.email.split("@")[0]}
                      </p>
                      {bu.isAdmin && (
                        <Shield size={12} style={{ color: "#8FAF96" }} />
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{bu.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>
                      {new Date(bu.createdAt).toLocaleDateString()}
                    </span>
                    {!bu.isAdmin && (
                      <button
                        onClick={() => removeMutation.mutate(bu.id)}
                        disabled={removeMutation.isPending}
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: "rgba(143,175,150,0.4)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
