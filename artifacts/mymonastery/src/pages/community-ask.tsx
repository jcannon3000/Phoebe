import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// "Ask your community" — the page a community admin lands on from the
// "Send" button on the community detail card. They choose the prompt
// (a preset or a custom question) and send it; every member then gets
// a push + email with that question and a slide to answer it.
//
// Rate-limited server-side to once per 7 days per community.

const FONT = "'Space Grotesk', sans-serif";

// Preset prompts. The first is the default; the rest give the ask a
// specific angle. "custom" is a sentinel — the admin types their own.
const PRAYER_PROMPT_PRESETS = [
  "How can we pray for you?",
  "What's a big life event this week we can pray for?",
  "Is there a friend or family member we can pray for?",
  "What justice issue is close to your heart?",
] as const;

type GroupEnvelope = {
  group?: { name?: string; emoji?: string | null };
  name?: string;
  emoji?: string | null;
};

export default function CommunityAskPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [, setLocation] = useLocation();

  const [promptChoice, setPromptChoice] = useState<string>(PRAYER_PROMPT_PRESETS[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const effectivePrompt = promptChoice === "custom"
    ? customPrompt.trim()
    : promptChoice;

  // Group — for the header. The endpoint wraps the row in a
  // { group, … } envelope; normalize so a bare row also works.
  const { data: raw } = useQuery<GroupEnvelope>({
    queryKey: [`/api/groups/${slug}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!slug,
    staleTime: 60_000,
  });
  const group = raw?.group ?? raw;

  // Cooldown status — once per 7 days. If not available, the page
  // shows a message instead of the picker.
  const { data: status } = useQuery<{
    available: boolean;
    nextEligibleAt: string | null;
  }>({
    queryKey: [`/api/groups/${slug}/prayer-invite-status`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-invite-status`),
    enabled: !!slug,
  });

  const sendMutation = useMutation<
    { ok: boolean; sentToCount: number },
    Error,
    string
  >({
    mutationFn: (prompt: string) =>
      apiRequest("POST", `/api/groups/${slug}/prayer-invite`, { prompt }),
    onSuccess: () => {
      // Back to the community, flagged so the card shows "Sent".
      setLocation(`/communities/${slug}?invited=1`);
    },
    onError: (err) => {
      setError(err.message || "Couldn't send the prompt. Try again?");
    },
  });

  const daysLeft = (() => {
    if (!status?.nextEligibleAt) return 0;
    const ms = new Date(status.nextEligibleAt).getTime() - Date.now();
    return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
  })();
  const onCooldown = status ? !status.available : false;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full px-1 pb-24">
        <button
          onClick={() => setLocation(`/communities/${slug}`)}
          className="text-xs mb-5 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96", background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}
        >
          ← {group?.name ?? "Community"}
        </button>

        <p
          className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-1"
          style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
        >
          Ask your community
        </p>
        <h1
          className="text-2xl font-bold mb-1.5"
          style={{ color: "#F0EDE6", fontFamily: FONT }}
        >
          Choose a prompt
        </h1>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: "rgba(168,197,160,0.8)", fontFamily: FONT }}
        >
          Every member gets a push notification + email with the question you
          choose, and a simple slide to answer it. You can send this once
          every 7 days.
        </p>

        {onCooldown ? (
          <div
            className="rounded-xl px-4 py-4 text-sm"
            style={{
              background: "rgba(46,107,64,0.08)",
              border: "1px solid rgba(46,107,64,0.22)",
              color: "rgba(168,197,160,0.85)",
              fontFamily: FONT,
            }}
          >
            You've already sent an ask this week. You can send another in{" "}
            {daysLeft} {daysLeft === 1 ? "day" : "days"}.
          </div>
        ) : (
          <>
            {/* Preset chips, stacked. The selected one is highlighted. */}
            <div className="flex flex-col gap-2 mb-4">
              {PRAYER_PROMPT_PRESETS.map((preset) => {
                const on = promptChoice === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => setPromptChoice(preset)}
                    className="text-left px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                      background: on ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.1)",
                      border: `1px solid ${on ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
                      color: on ? "#F0EDE6" : "rgba(200,212,192,0.82)",
                      fontFamily: FONT,
                    }}
                  >
                    {preset}
                  </button>
                );
              })}
              <button
                onClick={() => setPromptChoice("custom")}
                className="text-left px-4 py-3 rounded-xl text-sm transition-colors"
                style={{
                  background: promptChoice === "custom" ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.1)",
                  border: `1px solid ${promptChoice === "custom" ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
                  color: promptChoice === "custom" ? "#F0EDE6" : "rgba(200,212,192,0.82)",
                  fontFamily: FONT,
                }}
              >
                ✍🏽 Write your own…
              </button>
            </div>

            {promptChoice === "custom" && (
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, 160))}
                placeholder="e.g. What's weighing on you this week?"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm mb-4 outline-none"
                style={{
                  background: "#091A10",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6",
                  fontFamily: FONT,
                }}
              />
            )}

            {error && (
              <p className="text-xs mb-3" style={{ color: "#F87171", fontFamily: FONT }}>
                {error}
              </p>
            )}

            <button
              onClick={() => {
                setError(null);
                sendMutation.mutate(effectivePrompt);
              }}
              disabled={sendMutation.isPending || !effectivePrompt}
              className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT }}
            >
              {sendMutation.isPending ? "Sending…" : "Send to your community 🙏🏽"}
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
