import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";

// Compact prayer-request entry surface. Same submission flow + duration
// sheet as PrayerSection, but standalone so it can sit at the top of
// the dashboard (under the Daily Prayer List card) while the existing
// requests list stays where it lives. Both surfaces hit the same
// invalidation key, so a submission here updates the list below.
export function PrayerRequestQuickEntry() {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [durationDays, setDurationDays] = useState<3 | 7>(3);

  const submitMutation = useMutation({
    mutationFn: ({ body, durationDays: days }: { body: string; durationDays: number }) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: days }),
    onSuccess: () => {
      triggerSubmitFeedback();
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setInputValue("");
      setPendingBody("");
      setDurationDays(3);
      setShowModal(false);
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
    <div className="flex gap-2">
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSendClick(); }}
        placeholder="How can we pray for you? 🌿"
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
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Hold this with your community 🌿
            </h2>

            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed"
              style={{ backgroundColor: "rgba(200,212,192,0.06)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.2)" }}
            >
              {pendingBody}
            </div>

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

            <button
              type="button"
              onClick={handleModalSubmit}
              disabled={submitMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
            >
              {submitMutation.isPending ? "Sharing…" : "Share with my community 🙏🏽"}
            </button>

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
