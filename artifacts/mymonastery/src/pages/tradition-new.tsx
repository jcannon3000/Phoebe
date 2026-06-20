import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import ImprintSlideshow, { useGatheringSlides } from "@/components/ImprintSlideshow";
import { useTranslation } from "react-i18next";
import { useCommunityAdminToggle } from "@/hooks/useDemo";

const TEMPLATE_OPTIONS = [
  { value: "coffee", emoji: "☕", label: "Coffee", tagline: "Share your first cup, again and again" },
  { value: "meal", emoji: "🍽️", label: "A Meal", tagline: "The table is the oldest gathering place" },
  { value: "walk", emoji: "🚶🏽", label: "A Walk", tagline: "Move together on a regular day" },
  { value: "book_club", emoji: "📚", label: "Book Club", tagline: "Read together, think together" },
  { value: "custom", emoji: "🌿", label: "Something else", tagline: "Name your own gathering" },
];

const RHYTHM_OPTIONS = [
  { value: "once", emoji: "📅", label: "Just once", tagline: "A single gathering" },
  { value: "weekly", emoji: "📅", label: "Every week", tagline: "A weekly commitment" },
  { value: "biweekly", emoji: "📅", label: "Every two weeks", tagline: "A fortnightly rhythm" },
  { value: "monthly", emoji: "📅", label: "Once a month", tagline: "A monthly anchor" },
];

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

type Step = 0 | 1 | 2 | 3 | 4 | 5;

export default function TraditionNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const gatheringSlides = useGatheringSlides();

  const [imprintDone, setImprintDone] = useState(false);
  const bgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const [step, setStep] = useState<Step>(0);
  // Every gathering is "name your own" now — the template picker (step 1) is gone,
  // so the type is always custom and the flow skips straight from community → name.
  const [template, setTemplate] = useState("custom");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  // Additional invited communities (multi-community gatherings). The
  // primary host is selectedGroupId; these are extras that should see
  // the gathering on their dashboards and be invited as calendar
  // attendees (for video calls). Restricted to communities the user
  // also admins — the server re-checks ownership.
  const [additionalGroupIds, setAdditionalGroupIds] = useState<number[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<{ name: string; email: string }[]>([]);
  const [newPeople, setNewPeople] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [rhythm, setRhythm] = useState("once");
  const [firstPick, setFirstPick] = useState("");
  const [altTime1, setAltTime1] = useState("");
  const [altTime2, setAltTime2] = useState("");
  // Fixed-time gatherings (e.g. a parish's Wednesday dinner) skip the
  // alt-time coordination and just lock in the first pick. Flexible
  // keeps the existing flow of First Pick + two optional alternates
  // that members can weigh in on.
  const [timeMode, setTimeMode] = useState<"fixed" | "flexible">("fixed");
  const [firstLocation, setFirstLocation] = useState("");
  // In-person gatherings collect a location; video-call gatherings
  // collect a meeting link (Zoom / Meet / Teams). One or the other —
  // the format toggle on the "When" step picks which field shows.
  const [gatheringFormat, setGatheringFormat] = useState<"in_person" | "video">("in_person");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === 2) nameRef.current?.focus(); }, [step]);

  const { data: connectionsData } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: () => apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections"),
    enabled: step === 3,
  });
  const connections = connectionsData?.connections ?? [];

  // Only group admins can invite brand-new emails into a gathering. Regular
  // members are limited to picking from their existing fellowship — they can't
  // rope in outsiders without an admin's sign-off.
  const { data: groupsData } = useQuery<{
    groups: Array<{ id: number; name: string; slug: string; emoji: string | null; myRole: string }>;
  }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  const [communityAdminView] = useCommunityAdminToggle();
  const adminGroups = communityAdminView ? (groupsData?.groups ?? []).filter(g => g.myRole === "admin" || g.myRole === "hidden_admin") : [];
  const canInviteNewPeople = adminGroups.length > 0;

  // Resolved community slug — used to fetch that community's full member
  // roster so we can auto-populate participants and skip the "Who" step.
  // A gathering created inside a community should go out to EVERYONE in
  // the community; no invite step needed.
  const selectedGroup = adminGroups.find(g => g.id === selectedGroupId);
  const selectedSlug = selectedGroup?.slug ?? null;
  const { data: communityMembersData } = useQuery<{ members: Array<{ name: string | null; email: string; joinedAt: string | null; role: string }> }>({
    queryKey: ["/api/groups", selectedSlug, "members-for-gathering"],
    queryFn: () => apiRequest("GET", `/api/groups/${selectedSlug}`),
    enabled: !!selectedSlug,
  });
  const communityMembers = (communityMembersData?.members ?? [])
    .filter(m => m.joinedAt !== null && m.role !== "hidden_admin")
    .map(m => ({ name: m.name ?? m.email.split("@")[0], email: m.email }));

  // Auto-select and skip community step:
  //   1. If the URL carries ?community=<slug> (e.g. the "Create a
  //      gathering" button inside a community page), pre-select that
  //      community and skip step 0 — the user already chose.
  //   2. Otherwise, if the user is an admin of exactly one community,
  //      auto-select that one (preserves the original behavior).
  useEffect(() => {
    if (selectedGroupId !== null) return;
    const qs = new URLSearchParams(window.location.search);
    const slug = qs.get("community");
    if (slug) {
      const match = adminGroups.find(g => g.slug === slug);
      if (match) {
        setSelectedGroupId(match.id);
        if (step === 0) setStep(2);
        return;
      }
    }
    if (adminGroups.length === 1) {
      setSelectedGroupId(adminGroups[0].id);
      if (step === 0) setStep(2);
    }
  }, [adminGroups, selectedGroupId, step]);

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
    setDescription("");
    setStep(2);
  }

  function handleNameNext() {
    const opt = TEMPLATE_OPTIONS.find((o) => o.value === template);
    const hasTemplateFallback = !!opt && template !== "custom";
    if (!name.trim() && !hasTemplateFallback) {
      setError("Give your gathering a name.");
      return;
    }
    setError("");
    // Community gathering: skip the "Who's coming?" step. Participants
    // are the whole community, auto-populated at create time.
    setStep(selectedGroupId !== null ? 4 : 3);
  }

  function handleWhoNext() {
    if (!hasAtLeastOnePerson) { setError("Add at least one person."); return; }
    setError("");
    setStep(4);
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
    setStep(5);
  }

  async function handleCreate() {
    if (!user) return;
    if (!firstPick) { setError("Pick a time for your first gathering."); return; }
    if (gatheringFormat === "in_person" && !firstLocation.trim()) {
      setError("Where will this gathering happen?");
      return;
    }
    if (gatheringFormat === "video") {
      const url = meetingUrl.trim();
      if (!url) { setError("Paste the video call link."); return; }
      if (!/^https?:\/\/\S+$/i.test(url)) {
        setError("That doesn't look like a link — it should start with https://");
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      // Community gathering → participants = full community roster
      // (joined, non-hidden members). Anything added to selectedPeople
      // was a user-typed override; merge both with dedupe by email.
      let participants = allPeople.filter((p) => p.email.trim());
      if (selectedGroupId !== null) {
        const byEmail = new Map<string, { name: string; email: string }>();
        for (const p of participants) byEmail.set(p.email.toLowerCase(), p);
        for (const m of communityMembers) {
          const key = m.email.toLowerCase();
          if (!byEmail.has(key)) byEmail.set(key, m);
        }
        participants = Array.from(byEmail.values());
      }
      // Fixed-time gatherings don't offer alternates — the user already
      // committed to a single time. Flexible mode keeps the coordination
      // flow (first pick + up to two alternates).
      const proposedTimes = (timeMode === "fixed"
        ? [firstPick]
        : [firstPick, altTime1, altTime2]
      )
        .filter(Boolean)
        .map((t) => new Date(t).toISOString());

      const templateOption = TEMPLATE_OPTIONS.find((o) => o.value === template);
      const finalName = name.trim() || (templateOption && template !== "custom" ? `${templateOption.emoji} ${templateOption.label}` : name.trim());

      const result = await apiRequest<{ id: number }>("POST", "/api/rituals", {
        name: finalName,
        frequency: rhythm,
        participants,
        intention: description.trim() || TEMPLATE_OPTIONS.find((o) => o.value === template)?.tagline || `A ${finalName} gathering.`,
        ownerId: user.id,
        dayPreference: firstPick,
        rhythm,
        hasIntercession: false,
        hasFasting: false,
        intercessionIntention: null,
        fastingDescription: null,
        template: template || null,
        // Scope the gathering to the chosen community so it shows up
        // on /groups/:slug/gatherings for every member.
        groupId: selectedGroupId ?? undefined,
        // Video-call gatherings carry a meetingUrl; in-person ones
        // leave it undefined and use the per-meetup location instead.
        meetingUrl: gatheringFormat === "video" ? meetingUrl.trim() : undefined,
        // Additional communities (multi-community gatherings). Server
        // re-validates that the creator admins each one.
        additionalGroupIds: additionalGroupIds.length > 0 ? additionalGroupIds : undefined,
      });

      // Save proposed times + location → creates meetup + Google Calendar invite with alternates.
      // Location is per-meetup going forward, so it's sent here (not on the ritual create).
      // For a video-call gathering we send the meeting link as the
      // meetup location so the Google Calendar invite has a clickable
      // join link; in-app surfaces read the ritual-level meetingUrl.
      await apiRequest("PATCH", `/api/rituals/${result.id}/proposed-times`, {
        proposedTimes,
        location: gatheringFormat === "video" ? meetingUrl.trim() : firstLocation.trim(),
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
        ctaLabel={t("imprint_gathering.cta_start")}
        imprintType="gathering"
        onComplete={() => setImprintDone(true)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10", position: "relative" }}>
      {/* A still leaves photo behind the creator, under a dark wash. */}
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: 0 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
        </>
      )}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: "100%" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => {
            if (step === 0) { setLocation("/dashboard"); return; }
            // The template picker (step 1) was removed, so step 2 goes back to 0.
            if (step === 2) { setStep(0); return; }
            // Community flow skips the "Who" step (step 3) on the way
            // forward, so skip it on the way back too.
            if (step === 4 && selectedGroupId !== null) { setStep(2); return; }
            setStep((s) => (s - 1) as Step);
          }}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← {step === 0 ? "Dashboard" : "Back"}
        </button>
        <div className="flex-1 flex gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((s) => (
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

          {/* Step 0 — Choose community */}
          {step === 0 && (
            <motion.div key="s0" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Choose a community 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>Which community is this gathering for?</p>
              <div className="flex flex-col gap-3">
                {adminGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGroupId(g.id); setStep(2); }}
                    className={`px-5 py-4 rounded-xl text-left transition-all ${selectedGroupId === g.id ? "animate-turn-pulse" : ""}`}
                    style={selectedGroupId === g.id
                      ? { background: "#1A4A2E", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)" }
                      : { background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                      {g.emoji ? `${g.emoji} ` : ""}{g.name}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 1 (template picker) removed — every gathering is "name your
              own" now, so the flow goes straight from community → name. */}

          {/* Step 2 — Name + Description */}
          {step === 2 && (
            <motion.div key="s2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Name your gathering 🌿
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>A title and a few words to set the tone.</p>

              <div className="mb-6">
                <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "#8FAF96" }}>
                  Title
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

              <div className="mb-8">
                <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "#8FAF96" }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={(() => {
                    const opt = TEMPLATE_OPTIONS.find((o) => o.value === template);
                    return opt && template !== "custom" ? opt.tagline : "What is this gathering about?";
                  })()}
                  rows={4}
                  className="w-full px-4 py-3.5 rounded-xl text-base focus:outline-none resize-none"
                  style={{ background: "#091A10", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                />
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleNameNext}
                className="w-full py-4 rounded-2xl text-base font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Continue →
              </button>
            </motion.div>
          )}

          {/* Step 3 — Who */}
          {step === 3 && (
            <motion.div key="s3_who" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-6" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Who are you gathering with? 🌿
              </h1>

              {/* Non-admin with no fellows yet — nothing to invite, no new
                  emails allowed. Explain rather than showing a blank step. */}
              {!canInviteNewPeople && connections.length === 0 && (
                <div
                  className="mb-5 rounded-xl px-4 py-5 text-sm"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#8FAF96" }}
                >
                  You don't have anyone in your fellowship yet. Connect with
                  people through a group or a shared practice first, then come
                  back to invite them.
                </div>
              )}

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

              {/* New people — admins only. Regular members pick from
                  their fellowship above; inviting outsiders requires an
                  admin role in at least one group. */}
              {canInviteNewPeople && (
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
              )}

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

          {/* Step 4 — Rhythm */}
          {step === 4 && (
            <motion.div key="s4" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
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

          {/* Step 5 — When */}
          {step === 5 && (
            <motion.div key="s5" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {rhythm === "once" ? "When will you gather? 🌿" : "When will you first gather? 🌿"}
              </h1>
              <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>
                {rhythm === "once"
                  ? "Pick a date, time, and place."
                  : timeMode === "fixed"
                  ? "This gathering meets at a set time. Just pick when."
                  : "Pick a time to meet. Alternates are optional — your group can weigh in."}
              </p>

              {/* Fixed vs flexible toggle — "fixed" is for recurring
                  community events like a parish's Wednesday dinner,
                  where the time never moves. "Flexible" keeps the
                  alt-time coordination flow. */}
              <div
                className="grid grid-cols-2 gap-2 mb-6 p-1 rounded-2xl"
                style={{ background: "rgba(15,40,24,0.6)", border: "1px solid rgba(46,107,64,0.25)" }}
              >
                {(["fixed", "flexible"] as const).map((mode) => {
                  const active = timeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTimeMode(mode)}
                      className="rounded-xl py-2.5 text-sm font-semibold transition-colors"
                      style={{
                        background: active ? "#2D5E3F" : "transparent",
                        color: active ? "#F0EDE6" : "#8FAF96",
                      }}
                    >
                      <span className="block text-sm">{mode === "fixed" ? "Fixed time" : "Flexible time"}</span>
                      <span
                        className="block text-[10px] font-normal mt-0.5"
                        style={{
                          color: active ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.6)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {mode === "fixed" ? "Always the same time" : "Let group suggest times"}
                      </span>
                    </button>
                  );
                })}
              </div>

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

              {/* Format toggle — in-person vs video call. Picks which
                  field shows below: a free-text place, or a meeting
                  link. Same visual vocabulary as the fixed/flexible
                  toggle above it. */}
              <div
                className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-2xl"
                style={{ background: "rgba(15,40,24,0.6)", border: "1px solid rgba(46,107,64,0.25)" }}
              >
                {(["in_person", "video"] as const).map((fmt) => {
                  const active = gatheringFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => { setGatheringFormat(fmt); setError(""); }}
                      className="rounded-xl py-2.5 text-sm font-semibold transition-colors"
                      style={{
                        background: active ? "#2D5E3F" : "transparent",
                        color: active ? "#F0EDE6" : "#8FAF96",
                      }}
                    >
                      <span className="block text-sm">{fmt === "in_person" ? "In person" : "Video call"}</span>
                      <span
                        className="block text-[10px] font-normal mt-0.5"
                        style={{
                          color: active ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.6)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {fmt === "in_person" ? "Meet at a place" : "Zoom, Meet, Teams…"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {gatheringFormat === "in_person" ? (
                /* Location (required, tied to this first gathering) */
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#C8D4C0" }}>
                    Where · Required
                  </p>
                  <input
                    type="text"
                    value={firstLocation}
                    onChange={(e) => setFirstLocation(e.target.value)}
                    placeholder="e.g. The coffee shop on Main, my kitchen…"
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                  />
                  <p className="text-xs mt-2" style={{ color: "#8FAF96" }}>
                    Location is per event — set it fresh each time you gather.
                  </p>
                </div>
              ) : (
                /* Video call link (required) — one stable link reused
                   for every occurrence. */
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#C8D4C0" }}>
                    Video call link · Required
                  </p>
                  <input
                    type="url"
                    inputMode="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                  />
                  <p className="text-xs mt-2" style={{ color: "#8FAF96" }}>
                    Paste your Zoom, Google Meet, or Teams link — everyone uses the same link each time.
                  </p>
                </div>
              )}

              {/* Alternatives — flexible mode only. Hidden entirely for
                  fixed-time gatherings (parish dinners, scheduled
                  services) where there's nothing to negotiate. */}
              {timeMode === "flexible" && (
                <>
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
                </>
              )}

              {/* Also invite — multi-community gatherings. Only shown
                  when the admin has more than one community of their
                  own (excluding the primary host they already picked).
                  Members of every selected community will see the
                  gathering on their dashboard, can RSVP, and (for
                  video calls) receive the calendar invite. */}
              {adminGroups.filter((g) => g.id !== selectedGroupId).length > 0 && (
                <div className="mt-7">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3"
                    style={{ color: "rgba(143,175,150,0.5)" }}
                  >
                    Also invite (optional)
                  </p>
                  <div className="flex flex-col gap-2">
                    {adminGroups
                      .filter((g) => g.id !== selectedGroupId)
                      .map((g) => {
                        const checked = additionalGroupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              setAdditionalGroupIds((ids) =>
                                ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id],
                              );
                            }}
                            className="w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between"
                            style={{
                              background: checked ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.07)",
                              border: `1px solid ${checked ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.15)"}`,
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-5 h-5 rounded-md flex items-center justify-center text-xs shrink-0"
                                style={{
                                  background: checked ? "#2D6B40" : "transparent",
                                  border: `1px solid ${checked ? "#2D6B40" : "rgba(143,175,150,0.4)"}`,
                                  color: "#F0EDE6",
                                }}
                              >
                                {checked ? "✓" : ""}
                              </div>
                              <span className="text-sm" style={{ color: "#C8D4C0" }}>
                                {g.emoji ? `${g.emoji} ` : ""}{g.name}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    Each selected community will see this gathering and can RSVP.
                  </p>
                </div>
              )}

              {error && <p className="text-sm mt-4 mb-2" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleCreate}
                disabled={
                  !firstPick
                  || submitting
                  || (gatheringFormat === "in_person" && !firstLocation.trim())
                  || (gatheringFormat === "video" && !meetingUrl.trim())
                }
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
    </div>
  );
}
