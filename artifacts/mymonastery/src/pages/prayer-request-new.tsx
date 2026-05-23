import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";

type LastMineRow = {
  id: number;
  body: string;
  createdAt: string;
  expiresAt: string | null;
  closedAt: string | null;
  isAnswered: boolean;
  kind: string | null;
  isActive: boolean;
  isExpired: boolean;
};

// Kind comes from a `?kind=` query param set by the FAB on the home
// dashboard. Drives form copy AND is persisted to prayer_requests.kind
// so cards / slideshow can render the matching pill ("Life event" /
// "For justice"). Default "request" renders no pill. Community
// intercessions are not personal prayer requests — they go through
// /moment/new?template=intercession and live in shared_moments, so
// they never reach this form.
export type RequestKind = "request" | "life-event" | "justice";
const KIND_COPY: Record<RequestKind, {
  emoji: string;
  title: string;
  subtitle: string;
  placeholder: string;
}> = {
  "request": {
    emoji: "🙏🏽",
    title: "What are you carrying?",
    subtitle: "Share what you'd like your community to pray about. It can be big or small.",
    placeholder: "A big decision at work… a family member who's been on my heart…",
  },
  "life-event": {
    emoji: "🌱",
    title: "What's happening in your life?",
    subtitle: "A milestone, a change, a hard week — share what your community can hold with you.",
    placeholder: "Starting a new job next Monday… my dad just went into hospice…",
  },
  "justice": {
    emoji: "⚖️",
    title: "What injustice are you holding?",
    subtitle: "Name the ache. Your community will pray with you for what's broken.",
    placeholder: "A neighbor without housing… a hard ruling today…",
  },
};

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
  const search = useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();

  const kind: RequestKind = useMemo(() => {
    const raw = new URLSearchParams(search).get("kind") ?? "";
    if (raw === "life-event" || raw === "justice") return raw;
    return "request";
  }, [search]);
  const copy = KIND_COPY[kind];

  const [step, setStep] = useState<Step>(0);
  const [body, setBody] = useState("");
  const [days, setDays] = useState<3 | 7>(7);
  const [error, setError] = useState("");
  // Tag picker — userIds of people the requester has named in this
  // prayer. Sent in the POST body; server fans out a push to each
  // and grants them request-scoped visibility regardless of garden
  // membership. Reset on success when the form unmounts.
  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (step === 0) bodyRef.current?.focus(); }, [step]);

  // Pull the user's most-recent prayer request to offer a "renew this
  // instead?" card under the textarea on step 0. Only renders for an
  // expired/closed request — an active one already lives on /prayer-list,
  // so showing it here would just duplicate the surface.
  const { data: lastMineData } = useQuery<{ request: LastMineRow | null }>({
    queryKey: ["/api/prayer-requests/last-mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/last-mine"),
    enabled: !!user,
  });
  const lastMine = lastMineData?.request ?? null;
  const showRenewCard = lastMine && (lastMine.isExpired || !!lastMine.closedAt) && !lastMine.isActive;

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prayer-requests", {
        body: body.trim(),
        isAnonymous: false,
        durationDays: days,
        kind,
        // Server accepts an empty / missing array — it's only meaningful
        // when the user picked tags via the TagPicker below.
        taggedUserIds,
      }),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
      setLocation("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || "Couldn't share this request. Please try again.");
    },
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
      setLocation("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || "Couldn't renew. Please try again.");
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
                {copy.title} {copy.emoji}
              </h1>
              <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                {copy.subtitle}
              </p>

              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setError(""); }}
                rows={4}
                placeholder={copy.placeholder}
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

              {/* Tag people — the "praying for my friend Matthew"
                  signal. Selected users get visibility on this
                  request (regardless of garden / community), a push
                  on creation, and pushes on the first amen + every
                  word of comfort. Optional; an empty selection is
                  the default. */}
              <TagPicker
                ownerId={user?.id}
                selectedIds={taggedUserIds}
                onChange={setTaggedUserIds}
              />

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleBodyNext}
                disabled={body.trim().length === 0}
                className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-all"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Continue →
              </button>

              {/* Renew-instead card — only when the user has a previous
                  prayer request that's expired or released. Tapping the
                  green pill renews it for another 7 days and routes to
                  /prayer-list, skipping the new-request submission
                  entirely. The textarea above stays focused so the
                  user can still write something fresh if they prefer. */}
              {showRenewCard && lastMine && (
                <div
                  className="mt-6 rounded-xl p-4"
                  style={{
                    background: "#0F2818",
                    border: "1px solid rgba(46,107,64,0.35)",
                  }}
                >
                  <p
                    className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2"
                    style={{ color: "rgba(143,175,150,0.6)" }}
                  >
                    Or renew your last one
                  </p>
                  <p
                    className="text-[14px] italic leading-snug mb-3"
                    style={{
                      color: "rgba(232,217,176,0.85)",
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {lastMine.body}
                  </p>
                  <button
                    onClick={() => renewMutation.mutate(lastMine.id)}
                    disabled={renewMutation.isPending}
                    className="text-xs font-semibold rounded-full px-4 py-2 disabled:opacity-50"
                    style={{ background: "rgba(46,107,64,0.45)", color: "#F0EDE6" }}
                  >
                    {renewMutation.isPending ? "Renewing…" : "Renew for 7 days"}
                  </button>
                </div>
              )}
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

// ── Tag picker ─────────────────────────────────────────────────────
//
// Inline picker beneath the prayer-request textarea. Renders:
//   • "Tag someone" pill — opens / closes the suggestion list.
//   • Selected chips — each removable via the small "×".
//   • Search-as-you-type from the viewer's garden (the same set
//     /people surfaces, scoped to people they already know).
//
// Designed to add zero friction when not used — collapsed by
// default, an empty selection is the no-op default state.
function TagPicker({
  ownerId,
  selectedIds,
  onChange,
}: {
  ownerId: number | undefined;
  selectedIds: number[];
  onChange: (next: number[]) => void;
}) {
  const { data: people = [] } = usePeople(ownerId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Only people with a real user account can be tagged (server
  // enforces this too — we just hide the rest to avoid a confusing
  // "Tagged ✓ — except no, it didn't take" interaction).
  const eligible = useMemo(
    () => people.filter((p): p is PersonSummary & { userId: number } => typeof p.userId === "number"),
    [people],
  );

  const selected = useMemo(
    () => eligible.filter(p => selectedIds.includes(p.userId)),
    [eligible, selectedIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(p =>
      (p.name ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q),
    );
  }, [eligible, query]);

  const toggle = (uid: number) => {
    if (selectedIds.includes(uid)) {
      onChange(selectedIds.filter(x => x !== uid));
    } else {
      onChange([...selectedIds, uid]);
    }
  };

  return (
    <div className="mb-6">
      {/* Trigger + selected chips on the same row. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-90"
          style={{
            background: "rgba(46,107,64,0.18)",
            border: "1px solid rgba(46,107,64,0.4)",
            color: "#C8D4C0",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          🏷️  {selected.length > 0 ? `Tagged · ${selected.length}` : "Tag someone"}
        </button>
        {selected.map(p => (
          <span
            key={p.userId}
            className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(46,107,64,0.28)",
              border: "1px solid rgba(46,107,64,0.5)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {p.name}
            <button
              type="button"
              onClick={() => toggle(p.userId)}
              aria-label={`Untag ${p.name}`}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(143,175,150,0.85)",
                cursor: "pointer",
                padding: 0,
                marginLeft: 2,
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {open && (
        <div
          className="mt-3 rounded-xl"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(46,107,64,0.35)",
            padding: 8,
          }}
        >
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg mb-2 outline-none"
            style={{
              background: "rgba(15,40,24,0.7)",
              border: "1px solid rgba(46,107,64,0.3)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <p className="text-xs italic text-center py-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                {eligible.length === 0
                  ? "No one in your community yet."
                  : "No one matches that name."}
              </p>
            )}
            {filtered.map(p => {
              const isSelected = selectedIds.includes(p.userId);
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => toggle(p.userId)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors"
                  style={{
                    background: isSelected ? "rgba(46,107,64,0.25)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,212,192,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                    >
                      {(p.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-sm flex-1 truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {p.name}
                  </span>
                  {isSelected && <span className="text-sm" style={{ color: "#A8C5A0" }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
