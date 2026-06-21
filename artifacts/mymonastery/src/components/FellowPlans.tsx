/**
 * FellowPlans — the "How About" surface, embedded on the People page beneath
 * Fellows. A person shares something they're going to ("Evensong at the
 * Cathedral, Thursday"), and their active Fellows see it and can say they'll
 * come. Backed by /api/fellow-plans/* (fellow_plans + fellow_plan_rsvps).
 * Personal + 1:1: a plan is visible only to its host and the host's fellows.
 *
 * `canManage` (beta) gates the compose surface; the feed + RSVP stay open so a
 * non-beta fellow can still see and join a beta host's plan.
 */

import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, MapPin, X, Share as ShareIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BG = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.3)";

const EMOJI_CHOICES = ["⛪", "☕", "🍽️", "🚶", "📖", "🎶", "🙏", "🕯️", "✨"];

type Brief = { userId: number; name: string; avatarUrl: string | null };
type PlanTime = {
  id: number;
  startsAt: string;
  comingCount: number;
  maybeCount: number;
  comingPreview: Brief[];
  myStatus: "coming" | "maybe" | null;
};
type Plan = {
  id: number;
  title: string;
  note: string | null;
  location: string | null;
  emoji: string | null;
  startsAt: string | null;
  whenText: string | null;
  createdAt: string;
  isMine: boolean;
  host: Brief;
  comingCount: number;
  maybeCount: number;
  comingPreview: Brief[];
  myRsvp: "coming" | "maybe" | null;
  // Time organizer: when present, the plan is still being scheduled.
  deciding?: boolean;
  times?: PlanTime[];
  leadingTimeId?: number | null;
};

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name, url, size = 34 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: "1px solid rgba(46,107,64,0.3)" }} />;
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.34, fontFamily: FONT }}>{initials(name)}</div>;
}

// "Thu 6:00 PM" for a dated plan; the free-form whenText otherwise.
function whenLabel(p: Plan): string | null {
  if (p.startsAt) {
    const d = new Date(p.startsAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  }
  return p.whenText?.trim() || null;
}

export function FellowPlans({ canManage = false, hideWhenEmpty = false }: { canManage?: boolean; hideWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const plansQ = useQuery<{ plans: Plan[] }>({ queryKey: ["/api/fellow-plans"], queryFn: () => apiRequest("GET", "/api/fellow-plans"), staleTime: 20_000 });
  const plans = plansQ.data?.plans ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/fellow-plans"] });

  // Compose state — shared by "share a plan" (create) and editing an existing
  // plan (editingId set). A host taps their own card to edit it.
  const [composing, setComposing] = useState(false);
  // Opened from the office-close "Add plan" pill (navigates here with ?plan=new).
  const planSearch = useSearch();
  useEffect(() => {
    if (canManage && new URLSearchParams(planSearch).get("plan") === "new") setComposing(true);
  }, [planSearch, canManage]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  // A real date+time pick (datetime-local "YYYY-MM-DDTHH:mm" in the user's tz);
  // converted to an absolute ISO instant for the server's startsAt on submit.
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [location, setLocation] = useState("");
  // Time organizer: extra candidate times beyond the first. When the host
  // offers 2+ total, the plan opens "deciding" and fellows lean toward times.
  const [extraTimes, setExtraTimes] = useState<string[]>([]);

  const resetCompose = () => { setTitle(""); setEmoji(null); setStartsAtLocal(""); setLocation(""); setExtraTimes([]); setComposing(false); setEditingId(null); };

  // datetime-local "YYYY-MM-DDTHH:mm" from an ISO instant, in the viewer's tz.
  const isoToLocalInput = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const startEdit = (p: Plan) => {
    setEditingId(p.id);
    setTitle(p.title);
    setEmoji(p.emoji ?? null);
    setStartsAtLocal(isoToLocalInput(p.startsAt));
    setLocation(p.location ?? "");
    setComposing(true);
  };

  // Create (POST) or edit (PATCH). When editing, send null to CLEAR a field;
  // when creating, omit it.
  const save = useMutation({
    mutationFn: () => {
      // All candidate times (first + extras), in order, as ISO instants.
      const allTimes = [startsAtLocal, ...extraTimes].filter(Boolean).map((v) => new Date(v).toISOString());
      const offeringMany = !editingId && allTimes.length >= 2;
      const body = {
        title: title.trim(),
        emoji: emoji || (editingId ? null : undefined),
        startsAt: offeringMany ? undefined : (startsAtLocal ? new Date(startsAtLocal).toISOString() : (editingId ? null : undefined)),
        times: offeringMany ? allTimes : undefined,
        location: location.trim() || (editingId ? null : undefined),
      };
      return editingId
        ? apiRequest("PATCH", `/api/fellow-plans/${editingId}`, body)
        : apiRequest("POST", "/api/fellow-plans", body);
    },
    onSuccess: () => { resetCompose(); invalidate(); },
  });

  const rsvp = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "coming" | "maybe" | null }) =>
      apiRequest("PUT", `/api/fellow-plans/${id}/rsvp`, { status }),
    onSuccess: invalidate,
  });
  const cancelPlan = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/fellow-plans/${id}`),
    onSuccess: invalidate,
  });
  // Time organizer: lean toward one candidate time, and (host) resolve to a time.
  const timeRsvp = useMutation({
    mutationFn: ({ id, timeId, status }: { id: number; timeId: number; status: "coming" | "maybe" | null }) =>
      apiRequest("PUT", `/api/fellow-plans/${id}/times/${timeId}/rsvp`, { status }),
    onSuccess: invalidate,
  });
  const resolve = useMutation({
    mutationFn: ({ id, timeId, promoteMaybe }: { id: number; timeId: number; promoteMaybe?: boolean }) =>
      apiRequest("POST", `/api/fellow-plans/${id}/resolve`, { timeId, promoteMaybe: promoteMaybe ?? false }),
    onSuccess: invalidate,
  });
  // Host's "bring the maybes too" choice when locking in a time.
  const [promoteMaybe, setPromoteMaybe] = useState(false);

  const toggleRsvp = (p: Plan, status: "coming" | "maybe") =>
    rsvp.mutate({ id: p.id, status: p.myRsvp === status ? null : status });
  const toggleTime = (p: Plan, t: PlanTime, status: "coming" | "maybe") =>
    timeRsvp.mutate({ id: p.id, timeId: t.id, status: t.myStatus === status ? null : status });

  // Share a plan link — mint the public token, then open the best share
  // surface (native sheet, Web Share, or clipboard). Whoever opens it (a
  // fellow) lands on /plans/:token and can RSVP in one tap.
  const [sharedId, setSharedId] = useState<number | null>(null);
  const sharePlan = async (p: Plan) => {
    try {
      const { url } = await apiRequest<{ token: string; url: string }>("POST", `/api/fellow-plans/${p.id}/share-link`);
      const when = whenLabel(p);
      const detail = {
        title: t("plans.share_title", { defaultValue: "A plan on Phoebe" }),
        text: t("plans.share_text", { defaultValue: "How about {{title}}{{when}}? Tap to come along:", title: p.title, when: when ? ` — ${when}` : "" }),
        url,
      };
      if (isNativeShell()) { window.dispatchEvent(new CustomEvent("phoebe:share", { detail })); return; }
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (typeof nav.share === "function") { try { await nav.share(detail); return; } catch { /* cancelled → clipboard */ } }
      try { await navigator.clipboard.writeText(url); setSharedId(p.id); setTimeout(() => setSharedId(null), 2000); }
      catch { window.prompt("Copy this link", url); }
    } catch { /* best-effort */ }
  };

  const inputStyle = { background: "rgba(9,26,16,0.45)", border: `1px solid ${CARD_B}`, color: WARM, fontFamily: FONT } as const;

  // On a surface that shouldn't show an empty shell (the Events page for a
  // non-beta viewer with nothing to compose), render nothing until there's a
  // plan to show. Beta hosts always see it so they can share one. NB: this
  // guard MUST sit below every hook above — an early return between hooks
  // changes the hook count when plans load (empty→non-empty) and crashes
  // (React #310).
  if (hideWhenEmpty && !canManage && plans.length === 0) return null;

  return (
    <div className="mb-2">
      {/* Compose (beta) */}
      {canManage && (
        composing ? (
          <div className="rounded-2xl p-3.5 mb-3" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[13.5px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{editingId ? t("plans.edit_title", { defaultValue: "Edit your plan" }) : t("plans.compose_title", { defaultValue: "What are you going to?" })}</p>
              <button type="button" onClick={resetCompose} aria-label="Close"><X size={17} color={SAGE} /></button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("plans.title_placeholder", { defaultValue: "e.g. Evensong at the Cathedral" })}
              maxLength={140}
              className="w-full rounded-xl px-3.5 py-2.5 text-[15px] outline-none mb-2"
              style={inputStyle}
            />
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(emoji === e ? null : e)}
                  className="rounded-full text-[17px] leading-none transition-transform active:scale-95"
                  style={{
                    width: 34, height: 34,
                    background: emoji === e ? "rgba(46,107,64,0.55)" : "rgba(9,26,16,0.4)",
                    border: `1px solid ${emoji === e ? "rgba(143,175,150,0.6)" : CARD_B}`,
                  }}
                >{e}</button>
              ))}
            </div>
            <label className="block text-[12px] mb-1 px-0.5" style={{ color: SAGE, fontFamily: FONT }}>
              {editingId ? t("plans.when_label", { defaultValue: "When? (optional)" })
                : extraTimes.length > 0 ? t("plans.offer_times_label", { defaultValue: "Offer a few times — your fellows lean toward what works" })
                : t("plans.when_label", { defaultValue: "When? (optional)" })}
            </label>
            <input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none mb-2"
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
            {/* Extra candidate times (only when creating — the time organizer). */}
            {!editingId && extraTimes.map((val, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="datetime-local"
                  value={val}
                  onChange={(e) => setExtraTimes((arr) => arr.map((v, j) => j === i ? e.target.value : v))}
                  className="flex-1 rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                  style={{ ...inputStyle, colorScheme: "dark" }}
                />
                <button type="button" onClick={() => setExtraTimes((arr) => arr.filter((_, j) => j !== i))}
                  aria-label={t("plans.remove_time", { defaultValue: "Remove time" })}
                  className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 30, height: 30, color: "rgba(182,210,188,0.6)", border: `1px solid ${CARD_B}` }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {!editingId && startsAtLocal && extraTimes.length < 3 && (
              <button type="button" onClick={() => setExtraTimes((arr) => [...arr, ""])}
                className="w-full rounded-xl py-2 mb-2 text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5"
                style={{ color: "rgba(182,210,188,0.85)", border: `1px dashed ${CARD_B}`, fontFamily: FONT }}>
                <Plus size={13} /> {t("plans.add_time", { defaultValue: "Offer another time" })}
              </button>
            )}
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("plans.where_placeholder", { defaultValue: "Where? (optional)" })}
              maxLength={140}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none mb-3"
              style={inputStyle}
            />
            <button
              type="button"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate()}
              className="w-full rounded-full py-2.5 text-[14px] font-semibold transition-opacity active:scale-[0.99]"
              style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT, opacity: !title.trim() || save.isPending ? 0.55 : 1 }}
            >
              {save.isPending
                ? (editingId ? t("plans.saving", { defaultValue: "Saving…" }) : t("plans.sharing", { defaultValue: "Sharing…" }))
                : (editingId ? t("plans.save", { defaultValue: "Save changes" }) : t("plans.share", { defaultValue: "Share with my fellows" }))}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 mb-3 text-[14px] font-semibold transition-opacity active:scale-[0.99]"
            style={{ background: CARD_BG, border: `1px dashed ${CARD_B}`, color: "#A8C5A0", fontFamily: FONT }}
          >
            <Plus size={16} /> {t("plans.share_a_plan", { defaultValue: "Share a plan" })}
          </button>
        )
      )}

      {/* Feed */}
      {plans.length === 0 ? (
        plansQ.isLoading ? null : (
          <p className="text-[13px] px-1 py-1" style={{ color: SAGE, fontFamily: FONT }}>
            {canManage
              ? t("plans.empty_beta", { defaultValue: "No plans yet — share something you're going to, and your fellows can come." })
              : t("plans.empty", { defaultValue: "When a fellow shares a plan, it shows up here." })}
          </p>
        )
      ) : (
        plans.map((p) => {
          const when = whenLabel(p);
          return (
            <div key={p.id} className="rounded-2xl px-4 py-3.5 mb-2.5" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
              {/* Host line */}
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={p.host.name} url={p.host.avatarUrl} size={28} />
                <p className="flex-1 min-w-0 truncate text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>
                  {p.isMine
                    ? t("plans.you_going", { defaultValue: "You're going to" })
                    : t("plans.someone_going", { defaultValue: "{{name}} is going to", name: p.host.name })}
                </p>
                {p.isMine && (
                  <button
                    type="button"
                    onClick={() => sharePlan(p)}
                    aria-label={t("plans.share", { defaultValue: "Share" })}
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full"
                    style={{ color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
                  >
                    <ShareIcon size={12} /> {sharedId === p.id ? t("plans.share_copied", { defaultValue: "Copied" }) : t("plans.share", { defaultValue: "Share" })}
                  </button>
                )}
                {p.isMine && (
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="shrink-0 text-[12px] font-medium px-2.5 py-1 rounded-full"
                    style={{ color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
                  >{t("plans.edit", { defaultValue: "Edit" })}</button>
                )}
                {p.isMine && (
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(t("plans.cancel_confirm", { defaultValue: "Cancel this plan?" }))) cancelPlan.mutate(p.id); }}
                    className="shrink-0 text-[12px] font-medium px-2.5 py-1 rounded-full"
                    style={{ color: "rgba(182,210,188,0.6)", border: "1px solid rgba(143,175,150,0.22)", fontFamily: FONT }}
                  >{t("plans.cancel", { defaultValue: "Cancel" })}</button>
                )}
              </div>

              {/* Title (no emoji prefix — the host's avatar leads the card now) */}
              <p className="text-[16px] font-semibold leading-snug" style={{ color: WARM, fontFamily: FONT }}>
                {p.title}
              </p>

              {/* When / where */}
              {(when || p.location) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  {when && <span className="text-[13px]" style={{ color: "#C8D4C0", fontFamily: FONT }}>🗓 {when}</span>}
                  {p.location && (
                    <span className="inline-flex items-center gap-1 text-[13px]" style={{ color: "#C8D4C0", fontFamily: FONT }}>
                      <MapPin size={13} /> {p.location}
                    </span>
                  )}
                </div>
              )}

              {/* Time organizer — candidate times to converge on. The host
                  picks; fellows lean Works/Maybe. The leading time grows greener. */}
              {p.deciding && p.times && p.times.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
                      {p.isMine ? t("plans.finding_time_mine", { defaultValue: "Pick a time once your fellows weigh in." })
                        : t("plans.finding_time", { defaultValue: "Which times work for you?" })}
                    </p>
                    {p.isMine && (
                      <button type="button" onClick={() => setPromoteMaybe((v) => !v)}
                        className="shrink-0 text-[11.5px] font-medium px-2 py-0.5 rounded-full"
                        style={promoteMaybe
                          ? { background: "rgba(143,175,150,0.25)", color: WARM, border: "1px solid rgba(143,175,150,0.5)", fontFamily: FONT }
                          : { background: "transparent", color: "rgba(182,210,188,0.6)", border: `1px solid ${CARD_B}`, fontFamily: FONT }}>
                        {promoteMaybe ? t("plans.maybes_in", { defaultValue: "Maybes ✓" }) : t("plans.bring_maybes", { defaultValue: "Bring maybes" })}
                      </button>
                    )}
                  </div>
                  {p.times.map((tm) => {
                    const leading = p.leadingTimeId === tm.id && tm.comingCount > 0;
                    const fill = Math.min(0.8, 0.10 + tm.comingCount * 0.18);
                    const lbl = new Date(tm.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    return (
                      <div key={tm.id} className="rounded-2xl px-3.5 py-2.5" style={{ background: `rgba(46,107,64,${fill})`, border: `1px solid ${leading ? "rgba(111,175,133,0.55)" : CARD_B}`, transition: "background 0.4s" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-medium" style={{ color: WARM, fontFamily: FONT }}>🗓 {lbl}</span>
                          {tm.comingPreview.length > 0 && (
                            <div className="flex items-center shrink-0">
                              {tm.comingPreview.slice(0, 4).map((c, i) => (
                                <div key={c.userId} style={{ marginLeft: i === 0 ? 0 : -7 }}><Avatar name={c.name} url={c.avatarUrl} size={20} /></div>
                              ))}
                            </div>
                          )}
                        </div>
                        {p.isMine ? (
                          <button type="button" disabled={resolve.isPending}
                            onClick={() => { if (window.confirm(t("plans.resolve_confirm", { defaultValue: "Set the plan to this time?" }))) resolve.mutate({ id: p.id, timeId: tm.id, promoteMaybe }); }}
                            className="mt-2 w-full rounded-full py-1.5 text-[12.5px] font-semibold transition-opacity active:scale-[0.98]"
                            style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}>
                            {t("plans.lets_do_this", { defaultValue: "Let's do this one" })}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 mt-2">
                            <button type="button" disabled={timeRsvp.isPending} onClick={() => toggleTime(p, tm, "coming")}
                              className="flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-opacity active:scale-[0.98]"
                              style={tm.myStatus === "coming" ? { background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT } : { background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: `1px solid ${CARD_B}`, fontFamily: FONT }}>
                              {t("plans.works", { defaultValue: "Works" })}
                            </button>
                            <button type="button" disabled={timeRsvp.isPending} onClick={() => toggleTime(p, tm, "maybe")}
                              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-opacity active:scale-[0.98]"
                              style={tm.myStatus === "maybe" ? { background: "rgba(143,175,150,0.3)", color: WARM, border: "1px solid rgba(143,175,150,0.5)", fontFamily: FONT } : { background: "transparent", color: "rgba(182,210,188,0.7)", border: "1px solid rgba(143,175,150,0.22)", fontFamily: FONT }}>
                              {t("plans.maybe", { defaultValue: "Maybe" })}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(() => {
                    const lead = p.leadingTimeId ? p.times!.find((tm) => tm.id === p.leadingTimeId) : null;
                    if (!lead || lead.comingCount === 0) return null;
                    const day = new Date(lead.startsAt).toLocaleDateString(undefined, { weekday: "long" });
                    return <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>{t("plans.looking_good", { day, defaultValue: `${day}'s looking good 🌿` })}</p>;
                  })()}
                </div>
              )}

              {/* Coming row */}
              {!p.deciding && p.comingCount > 0 && (
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="flex items-center">
                    {p.comingPreview.map((c, i) => (
                      <div key={c.userId} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                        <Avatar name={c.name} url={c.avatarUrl} size={24} />
                      </div>
                    ))}
                  </div>
                  <span className="text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>
                    {t("plans.coming_count", { defaultValue: "{{count}} coming", count: p.comingCount })}
                    {p.maybeCount > 0 ? ` · ${t("plans.maybe_count", { defaultValue: "{{count}} maybe", count: p.maybeCount })}` : ""}
                  </span>
                </div>
              )}

              {/* RSVP control — fellows' plans only (host is implicitly attending).
                  Hidden while deciding — the per-time leanings stand in. */}
              {!p.isMine && !p.deciding && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    disabled={rsvp.isPending}
                    onClick={() => toggleRsvp(p, "coming")}
                    className="flex-1 rounded-full py-2 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
                    style={p.myRsvp === "coming"
                      ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }
                      : { background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: `1px solid ${CARD_B}`, fontFamily: FONT }}
                  >
                    {p.myRsvp === "coming" ? t("plans.im_in_done", { defaultValue: "You're in ✓" }) : t("plans.im_in", { defaultValue: "I'll come" })}
                  </button>
                  <button
                    type="button"
                    disabled={rsvp.isPending}
                    onClick={() => toggleRsvp(p, "maybe")}
                    className="rounded-full px-4 py-2 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
                    style={p.myRsvp === "maybe"
                      ? { background: "rgba(143,175,150,0.3)", color: WARM, border: "1px solid rgba(143,175,150,0.5)", fontFamily: FONT }
                      : { background: "transparent", color: "rgba(182,210,188,0.7)", border: "1px solid rgba(143,175,150,0.22)", fontFamily: FONT }}
                  >
                    {t("plans.maybe", { defaultValue: "Maybe" })}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
