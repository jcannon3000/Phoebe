import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X, Users, ChevronDown, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  pageBg: "#091A10",
  card: "#0F2818",
  cardHover: "#1F4A33",
  text: "#F0EDE6",
  textSecondary: "#8FAF96",
  accent: "#C8D4C0",
  divider: "rgba(200, 212, 192, 0.15)",
  cardBorder: "1px solid rgba(200, 212, 192, 0.25)",
  cardShadow: "0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)",
  activeBtnBg: "#2D5E3F",
  prayer: "#C47A65",
  fab: "#1A4A2E",
  footer: "rgba(143, 175, 150, 0.5)",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Browser chrome color ────────────────────────────────────────────────────

function useThemeColor() {
  useEffect(() => {
    // Set theme-color for Safari/Chrome browser chrome
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const hadMeta = !!meta;
    const prevContent = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = C.pageBg;

    // Set status bar style for iOS
    let statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null;
    const hadStatusMeta = !!statusMeta;
    const prevStatusContent = statusMeta?.content;
    if (!statusMeta) {
      statusMeta = document.createElement("meta");
      statusMeta.name = "apple-mobile-web-app-status-bar-style";
      document.head.appendChild(statusMeta);
    }
    statusMeta.content = "black-translucent";

    return () => {
      // Restore on unmount
      const tc = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (tc) {
        if (hadMeta && prevContent) tc.content = prevContent;
        else tc.remove();
      }
      const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null;
      if (sb) {
        if (hadStatusMeta && prevStatusContent) sb.content = prevStatusContent;
        else sb.remove();
      }
    };
  }, []);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEE, MMM d");
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function DarkNav() {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  return (
    <header
      className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pt-5 pb-2 md:pt-6 md:pb-5 flex justify-between items-center"
      style={{ background: C.pageBg }}
    >
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
          <span
            className="text-3xl font-bold transition-colors"
            style={{ letterSpacing: "-0.03em", fontFamily: C.font, color: C.text }}
          >
            Phoebe
          </span>
        </Link>

        <Link
          href="/people"
          className="flex items-center gap-1.5 text-sm font-medium transition-colors mt-2"
          style={{ color: C.textSecondary }}
        >
          <Users size={15} />
          People
        </Link>
      </div>

      {user && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors focus:outline-none"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full"
                style={{ border: `1px solid ${C.divider}` }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: C.card, color: C.textSecondary, border: "1px solid rgba(200,212,192,0.2)" }}
              >
                {user.name.charAt(0)}
              </div>
            )}
            <span className="hidden sm:block text-sm font-medium" style={{ color: C.text }}>{user.name}</span>
            <ChevronDown size={14} style={{ color: C.textSecondary }} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-2xl z-20 overflow-hidden"
                style={{ background: C.card, boxShadow: C.cardShadow, border: C.cardBorder }}
              >
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.divider}` }}>
                  <p className="text-sm font-medium truncate" style={{ color: C.text }}>{user.name}</p>
                  <p className="text-xs truncate" style={{ color: C.textSecondary }}>{user.email}</p>
                </div>
                <button
                  onClick={() => presenceToggle.mutate(!user.showPresence)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors"
                  style={{ color: C.textSecondary }}
                >
                  <span>Show when I'm here 🌿</span>
                  <div
                    className="w-8 h-[18px] rounded-full transition-colors relative"
                    style={{ background: user.showPresence ? "#5C7A5F" : "rgba(200,212,192,0.2)" }}
                  >
                    <div
                      className="absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform"
                      style={{ background: C.text, left: user.showPresence ? 16 : 2 }}
                    />
                  </div>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors"
                  style={{ color: C.textSecondary, borderTop: `1px solid ${C.divider}` }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function DarkFAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/letters/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: C.card, border: "rgba(200,212,192,0.15)", boxShadow: C.cardShadow, minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: C.text }}>📮 Start a correspondence</p>
              <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>Write letters with someone</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: C.card, border: C.cardBorder, boxShadow: C.cardShadow, minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: C.text }}>🕯️ Start a gathering</p>
              <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>Meet together regularly</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: C.fab, color: C.text }}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </button>
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: C.text, fontFamily: C.font }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: C.divider }} />
    </div>
  );
}

// ─── Letters Section ─────────────────────────────────────────────────────────

function LettersSection() {
  const { user } = useAuth();
  const { data: correspondences, isLoading } = useQuery<Array<{
    id: number;
    name: string;
    groupType: string;
    unreadCount: number;
    members: Array<{ name: string | null; email: string; homeCity: string | null }>;
    recentPostmarks: Array<{ authorName: string; city: string; sentAt: string }>;
    currentPeriod: {
      periodNumber: number;
      periodLabel: string;
      hasWrittenThisPeriod: boolean;
      isLastThreeDays: boolean;
      membersWritten: Array<{ name: string; hasWritten: boolean }>;
    };
  }>>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <>
        <SectionHeader label="Letters 📮" />
        <div className="space-y-3 mb-8">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: C.card }} />
          ))}
        </div>
      </>
    );
  }

  const items = correspondences ?? [];

  return (
    <div className="mb-8">
      <SectionHeader label="Letters 📮" />

      {items.length === 0 ? (
        <div
          className="rounded-2xl p-[18px] text-center"
          style={{ background: C.card, border: "1px dashed rgba(200,212,192,0.3)", boxShadow: C.cardShadow }}
        >
          <p className="text-sm mb-3" style={{ color: C.textSecondary }}>No letters yet. Start a correspondence. 📮</p>
          <Link href="/letters/new">
            <span className="text-sm font-semibold" style={{ color: C.accent }}>Start writing →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const isOneToOne = c.groupType === "one_to_one";
            const otherMembers = c.members
              .filter(m => m.email !== user?.email)
              .map(m => m.name || m.email.split("@")[0])
              .join(", ");

            const iWrote = c.currentPeriod.membersWritten.find(m => m.name === user?.name)?.hasWritten ?? false;
            const theyWrote = c.currentPeriod.membersWritten.find(m => m.name !== user?.name)?.hasWritten ?? false;
            const hasUnread = c.unreadCount > 0;
            const needsWrite = !iWrote;

            let statusText = "";
            let statusColor = C.textSecondary;

            if (hasUnread) {
              statusText = `${otherMembers} wrote 🌿`;
              statusColor = C.accent;
            } else if (iWrote && !theyWrote) {
              statusText = isOneToOne ? `Waiting for ${otherMembers}... 🌿` : `Your update is in 🌿`;
              statusColor = C.textSecondary;
            } else if (needsWrite) {
              statusText = isOneToOne ? `Your turn to write 🖋️` : `Share your update 📮`;
              statusColor = C.accent;
            } else {
              statusText = "All written 🌿";
              statusColor = "#6B8F71";
            }

            const lastPostmark = c.recentPostmarks[0];

            return (
              <Link key={c.id} href={`/letters/${c.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex rounded-2xl overflow-hidden cursor-pointer transition-shadow"
                  style={{ background: C.card, border: C.cardBorder, boxShadow: C.cardShadow }}
                >
                  <div className="w-[3px] flex-shrink-0" style={{ background: C.textSecondary }} />
                  <div className="flex-1 p-[18px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-semibold" style={{ color: C.text }}>
                          {c.name || (isOneToOne ? `Letters with ${otherMembers}` : otherMembers)}
                        </span>
                        {hasUnread && (
                          <span
                            className="ml-2 inline-block w-2 h-2 rounded-full align-middle"
                            style={{ background: C.accent }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-semibold shrink-0" style={{ color: C.accent, letterSpacing: "0.08em" }}>
                        {isOneToOne ? `Letter ${c.currentPeriod.periodNumber}` : `Week ${c.currentPeriod.periodNumber}`}
                      </span>
                    </div>

                    <p className="text-sm mt-1 font-medium" style={{ color: statusColor }}>
                      {statusText}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px]" style={{ color: C.textSecondary }}>
                        {c.currentPeriod.periodLabel}
                        {lastPostmark?.city ? ` · ${lastPostmark.city}` : ""}
                      </span>
                      {needsWrite && (
                        <Link
                          href={`/letters/${c.id}/write`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <span
                            className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                            style={{ background: C.activeBtnBg, color: C.text }}
                          >
                            Write 🖋️
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gatherings Section ──────────────────────────────────────────────────────

function GatheringsSection() {
  const { user } = useAuth();
  const { data: rituals, isLoading } = useListRituals({ ownerId: user?.id });

  if (isLoading) {
    return (
      <>
        <SectionHeader label="Gatherings 🕯️" />
        <div className="space-y-3 mb-8">
          {[1].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: C.card }} />
          ))}
        </div>
      </>
    );
  }

  const gatherings = rituals ?? [];

  return (
    <div className="mb-4">
      <SectionHeader label="Gatherings 🕯️" />

      {gatherings.length === 0 ? (
        <div
          className="rounded-2xl p-[18px] text-center"
          style={{ background: C.card, border: "1px dashed rgba(200,212,192,0.3)", boxShadow: C.cardShadow }}
        >
          <p className="text-sm mb-3" style={{ color: C.textSecondary }}>No gatherings yet. Start one. 📅</p>
          <Link href="/tradition/new">
            <span className="text-sm font-semibold" style={{ color: C.accent }}>Start a gathering →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {gatherings.map((ritual) => {
            const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
            const r = ritual as any;
            const rhythm = r.rhythm as string | undefined;
            const rhythmLabel = rhythm === "weekly" ? "weekly tradition"
              : rhythm === "biweekly" || rhythm === "fortnightly" ? "biweekly tradition"
              : rhythm === "monthly" ? "monthly tradition"
              : ritual.frequency ? `${ritual.frequency} tradition` : "recurring tradition";

            return (
              <Link key={ritual.id} href={`/ritual/${ritual.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex rounded-2xl overflow-hidden cursor-pointer transition-shadow"
                  style={{ background: C.card, border: C.cardBorder, boxShadow: C.cardShadow }}
                >
                  <div className="w-[3px] flex-shrink-0" style={{ background: C.textSecondary }} />
                  <div className="flex-1 p-[18px]">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-base font-semibold" style={{ color: C.text }}>{ritual.name}</span>
                      <span className="text-[11px]" style={{ color: C.textSecondary }}>{rhythmLabel}</span>
                    </div>

                    {ritual.participants && (ritual.participants as any[]).length > 0 && (
                      <p className="text-sm mb-1" style={{ color: C.textSecondary }}>
                        with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                        {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
                      </p>
                    )}

                    {next && (
                      <p className="text-sm" style={{ color: C.textSecondary }}>
                        {dayLabel(next)} · {format(next, "h:mm a")}
                        {ritual.location && <> · {ritual.location}</>}
                      </p>
                    )}

                    {r.intercessionIntention && (
                      <p className="text-xs mt-1" style={{ color: C.textSecondary }}>🙏 Praying for {r.intercessionIntention}</p>
                    )}
                    {r.fastingDescription && (
                      <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>🌿 Fasting together</p>
                    )}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Prayer Section (inline) ─────────────────────────────────────────────────

interface PrayerRequest {
  id: number;
  body: string;
  ownerId: number;
  ownerName: string | null;
  isOwnRequest: boolean;
  isAnswered: boolean;
  isAnonymous: boolean;
  closedAt: string | null;
  expiresAt: string | null;
  nearingExpiry: boolean;
  words: Array<{ authorName: string; content: string }>;
  myWord: string | null;
  createdAt: string;
}

function DarkPrayerSection() {
  const queryClient = useQueryClient();
  useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordInputs, setWordInputs] = useState<Record<number, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  const { data: requests = [], isLoading } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
  });

  const submitMutation = useMutation({
    mutationFn: ({ body }: { body: string }) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setInputValue("");
      setPendingBody("");
      setShowModal(false);
    },
  });

  const wordMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest("POST", `/api/prayer-requests/${id}/word`, { content }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setWordInputs(prev => ({ ...prev, [id]: "" }));
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const handleSendClick = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setPendingBody(trimmed);
    setShowModal(true);
  };

  const handleModalSubmit = () => {
    if (!pendingBody.trim()) return;
    submitMutation.mutate({ body: pendingBody.trim() });
  };

  const handleModalCancel = () => {
    setShowModal(false);
    setPendingBody("");
  };

  const handleRowClick = (id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleWordSubmit = (id: number) => {
    const content = (wordInputs[id] || "").trim();
    if (!content) return;
    wordMutation.mutate({ id, content });
  };

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

  return (
    <div className="mt-2">
      {/* Section header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center gap-3 mb-4 group"
        aria-expanded={isOpen}
      >
        <h2 className="text-lg font-semibold shrink-0" style={{ color: C.text, fontFamily: C.font }}>
          Prayer requests 🙏
        </h2>
        <div className="flex-1 h-px" style={{ background: C.divider }} />
        <span
          className="text-xs shrink-0 transition-transform duration-200"
          style={{ color: C.textSecondary, display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="mt-3">
          {/* Input area */}
          <div className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSendClick(); }}
              placeholder="Share a prayer request with your garden... 🌿"
              maxLength={1000}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 transition-all"
              style={{
                backgroundColor: C.pageBg,
                border: `1px solid ${C.divider}`,
                color: C.text,
                // placeholder color handled via class below
              }}
            />
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!inputValue.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              style={{ backgroundColor: C.prayer, color: C.text }}
            >
              🙏
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded-2xl animate-pulse" style={{ background: C.card }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && requests.length === 0 && (
            <p className="text-sm text-center" style={{ color: C.textSecondary }}>
              Your community is here to carry what you're carrying.
            </p>
          )}

          {/* Prayer request rows */}
          {!isLoading && requests.length > 0 && (
            <div>
              {requests.map((request, idx) => {
                const isExpanded = expandedId === request.id;
                const isLast = idx === requests.length - 1;

                return (
                  <div
                    key={request.id}
                    style={!isLast ? { borderBottom: `1px solid ${C.divider}` } : undefined}
                  >
                    {/* Row */}
                    <div
                      className="flex gap-0 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(request.id)}
                    >
                      {/* Terracotta accent bar */}
                      <div
                        className="w-[3px] self-stretch shrink-0"
                        style={{ backgroundColor: C.prayer }}
                      />

                      <div className="flex-1 p-4 pl-3 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Attribution */}
                            <p className="text-[10px] font-medium tracking-widest mb-1" style={{ color: C.textSecondary }}>
                              From {request.ownerName ?? "someone"}
                            </p>
                            {/* Body */}
                            <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                              {request.body}
                            </p>
                          </div>

                          {/* Delete button for own requests */}
                          {request.isOwnRequest && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                deleteMutation.mutate(request.id);
                              }}
                              disabled={deleteMutation.isPending}
                              aria-label="Delete prayer request"
                              className="text-base leading-none shrink-0 ml-2 disabled:opacity-30 transition-colors"
                              style={{ color: C.textSecondary }}
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* Nearing expiry */}
                        {request.nearingExpiry && (
                          <p className="text-xs italic mt-2" style={{ color: C.textSecondary }}>
                            Released tomorrow 🌿
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div
                        className="pl-4 pr-4 pb-4"
                        style={{ borderLeft: `2px solid ${C.textSecondary}`, marginLeft: "2px" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {request.words.length > 0 && (
                          <>
                            <p className="text-[10px] font-medium tracking-widest mb-2 mt-1" style={{ color: C.textSecondary }}>
                              From your community
                            </p>

                            <div className="mb-3 space-y-1">
                              {request.words.map((w, i) => {
                                const isMyWord = request.myWord && w.content === request.myWord;
                                return (
                                  <p key={i} className="text-sm" style={{ color: C.textSecondary }}>
                                    <span className="font-medium" style={{ color: C.accent }}>{w.authorName}</span>
                                    {": "}
                                    {w.content}
                                    {isMyWord && " 🌿"}
                                  </p>
                                );
                              })}
                            </div>

                            <p className="text-xs italic mb-3" style={{ color: C.textSecondary }}>
                              Your community is holding this. 🙏
                            </p>
                          </>
                        )}

                        {/* Word input */}
                        {!request.myWord && !request.isOwnRequest && (
                          <div className="flex gap-2 mt-2">
                            <input
                              type="text"
                              value={wordInputs[request.id] || ""}
                              onChange={e =>
                                setWordInputs(prev => ({
                                  ...prev,
                                  [request.id]: e.target.value,
                                }))
                              }
                              onKeyDown={e => {
                                if (e.key === "Enter") handleWordSubmit(request.id);
                              }}
                              placeholder="Leave a word alongside this... 🌿"
                              maxLength={120}
                              className="flex-1 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 transition-all"
                              style={{
                                backgroundColor: C.pageBg,
                                border: `1px solid ${C.divider}`,
                                color: C.text,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleWordSubmit(request.id)}
                              disabled={!(wordInputs[request.id] || "").trim() || wordMutation.isPending}
                              className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                              style={{ backgroundColor: C.prayer, color: C.text }}
                            >
                              🙏
                            </button>
                          </div>
                        )}

                        {/* Release / Remove */}
                        <div className="flex justify-end mt-3 pt-2" style={{ borderTop: `1px solid ${C.divider}` }}>
                          {request.isOwnRequest ? (
                            <button
                              type="button"
                              onClick={() => releaseMutation.mutate(request.id)}
                              disabled={releaseMutation.isPending}
                              className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: C.textSecondary }}
                            >
                              Release this 🌿
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(request.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: C.textSecondary }}
                            >
                              Remove from my view
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom sheet modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={e => { if (e.target === e.currentTarget) handleModalCancel(); }}
        >
          <div
            className="rounded-t-3xl shadow-2xl px-6 pt-6 pb-10"
            style={{ backgroundColor: C.card }}
            onClick={e => e.stopPropagation()}
          >
            <h2
              className="text-lg font-serif mb-4"
              style={{ color: C.text }}
            >
              Hold this with your community 🌿
            </h2>

            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed"
              style={{ backgroundColor: "rgba(240,237,230,0.07)", color: C.text }}
            >
              {pendingBody}
            </div>

            <p className="text-xs italic mb-6" style={{ color: C.textSecondary }}>
              Your community will hold this for three days. On the third day it will quietly be released. 🌿
            </p>

            <button
              type="button"
              onClick={handleModalSubmit}
              disabled={submitMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: C.activeBtnBg, color: C.text }}
            >
              {submitMutation.isPending ? "Sharing..." : "Share with my community 🙏"}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleModalCancel}
                className="text-xs transition-colors"
                style={{ color: C.textSecondary }}
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline style for placeholder color */}
      <style>{`
        .dark-prayer-input::placeholder { color: ${C.textSecondary}; }
      `}</style>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomeDark() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  useThemeColor();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: C.pageBg }}>
      <DarkNav />

      <main className="flex-1 flex flex-col pt-2 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          <div className="flex flex-col w-full pb-36">

            {/* Header */}
            <div className="mb-6">
              <p className="mb-1" style={{ color: C.textSecondary, fontSize: "13px", fontWeight: 400, letterSpacing: 0 }}>
                Cultivating community makes life radiant ✨
              </p>
              <h1 className="text-2xl font-semibold" style={{ color: C.text, fontFamily: C.font }}>
                {format(new Date(), "EEEE, d MMMM")}
              </h1>
            </div>

            {/* Letters */}
            <LettersSection />

            {/* Gatherings */}
            <GatheringsSection />

            {/* Prayer Requests */}
            <DarkPrayerSection />

            {/* Footer */}
            <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: C.footer }}>
              Inspired by Monastic Wisdom
            </p>

            {/* FAB */}
            <DarkFAB />
          </div>
        </motion.div>
      </main>

      {/* Global placeholder styling for dark inputs */}
      <style>{`
        input::placeholder { color: ${C.textSecondary} !important; opacity: 1; }
      `}</style>
    </div>
  );
}
