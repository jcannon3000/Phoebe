import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import ImprintSlideshow, { gatheringSlides } from "@/components/ImprintSlideshow";

const TEMPLATE_OPTIONS = [
  { value: "coffee", emoji: "☕", label: "Coffee", tagline: "Share your first cup, again and again" },
  { value: "meal", emoji: "🍽️", label: "A Meal", tagline: "The table is the oldest tradition" },
  { value: "walk", emoji: "🚶", label: "A Walk", tagline: "Move together on a regular day" },
  { value: "book_club", emoji: "📚", label: "Book Club", tagline: "Read together, think together" },
  { value: "custom", emoji: "🌿", label: "Something else", tagline: "Name your own tradition" },
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

type Step = 1 | 2 | 3;

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
  const [selectedSlot, setSelectedSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  interface Slot { day: string; date: string; time: string; value: string }

  function generateSlots(freq: string): Slot[] {
    const today = new Date();
    const fmtDay  = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" });
    const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const slot = (d: Date, time: string): Slot => ({
      day: fmtDay(d), date: fmtDate(d), time,
      value: `${fmtDate(d)}-${time}`,
    });

    // Next Saturday from today (minimum 2 days away so it feels meaningful)
    const daysUntilSat = ((6 - today.getDay()) + 7) % 7 || 7;
    const sat1 = new Date(today); sat1.setDate(today.getDate() + daysUntilSat);
    const sun1 = new Date(sat1);  sun1.setDate(sat1.getDate() + 1);
    const sat2 = new Date(sat1);  sat2.setDate(sat1.getDate() + 7);
    const sat4 = new Date(sat1);  sat4.setDate(sat1.getDate() + 14);

    if (freq === "weekly") {
      return [
        slot(sat1, "10:00 AM"),
        slot(sat1, "2:00 PM"),
        slot(sun1, "10:00 AM"),
        slot(sat2, "10:00 AM"),
      ];
    }
    if (freq === "biweekly") {
      return [
        slot(sat1, "10:00 AM"),
        slot(sat1, "2:00 PM"),
        slot(sat4, "10:00 AM"),
        slot(sat4, "2:00 PM"),
      ];
    }
    if (freq === "monthly") {
      // First Saturday of each of the next 3 months
      const results: Slot[] = [];
      for (let m = 0; m < 3; m++) {
        const d = new Date(today.getFullYear(), today.getMonth() + m + (today.getDate() > 20 ? 1 : 0), 1);
        while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
        if (d <= today) d.setDate(d.getDate() + 7); // skip if already past
        results.push(slot(d, "10:00 AM"));
        if (m === 0) results.push(slot(d, "2:00 PM"));
      }
      return results;
    }
    return [];
  }

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
    const option = TEMPLATE_OPTIONS.find((o) => o.value === t);
    if (!name && option && t !== "custom") {
      setName(option.label);
    }
    setStep(2);
  }

  function handleWhoNext() {
    if (!name.trim()) { setError("Give your tradition a name."); return; }
    if (!hasAtLeastOnePerson) { setError("Add at least one person."); return; }
    setError("");
    setStep(3);
  }

  async function handleCreate() {
    if (!user) return;
    setSubmitting(true);
    setError("");
    try {
      const participants = allPeople.filter((p) => p.email.trim());
      const result = await apiRequest<{ id: number }>("POST", "/api/rituals", {
        name: name.trim(),
        frequency: rhythm,
        participants,
        intention: TEMPLATE_OPTIONS.find((o) => o.value === template)?.tagline || `A ${name} gathering.`,
        ownerId: user.id,
        dayPreference: selectedSlot,
        rhythm,
        hasIntercession: false,
        hasFasting: false,
        intercessionIntention: null,
        fastingDescription: null,
      });
      qc.invalidateQueries({ queryKey: ["/api/rituals"] });
      setLocation(`/ritual/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
    <div className="min-h-screen flex flex-col" style={{ background: "#F2EFE6" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => step === 1 ? setLocation("/dashboard") : setStep((s) => (s - 1) as Step)}
          className="text-sm"
          style={{ color: "#9a9390" }}
        >
          ← {step === 1 ? "Dashboard" : "Back"}
        </button>
        <div className="flex-1 flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ background: s <= step ? "#C17F24" : "#C8C4B4" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* Step 1 — What */}
          {step === 1 && (
            <motion.div key="s1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                What will you start? 🫱🏻‍🫲🏾
              </h1>
              <p className="text-sm mb-8" style={{ color: "#9a9390" }}>Recurring traditions are where belonging forms.</p>

              <div className="space-y-3">
                {TEMPLATE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleTypeSelect(o.value)}
                    className="w-full text-left p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                    style={{ background: "#fff", border: "1.5px solid rgba(193,127,36,0.25)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{o.emoji}</span>
                      <div>
                        <p className="font-semibold text-base" style={{ color: "#2C1810" }}>{o.label}</p>
                        <p className="text-sm" style={{ color: "#9a9390" }}>{o.tagline}</p>
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
              <h1 className="text-2xl font-bold mb-6" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                Who are you meeting with? 🫱🏻‍🫲🏾
              </h1>

              {/* Name */}
              <div className="mb-6">
                <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "#C17F24" }}>
                  Name this tradition
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Morning Coffee, Sunday Dinner"
                  className="w-full px-4 py-3.5 rounded-xl text-base focus:outline-none"
                  style={{ background: "#fff", border: "1.5px solid #C8C4B4", color: "#2C1810" }}
                />
              </div>

              {/* Existing connections */}
              {connections.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#9a9390" }}>People you know</p>
                  <div className="space-y-2">
                    {connections.map((person) => {
                      const sel = selectedPeople.some((p) => p.email === person.email);
                      return (
                        <button
                          key={person.email}
                          onClick={() => togglePerson(person)}
                          className="w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all"
                          style={{
                            background: sel ? "rgba(193,127,36,0.08)" : "#fff",
                            border: `1.5px solid ${sel ? "#C17F24" : "#C8C4B4"}`,
                          }}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                            style={{ background: sel ? "#C17F24" : "#C8C4B8", color: sel ? "#fff" : "#2C1810" }}
                          >
                            {(person.name || person.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: "#2C1810" }}>{person.name || person.email}</p>
                            {person.name && <p className="text-xs truncate" style={{ color: "#9a9390" }}>{person.email}</p>}
                          </div>
                          {sel && <span style={{ color: "#C17F24" }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New people */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#9a9390" }}>
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
                          style={{ background: "#fff", border: "1px solid #C8C4B4", color: "#2C1810" }}
                        />
                        {newPeople.length > 1 && (
                          <button onClick={() => setNewPeople((p) => p.filter((_, j) => j !== i))} className="text-lg px-1" style={{ color: "#9a9390" }}>×</button>
                        )}
                      </div>
                      <input
                        type="email"
                        value={entry.email}
                        onChange={(e) => setNewPeople((p) => { const c = [...p]; c[i] = { ...c[i], email: e.target.value }; return c; })}
                        placeholder="Email address"
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: "#fff", border: "1px solid #C8C4B4", color: "#2C1810" }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setNewPeople((p) => [...p, { name: "", email: "" }])}
                    className="text-sm font-medium"
                    style={{ color: "#C17F24" }}
                  >
                    + Add another person
                  </button>
                </div>
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C17F24" }}>{error}</p>}

              <button
                onClick={handleWhoNext}
                className="w-full py-4 rounded-2xl text-base font-semibold"
                style={{ background: "#C17F24", color: "#fff" }}
              >
                Continue →
              </button>
            </motion.div>
          )}

          {/* Step 3 — Rhythm */}
          {step === 3 && (
            <motion.div key="s3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                How often will you gather? 🫱🏻‍🫲🏾
              </h1>
              <p className="text-sm mb-8" style={{ color: "#9a9390" }}>The rhythm is the commitment.</p>

              <div className="space-y-3 mb-8">
                {RHYTHM_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setRhythm(o.value); setSelectedSlot(""); }}
                    className="w-full text-left p-4 rounded-2xl transition-all"
                    style={{
                      background: rhythm === o.value ? "rgba(92,122,95,0.08)" : "#fff",
                      border: `2px solid ${rhythm === o.value ? "#5C7A5F" : "rgba(92,122,95,0.2)"}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{o.emoji}</span>
                      <div>
                        <p className="font-semibold" style={{ color: "#2C1810" }}>{o.label}</p>
                        <p className="text-sm" style={{ color: "#9a9390" }}>{o.tagline}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* First gathering time picker */}
              {rhythm && (
                <motion.div
                  key={rhythm}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mb-8"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#C17F24" }}>
                    When's your first gathering?
                  </p>
                  <div className="space-y-2.5">
                    {generateSlots(rhythm).map((slot, i) => {
                      const isSelected = selectedSlot === slot.value;
                      return (
                        <button
                          key={slot.value}
                          onClick={() => setSelectedSlot(slot.value)}
                          className="w-full text-left rounded-2xl transition-all active:scale-[0.99]"
                          style={{
                            background: isSelected ? "rgba(92,122,95,0.07)" : "#fff",
                            border: `2px solid ${isSelected ? "#5C7A5F" : "rgba(44,24,16,0.1)"}`,
                            padding: "14px 16px",
                          }}
                        >
                          {i === 0 && (
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#5C7A5F" }}>
                              ✦ Recommended
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-base font-bold leading-tight" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {slot.day}
                              </p>
                              <p className="text-sm mt-0.5" style={{ color: "#9a9390" }}>
                                {slot.date}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div
                                className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                                style={{
                                  background: isSelected ? "rgba(92,122,95,0.12)" : "rgba(44,24,16,0.05)",
                                  color: isSelected ? "#5C7A5F" : "#2C1810",
                                }}
                              >
                                {slot.time}
                              </div>
                              {isSelected && (
                                <span className="text-base font-bold" style={{ color: "#5C7A5F" }}>✓</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {error && <p className="text-sm mb-4" style={{ color: "#C17F24" }}>{error}</p>}

              <button
                onClick={() => { if (rhythm && selectedSlot) handleCreate(); }}
                disabled={!rhythm || !selectedSlot || submitting}
                className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                {submitting ? "Starting…" : "Start this tradition 🫱🏻‍🫲🏾"}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
