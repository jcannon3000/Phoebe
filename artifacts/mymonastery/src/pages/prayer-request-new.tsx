import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";

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

  const [body, setBody] = useState("");
  // Default to a single day — most requests are for "today"; the dropdown lets
  // them dial it up (1–7 days).
  const [days, setDays] = useState<number>(1);
  const [error, setError] = useState("");
  // This flow is community-only now (the "ask one person" path lives on the home
  // — tap a face). So no tagged users / directOnly here.
  const taggedUserIds: number[] = [];

  // Life-event extras — a short title + the date it happens. Drives the
  // "how did it go?" follow-up. The body still holds the prayer focus.
  const isLifeEvent = kind === "life-event";
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(""); // YYYY-MM-DD from <input type=date>
  const todayStr = new Date().toLocaleDateString("en-CA");

  const bodyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { bodyRef.current?.focus(); }, []);

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
      setLocation("/prayer-list");
    },
    onError: (err: any) => {
      setError(err?.message || t("prayer_request.couldnt_share"));
    },
  });

  // One slide now: validate, then submit. (Life events also carry a title + date.)
  function handleSubmit() {
    if (body.trim().length === 0) { setError(t("prayer_request.write_request_first")); return; }
    if (isLifeEvent) {
      if (eventTitle.trim().length === 0) { setError(t("prayer_request.life_event_need_title", { defaultValue: "Give it a short title." })); return; }
      if (!eventDate) { setError(t("prayer_request.life_event_need_date", { defaultValue: "Pick the date it happens." })); return; }
    }
    setError("");
    createMutation.mutate();
  }

  function handleBack() {
    setLocation("/prayer-list");
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
        {/* One slide — write the request, choose how long, share. */}
        <div>
          {/* Designed header — emoji badge, eyebrow, title, subtitle (the per-kind
              copy defined all four; the page used to render only the title, which
              left it floating in empty space). */}
          <div style={{ marginBottom: 24 }}>
            <div
              aria-hidden
              style={{ width: 52, height: 52, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.35)", marginBottom: 14 }}
            >
              {copy.emoji}
            </div>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: SAGE, fontFamily: SPACE, fontWeight: 600, margin: 0, marginBottom: 8 }}>
              {copy.eyebrow}
            </p>
            <h1 style={{ fontSize: 24, lineHeight: 1.18, fontWeight: 700, color: CREAM, fontFamily: SPACE, letterSpacing: "-0.02em", margin: 0, marginBottom: 9 }}>
              {copy.title}
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: SAGE, fontFamily: SERIF, fontStyle: "italic", margin: 0 }}>
              {copy.subtitle}
            </p>
          </div>

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

          <input
            ref={bodyRef}
            type="text"
            value={body}
            onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setError(""); }}
            placeholder={copy.placeholder}
            className="w-full px-5 py-3.5 text-base mb-6"
            style={{ ...glassField, fontFamily: SPACE, fontSize: 16 }}
          />

          {/* How long to carry it — a simple dropdown (1–7 days), in the spot the
              audience picker used to sit. Life events derive their own lifetime
              from the event date, so the dropdown is hidden for them. */}
          {!isLifeEvent && (
            <div className="mb-6">
              <p className="text-[12px] font-semibold mb-2" style={{ color: SAGE, fontFamily: SPACE }}>
                {t("prayer_request.duration_question", { defaultValue: "How long should we carry it?" })}
              </p>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{
                  display: "inline-block",
                  width: "auto",
                  background: "rgba(46,107,64,0.22)",
                  color: CREAM,
                  border: "1px solid rgba(46,107,64,0.50)",
                  borderRadius: 999,
                  padding: "12px 26px",
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: SPACE,
                  textAlignLast: "center",
                  colorScheme: "dark",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm mb-4" style={{ color: "#C47A65" }}>{error}</p>}

          {/* Flat CTA — solid green, no gradient/shadow. */}
          <button
            onClick={handleSubmit}
            disabled={body.trim().length === 0 || createMutation.isPending}
            className="w-full py-4 text-base font-semibold disabled:opacity-40 active:scale-[0.99] transition-all"
            style={{ background: "#2D5E3F", color: CREAM, fontFamily: SPACE, borderRadius: 16, border: "none" }}
          >
            {createMutation.isPending ? t("prayer_request.sharing") : t("prayer_request.share_with_community")}
          </button>

        </div>
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
