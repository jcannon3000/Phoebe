import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";
import { DrumPicker } from "@/components/DrumPicker";

// ── Visual language ─────────────────────────────────────────────────
// A calm DARK-BLUE surface (the app's reflection blue, #6FAF85, family) —
// solid, no drifting gradient — behind frosted-glass cards, Space Grotesk
// headings, Georgia-italic body, a blue-grey + warm-cream palette.
const BG = "#102816";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const SERIF = "Georgia, 'Times New Roman', serif";
const SPACE = "'Space Grotesk', sans-serif";
const GLASS = "rgba(8,22,15,0.6)";
const GLASS_BORDER = "rgba(255,255,255,0.08)";
// Shared glass field styling (textarea + inputs). No box-shadow inline so
// the global input :focus glow (index.css) still rings the field.
const glassField = {
  background: GLASS,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 18,
  color: CREAM,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  outline: "none",
} as const;

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

// Per-kind copy is built from i18n via useKindCopy() — was a frozen
// module-level const before, which locked the labels to English at
// load time even when the user flipped to Spanish.
function useKindCopy(): Record<RequestKind, { emoji: string; eyebrow: string; title: string; subtitle: string; placeholder: string }> {
  const { t } = useTranslation();
  return {
    "request": {
      emoji: "🙏🏽",
      eyebrow: t("prayer_request.eyebrow_default", { defaultValue: "Prayer request" }),
      title: t("prayer_request.title_default"),
      subtitle: t("prayer_request.subtitle_default"),
      placeholder: t("prayer_request.placeholder_default"),
    },
    "life-event": {
      emoji: "🌱",
      eyebrow: t("prayer_request.eyebrow_life_event", { defaultValue: "Life event" }),
      title: t("prayer_request.title_life_event"),
      subtitle: t("prayer_request.subtitle_life_event"),
      placeholder: t("prayer_request.placeholder_life_event"),
    },
    "justice": {
      emoji: "⚖️",
      eyebrow: t("prayer_request.eyebrow_justice", { defaultValue: "For justice" }),
      title: t("prayer_request.title_justice"),
      subtitle: t("prayer_request.subtitle_justice"),
      placeholder: t("prayer_request.placeholder_justice"),
    },
  };
}

// Full-screen, step-by-step authoring flow for sharing your own prayer
// request with the community. Mirrors the "gathering" and "pray-for-new"
// templates so the creation affordances all feel like siblings:
//   • dark #081912 canvas
//   • header = back button + progress pills
//   • one question per step, Space Grotesk titles, Playfair Display body
//
// Two steps:
//   0 — What are you asking prayer for?
//   1 — How long should we carry it? (3 or 7 days)
//
// On success we return to /prayer-list, where the new card will show up
// under "Prayer Requests".

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -20 },
};

type Step = 0 | 1;

export default function PrayerRequestNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const KIND_COPY = useKindCopy();

  const kind: RequestKind = useMemo(() => {
    const raw = new URLSearchParams(search).get("kind") ?? "";
    if (raw === "life-event" || raw === "justice") return raw;
    return "request";
  }, [search]);
  const copy = KIND_COPY[kind];

  const [step, setStep] = useState<Step>(0);
  const [body, setBody] = useState("");
  // Default to a single day — most requests are for "today"; the roller lets
  // them dial it up. (1–14 days via the DrumPicker below.)
  const [days, setDays] = useState<number>(1);
  const [error, setError] = useState("");
  // Tag picker — userIds of people the requester has named in this
  // prayer. Sent in the POST body; server fans out a push to each
  // and grants them request-scoped visibility regardless of garden
  // membership. Reset on success when the form unmounts.
  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);

  // Life-event extras — a short title + the date it happens. Drives the
  // "how did it go?" follow-up. The body still holds the prayer focus.
  const isLifeEvent = kind === "life-event";
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(""); // YYYY-MM-DD from <input type=date>
  const todayStr = new Date().toLocaleDateString("en-CA");

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
        // Life-event only: a title + the date (sent as LOCAL noon so the
        // owner-tz calendar date is unambiguous). Ignored for other kinds.
        ...(isLifeEvent ? {
          eventTitle: eventTitle.trim(),
          eventDate: eventDate ? new Date(`${eventDate}T12:00:00`).toISOString() : undefined,
        } : {}),
        // Server accepts an empty / missing array. A non-empty selection means
        // "to a fellow" — directOnly makes the request private to them + you.
        taggedUserIds,
        directOnly: taggedUserIds.length > 0,
      }),
    onSuccess: () => {
      triggerSubmitFeedback();
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
      setLocation("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || t("prayer_request.couldnt_share"));
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
      setError(err?.message || t("prayer_request.couldnt_renew"));
    },
  });

  function handleBodyNext() {
    if (body.trim().length === 0) { setError(t("prayer_request.write_request_first")); return; }
    // Life events carry a title + date and derive their own lifetime, so they
    // skip the 3/7-day step and submit straight from here.
    if (isLifeEvent) {
      if (eventTitle.trim().length === 0) { setError(t("prayer_request.life_event_need_title", { defaultValue: "Give it a short title." })); return; }
      if (!eventDate) { setError(t("prayer_request.life_event_need_date", { defaultValue: "Pick the date it happens." })); return; }
      setError("");
      createMutation.mutate();
      return;
    }
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
    <motion.div
      // Smooth fade + gentle rise as the screen pulls up into view (it's a
      // full-screen route, so this is its entrance — no hard cut).
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "relative", isolation: "isolate", minHeight: "100dvh", background: BG, overflowX: "hidden" }}
    >

      {/* Header — just a quiet Back. No progress bar (the flow is two short steps). */}
      <div style={{ paddingTop: "max(1rem, var(--safe-top))", paddingLeft: 20, paddingRight: 20, paddingBottom: 2 }}>
        <button
          onClick={handleBack}
          style={{ color: SAGE, fontSize: 14, fontFamily: SPACE, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          {t("prayer_request.back")}
        </button>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", width: "100%", padding: "22px 24px calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px) + 24px)" }}>
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
              {/* Title only — the "PRAYER REQUEST" eyebrow + serif subtitle were
                  removed per request (redundant with the title + the placeholder
                  prompt below). */}
              <h1 style={{ fontSize: 23, lineHeight: 1.2, fontWeight: 700, color: CREAM, fontFamily: SPACE, letterSpacing: "-0.02em", margin: 0, marginBottom: 22 }}>
                {copy.title}
              </h1>

              {/* Life-event: a short title + the date it happens. */}
              {isLifeEvent && (
                <div className="space-y-3 mb-5">
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => { setEventTitle(e.target.value.slice(0, 80)); setError(""); }}
                    placeholder={t("prayer_request.life_event_title_placeholder", { defaultValue: "What is it? e.g. Knee surgery" })}
                    className="w-full px-4 py-3.5 text-base"
                    style={{ ...glassField, fontFamily: SPACE }}
                  />
                  <div>
                    <label className="text-[12px] block mb-1.5" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("prayer_request.life_event_date_label", { defaultValue: "When does it happen?" })}
                    </label>
                    <input
                      type="date"
                      value={eventDate}
                      min={todayStr}
                      onChange={(e) => { setEventDate(e.target.value); setError(""); }}
                      className="w-full px-4 py-3.5 text-base"
                      style={{ ...glassField, fontFamily: SPACE, colorScheme: "dark" }}
                    />
                  </div>
                </div>
              )}

              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setError(""); }}
                rows={4}
                placeholder={copy.placeholder}
                className="w-full px-5 py-4 text-base resize-none"
                style={{
                  ...glassField,
                  minHeight: 140,
                  fontFamily: SPACE,
                  fontSize: 16,
                  lineHeight: 1.6,
                }}
              />
              <p className="text-[11px] mb-3 text-right" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE, marginTop: 6 }}>
                {t("prayer_request.char_count", { count: body.length })}
              </p>

              {/* Audience — to a fellow (private, just between you two) or to
                  everyone you're connected with (the default garden feed).
                  Picking a fellow tags them + makes the request directOnly. */}
              <AudiencePicker
                selectedIds={taggedUserIds}
                onChange={setTaggedUserIds}
              />

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={handleBodyNext}
                disabled={body.trim().length === 0 || (isLifeEvent && createMutation.isPending)}
                className="w-full py-4 text-base font-semibold disabled:opacity-40 active:scale-[0.99] transition-all"
                style={{
                  background: "linear-gradient(180deg, #2D5E3F 0%, #1F4E33 100%)",
                  color: CREAM,
                  fontFamily: SPACE,
                  borderRadius: 20,
                  border: "1px solid rgba(143,175,150,0.4)",
                  boxShadow: "0 10px 30px rgba(20,46,30,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
                }}
              >
                {isLifeEvent
                  ? (createMutation.isPending ? t("prayer_request.sharing") : t("prayer_request.share_with_community"))
                  : t("prayer_request.continue_button")}
              </button>

              {/* Renew-instead card — only when the user has a previous
                  prayer request that's expired or released. Tapping the
                  green pill renews it for another 7 days and routes to
                  /prayer-list, skipping the new-request submission
                  entirely. The textarea above stays focused so the
                  user can still write something fresh if they prefer. */}
              {showRenewCard && lastMine && (
                <div
                  className="mt-7 p-4"
                  style={{
                    background: GLASS,
                    border: `1px solid ${GLASS_BORDER}`,
                    borderRadius: 18,
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <p
                    className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2"
                    style={{ color: "rgba(143,175,150,0.6)" }}
                  >
                    {t("prayer_request.or_renew")}
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
                    {renewMutation.isPending ? t("prayer_request.renewing") : t("prayer_request.renew_for_7_days")}
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
              <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, color: SAGE_DIM, fontFamily: SPACE, margin: 0, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ fontSize: 15 }}>🕊️</span>
                {t("prayer_request.eyebrow_duration", { defaultValue: "How long" })}
              </p>
              <h1 style={{ fontSize: "clamp(22px, 6.2vw, 29px)", lineHeight: 1.18, fontWeight: 700, color: CREAM, fontFamily: SPACE, letterSpacing: "-0.02em", margin: 0, marginBottom: 12 }}>
                {t("prayer_request.duration_question")}
              </h1>
              <p style={{ fontSize: 16, lineHeight: 1.5, fontStyle: "italic", color: SAGE, fontFamily: SERIF, margin: 0, marginBottom: 26 }}>
                {t("prayer_request.duration_subtitle")}
              </p>

              {/* Duration roller — dial how many days to carry it (default 1). */}
              <div className="mb-8">
                <DrumPicker
                  value={days}
                  onChange={setDays}
                  options={Array.from({ length: 14 }, (_, i) => i + 1).map((d) => ({
                    value: d,
                    label: t("prayer_request.n_days", { count: d, defaultValue: d === 1 ? "1 day" : `${d} days` }),
                  }))}
                />
              </div>

              {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full py-4 text-base font-semibold disabled:opacity-40 active:scale-[0.99] transition-all"
                style={{
                  background: "linear-gradient(180deg, #2D5E3F 0%, #1F4E33 100%)",
                  color: CREAM,
                  fontFamily: SPACE,
                  borderRadius: 20,
                  border: "1px solid rgba(143,175,150,0.4)",
                  boxShadow: "0 10px 30px rgba(20,46,30,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
                }}
              >
                {createMutation.isPending ? t("prayer_request.sharing") : t("prayer_request.share_with_community")}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Audience picker ────────────────────────────────────────────────
//
// "Who is this for?" — the request goes to everyone you're connected with
// (the default garden feed) OR privately to a fellow (wide pills with their
// photo + name; multi-select allowed). Picking a fellow makes the request
// directOnly server-side, so only they + you can ever see it.
type FellowLite = { userId: number; name: string | null; avatarUrl: string | null };
function AudiencePicker({
  selectedIds,
  onChange,
}: {
  selectedIds: number[];
  onChange: (next: number[]) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Search your whole GARDEN (everyone you're connected with), not just fellows.
  const { data: garden } = usePeople(user?.id);
  const people = (garden ?? []).filter((p) => p.userId != null && p.userId !== user?.id);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? people.filter((p) => (p.name ?? "").toLowerCase().includes(q)) : people;
  // "individual" mode the moment someone's picked; otherwise the everyone default.
  const [mode, setMode] = useState<"everyone" | "individual">(selectedIds.length > 0 ? "individual" : "everyone");

  const toggle = (uid: number) => {
    onChange(selectedIds.includes(uid) ? selectedIds.filter(x => x !== uid) : [...selectedIds, uid]);
  };

  const Option = ({ active, emoji, title, sub, onClick }: { active: boolean; emoji: string; title: string; sub: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors"
      style={{ background: active ? "rgba(46,107,64,0.28)" : GLASS, border: `1px solid ${active ? "rgba(143,175,150,0.55)" : GLASS_BORDER}` }}
    >
      <span style={{ fontSize: 20 }} aria-hidden>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: CREAM, fontFamily: SPACE }}>{title}</span>
        <span className="block text-[12px]" style={{ color: SAGE, fontFamily: SPACE }}>{sub}</span>
      </span>
      {active && <span style={{ color: "#C8D4C0" }} aria-hidden>✓</span>}
    </button>
  );

  return (
    <div className="mb-6">
      <p className="text-[12px] font-semibold mb-2" style={{ color: SAGE, fontFamily: SPACE }}>
        {t("prayer_request.audience_q", { defaultValue: "Who is this for?" })}
      </p>
      <div className="flex flex-col gap-2">
        <Option
          active={mode === "everyone"}
          emoji="🌿"
          title={t("prayer_request.audience_everyone", { defaultValue: "Everyone you're connected with" })}
          sub={t("prayer_request.audience_everyone_sub", { defaultValue: "Shared with your circle's prayer feed" })}
          onClick={() => { setMode("everyone"); onChange([]); }}
        />
        <Option
          active={mode === "individual"}
          emoji="👤"
          title={t("prayer_request.audience_individual", { defaultValue: "An individual" })}
          sub={t("prayer_request.audience_individual_sub", { defaultValue: "Private — just between you and them" })}
          onClick={() => setMode("individual")}
        />
      </div>

      {mode === "individual" && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("prayer_request.audience_search", { defaultValue: "Search your garden…" })}
            className="w-full rounded-2xl px-4 py-2.5 text-[14px]"
            style={{ background: GLASS, border: `1px solid ${GLASS_BORDER}`, color: CREAM, fontFamily: SPACE, outline: "none" }}
          />
          {matches.length === 0 ? (
            <p className="text-[12px] italic px-1 py-2" style={{ color: SAGE_DIM, fontFamily: SPACE }}>
              {q
                ? t("prayer_request.audience_no_match", { defaultValue: "No one by that name." })
                : t("prayer_request.audience_empty_garden", { defaultValue: "No one in your garden yet." })}
            </p>
          ) : matches.slice(0, 40).map((f) => {
            const isSel = selectedIds.includes(f.userId!);
            return (
              <button
                key={f.userId}
                type="button"
                onClick={() => toggle(f.userId!)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors"
                style={{ background: isSel ? "rgba(46,107,64,0.28)" : GLASS, border: `1px solid ${isSel ? "rgba(143,175,150,0.55)" : GLASS_BORDER}` }}
              >
                {f.avatarUrl ? (
                  <img src={f.avatarUrl} alt={f.name ?? ""} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold" style={{ background: "#1A4A2E", color: "#C8D4C0" }}>
                    {(f.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <span className="text-[14px] flex-1 truncate" style={{ color: CREAM, fontFamily: SPACE }}>{f.name ?? "Someone"}</span>
                {isSel && <span style={{ color: "#C8D4C0" }} aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
