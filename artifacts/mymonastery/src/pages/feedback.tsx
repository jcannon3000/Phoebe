import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type FeedbackRow = {
  id: number;
  userName: string;
  userEmail: string;
  message: string;
  createdAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { rawIsAdmin } = useBetaStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", "/api/feedback", { message }),
    onSuccess: () => {
      setMessage("");
      toast({ title: "Thanks for your feedback!" });
    },
    onError: () => {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const { data: inboxData, isLoading: inboxLoading } = useQuery<{ feedback: FeedbackRow[] }>({
    queryKey: ["/api/feedback"],
    queryFn: () => apiRequest("GET", "/api/feedback"),
    enabled: !!user && rawIsAdmin,
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full py-8 space-y-10">

        {/* ── Submit form ── */}
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Feedback
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            Share a thought, report a bug, or suggest something. We read every message.
          </p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            rows={5}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-1"
            style={{
              background: "rgba(200,212,192,0.05)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              lineHeight: "1.6",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.55)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(46,107,64,0.25)"; }}
          />

          <div className="flex justify-end mt-3">
            <button
              onClick={() => submit.mutate()}
              disabled={!message.trim() || submit.isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "#4a7c59", color: "#ffffff" }}
            >
              {submit.isPending ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>

        {/* ── Admin inbox ── */}
        {rawIsAdmin && (
          <div>
            <div className="mb-4" style={{ height: 1, background: "rgba(46,107,64,0.18)" }} />
            <h2
              className="text-base font-semibold mb-4"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Feedback Inbox
            </h2>

            {inboxLoading && (
              <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
            )}

            {!inboxLoading && (inboxData?.feedback ?? []).length === 0 && (
              <p className="text-sm" style={{ color: "#8FAF96" }}>No feedback yet.</p>
            )}

            <div className="space-y-3">
              {(inboxData?.feedback ?? []).map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl px-4 py-4"
                  style={{
                    background: "rgba(200,212,192,0.04)",
                    border: "1px solid rgba(46,107,64,0.15)",
                  }}
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
                        {row.userName}
                      </span>
                      <span className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {row.userEmail}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: "rgba(143,175,150,0.4)" }}>
                      {formatDate(row.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#C8D4C0" }}>
                    {row.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
