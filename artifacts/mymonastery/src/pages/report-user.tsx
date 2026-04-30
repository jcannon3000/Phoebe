import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Report-a-user page. Required by App Store Guideline 1.2 for any
// app with user-generated content. Lifted out of the modal in
// person.tsx because the iOS WKWebView keyboard pushed the action
// buttons below the visible viewport with no way to scroll past
// the keyboard — a full page guarantees the form has whatever
// vertical room iOS gives it, with the textarea + buttons always
// reachable.
//
// On submit, POSTs to /api/reports with kind='user' and the
// target user id. The backend stores the row in content_reports
// and logs at WARN level so reports surface in Railway tail.
// Operator (developer) reviews and acts within 24 hours — the
// SLA we publish in App Review notes and the privacy policy.
export default function ReportUserPage() {
  const [, params] = useRoute("/people/:email/report");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const email = params?.email ? decodeURIComponent(params.email) : undefined;
  const { data: person, isLoading } = usePersonProfile(email, user?.id);

  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  const reportMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", "/api/reports", {
        kind: "user",
        targetId: (person as { userId?: number } | undefined)?.userId,
        reason: text.trim() || undefined,
      }),
    onSuccess: () => setSent(true),
  });

  if (authLoading || !user) return null;

  const firstName = person?.name?.split(" ")[0] ?? "this person";
  const profileHref = email ? `/people/${encodeURIComponent(email)}` : "/people";

  return (
    <Layout>
      <div className="max-w-md mx-auto px-5 pt-6 pb-12" style={{ minHeight: "100dvh" }}>
        {/* Back-to-profile chevron — same chrome as other detail pages. */}
        <Link href={profileHref}>
          <a
            className="inline-flex items-center gap-1 text-sm mb-6"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <ChevronLeft size={16} />
            Back
          </a>
        </Link>

        {sent ? (
          <div className="text-center pt-8">
            <div className="text-5xl mb-5" aria-hidden>🚩</div>
            <h1
              className="text-2xl font-semibold mb-3"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Thank you
            </h1>
            <p className="text-sm leading-relaxed mb-8 max-w-[320px] mx-auto" style={{ color: "#8FAF96" }}>
              We review every report and act within 24 hours. You may also want to mute {firstName} so their content stops appearing for you in the meantime.
            </p>
            <button
              onClick={() => setLocation(profileHref)}
              className="px-6 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                background: "rgba(46,107,64,0.18)",
                color: "#A8C5A0",
                border: "1px solid rgba(46,107,64,0.3)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Back to {firstName}'s profile
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-5xl mb-4" aria-hidden>🚩</div>
              <h1
                className="text-2xl font-semibold mb-2"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {isLoading ? "Report" : `Report ${firstName}`}
              </h1>
              <p className="text-sm leading-relaxed max-w-[320px] mx-auto" style={{ color: "#8FAF96" }}>
                Tell us what's wrong. We review every report and act within 24 hours.
              </p>
            </div>

            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional — what should we know?"
              rows={6}
              maxLength={2000}
              className="w-full px-3.5 py-3 rounded-xl text-sm outline-none mb-3"
              style={{
                background: "rgba(200,212,192,0.05)",
                border: "1px solid rgba(46,107,64,0.3)",
                color: "#F0EDE6",
                fontSize: 16,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            />
            {reportMutation.isError && (
              <p className="text-xs mb-3" style={{ color: "#C47A65" }}>
                Couldn't send the report. Please try again.
              </p>
            )}

            {/* Action buttons sit naturally below the textarea on a
                full page; iOS keyboard pushes the page up but doesn't
                hide the buttons because page scroll keeps them in
                view. */}
            <div className="flex gap-3">
              <button
                onClick={() => setLocation(profileHref)}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: "rgba(46,107,64,0.08)",
                  color: "#8FAF96",
                  border: "1px solid rgba(46,107,64,0.18)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => reportMutation.mutate(reason)}
                disabled={reportMutation.isPending || !(person as { userId?: number } | undefined)?.userId}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "rgba(194,92,92,0.2)",
                  color: "#C25C5C",
                  border: "1px solid rgba(194,92,92,0.3)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {reportMutation.isPending ? "Sending…" : "Send report"}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
