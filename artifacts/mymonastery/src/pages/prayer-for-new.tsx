import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, usePersonProfile } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";

// Full-screen, step-by-step authoring flow for starting a private prayer for
// another user. Mirrors the "gathering" (tradition-new) + "prayer-request-new"
// templates: dark #091A10 canvas, a back button + progress pills in the
// header, and one question per step in Space Grotesk.
//
// Two entry points:
//   • /pray-for/new/:email  — person is already picked (launched from a
//                              person profile or prayer list). Starts at
//                              step 1.
//   • /pray-for/new         — no person picked yet. Step 0 shows a search
//                              + suggestions list built from usePeople().
//
// Steps:
//   0 — Choose a person  (only shown when no email was pre-selected)
//   1 — Write the prayer
//   2 — Choose how many days to hold it (3 or 7)
//
// On success we return to /people/:email (the profile we started from) or
// /prayer-list (the picker entry point), depending on how the flow began.

const DURATION_OPTIONS = [
  { value: 3, label: "3 days", tagline: "A short, steady watch" },
  { value: 7, label: "7 days", tagline: "A full week of prayer" },
] as const;

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -20 },
};

type Step = 0 | 1 | 2;

export default function PrayerForNew() {
  // Match both route shapes — wouter returns the params for whichever fires.
  const [, paramsWithEmail] = useRoute<{ email: string }>("/pray-for/new/:email");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const emailParam = paramsWithEmail?.email ? decodeURIComponent(paramsWithEmail.email) : "";

  // `selectedEmail` is the person we're praying for. When the route pre-fills
  // the email we skip the picker entirely; otherwise it's chosen on step 0.
  const [selectedEmail, setSelectedEmail] = useState<string>(emailParam);

  // Total flow length depends on whether we needed the picker. If the user
  // arrived with an email, we only show 2 pills (write + duration).
  const needsPicker = !emailParam;
  const totalSteps = needsPicker ? 3 : 2;
  const initialStep: Step = needsPicker ? 0 : 1;

  const [step, setStep] = useState<Step>(initialStep);
  const [text, setText] = useState("");
  const [days, setDays] = useState<3 | 7>(7);
  const [error, setError] = useState("");

  // Profile query fires as soon as an email is selected (either from the URL
  // or from tapping a row on step 0). We need the recipientUserId to POST.
  const { data: person, isLoading: personLoading, error: personError } =
    usePersonProfile(selectedEmail || undefined, user?.id);

  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (step === 1) textRef.current?.focus(); }, [step]);

  // Where do we go on success / "Back" from the first step? If we came in
  // with an email we return to that person's profile; otherwise back to the
  // prayer list.
  const returnHref = emailParam
    ? `/people/${encodeURIComponent(emailParam)}`
    : "/prayer-list";

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
    setStep(2);
  }

  function handleBack() {
    if (step === initialStep) { setLocation(returnHref); return; }
    setStep((s) => (s - 1) as Step);
  }

  function handlePickPerson(email: string) {
    setSelectedEmail(email);
    setError("");
    setStep(1);
  }

  // ── Loading / error shells (keep the template chrome) ──────────────────────
  if (!user) {
    setLocation("/");
    return null;
  }

  const firstName = person?.name?.split(" ")[0] ?? "them";

  // Progress pills: count depends on whether we included the picker.
  const pillIndexes = Array.from({ length: totalSteps }, (_, i) =>
    needsPicker ? i : i + 1,
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      {/* Header — back + progress pills, matching tradition-new */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
        <div className="flex-1 flex gap-1.5">
          {pillIndexes.map((s) => (
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

          {/* Step 0 — Choose a person (picker only) */}
          {step === 0 && (
            <motion.div
              key="s0"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <PersonPicker
                ownerId={user.id}
                onPick={handlePickPerson}
              />
            </motion.div>
          )}

          {/* Step 1 — Write the prayer. Needs `person` loaded before the
              user can proceed; show skeleton or error shell if profile
              didn't resolve. */}
          {step === 1 && (
            <motion.div
              key="s1"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
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
                    onClick={() => {
                      if (needsPicker) { setSelectedEmail(""); setStep(0); }
                      else setLocation("/people");
                    }}
                    className="w-full py-4 rounded-2xl text-base font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    {needsPicker ? "Pick someone else" : "Back to people"}
                  </button>
                </div>
              )}

              {person && !personLoading && (
                <>
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
                </>
              )}
            </motion.div>
          )}

          {/* Step 2 — Duration */}
          {step === 2 && (
            <motion.div
              key="s2"
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
      </div>
    </div>
  );
}

// ─── Person picker (Step 0) ────────────────────────────────────────────────
// Lightweight inline component so the main page stays readable. Loads the
// user's fellow-travelers from /api/people, ranks by the server's existing
// `score` (already sorted in the response), and filters locally on typing.

function PersonPicker({
  ownerId,
  onPick,
}: {
  ownerId: number;
  onPick: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const { data: people = [], isLoading } = usePeople(ownerId);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) =>
      p.name.toLowerCase().includes(needle)
      || p.email.toLowerCase().includes(needle),
    );
  }, [people, q]);

  const title = q.trim() ? "Results" : "Suggested";

  return (
    <>
      <h1
        className="text-2xl font-bold mb-2"
        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Who are you praying for? 🌿
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
        Search anyone in your fellowship, or pick a friend from the list below.
      </p>

      {/* Search input */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4"
        style={{
          background: "#0F2818",
          border: "1.5px solid rgba(46,107,64,0.35)",
        }}
      >
        <SearchIcon size={16} style={{ color: "#8FAF96" }} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 bg-transparent text-base outline-none"
          style={{ color: "#F0EDE6" }}
          autoFocus
        />
      </div>

      {/* Suggestion list */}
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2"
        style={{ color: "rgba(143,175,150,0.6)" }}
      >
        {title}
      </p>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm italic mt-6 text-center" style={{ color: "rgba(143,175,150,0.6)" }}>
          {q.trim()
            ? "No one in your fellowship matches that yet."
            : "Your fellowship is quiet — add friends to start praying for them."}
        </p>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((p) => (
            <button
              key={p.email}
              type="button"
              onClick={() => onPick(p.email)}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
              style={{
                background: "#0F2818",
                border: "1px solid rgba(46,107,64,0.28)",
              }}
            >
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt={p.name}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                  style={{ border: "1px solid rgba(46,107,64,0.3)" }}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                >
                  {p.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? "")
                    .join("")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                  {p.name}
                </p>
                <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
                  {p.email}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
