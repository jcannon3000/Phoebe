import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import ImprintSlideshow, { gatheringSlides } from "@/components/ImprintSlideshow";

const TEMPLATE_OPTIONS = [
  { value: "coffee", emoji: "☕", label: "Coffee", tagline: "Share your first cup, again and again" },
  { value: "meal", emoji: "🍽️", label: "A Meal", tagline: "The table is the oldest gathering place" },
  { value: "walk", emoji: "🚶🏽", label: "A Walk", tagline: "Move together on a regular day" },
  { value: "book_club", emoji: "📚", label: "Book Club", tagline: "Read together, think together" },
  { value: "custom", emoji: "🌿", label: "Something else", tagline: "Name your own gathering" },
];

const RHYTHM_OPTIONS = [
  { value: "weekly", emoji: "📅", label: "Every week", tagline: "A weekly commitment" },
  { value: "biweekly", emoji: "📅", label: "Every two weeks", tagline: "A fortnightly rhythm" },
  { value: "monthly", emoji: "📅", label: "Once a month", tagline: "A monthly anchor" },
];

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

type Step = 1 | 2 | 3 | 4;

export default function TraditionNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [imprintDone, setImprintDone] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [template, setTemplate] = useState("");
  const [name, setName] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<{ name: string; email: string }[]>([]);
  const [newPeople, setNewPeople] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [rhythm, setRhythm] = useState("");
  const [firstPick, setFirstPick] = useState("");
  const [altTime1, setAltTime1] = useState("");
  const [altTime2, setAltTime2] = useState("");
  const [firstLocation, setFirstLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === 2) nameRef.current?.focus(); }, [step]);

  const { data: connectionsData } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: () => apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections"),
    enabled: step === 2,
  });
  const connections = connectionsData?.connections ?? [];

  function togglePerson(person: { name: string; email: string }) {
    setSelectedPeople((prev) =>
      prev.some((p) => p.email === person.email)
        ? prev.filter((p) => p.email !== person.email)
        : [...prev, person],
    );
  }

  const allPeople = (() => {
    const merged = [...selectedPeople];
    for (const np of newPeople) {
      if (np.email.trim() && !merged.some((p) => p.email === np.email)) {
        merged.push(np);
      }
    }
    return merged;
  })();

  const hasAtLeastOnePerson = allPeople.length > 0;

  function handleTypeSelect(t: string) {
    setTemplate(t);
    setName("");
    setStep(2);
  }

  function handleWhoNext() {
    const templateOption = TEMPLATE_OPTIONS.find((o) => o.value === template);
    const effectiveName = name.trim() || (templateOption && template !== "custom" ? `${templateOption.emoji} ${templateOption.label}` : "");
    if (!effectiveName) { setError("Give your gathering a name."); return; }
    if (!name.trim()) setName(effectiveName);
    if (!hasAtLeastOnePerson) { setError("Add at least one person."); return; }
    setError("");
    setStep(3);
  }

  function handleRhythmNext() {
    if (!rhythm) { setError("Choose a rhythm."); return; }
    setError("");
    if (!firstPick) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setFirstPick(`${yyyy}-${mm}-${dd}T12:00`);
    }
    setStep(4);
  }

  async function handleCreate() {
    if (!user) return;
    if (!firstPick) { setError("Pick a time for your first gathering."); return; }
    if (!firstLocation.trim()) { setError("Where will this gathering happen?"); return; }
    setSubmitting(true);
    setError("");
    try {
      const participants = allPeople.filter((p) => p.email.trim());
      const proposedTimes = [firstPick, altTime1, altTime2]
        .filter(Boolean)
        .map((t) => new Date(t).toISOString());

      const templateOption = TEMPLATE_OPTIONS.find((o) => o.value === template);
      const finalName = name.trim() || (templateOption && template !== "custom" ? `${templateOption.emoji} ${templateOption.label}` : name.trim());

      const result = await apiRequest<{ id: number }>("POST", "/api/rituals", {
        name: finalName,
        frequency: rhythm,
        participants,
        intention: TEMPLATE_OPTIONS.find((o) => o.value === template)?.tagline || `A ${finalName} gathering.`,
        ownerId: user.id,
        dayPreference: firstPick,
        rhythm,
        hasIntercession: false,
        hasFasting: false,
        intercessionIntention: null,
        fastingDescription: null,
        template: template || null,
      });

      // Save proposed times + location → creates meetup + Google Calendar invite with alternates.
      // Location is per-meetup going forward, so it's sent here (not on the ritual create).
      await apiRequest("PATCH", `/api/rituals/${result.id}/proposed-times`, {
        proposedTimes,
        location: firstLocation.trim(),
      });

      qc.invalidateQueries({ queryKey: ["/api/rituals"] });
      setLocation(`/ritual/${result.id}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Server error responses may include JSON error messages; fall back gracefully
      let friendly = "Something went wrong — please try again.";
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error && typeof parsed.error === "string") friendly = parsed.error;
      } catch { /* not JSON */ }
      setError(friendly);
      setSubmitting(false);
    }
  }

  if (user && !user.gatheringImprintCompleted && !imprintDone) {
    return (
      <ImprintSlideshow
        slides={gatheringSlides}
        ctaLabel="Start a tradition →"
        imprintType="gathering"
        onComplete={() => setImprintDone(true)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => step === 1 ? setLocation("/dashboard") : setStep((s) => (s - 1) as Step)}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← {step === 1 ? "Dashboard" : "Back"}
        </button>
        <div className="flex-1 flex gap-1.5">
          {[1, 2, 3, 4].map((s) => (
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

          {/* Step 1 — What */}
          {step === 1 && (
            <motion.div key="s1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                What will you gather for? 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>Recurring gatherings are where belonging forms.</p>

              <div className="space-y-3">
                {TEMPLATE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleTypeSelect(o.value)}
                    className="w-full text-left p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                    style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{o.emoji}</span>
                      <div>
                        <p className="font-semibold text-base" style={{ color: "#F0EDE6" }}>{o.label}</p>
                        <p className="text-sm" style={{ color: "#8FAF96" }}>{o.tagline}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2 — Name + Who */}
          {step === 2 && (
            <motion.div key="s2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-6" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Who are you gathering with? 🌿
              </h1>

              {/* Name */}
              <div className="mb-6">
                <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "#8FAF96" }}>
                  Name this gathering
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={(() => {
                    const opt = TEMPLATE_OPTIONS.find((o) => o.value === template);
                    return opt && template !== "custom" ? `${opt.emoji} ${opt.label}` : "e.g. Morning Coffee, Sunday Dinner";
                  })()}
                  className="w-full px-4 py-3.5 rounded-xl text-base focus:outline-none"
                  style={{ background: "#091A10", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                />
              </div>

              {/* Existing connections */}
              {connections.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#C8D4C0" }}>People you know</p>
                  <div className="relative">
                    <div
                      className="space-y-2 overflow-y-auto"
                      style={{
                        maxHeight: "238px",
                        scrollbarWidth: "none",
                        maskImage: connections.length > 3 ? "linear-gradient(to bottom, black 70%, transparent)" : undefined,
                        WebkitMaskImage: connections.length > 3 ? "linear-gradient(to bottom, black 70%, transparent)" : undefined,
                      }}
                    >
                      {connections.map((person) => {
                        const sel = selectedPeople.some((p) => p.email === person.email);
                        return (
                          <button
                            key={person.email}
                            onClick={() => togglePerson(person)}
                            className="w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all"
                            style={{
                              background: sel ? "#2D5E3F" : "#0F2818",
                              border: `1.5px solid ${sel ? "rgba(46,107,64,0.65)" : "rgba(46,107,64,0.3)"}`,
                            }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                              style={{ background: sel ? "rgba(200,212,192,0.2)" : "rgba(200,212,192,0.1)", color: sel ? "#F0EDE6" : "#8FAF96" }}
                            >
                              {(person.name || person.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{person.name || person.email}</p>
                              {person.name && <p className="text-xs truncate" style={{ color: "#8FAF96" }}>{person.email}</p>}
                            </div>
                            {sel && <span style={{ color: "#C8D4C0" }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* New people */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#8FAF96" }}>
                  {connections.length > 0 ? "Or invite someone new" : "Who's coming?"}
                </p>
                <div className="space-y-4">
                  {newPeople.map((entry, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={entry.name}
                          onChange={(e) => setNewPeople((p) => { const c = [...p]; c[i] = { ...c[i], name: e.target.value }; return c; })}
                          placeholder="Name (optional)"
                          className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                          style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                        />
                        {newPeople.length > 1 && (
                          <button onClick={() => setNewPeople((p) => p.filter((_, j) => j !== i))} className="text-lg px-1" style={{ color: "#8FAF96" }}>×</button>
                        )}
                      </div>
                      <input
                        type="email"
                        value={entry.email}
                        onChange={(e) => setNewPeople((p) => { const c = [...p]; c[i] = { ...c[i], email: e.target.value }; return c; })}
                        placeholder="Email address"
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setNewPeople((p) => [...p, { name: "", email: "" }])}
                    className="text-sm font-medium"
                    style={{ color: "#C8D4C0" }}
                  >
                    + Add another person
                  </button>
                </div>
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleWhoNext}
                className="w-full py-4 rounded-2xl text-base font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Continue →
              </button>
            </motion.div>
          )}

          {/* Step 3 — Rhythm */}
          {step === 3 && (
            <motion.div key="s3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                How often will you gather? 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>The rhythm is the commitment.</p>

              <div className="space-y-3 mb-8">
                {RHYTHM_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setRhythm(o.value)}
                    className="w-full text-left p-4 rounded-2xl transition-all"
                    style={{
                      background: rhythm === o.value ? "#2D5E3F" : "#0F2818",
                      border: `2px solid ${rhythm === o.value ? "rgba(46,107,64,0.65)" : "rgba(46,107,64,0.3)"}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{o.emoji}</span>
                      <div>
                        <p className="font-semibold" style={{ color: "#F0EDE6" }}>{o.label}</p>
                        <p className="text-sm" style={{ color: "#8FAF96" }}>{o.tagline}</p>
                      </div>
                      {rhythm === o.value && (
                        <span className="ml-auto text-base font-bold" style={{ color: "#C8D4C0" }}>✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleRhythmNext}
                disabled={!rhythm}
                className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Continue →
              </button>
            </motion.div>
          )}

          {/* Step 4 — When */}
          {step === 4 && (
            <motion.div key="s4" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                When will you first gather? 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                Pick a time to meet. Alternates are optional — your group can weigh in.
              </p>

              {/* First Pick */}
              <div className="mb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#C8D4C0" }}>
                  First Pick
                </p>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={firstPick ? firstPick.split("T")[0] : ""}
                    onChange={(e) => {
                      const time = firstPick ? firstPick.split("T")[1] || "12:00" : "12:00";
                      setFirstPick(e.target.value ? `${e.target.value}T${time}` : "");
                    }}
                    className="flex-1 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                  <input
                    type="time"
                    value={firstPick ? firstPick.split("T")[1] || "" : ""}
                    onChange={(e) => {
                      const date = firstPick ? firstPick.split("T")[0] : "";
                      if (date) setFirstPick(`${date}T${e.target.value}`);
                    }}
                    className="w-28 px-3 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                </div>
              </div>

              {/* Location (required, tied to this first gathering) */}
              <div className="mb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#C8D4C0" }}>
                  Where · Required
                </p>
                <input
                  type="text"
                  value={firstLocation}
                  onChange={(e) => setFirstLocation(e.target.value)}
                  placeholder="e.g. The coffee shop on Main, my kitchen, Zoom…"
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                />
                <p className="text-xs mt-2" style={{ color: "#8FAF96" }}>
                  Location is per event — set it fresh each time you gather.
                </p>
              </div>

              {/* Alternatives */}
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3 mt-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                Alternative time suggestions (optional)
              </p>
              <div className="mb-5">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={altTime1 ? altTime1.split("T")[0] : ""}
                    onChange={(e) => {
                      const time = altTime1 ? altTime1.split("T")[1] || "12:00" : "12:00";
                      setAltTime1(e.target.value ? `${e.target.value}T${time}` : "");
                    }}
                    placeholder="Optional"
                    className="flex-1 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.25)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                  <input
                    type="time"
                    value={altTime1 ? altTime1.split("T")[1] || "" : ""}
                    onChange={(e) => {
                      const date = altTime1 ? altTime1.split("T")[0] : "";
                      if (date) setAltTime1(`${date}T${e.target.value}`);
                    }}
                    className="w-28 px-3 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.25)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                </div>
              </div>

              <div className="mb-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={altTime2 ? altTime2.split("T")[0] : ""}
                    onChange={(e) => {
                      const time = altTime2 ? altTime2.split("T")[1] || "12:00" : "12:00";
                      setAltTime2(e.target.value ? `${e.target.value}T${time}` : "");
                    }}
                    placeholder="Optional"
                    className="flex-1 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.25)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                  <input
                    type="time"
                    value={altTime2 ? altTime2.split("T")[1] || "" : ""}
                    onChange={(e) => {
                      const date = altTime2 ? altTime2.split("T")[0] : "";
                      if (date) setAltTime2(`${date}T${e.target.value}`);
                    }}
                    className="w-28 px-3 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.25)", color: "#F0EDE6", colorScheme: "dark" }}
                  />
                </div>
              </div>

              {error && <p className="text-sm mt-4 mb-2" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleCreate}
                disabled={!firstPick || !firstLocation.trim() || submitting}
                className="w-full mt-8 py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {submitting ? "Starting..." : "Continue →"}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
