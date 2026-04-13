import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDemoFlag } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Users, MessageCircle, X, Settings } from "lucide-react";

const FONT = "'Space Grotesk', sans-serif";

type Group = {
  id: number; name: string; description: string | null; slug: string; createdAt: string;
};
type Member = {
  id: number; name: string | null; email: string; role: string; joinedAt: string | null; pending?: boolean;
};
type PrayerRequest = {
  id: number; body: string; ownerName: string | null; wordCount: number;
  isOwnRequest: boolean; isAnonymous: boolean; createdAt: string;
};
type Practice = {
  id: number; name: string; templateType: string | null; intention: string; momentToken: string;
};
type Gathering = {
  id: number; name: string; description: string | null; template: string | null;
};
type Announcement = {
  id: number; title: string | null; content: string; authorName: string; createdAt: string;
};

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const communitiesEnabled = useDemoFlag("communities");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"prayer" | "practices" | "gatherings" | "announcements" | "members">("prayer");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [newPrayer, setNewPrayer] = useState("");
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("");
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && !communitiesEnabled) setLocation("/communities");
  }, [user, authLoading, communitiesEnabled, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string; members: Member[] }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });

  const { data: prayerData } = useQuery<{ requests: PrayerRequest[] }>({
    queryKey: ["/api/groups", slug, "prayer-requests"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-requests`),
    enabled: !!user && !!slug && activeTab === "prayer",
  });

  const { data: practicesData } = useQuery<{ practices: Practice[] }>({
    queryKey: ["/api/groups", slug, "practices"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/practices`),
    enabled: !!user && !!slug && activeTab === "practices",
  });

  const { data: gatheringsData } = useQuery<{ gatherings: Gathering[] }>({
    queryKey: ["/api/groups", slug, "gatherings"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/gatherings`),
    enabled: !!user && !!slug && activeTab === "gatherings",
  });

  const { data: announcementsData } = useQuery<{ announcements: Announcement[] }>({
    queryKey: ["/api/groups", slug, "announcements"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/announcements`),
    enabled: !!user && !!slug && activeTab === "announcements",
  });

  const { data: searchData } = useQuery<{ users: { id: number; name: string | null; email: string }[] }>({
    queryKey: ["/api/groups/users/search", searchQuery],
    queryFn: () => apiRequest("GET", `/api/groups/users/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.length >= 2,
    staleTime: 10_000,
  });

  const inviteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/members`, {
      people: [{ name: inviteName || undefined, email: inviteEmail }],
    }),
    onSuccess: () => {
      setInviteEmail("");
      setInviteName("");
      setShowInvite(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  const prayerMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/prayer-requests`, { body: newPrayer }),
    onSuccess: () => {
      setNewPrayer("");
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-requests"] });
    },
  });

  const announcementMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/announcements`, {
      title: newAnnouncementTitle || undefined,
      content: newAnnouncementContent,
    }),
    onSuccess: () => {
      setNewAnnouncementTitle("");
      setNewAnnouncementContent("");
      setShowAnnouncementForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "announcements"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => apiRequest("DELETE", `/api/groups/${slug}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  if (authLoading || !user || !communitiesEnabled) return null;
  if (!groupData) return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full text-center py-20">
        <p className="text-sm" style={{ color: "#8FAF96" }}>Loading...</p>
      </div>
    </Layout>
  );

  const { group, myRole, members } = groupData;
  const isAdmin = myRole === "admin";

  const tabs = [
    { key: "prayer" as const, label: "Prayer Wall", emoji: "🙏🏽" },
    { key: "practices" as const, label: "Practices", emoji: "🌿" },
    { key: "gatherings" as const, label: "Gatherings", emoji: "🤝🏽" },
    { key: "announcements" as const, label: "Announcements", emoji: "📮" },
    { key: "members" as const, label: "Members", emoji: "👥" },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-4">
          <button
            onClick={() => setLocation("/communities")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            ← Communities
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                {group.name}
              </h1>
              {group.description && (
                <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>{group.description}</p>
              )}
              <p className="text-xs mt-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                {members.length} {members.length === 1 ? "member" : "members"}
                {isAdmin && " · You are admin"}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setLocation(`/communities/${slug}/settings`)}
                className="p-2 rounded-xl"
                style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
                title="Community settings"
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                <Plus size={14} /> Invite
              </button>
              </div>
            )}
          </div>
        </div>

        {/* Invite modal */}
        {showInvite && (
          <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Invite someone</p>
              <button onClick={() => { setShowInvite(false); setSearchQuery(""); setInviteEmail(""); setInviteName(""); }}>
                <X size={16} style={{ color: "#8FAF96" }} />
              </button>
            </div>

            {/* Search by name */}
            <div className="relative mb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setInviteEmail(""); setInviteName(""); }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search by name…"
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                style={{ color: "#F0EDE6" }}
              />
              {/* Dropdown results */}
              {searchFocused && searchQuery.length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                  style={{ background: "#0D2318", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                  {(searchData?.users ?? []).length === 0 ? (
                    <p className="text-xs px-4 py-3" style={{ color: "rgba(143,175,150,0.55)" }}>No Phoebe users found</p>
                  ) : (
                    (searchData?.users ?? []).map(u => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{ borderBottom: "1px solid rgba(46,107,64,0.12)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(46,107,64,0.15)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => {
                          setInviteName(u.name || "");
                          setInviteEmail(u.email);
                          setSearchQuery(u.name || u.email);
                          setSearchFocused(false);
                        }}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                          {(u.name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>{u.name || u.email}</p>
                          <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{u.email}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected user or manual email fallback */}
            {inviteEmail ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-2"
                style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.35)" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{inviteName || inviteEmail}</p>
                  <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>{inviteEmail}</p>
                </div>
                <button onClick={() => { setInviteEmail(""); setInviteName(""); setSearchQuery(""); }}>
                  <X size={14} style={{ color: "#8FAF96" }} />
                </button>
              </div>
            ) : searchQuery.includes("@") ? (
              // Allow inviting by email directly if they typed one
              <p className="text-xs mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                Not on Phoebe yet? They'll get an invite link.
              </p>
            ) : null}

            <button
              onClick={() => {
                const email = inviteEmail || (searchQuery.includes("@") ? searchQuery : "");
                if (!email) return;
                setInviteEmail(email);
                inviteMutation.mutate();
              }}
              disabled={(!inviteEmail && !searchQuery.includes("@")) || inviteMutation.isPending}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 mt-1"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              {inviteMutation.isPending ? "Inviting…" : "Send Invite"}
            </button>
          </div>
        )}

        {/* Tabs — scrolling pill ticker */}
        <div
          className="flex gap-2 mb-5 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8"
          style={{
            overflowX: "scroll",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            paddingBottom: 4,
          }}
        >
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0"
              style={{
                background: activeTab === t.key ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.1)",
                color: activeTab === t.key ? "#F0EDE6" : "#8FAF96",
                border: `1px solid ${activeTab === t.key ? "rgba(46,107,64,0.55)" : "rgba(46,107,64,0.2)"}`,
              }}
            >
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {/* ─── Prayer Wall ─── */}
        {activeTab === "prayer" && (
          <div>
            {/* New prayer input */}
            <div className="flex gap-2 mb-5">
              <input
                type="text"
                value={newPrayer}
                onChange={e => setNewPrayer(e.target.value)}
                placeholder="Share a prayer request..."
                maxLength={1000}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#2E6B40]/30 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                style={{ color: "#F0EDE6" }}
                onKeyDown={e => { if (e.key === "Enter" && newPrayer.trim()) prayerMutation.mutate(); }}
              />
              <button
                onClick={() => prayerMutation.mutate()}
                disabled={!newPrayer.trim() || prayerMutation.isPending}
                className="px-3 py-2.5 rounded-xl text-sm disabled:opacity-40"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                🙏🏽
              </button>
            </div>

            {(prayerData?.requests ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No prayer requests yet. Be the first to share.
              </p>
            ) : (
              <div className="space-y-2">
                {prayerData!.requests.map(r => (
                  <div key={r.id} className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                    <div className="w-1 shrink-0" style={{ background: "#8FAF96" }} />
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>
                            From {r.isAnonymous ? "Someone" : r.ownerName}
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                            {r.body}
                          </p>
                        </div>
                        {r.wordCount > 0 && (
                          <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                            <span className="text-[10px] tabular-nums">{r.wordCount}</span>
                            <MessageCircle size={12} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Practices ─── */}
        {activeTab === "practices" && (
          <div>
            {isAdmin && (
              <Link href="/moment/new" className="block mb-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                  <Plus size={16} /> Create a practice for this community
                </div>
              </Link>
            )}
            {(practicesData?.practices ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No practices yet.{isAdmin ? " Create one above." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {practicesData!.practices.map(p => (
                  <Link key={p.id} href={`/moments/${p.id}`} className="block">
                    <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                      <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
                      <div className="flex-1 px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{p.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{p.intention}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Gatherings ─── */}
        {activeTab === "gatherings" && (
          <div>
            {isAdmin && (
              <Link href="/tradition/new" className="block mb-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                  <Plus size={16} /> Create a gathering for this community
                </div>
              </Link>
            )}
            {(gatheringsData?.gatherings ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No gatherings yet.{isAdmin ? " Create one above." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {gatheringsData!.gatherings.map(g => (
                  <Link key={g.id} href={`/ritual/${g.id}`} className="block">
                    <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                      <div className="w-1 shrink-0" style={{ background: "#6FAF85" }} />
                      <div className="flex-1 px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{g.name}</p>
                        {g.description && <p className="text-xs mt-0.5 truncate" style={{ color: "#8FAF96" }}>{g.description}</p>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Announcements ─── */}
        {activeTab === "announcements" && (
          <div>
            {isAdmin && !showAnnouncementForm && (
              <button
                onClick={() => setShowAnnouncementForm(true)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm mb-4"
                style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}
              >
                <Plus size={16} /> Post an announcement
              </button>
            )}
            {isAdmin && showAnnouncementForm && (
              <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>New Announcement</p>
                  <button onClick={() => setShowAnnouncementForm(false)}><X size={16} style={{ color: "#8FAF96" }} /></button>
                </div>
                <input
                  type="text"
                  value={newAnnouncementTitle}
                  onChange={e => setNewAnnouncementTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm mb-2"
                  style={{ color: "#F0EDE6" }}
                />
                <textarea
                  value={newAnnouncementContent}
                  onChange={e => setNewAnnouncementContent(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none mb-2"
                  style={{ color: "#F0EDE6" }}
                />
                <button
                  onClick={() => announcementMutation.mutate()}
                  disabled={!newAnnouncementContent.trim() || announcementMutation.isPending}
                  className="px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {announcementMutation.isPending ? "Posting..." : "Post"}
                </button>
              </div>
            )}
            {(announcementsData?.announcements ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No announcements yet.
              </p>
            ) : (
              <div className="space-y-3">
                {announcementsData!.announcements.map(a => (
                  <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                    {a.title && (
                      <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>{a.title}</p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#C8D4C0" }}>
                      {a.content}
                    </p>
                    <p className="text-[10px] mt-2" style={{ color: "rgba(143,175,150,0.45)" }}>
                      {a.authorName} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Members ─── */}
        {activeTab === "members" && (
          <div>
            <div className="space-y-1.5">
              {members.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
                        {m.name || m.email.split("@")[0]}
                      </p>
                      {m.role === "admin" && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
                  </div>
                  {isAdmin && m.role !== "admin" && (
                    <button
                      onClick={() => removeMemberMutation.mutate(m.id)}
                      className="text-[10px] px-2 py-1 rounded-lg shrink-0 ml-2"
                      style={{ color: "rgba(143,175,150,0.5)", border: "1px solid rgba(143,175,150,0.2)" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Pending invites */}
            {isAdmin && (
              <div className="mt-4">
                {(groupData?.members ?? []).filter(m => !m.joinedAt).length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.4)" }}>
                      Pending Invites
                    </p>
                    <div className="space-y-1">
                      {groupData!.members.filter(m => !m.joinedAt).map(m => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ background: "rgba(46,107,64,0.05)" }}>
                          <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                            {m.name || m.email}
                          </p>
                          <span className="text-[10px] italic" style={{ color: "rgba(143,175,150,0.35)" }}>pending</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
