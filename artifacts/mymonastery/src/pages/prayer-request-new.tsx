import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";

// Full-screen, step-by-step authoring flow for sharing your own prayer
// request with the community. Mirrors the "gathering" and "pray-for-new"
// templates so the creation affordances all feel like siblings:
//   • dark #091A10 canvas
//   • header = back button + progress pills
//   • one question per step, Space Grotesk titles, Playfair Display body
//
// Two steps:
//   0 — What are you asking prayer for?
//   1 — How long should we carry it? (3 or 7 days)
//
// On success we return to /prayer-list, where the new card will show up
// under "Prayer Requests".

const DURATION_OPTIONS = [
  { value: 3, label: "3 days", tagline: "A short, steady watch" },
  { value: 7, label: "7 days", tagline: "A full week of prayer" },
] as const;

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -20 },
};

type Step = 0 | 1;

export default function PrayerRequestNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(0);
  const [body, setBody] = useState("");
  const [days, setDays] = useState<3 | 7>(7);
  const [error, setError] = useState("");

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (step === 0) bodyRef.current?.focus(); }, [step]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prayer-requests", {
        body: body.trim(),
        isAnonymous: false,
        durationDays: days,
      }),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setLocation("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || "Couldn't share this request. Please try again.");
    },
  });

  function handleBodyNext() {
    if (body.trim().length === 0) { setError("Write a prayer request first."); return; }
    setError("");
    setStep(1);
  }

  function handleBack() {
    if (step === 0) { setLocation("/prayer-list"); return; }
    setStep((s) => (s - 1) as Step);
  }

  // Auth guard — same pattern as the other template pages
  if (!user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      {/* Header — back + progress pills */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
        <div className="flex-1 flex gap-1.5">
          {[0, 1].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ background: s <= step ? "#2D5E3F" : "rgba(200,212,192,0.2)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* Step 0 — Write the request */}
          {step === 0 && (
            <motion.div
              key="s0"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                What are you carrying? 🙏🏽
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                Share what you'd like your community to pray about. It can be
                big or small.
              </p>

              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setError(""); }}
                rows={8}
                placeholder="A big decision at work… a family member who's been on my heart…"
                className="w-full rounded-xl px-4 py-3.5 text-base outline-none resize-none mb-2"
                style={{
                  background: "#0F2818",
                  border: "1.5px solid rgba(46,107,64,0.35)",
                  color: "#F0EDE6",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }}
              />
              <p className="text-[11px] mb-6 text-right" style={{ color: "rgba(143,175,150,0.5)" }}>
                {body.length} / 1000
              </p>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleBodyNext}
                disabled={body.trim().length === 0}
                className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Continue →
              </button>
            </motion.div>
          )}

          {/* Step 1 — Duration */}
          {step === 1 && (
            <motion.div
              key="s1"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                How long should we carry it? 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                Choose a watch. You can renew or release it any time.
              </p>

              <div className="space-y-3 mb-8">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setDays(o.value)}
                    className="w-full text-left p-4 rounded-2xl transition-all"
                    style={{
                      background: days === o.value ? "#2D5E3F" : "#0F2818",
                      border: `2px solid ${days === o.value ? "rgba(46,107,64,0.65)" : "rgba(46,107,64,0.3)"}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🙏</span>
                      <div>
                        <p className="font-semibold" style={{ color: "#F0EDE6" }}>{o.label}</p>
                        <p className="text-sm" style={{ color: "#8FAF96" }}>{o.tagline}</p>
                      </div>
                      {days === o.value && (
                        <span className="ml-auto text-base font-bold" style={{ color: "#C8D4C0" }}>✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {createMutation.isPending ? "Sharing…" : "Share with my community →"}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
