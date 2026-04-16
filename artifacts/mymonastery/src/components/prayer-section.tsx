import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle } from "lucide-react";

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
  needsRenewal: boolean;
  isFellow?: boolean;
  words: Array<{ authorName: string; content: string }>;
  myWord: string | null;
  createdAt: string;
}

export function PrayerSection({ maxVisible = 0 }: { maxVisible?: number }) {
  // maxVisible: 0 = show all, N = show N then "See all" button
  const queryClient = useQueryClient();
  useAuth();

  // Mute is now only available on person detail page and in Settings

  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [durationDays, setDurationDays] = useState<3 | 7>(3);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordInputs, setWordInputs] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const { data: requests = [], isLoading } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
  });

  const submitMutation = useMutation({
    mutationFn: ({ body, durationDays: days }: { body: string; durationDays: number }) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setInputValue("");
      setPendingBody("");
      setDurationDays(3);
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

  const renewMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
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
    submitMutation.mutate({ body: pendingBody.trim(), durationDays });
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

  // Trap scroll when modal is open
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
        <h2 className="text-lg font-semibold shrink-0" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          Prayer Requests 🙏🏽
        </h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        <span
          className="text-xs shrink-0 transition-transform duration-200"
          style={{ color: "#9a9390", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
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
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/40 focus:border-[#8FAF96] transition-all"
              style={{ backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" }}
            />
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!inputValue.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
            >
              🙏🏽
            </button>
          </div>

          {/* Loading state — explicit dark sage so it blends into the
              page while data loads (bg-card + border-border can render
              as a pale/white-ish block against the dark theme). */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div
                  key={i}
                  className="h-14 rounded-xl animate-pulse"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    border: "1px solid rgba(46,107,64,0.2)",
                  }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && requests.length === 0 && (
            <p className="text-sm text-center" style={{ color: "#8FAF96" }}>
              Your community is here to carry what you're carrying.
            </p>
          )}

          {/* Prayer request rows */}
          {!isLoading && requests.length > 0 && (
            <div>
              {(maxVisible > 0 && !showAll ? requests.slice(0, maxVisible) : requests).map((request, idx, arr) => {
                const isExpanded = expandedId === request.id;
                const isLast = idx === arr.length - 1;

                return (
                  <div
                    key={request.id}
                    className={!isLast ? "border-b border-border/20" : ""}
                  >
                    {/* Row */}
                    <div
                      className="flex gap-0 cursor-pointer hover:bg-white/[0.02] transition-colors"
                      onClick={() => handleRowClick(request.id)}
                    >
                      {/* Sage accent bar */}
                      <div
                        className="w-0.5 self-stretch shrink-0"
                        style={{ backgroundColor: "#8FAF96" }}
                      />

                      <div className="flex-1 p-4 pl-3 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Attribution */}
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-1">
                              From {request.ownerName ?? "someone"}
                              {request.isFellow && (
                                <span className="ml-1.5 normal-case tracking-normal" style={{ color: "rgba(92,138,95,0.7)" }}>· Fellow</span>
                              )}
                            </p>
                            {/* Body */}
                            <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6" }}>
                              {request.body}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {/* Comment hint — shows word count for all requests */}
                            {request.words.length > 0 && (
                              <span className="flex items-center gap-1" style={{ color: request.isOwnRequest ? "rgba(143,175,150,0.45)" : request.myWord ? "#5C7A5F" : "rgba(143,175,150,0.35)" }}>
                                <span className="text-[10px] tabular-nums">{request.words.length}</span>
                                <MessageCircle size={14} />
                              </span>
                            )}
                            {/* Subtle icon when no words yet (not own request) */}
                            {request.words.length === 0 && !request.isOwnRequest && (
                              <span className="flex items-center gap-1" style={{ color: "rgba(143,175,150,0.35)" }}>
                                <MessageCircle size={14} />
                              </span>
                            )}

                            {/* Days remaining — own requests */}
                            {request.isOwnRequest && request.expiresAt && (() => {
                              const days = Math.max(0, Math.ceil((new Date(request.expiresAt).getTime() - Date.now()) / 86400000));
                              return (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: days <= 1 ? "rgba(217,140,74,0.15)" : "rgba(46,107,64,0.15)",
                                    color: days <= 1 ? "#D98C4A" : "rgba(143,175,150,0.7)",
                                    border: `1px solid ${days <= 1 ? "rgba(217,140,74,0.3)" : "rgba(46,107,64,0.2)"}`,
                                  }}
                                >
                                  {days === 0 ? "today" : `${days}d left`}
                                </span>
                              );
                            })()}

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
                                className="text-muted-foreground/40 hover:text-muted-foreground text-base leading-none disabled:opacity-30 transition-colors"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div
                        className="pl-4 pr-4 pb-4"
                        style={{ borderLeft: "2px solid #5C7A5F", marginLeft: "2px" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {(() => {
                          const othersWords = request.words.filter(
                            (w) => !(request.myWord && w.content === request.myWord),
                          );
                          return (
                            <>
                              {/* Show the user's own word first */}
                              {request.myWord && (
                                <div className="mb-3 mt-1 px-3 py-2 rounded-lg" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.2)" }}>
                                  <p className="text-[10px] font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
                                    Your word
                                  </p>
                                  <p className="text-sm" style={{ color: "#A8C5A0" }}>
                                    {request.myWord}
                                  </p>
                                </div>
                              )}

                              {othersWords.length > 0 && (
                                <>
                                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2 mt-1">
                                    From your community
                                  </p>
                                  <div className="mb-3 space-y-1">
                                    {othersWords.map((w, i) => (
                                      <p key={i} className="text-sm text-muted-foreground/70">
                                        <span className="font-medium text-muted-foreground/80">{w.authorName}</span>
                                        {": "}
                                        {w.content}
                                      </p>
                                    ))}
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}

                        {/* Word input — hide if user already left a word */}
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
                              placeholder="Leave a word alongside this… 🌿"
                              maxLength={120}
                              className="flex-1 text-sm px-3 py-2 rounded-lg border placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#8FAF96]/30 focus:border-[#8FAF96]/40 transition-all"
                              style={{ backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                            />
                            <button
                              type="button"
                              onClick={() => handleWordSubmit(request.id)}
                              disabled={!(wordInputs[request.id] || "").trim() || wordMutation.isPending}
                              className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                              style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
                            >
                              🙏🏽
                            </button>
                          </div>
                        )}

                        {/* Release / Renew / Remove */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
                          {request.isOwnRequest ? (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => renewMutation.mutate(request.id)}
                                disabled={renewMutation.isPending}
                                className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                                style={{
                                  background: "rgba(46,107,64,0.2)",
                                  color: "#A8C5A0",
                                  border: "1px solid rgba(46,107,64,0.3)",
                                }}
                              >
                                {renewMutation.isPending ? "…" : "🔄 Renew"}
                              </button>
                              <button
                                type="button"
                                onClick={() => releaseMutation.mutate(request.id)}
                                disabled={releaseMutation.isPending}
                                className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                                style={{ color: "rgba(143,175,150,0.5)" }}
                              >
                                Release this 🌿
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* See all / collapse */}
              {maxVisible > 0 && requests.length > maxVisible && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="mt-3 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: "#A8C5A0" }}
                >
                  {showAll ? "Show less" : `See all (${requests.length}) →`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom sheet modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) handleModalCancel(); }}
        >
          <div
            className="rounded-t-3xl shadow-2xl px-6 pt-6 pb-10"
            style={{ backgroundColor: "#0F2818" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Hold this with your community 🌿
            </h2>

            {/* Request preview */}
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed"
              style={{ backgroundColor: "rgba(200,212,192,0.06)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.2)" }}
            >
              {pendingBody}
            </div>

            {/* Duration picker */}
            <p className="text-[10px] font-medium uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
              How long should your community hold this?
            </p>
            <div className="flex gap-2 mb-4">
              {([3, 7] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationDays(d)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: durationDays === d ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${durationDays === d ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}`,
                    color: durationDays === d ? "#F0EDE6" : "#8FAF96",
                  }}
                >
                  {d === 3 ? "3 days 🌱" : "7 days 🌿"}
                </button>
              ))}
            </div>
            <p className="text-xs italic mb-6" style={{ color: "#8FAF96" }}>
              {durationDays === 3
                ? "Your community will hold this for three days. On the third day it will quietly be released. 🌿"
                : "Your community will hold this for a full week. After seven days it will quietly be released. 🌿"}
            </p>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleModalSubmit}
              disabled={submitMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
            >
              {submitMutation.isPending ? "Sharing…" : "Share with my community 🙏🏽"}
            </button>

            {/* Cancel */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleModalCancel}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mute is available on person detail page and in Settings */}
    </div>
  );
}
