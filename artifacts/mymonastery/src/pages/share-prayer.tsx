import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Landing page for the "How can we pray for you?" community prompt.
// Members arrive here via push or email; the page shows who is asking,
// frames the question (something this week the community can be with
// them in prayer about), and collects a single response that becomes
// a regular prayer request visible to the user's whole garden.

const FONT = "'Space Grotesk', sans-serif";

type Group = {
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  // The question the admin chose for the most recent "Ask your
  // community" send. Drives this slide's headline so it asks the
  // same thing the push / email did. Null → the default question.
  prayerInvitePrompt: string | null;
};

export default function SharePrayerPage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = params.slug ?? "";
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pull the group so the page can address the user by name, name the
  // community that asked, and read the admin's chosen prompt. Endpoint
  // already requires membership, so non-members get a 403 and we land
  // on a generic error state. GET /api/groups/:slug wraps the row in a
  // `{ group, members, … }` envelope — normalize so this page works
  // whether the response is the envelope or a bare group.
  const { data: raw, isLoading, error } = useQuery<{ group?: Group } & Partial<Group>>({
    queryKey: [`/api/groups/${slug}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!slug,
    staleTime: 60_000,
  });
  const group: Group | undefined = raw
    ? (raw.group ?? (raw as Group))
    : undefined;

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "";
  // The headline question — the admin's chosen prompt, or the default.
  const prompt = (group?.prayerInvitePrompt ?? "").trim() || "How can we pray for you?";

  async function handleSubmit() {
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Plain prayer-request POST. The result lands in the user's
      // garden via the existing visibility rules — no group-scoping
      // here; community admins asked, but the prayer is for everyone
      // who already prays with this user.
      await apiRequest("POST", "/api/prayer-requests", { body });
      await queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setSubmitted(true);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't share that. Try again?",
      );
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full px-5 py-10 text-center">
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
            Loading…
          </p>
        </div>
      </Layout>
    );
  }

  if (error || !group) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full px-5 py-10 text-center">
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
            We couldn't find that community.
          </p>
          <button
            onClick={() => setLocation("/dashboard")}
            className="mt-6 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT }}
          >
            Back to home
          </button>
        </div>
      </Layout>
    );
  }

  if (submitted) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full px-5 py-10 text-center">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="text-5xl mb-6"
          >
            🌿
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-xl font-semibold mb-2"
            style={{ color: "#F0EDE6", fontFamily: FONT }}
          >
            Your community will hold this.
          </motion.p>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            onClick={() => setLocation("/dashboard")}
            className="mt-8 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT }}
          >
            Back to home
          </motion.button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full px-5 py-8">
        {firstName && (
          <p
            className="text-sm mb-1.5"
            style={{ color: "#8FAF96", fontFamily: FONT }}
          >
            Hi {firstName},
          </p>
        )}
        <h1
          className="text-2xl md:text-3xl font-semibold mb-3 leading-tight"
          style={{ color: "#F0EDE6", fontFamily: FONT }}
        >
          {prompt}
        </h1>
        <p
          className="text-sm md:text-base leading-relaxed font-light mb-8"
          style={{ color: "#8FAF96", fontFamily: FONT }}
        >
          {group.emoji ?? "🌿"} {group.name} is asking. Share what's on your heart — nothing is too small to be held together.
        </p>

        {/* Same card visual as the in-app prayer-request compose box —
            sage tint, accent bar on the left, eyebrow + textarea inside. */}
        <div
          className="w-full relative flex rounded-xl overflow-hidden mb-4"
          style={{
            background: "rgba(143,175,150,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
          }}
        >
          <div className="w-1 flex-shrink-0" style={{ background: "#8FAF96" }} />
          <div className="flex-1 px-4 py-3 text-left">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5"
              style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}
            >
              Your request
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="What's on your heart this week? 🌿"
              className="w-full text-sm resize-none outline-none"
              style={{
                background: "transparent",
                color: "#F0EDE6",
                fontFamily: FONT,
                lineHeight: "1.5",
                WebkitAppearance: "none",
                appearance: "none",
                boxShadow: "none",
                border: "none",
              }}
            />
          </div>
        </div>

        {submitError && (
          <p className="text-xs text-center mb-3" style={{ color: "#F87171", fontFamily: FONT }}>
            {submitError}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT }}
        >
          {submitting ? "Sharing…" : "Share with my community 🙏🏽"}
        </button>

        <p
          className="text-xs text-center mt-6"
          style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}
        >
          {group.emoji ?? "🌿"} {group.name} is asking — but everyone who already prays with you will see this.
        </p>
      </div>
    </Layout>
  );
}
