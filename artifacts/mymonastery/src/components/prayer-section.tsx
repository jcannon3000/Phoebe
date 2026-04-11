import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

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
  words: Array<{ authorName: string; content: string }>;
  myWord: string | null;
  createdAt: string;
}

export function PrayerSection({ maxVisible = 0 }: { maxVisible?: number }) {
  // maxVisible: 0 = show all, N = show N then "See all" button
  const queryClient = useQueryClient();
  useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordInputs, setWordInputs] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState(false);

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

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded bg-card border border-border/20 animate-pulse" />
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
                            </p>
                            {/* Body */}
                            <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6" }}>
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
                              className="text-muted-foreground/40 hover:text-muted-foreground text-base leading-none shrink-0 ml-2 disabled:opacity-30 transition-colors"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* Nearing expiry — quiet line */}
                        {request.nearingExpiry && !request.needsRenewal && (
                          <p className="text-xs italic mt-2" style={{ color: "#8FAF96" }}>
                            Past three days soon 🌿
                          </p>
                        )}

                        {/* Past 3-day mark — owner can renew */}
                        {request.isOwnRequest && request.needsRenewal && (
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-xs italic" style={{ color: "rgba(143,175,150,0.65)" }}>
                              Carried for three days 🌿
                            </p>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                renewMutation.mutate(request.id);
                              }}
                              disabled={renewMutation.isPending}
                              className="text-xs font-semibold px-3 py-1 rounded-full transition-opacity disabled:opacity-40"
                              style={{
                                background: "rgba(46,107,64,0.25)",
                                color: "#C8D4C0",
                                border: "1px solid rgba(143,175,150,0.35)",
                              }}
                            >
                              🔄 Renew
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div
                        className="pl-4 pr-4 pb-4"
                        style={{ borderLeft: "2px solid #5C7A5F", marginLeft: "2px" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {request.words.length > 0 && (
                          <>
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2 mt-1">
                              From your community
                            </p>

                            <div className="mb-3 space-y-1">
                              {request.words.map((w, i) => {
                                const isMyWord = request.myWord && w.content === request.myWord;
                                return (
                                  <p key={i} className="text-sm text-muted-foreground/70">
                                    <span className="font-medium text-muted-foreground/80">{w.authorName}</span>
                                    {": "}
                                    {w.content}
                                    {isMyWord && " 🌿"}
                                  </p>
                                );
                              })}
                            </div>

                            <p className="text-xs italic mb-3" style={{ color: "#5C7A5F" }}>
                              Your community is holding this. 🙏🏽
                            </p>
                          </>
                        )}

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

                        {/* Release / Remove */}
                        <div className="flex justify-end mt-3 pt-2 border-t border-border/20">
                          {request.isOwnRequest ? (
                            <button
                              type="button"
                              onClick={() => releaseMutation.mutate(request.id)}
                              disabled={releaseMutation.isPending}
                              className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: "#8FAF96" }}
                            >
                              Release this 🌿
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(request.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: "#8FAF96" }}
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

            {/* Instructional copy */}
            <p className="text-xs italic mb-6" style={{ color: "#8FAF96" }}>
              Your community will hold this for three days. On the third day it will quietly be released. 🌿
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
    </div>
  );
}
