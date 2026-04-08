import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import ImprintSlideshow, { correspondenceSlides } from "@/components/ImprintSlideshow";

type CorrespondenceType = "one_to_one" | "group";

interface Member {
  email: string;
  name: string;
}

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export default function LetterNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [imprintDone, setImprintDone] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<CorrespondenceType | null>(null);
  const [members, setMembers] = useState<Member[]>([{ email: "", name: "" }]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: { type: CorrespondenceType; name: string; members: Member[] }) =>
      apiRequest("POST", "/api/phoebe/correspondences", data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
      setLocation(`/letters/${result.id}`);
    },
    onError: (err: Error) => {
      setError(err.message || "Something went wrong.");
    },
  });

  function handleTypeSelect(t: CorrespondenceType) {
    setType(t);
    if (t === "one_to_one") {
      setMembers([{ email: "", name: "" }]);
    } else {
      setMembers([{ email: "", name: "" }, { email: "", name: "" }]);
    }
    setStep(2);
  }

  function handleWhoNext() {
    setError("");
    const validMembers = members.filter((m) => m.email.trim() && m.email.includes("@"));
    if (type === "one_to_one" && validMembers.length !== 1) {
      setError("Enter one valid email address."); return;
    }
    if (type === "group" && validMembers.length < 2) {
      setError("Add at least 2 people."); return;
    }
    if (type === "one_to_one") {
      // Skip naming — auto-generate and create immediately
      const other = validMembers[0];
      const autoName = `Letters with ${other.name || other.email.split("@")[0]}`;
      createMutation.mutate({ type: "one_to_one", name: autoName, members: validMembers });
    } else {
      if (!name) setName("Our Updates");
      setStep(3);
    }
  }

  function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Give it a name."); return; }
    const validMembers = members.filter((m) => m.email.trim() && m.email.includes("@"));
    createMutation.mutate({ type: type!, name: name.trim(), members: validMembers });
  }

  function updateMember(i: number, field: "email" | "name", value: string) {
    setMembers((ms) => ms.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  function removeMember(i: number) {
    setMembers((ms) => ms.filter((_, idx) => idx !== i));
  }

  if (user && !user.correspondenceImprintCompleted && !imprintDone) {
    return (
      <ImprintSlideshow
        slides={correspondenceSlides}
        ctaLabel="Start writing →"
        imprintType="correspondence"
        onComplete={() => setImprintDone(true)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => step === 1 ? setLocation("/letters") : setStep((s) => (s - 1) as 1 | 2 | 3)}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← {step === 1 ? "Letters" : "Back"}
        </button>
        <div className="flex-1 flex gap-1.5">
          {(type === "one_to_one" ? [1, 2] : [1, 2, 3]).map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ background: s <= step ? "#8FAF96" : "rgba(200,212,192,0.2)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* Step 1 — Type */}
          {step === 1 && (
            <motion.div key="step1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Who are you writing to? 📮
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                Choose how you want to correspond.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleTypeSelect("one_to_one")}
                  className="w-full text-left p-5 rounded-2xl transition-all active:scale-[0.99]"
                  style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                >
                  <p className="text-base font-semibold mb-2" style={{ color: "#F0EDE6" }}>📮 A letter</p>
                  <p className="text-sm font-medium mb-1" style={{ color: "#C8D4C0" }}>Start a dialogue. Stay in touch.</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                    Once a week, one letter, one person. A zoom out from the daily noise — not a text, not ambient. A real correspondence, with history. Monks have written this way for centuries. Sacred because it's the only one you send.
                  </p>
                </button>

                <button
                  onClick={() => handleTypeSelect("group")}
                  className="w-full text-left p-5 rounded-2xl transition-all active:scale-[0.99]"
                  style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                >
                  <p className="text-base font-semibold mb-2" style={{ color: "#F0EDE6" }}>📮 Group updates</p>
                  <p className="text-sm font-medium mb-1" style={{ color: "#C8D4C0" }}>Keep a circle close.</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                    3 to 15 people. Everyone shares once a week — 50 words or more. A thread that keeps a community rooted in each other's lives.
                  </p>
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2 — Who */}
          {step === 2 && (
            <motion.div key="step2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {type === "one_to_one" ? "Who do you want to write to?" : "Who's in this group?"}
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                {type === "one_to_one"
                  ? "They'll get an email invitation."
                  : "Add 2–14 people. Everyone gets an invitation."}
              </p>

              <div className="space-y-5">
                {members.map((m, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Name (optional)"
                        value={m.name}
                        onChange={(e) => updateMember(i, "name", e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                        style={{ background: "#091A10", border: "1px solid rgba(200,212,192,0.2)", color: "#F0EDE6" }}
                      />
                      {type === "group" && i >= 2 && (
                        <button onClick={() => removeMember(i)} className="text-lg px-1" style={{ color: "#8FAF96" }}>×</button>
                      )}
                    </div>
                    <input
                      type="email"
                      placeholder="Email address"
                      value={m.email}
                      onChange={(e) => updateMember(i, "email", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                      style={{ background: "#091A10", border: "1px solid rgba(200,212,192,0.2)", color: "#F0EDE6" }}
                    />
                  </div>
                ))}

                {type === "group" && members.length < 14 && (
                  <button
                    onClick={() => setMembers((ms) => [...ms, { email: "", name: "" }])}
                    className="text-sm font-medium"
                    style={{ color: "#C8D4C0" }}
                  >
                    + Add another person
                  </button>
                )}
              </div>

              {error && <p className="text-sm mt-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleWhoNext}
                disabled={createMutation.isPending}
                className="w-full mt-8 py-4 rounded-2xl text-base font-semibold disabled:opacity-50 transition-opacity"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {createMutation.isPending ? "Starting…" : type === "one_to_one" ? "Start writing" : "Continue →"}
              </button>
            </motion.div>
          )}

          {/* Step 3 — Name */}
          {step === 3 && (
            <motion.div key="step3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Name it
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                This is how it'll appear in your letters.
              </p>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "one_to_one" ? "Letters with..." : "Our Updates"}
                maxLength={60}
                autoFocus
                className="w-full px-4 py-4 rounded-xl text-lg font-medium focus:outline-none"
                style={{ background: "#091A10", border: "1px solid rgba(200,212,192,0.2)", color: "#F0EDE6" }}
              />

              {error && <p className="text-sm mt-3" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !name.trim()}
                className="w-full mt-8 py-4 rounded-2xl text-base font-semibold disabled:opacity-50 transition-opacity"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {createMutation.isPending ? "Starting..." : "Start writing 📮"}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
