import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Shield, X } from "lucide-react";

type BetaUser = {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  // Display name of the admin who added this user, or null if the inviter
  // account was deleted. Populated server-side from beta_users.added_by_user_id.
  addedByName: string | null;
};

type AppUser = { id: number; name: string | null; email: string };

export default function BetaAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceSubject, setAnnounceSubject] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceSent, setAnnounceSent] = useState<{ sent: number; total: number } | null>(null);
  const announceMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/announce", {
      subject: announceSubject.trim(),
      body: announceBody.trim(),
    }),
    onSuccess: (data: { sent: number; total: number }) => {
      setAnnounceSent(data);
      setAnnounceSubject("");
      setAnnounceBody("");
    },
  });

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  const debouncedQuery = suggestionQuery.trim();
  const { data: searchData } = useQuery<{ users: AppUser[] }>({
    queryKey: ["/api/groups/users/search", debouncedQuery],
    queryFn: () => apiRequest("GET", `/api/groups/users/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: !!user && isAdmin && debouncedQuery.length >= 2,
  });

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const betaEmails = new Set((betaUsersData?.users ?? []).map(u => u.email.toLowerCase()));
  const filteredSuggestions = (searchData?.users ?? [])
    .filter(u => !betaEmails.has(u.email.toLowerCase()))
    .slice(0, 5);

  const selectSuggestion = (u: AppUser) => {
    setNewName(u.name || u.email.split("@")[0]);
    setNewEmail(u.email);
    setShowSuggestions(false);
  };

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
              Pilot Users
            </h1>
            <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(46,107,64,0.25)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.4)" }}>
              Admin
            </span>
          </div>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Manage who has access to pilot features like Communities.
          </p>
        </div>

        <div className="h-px mb-5" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Preview onboarding */}
        <div className="mb-6 flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}>
          <div>
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>New user onboarding</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>Preview the 10-slide flow shown to first-time users.</p>
          </div>
          <button
            onClick={() => setLocation("/onboarding?preview=1")}
            className="shrink-0 ml-4 px-4 py-2 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Preview →
          </button>
        </div>

        {/* ── Announce ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
            Send Announcement
          </p>
          {!announceOpen ? (
            <button
              type="button"
              onClick={() => { setAnnounceOpen(true); setAnnounceSent(null); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-opacity hover:opacity-90"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}
            >
              <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Email all users…</span>
              <span className="text-sm" style={{ color: "rgba(200,212,192,0.4)" }}>→</span>
            </button>
          ) : (
            <div className="rounded-2xl p-5" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.3)" }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Email all users</p>
                <button type="button" onClick={() => { setAnnounceOpen(false); setAnnounceSent(null); }} style={{ color: "rgba(200,212,192,0.5)" }}>
                  <X size={16} />
                </button>
              </div>
              {announceSent !== null ? (
                <div className="text-center py-4">
                  <p className="text-2xl mb-2">✓</p>
                  <p className="text-sm font-medium" style={{ color: "#A8C5A0" }}>
                    Sent to {announceSent.sent} of {announceSent.total} users
                  </p>
                  <button
                    type="button"
                    onClick={() => setAnnounceSent(null)}
                    className="text-xs mt-3 transition-opacity hover:opacity-80"
                    style={{ color: "rgba(143,175,150,0.6)" }}
                  >
                    Send another
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>Subject</label>
                    <input
                      type="text"
                      value={announceSubject}
                      onChange={e => setAnnounceSubject(e.target.value)}
                      maxLength={200}
                      placeholder="What's the news?"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                      style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>Message</label>
                    <textarea
                      value={announceBody}
                      onChange={e => setAnnounceBody(e.target.value)}
                      maxLength={10000}
                      rows={5}
                      placeholder="Write your announcement…"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                      style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                    />
                  </div>
                  {announceMutation.isError && (
                    <p className="text-xs mb-3" style={{ color: "#E57373" }}>Something went wrong. Try again.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => announceMutation.mutate()}
                    disabled={!announceSubject.trim() || !announceBody.trim() || announceMutation.isPending}
                    className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    {announceMutation.isPending ? "Sending…" : "Send to all users"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Add user form */}
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
            Add Pilot User
          </p>
          <div className="relative" ref={suggestionsRef}>
            <div className="flex gap-2">
              <input
                type="text"
                autoComplete="off"
                value={newName}
                onChange={e => { setNewName(e.target.value); setSuggestionQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => { setSuggestionQuery(newName); setShowSuggestions(true); }}
                placeholder="Name"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                style={{ color: "#F0EDE6" }}
              />
              <input
                type="text"
                autoComplete="off"
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setSuggestionQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => { setSuggestionQuery(newEmail); setShowSuggestions(true); }}
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
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-[#2E6B40]/40 overflow-hidden z-20"
                style={{ background: "#0F2818" }}
              >
                {filteredSuggestions.map(u => (
                  <button
                    key={u.email}
                    onClick={() => selectSuggestion(u)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#2E6B40]/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "#F0EDE6" }}>{u.name || u.email.split("@")[0]}</p>
                      <p className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {addMutation.isError && (
            <p className="text-xs mt-2" style={{ color: "#E57373" }}>Failed to add user.</p>
          )}
        </div>

        {/* User list */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
            {betaUsers.length} Pilot {betaUsers.length === 1 ? "User" : "Users"}
          </p>
          {betaUsers.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "rgba(143,175,150,0.5)" }}>
              No pilot users yet. Add someone above.
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
                    {bu.addedByName && (
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.4)" }}>
                        Invited by {bu.addedByName}
                      </p>
                    )}
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
