import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

export default function CommunityNewPage() {
  const { user, isLoading } = useAuth();
  const { rawIsAdmin: isBuilder } = useBetaStatus();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");
  // ── Prayer Circle (beta) — opt-in at creation time. When on, we require
  // an `intention` and expose an optional `circleDescription` for more
  // context. Non-circles ignore these fields. Group admins can also flip
  // this on later from the settings page.
  const [isPrayerCircle, setIsPrayerCircle] = useState(false);
  const [intention, setIntention] = useState("");
  const [circleDescription, setCircleDescription] = useState("");

  const EMOJI_OPTIONS = ["🏘️","⛪","✝️","🕊️","🙏🏽","🌿","🌱","🕯️","📖","🫂","💒","🌾","🔔","🫙","🌻","🍃","🏔️","🌊","☀️","🌙"];
  const INTENTION_EXAMPLES = [
    "For the sick in our parish.",
    "For an end to gun violence.",
    "For our neighbors who are new to this country.",
    "For those who have left the church.",
  ];

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && user && !isBuilder) setLocation("/communities");
  }, [user, isLoading, isBuilder, setLocation]);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/groups", {
      name,
      description: description || undefined,
      emoji,
      isPrayerCircle,
      intention: isPrayerCircle ? intention.trim() : undefined,
      circleDescription: isPrayerCircle && circleDescription.trim() ? circleDescription.trim() : undefined,
    }),
    onSuccess: (data: any) => {
      setLocation(`/communities/${data.group.slug}`);
    },
  });

  const canSubmit =
    name.trim().length > 0 &&
    (!isPrayerCircle || intention.trim().length > 0) &&
    !createMutation.isPending;

  if (isLoading || !user) return null;

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

          {/* ── Prayer Circle toggle (beta) ─────────────────────────────── */}
          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
          >
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrayerCircle}
                onChange={e => setIsPrayerCircle(e.target.checked)}
                className="mt-1 w-4 h-4 flex-shrink-0 rounded"
                style={{ accentColor: "#2D5E3F" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                  Make this a prayer circle
                </p>
                <p className="text-xs leading-relaxed mt-1" style={{ color: "#8FAF96" }}>
                  A prayer circle is a group bound by a shared intention. You will name what you are praying for together, and it will surface in each member's daily bell.
                </p>
              </div>
            </label>
          </div>

          {isPrayerCircle && (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                  Intention
                </label>
                <input
                  type="text"
                  value={intention}
                  onChange={e => setIntention(e.target.value)}
                  placeholder="What does this circle pray for?"
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                  style={{
                    color: "#F0EDE6",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INTENTION_EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setIntention(ex)}
                      className="text-[11px] italic px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(46,107,64,0.12)",
                        border: "1px solid rgba(46,107,64,0.25)",
                        color: "rgba(200,212,192,0.8)",
                        fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                  About the circle (optional)
                </label>
                <textarea
                  value={circleDescription}
                  onChange={e => setCircleDescription(e.target.value)}
                  placeholder="Say more about what this circle is for."
                  maxLength={2000}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none"
                  style={{ color: "#F0EDE6" }}
                />
              </div>

              <p className="text-[11px] italic" style={{ color: "rgba(143,175,150,0.65)" }}>
                Prayer circles are a beta feature. We are learning what makes them flourish — we would love your feedback.
              </p>
            </>
          )}

          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {createMutation.isPending
              ? "Creating..."
              : isPrayerCircle ? "Create Prayer Circle" : "Create Community"}
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
