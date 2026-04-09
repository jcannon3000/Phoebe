import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

export default function InvitationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Invitations 📩
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Practices and gatherings you've been invited to.
          </p>
        </div>

        {/* Empty state */}
        <div
          className="rounded-xl px-5 py-8 text-center"
          style={{ background: "transparent", border: "1px dashed rgba(200,212,192,0.2)" }}
        >
          <p className="text-2xl mb-3">📩</p>
          <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>
            No pending invitations
          </p>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            When someone invites you to a practice or gathering, it will appear here.
          </p>
        </div>
      </div>
    </Layout>
  );
}
