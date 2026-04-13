import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

export default function BetaClaimPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(searchString);
  const tokenFromUrl = params.get("token") || "";

  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/beta/claim", { token: tokenFromUrl }),
    onSuccess: () => {
      setStatus("done");
      queryClient.invalidateQueries({ queryKey: ["/api/beta/status"] });
    },
    onError: (err: any) => {
      setStatus("error");
      setErrorMsg(err?.message || "Invalid or expired claim token.");
    },
  });

  // Auto-claim if token is in URL and user is logged in
  useEffect(() => {
    if (user && tokenFromUrl && status === "idle") {
      setStatus("claiming");
      claimMutation.mutate();
    }
  }, [user, tokenFromUrl]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-md mx-auto w-full text-center py-16">
        {!tokenFromUrl ? (
          <>
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Admin Claim
            </h1>
            <p className="text-sm mb-2" style={{ color: "#8FAF96" }}>
              This link requires a valid claim token.
            </p>
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
              Use the link you were given — it includes the token automatically.
            </p>
          </>
        ) : status === "claiming" ? (
          <>
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Claiming admin access…
            </h1>
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              Setting you up as a beta admin for <strong style={{ color: "#F0EDE6" }}>{user.email}</strong>
            </p>
          </>
        ) : status === "done" ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              You're a beta admin!
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              You now have access to manage beta users and all beta features.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setLocation("/beta")}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Manage Beta Users
              </button>
              <button
                onClick={() => setLocation("/dashboard")}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.3)" }}
              >
                Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Claim Failed
            </h1>
            <p className="text-sm mb-6" style={{ color: "#E57373" }}>
              {errorMsg}
            </p>
            <button
              onClick={() => setLocation("/dashboard")}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
