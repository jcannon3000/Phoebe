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
  words: Array<{ authorName: string; content: string }>;
  myWord: string | null;
  createdAt: string;
}

export function PrayerSection() {
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
    <div>
      {/* Section header */}
      <div className="mb-4">
        <button
          onClick={() => setIsOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={isOpen}
        >
          <span className="section-header">
            Prayer Requests
          </span>
          <div className="flex-1 h-px mx-2 animate-rule-sage" />
          <span
            className="text-xs transition-transform duration-200"
            style={{ display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#A89E92" }}
          >
            ▾
          </span>
        </button>
      </div>

      {/* Input bar — always visible */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSendClick(); }}
          placeholder="What would you like your community to hold? 🙏"
          maxLength={1000}
          className="flex-1 px-4 py-2.5 rounded-xl border border-border/60 bg-card placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#D4896A]/30 focus:border-[#D4896A]/50 transition-all"
          style={{ fontSize: "15px" }}
        />
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!inputValue.trim()}
          className="px-4 py-2.5 rounded-xl text-[#E8E4D8] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          style={{ backgroundColor: "#D4896A" }}
        >
          🙏
        </button>
      </div>

      {isOpen && (
        <div>

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
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "#E8E2D5", border: "1px dashed #D4CFC4" }}
            >
              <div className="text-3xl mb-3">🙏</div>
              <p className="italic" style={{ fontSize: "16px", lineHeight: 1.5, color: "#2C1810", marginBottom: "6px" }}>Your community is here to carry what you're carrying.</p>
              <p className="italic" style={{ fontSize: "16px", lineHeight: 1.5, color: "#2C1810" }}>Nothing is too small to be held together.</p>
            </div>
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
                    className={!isLast ? "border-b border-border/20" : ""}
                  >
                    {/* Row */}
                    <div
                      className="flex gap-0 cursor-pointer hover:bg-[#D4896A]/[0.04] transition-colors"
                      onClick={() => handleRowClick(request.id)}
                    >
                      {/* Sage accent bar */}
                      <div
                        className="w-0.5 self-stretch shrink-0"
                        style={{ backgroundColor: "#5C7A5F" }}
                      />

                      <div className="flex-1 p-4 pl-3 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Attribution */}
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-1">
                              From {request.ownerName ?? "someone"}
                            </p>
                            {/* Body */}
                            <p className="text-sm leading-relaxed" style={{ color: "#2C1810" }}>
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
                        {request.nearingExpiry && (
                          <p className="text-xs italic mt-2" style={{ color: "#8C7B6B" }}>
                            Released tomorrow 🌿
                          </p>
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
                              Your community is holding this. 🙏
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
                              className="flex-1 text-sm px-3 py-2 rounded-lg border border-border/50 bg-card placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#D4896A]/30 focus:border-[#D4896A]/40 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => handleWordSubmit(request.id)}
                              disabled={!(wordInputs[request.id] || "").trim() || wordMutation.isPending}
                              className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                              style={{ backgroundColor: "#D4896A", color: "#E8E4D8" }}
                            >
                              🙏
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
                              style={{ color: "#8C7B6B" }}
                            >
                              Release this 🌿
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(request.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: "#8C7B6B" }}
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
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) handleModalCancel(); }}
        >
          <div
            className="rounded-t-3xl shadow-2xl px-6 pt-6 pb-10"
            style={{ backgroundColor: "#E8E2D5" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <h2
              className="text-lg font-serif mb-4"
              style={{ color: "#2C1810" }}
            >
              Hold this with your community 🌿
            </h2>

            {/* Request preview */}
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed"
              style={{ backgroundColor: "rgba(44,24,16,0.05)", color: "#2C1810" }}
            >
              {pendingBody}
            </div>

            {/* Instructional copy */}
            <p className="text-xs italic mb-6" style={{ color: "#5C7A5F" }}>
              Your community will hold this for three days. On the third day it will quietly be released. 🌿
            </p>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleModalSubmit}
              disabled={submitMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#2C1810", color: "#E8E4D8" }}
            >
              {submitMutation.isPending ? "Sharing…" : "Share with my community 🙏"}
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
