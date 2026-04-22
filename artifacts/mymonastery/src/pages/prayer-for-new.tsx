import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";

// Full-screen, step-by-step authoring flow for starting a private prayer for
// another user. Mirrors the "gathering" (tradition-new) template: dark
// #091A10 canvas, a back button + progress pills in the header, and one
// question per step in Space Grotesk.
//
// Two steps:
//   0 — Write the prayer
//   1 — Choose how many days to hold it (3 or 7)
//
// On success we return to /people/:email, the same page the user launched
// from. Replaces the old bottom-sheet modal in pray-for-them.tsx.

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

export default function PrayerForNew() {
  const [, params] = useRoute<{ email: string }>("/pray-for/new/:email");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const emailParam = params?.email ? decodeURIComponent(params.email) : "";
  const { data: person, isLoading: personLoading, error: personError } =
    usePersonProfile(emailParam || undefined, user?.id);

  const [step, setStep] = useState<Step>(0);
  const [text, setText] = useState("");
  const [days, setDays] = useState<3 | 7>(7);
  const [error, setError] = useState("");

  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (step === 0) textRef.current?.focus(); }, [step]);

  const returnHref = emailParam ? `/people/${encodeURIComponent(emailParam)}` : "/people";

  const createMutation = useMutation({
    mutationFn: () => {
      const recipientUserId = (person as any)?.userId as number | undefined;
      if (!recipientUserId) throw new Error("Recipient not loaded");
      return apiRequest("POST", "/api/prayers-for", {
        recipientUserId,
        prayerText: text.trim(),
        durationDays: days,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      setLocation(returnHref);
    },
    onError: (err: any) => {
      setError(err?.message || "Couldn't start this prayer. Please try again.");
    },
  });

  function handleTextNext() {
    if (text.trim().length === 0) { setError("Write a prayer first."); return; }
    setError("");
    setStep(1);
  }

  function handleBack() {
    if (step === 0) { setLocation(returnHref); return; }
    setStep((s) => (s - 1) as Step);
  }

  // ── Loading / error shells (keep the template chrome) ──────────────────────
  if (!user) {
    setLocation("/");
    return null;
  }

  const firstName = person?.name?.split(" ")[0] ?? "them";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      {/* Header — back + progress pills, matching tradition-new */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← {step === 0 ? "Back" : "Back"}
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
        {personLoading && (
          <div className="space-y-3 mt-6">
            <div className="h-8 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            <div className="h-4 w-2/3 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            <div className="h-40 rounded-xl animate-pulse mt-8" style={{ background: "#0F2818" }} />
          </div>
        )}

        {personError && !personLoading && (
          <div className="mt-8">
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Couldn't open this prayer 🌿
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              We couldn't find the person you're praying for. They may have left
              your fellowship.
            </p>
            <button
              onClick={() => setLocation("/people")}
              className="w-full py-4 rounded-2xl text-base font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Back to people
            </button>
          </div>
        )}

        {person && !personLoading && (
          <AnimatePresence mode="wait">

            {/* Step 0 — Write the prayer */}
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
                  Write a prayer for {firstName} 🌿
                </h1>
                <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                  {firstName} will see that you're holding them in prayer — not
                  the words. This is between you and God.
                </p>

                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value.slice(0, 1000)); setError(""); }}
                  rows={8}
                  placeholder={`Praying ${firstName} has a good day today…`}
                  className="w-full rounded-xl px-4 py-3.5 text-base outline-none resize-none mb-2"
                  style={{
                    background: "#0F2818",
                    border: "1.5px solid rgba(46,107,64,0.35)",
                    color: "#F0EDE6",
                    fontFamily: "Playfair Display, Georgia, serif",
                    fontStyle: "italic",
                    lineHeight: 1.6,
                  }}
                />
                <p className="text-[11px] mb-6 text-right" style={{ color: "rgba(143,175,150,0.5)" }}>
                  {text.length} / 1000
                </p>

                {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

                <button
                  onClick={handleTextNext}
                  disabled={text.trim().length === 0}
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
                  How long will you pray? 🌿
                </h1>
                <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                  Choose a watch. You can renew or end it any time.
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
                  {createMutation.isPending ? "Beginning…" : "Begin praying →"}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
