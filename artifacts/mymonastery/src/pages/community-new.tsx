import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDemoFlag } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

export default function CommunityNewPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const communitiesEnabled = useDemoFlag("communities");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");

  const EMOJI_OPTIONS = ["🏘️","⛪","✝️","🕊️","🙏🏽","🌿","🌱","🕯️","📖","🫂","💒","🌾","🔔","🫙","🌻","🍃","🏔️","🌊","☀️","🌙"];

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && !communitiesEnabled) setLocation("/communities");
  }, [user, isLoading, communitiesEnabled, setLocation]);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/groups", { name, description: description || undefined, emoji }),
    onSuccess: (data: any) => {
      setLocation(`/communities/${data.group.slug}`);
    },
  });

  if (isLoading || !user || !communitiesEnabled) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
        <button
          onClick={() => setLocation("/communities")}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← Communities
        </button>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Create a Community
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          A shared space for prayer, practice, and connection.
        </p>

        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Icon
            </label>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
                {emoji}
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)}
                    className="text-xl w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                    style={{
                      background: emoji === e ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${emoji === e ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. St. Mary's Parish"
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this community about?"
              maxLength={500}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none"
              style={{ color: "#F0EDE6" }}
            />
          </div>

          <button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {createMutation.isPending ? "Creating..." : "Create Community"}
          </button>

          {createMutation.isError && (
            <p className="text-sm text-center" style={{ color: "#E57373" }}>
              Something went wrong. Try again.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
