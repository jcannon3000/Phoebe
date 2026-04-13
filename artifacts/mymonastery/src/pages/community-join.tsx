import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

export default function CommunityJoinPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
  const [groupName, setGroupName] = useState("");

  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/join`, { token }),
    onSuccess: (data: any) => {
      setGroupName(data.group?.name ?? slug);
      setStatus(data.alreadyJoined ? "already" : "success");
    },
    onError: () => setStatus("error"),
  });

  useEffect(() => {
    if (!authLoading && slug && token) {
      joinMutation.mutate();
    }
  }, [authLoading, slug, token]);

  if (authLoading) return null;

  return (
    <Layout>
      <div className="max-w-md mx-auto w-full text-center py-16">
        {status === "loading" && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Joining community...</p>
        )}
        {status === "success" && (
          <>
            <div className="text-5xl mb-4">🏘️</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Welcome to {groupName}
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              You've joined the community.
            </p>
            <button
              onClick={() => setLocation(`/communities/${slug}`)}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Go to community →
            </button>
          </>
        )}
        {status === "already" && (
          <>
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Already a member
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              You're already part of {groupName}.
            </p>
            <button
              onClick={() => setLocation(`/communities/${slug}`)}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Go to community →
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-5xl mb-4">😕</div>
            <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Invalid invite
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              This invite link may have expired or is no longer valid.
            </p>
            <button
              onClick={() => setLocation("/communities")}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Back to communities
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
