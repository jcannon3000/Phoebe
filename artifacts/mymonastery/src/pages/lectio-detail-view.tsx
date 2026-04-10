/**
 * Lectio Divina — practice detail view.
 *
 * Rendered by moment-detail.tsx when moment.templateType === "lectio-divina".
 * Replaces the generic practice detail (streaks, log timeline, sessions goal)
 * with a Lectio-specific flow: gospel card, three stages, group progress dots,
 * and a past-readings archive.
 *
 * Takes the already-fetched MomentDetail as a prop to avoid a double fetch,
 * and does its own queries for lectio week data + archive.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { InviteStep } from "@/components/InviteStep";

// ─── Types ───────────────────────────────────────────────────────────────────

type Stage = "lectio" | "meditatio" | "oratio";
const STAGES: Stage[] = ["lectio", "meditatio", "oratio"];
const STAGE_DAY_LABELS: Record<Stage, string> = {
  lectio: "Monday",
  meditatio: "Wednesday",
  oratio: "Friday",
};

interface StageReveal {
  label: string;
  prompt: string;
  unlocked: boolean;
  userHasSubmitted: boolean;
  myReflection: string | null;
  reflections:
    | Array<{ userName: string; isYou: boolean; text: string; createdAt: string }>
    | null;
  nonSubmitterNames: string[];
}

interface LectioWeekData {
  moment: { id: number; name: string; templateType: string; timezone: string };
  userName: string;
  userToken: string;
  memberCount: number;
  week: {
    sundayDate: string;
    phaseLabel: string;
    currentStage: Stage | null;
    unlockedStages: Stage[];
    isSunday: boolean;
  };
  reading: {
    sundayDate: string;
    sundayName: string;
    liturgicalSeason: string | null;
    liturgicalYear: string | null;
    gospelReference: string;
    gospelText: string;
    sourceUrl: string | null;
    fallbackReason?: string | null;
  };
  stages: Record<Stage, StageReveal>;
}

interface ArchiveWeek {
  sundayDate: string;
  sundayName: string | null;
  gospelReference: string | null;
  reflectionCount: number;
}

interface LectioDetailViewProps {
  id: string;
  data: {
    moment: {
      id: number;
      name: string;
      momentToken: string;
      templateType: string | null;
    };
    members: { name: string | null; email: string }[];
    memberCount: number;
    myUserToken: string | null;
    isCreator: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatSundayDate(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function daysUntilSunday(sundayIso: string): number {
  try {
    const now = new Date();
    const sunday = new Date(sundayIso + "T12:00:00");
    const ms = sunday.getTime() - now.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  } catch {
    return 0;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LectioDetailView({ id, data }: LectioDetailViewProps) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { moment, members, memberCount, myUserToken, isCreator } = data;

  // UI state
  const [showInvite, setShowInvite] = useState(false);
  const [invitePeople, setInvitePeople] = useState<{ name: string; email: string }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showPassage, setShowPassage] = useState(false);
  const [activeReflectStage, setActiveReflectStage] = useState<Stage | null>(null);
  const [expandedReflectionsStage, setExpandedReflectionsStage] = useState<Stage | null>(null);
  const [draftReflection, setDraftReflection] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // ─── Lectio week data query ───────────────────────────────────────────────
  const lectioQueryKey = [`/api/lectio/${moment.momentToken}/${myUserToken ?? ""}`];
  const { data: lectio, isLoading: lectioLoading, error: lectioError } = useQuery<LectioWeekData>({
    queryKey: lectioQueryKey,
    queryFn: () => apiRequest<LectioWeekData>("GET", `/api/lectio/${moment.momentToken}/${myUserToken}`),
    enabled: !!myUserToken,
    refetchInterval: 30_000,
  });

  // ─── Archive query ────────────────────────────────────────────────────────
  const { data: archive } = useQuery<{ weeks: ArchiveWeek[] }>({
    queryKey: [`/api/lectio/${moment.momentToken}/${myUserToken ?? ""}/archive`],
    queryFn: () => apiRequest<{ weeks: ArchiveWeek[] }>(
      "GET",
      `/api/lectio/${moment.momentToken}/${myUserToken}/archive`,
    ),
    enabled: !!myUserToken,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const reflectMutation = useMutation({
    mutationFn: (body: { stage: Stage; reflectionText: string }) =>
      apiRequest("POST", `/api/lectio/${moment.momentToken}/${myUserToken}/reflect`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lectioQueryKey });
      setActiveReflectStage(null);
      setDraftReflection("");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (people: { name: string; email: string }[]) =>
      apiRequest("POST", `/api/moments/${id}/invite`, { people }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setShowInvite(false);
      setInvitePeople([]);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/moments/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
  });

  // ─── Derived state ────────────────────────────────────────────────────────
  // Map userToken → stage completion for the progress dots section. The GET
  // endpoint only reveals reflections for stages the viewer has submitted, so
  // for un-submitted stages we just know the count (not who). That's OK —
  // the dots mirror what the viewer is allowed to see.
  const stageSubmitterSets: Record<Stage, Set<string>> | null = useMemo(() => {
    if (!lectio) return null;
    const result: Record<Stage, Set<string>> = {
      lectio: new Set(),
      meditatio: new Set(),
      oratio: new Set(),
    };
    for (const s of STAGES) {
      const stageData = lectio.stages[s];
      if (stageData.reflections) {
        for (const r of stageData.reflections) result[s].add(r.userName);
      } else if (stageData.userHasSubmitted) {
        result[s].add(lectio.userName);
      }
    }
    return result;
  }, [lectio]);

  // ─── Early returns ────────────────────────────────────────────────────────
  if (!myUserToken) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            You don't have a personal access token for this practice yet.
          </p>
        </div>
      </Layout>
    );
  }

  if (lectioLoading) {
    return (
      <Layout>
        <div className="space-y-3 pt-4 max-w-2xl mx-auto w-full">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </Layout>
    );
  }

  if (lectioError || !lectio) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center px-4">
          <p className="text-sm text-muted-foreground">
            We couldn't load this week's reading. Try refreshing in a moment.
          </p>
        </div>
      </Layout>
    );
  }

  // ─── Body ─────────────────────────────────────────────────────────────────
  const { reading, week, stages } = lectio;
  const isSunday = week.isSunday;
  const days = daysUntilSunday(week.sundayDate);

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto w-full overflow-x-clip">
        {/* Back */}
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-5 transition-colors"
        >
          ← Your practices
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground mb-1 min-w-0 break-words">
              {moment.name}
            </h1>
            <button
              onClick={() => setShowInvite(true)}
              className="shrink-0 mt-0.5 text-xs font-medium text-[#5C7A5F] border border-[#5C7A5F]/40 rounded-full px-3 py-1.5 hover:bg-[#5C7A5F]/8 transition-colors whitespace-nowrap"
            >
              + Invite 🌿
            </button>
          </div>

          {/* Subtitle: Sunday name + gospel reference */}
          {reading.sundayName && reading.gospelReference && (
            <p className="text-sm text-muted-foreground">
              {reading.sundayName} · {reading.gospelReference}
            </p>
          )}

          {/* Liturgical week context */}
          <p className="text-xs text-muted-foreground/70 mt-1">
            Week of {formatSundayDate(week.sundayDate)}
            {!isSunday && days > 0 && ` · ${days} ${days === 1 ? "day" : "days"} until Sunday`}
            {isSunday && " · Sunday"}
          </p>

          {/* Members */}
          {members.length > 0 && (() => {
            const MAX = 4;
            const shown = members.length <= MAX ? members : members.slice(0, MAX - 1);
            const extra = members.length > MAX ? members.length - (MAX - 1) : 0;
            return (
              <div className="mt-3 flex flex-wrap gap-x-1.5 gap-y-0.5">
                {shown.map((m, i) => (
                  <span key={m.email}>
                    <Link
                      href={`/people/${encodeURIComponent(m.email)}`}
                      className="text-sm text-muted-foreground/70 hover:text-primary transition-colors"
                    >
                      {(m.name ?? m.email).split(" ")[0]}
                    </Link>
                    {(i < shown.length - 1 || extra > 0) && (
                      <span className="text-muted-foreground/40"> ·</span>
                    )}
                  </span>
                ))}
                {extra > 0 && (
                  <span className="text-sm text-muted-foreground/50">+{extra} more</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Gospel Passage Card */}
        <div
          className="mb-6 rounded-2xl"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(200,212,192,0.25)",
            padding: 20,
          }}
        >
          {reading.sundayName ? (
            <>
              <p
                className="uppercase"
                style={{
                  color: "#8FAF96",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                {reading.sundayName}
              </p>
              <p
                className="mt-1"
                style={{
                  color: "#8FAF96",
                  fontSize: 13,
                }}
              >
                {reading.gospelReference}
              </p>
              <button
                onClick={() => setShowPassage((v) => !v)}
                className="mt-3 text-sm transition-colors"
                style={{ color: "#A8C5A0" }}
              >
                {showPassage ? "Hide passage ↑" : "Read the passage →"}
              </button>
              <AnimatePresence initial={false}>
                {showPassage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: "hidden" }}
                  >
                    <p
                      className="mt-4"
                      style={{
                        color: "#F0EDE6",
                        fontSize: 15,
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        fontFamily: "'EB Garamond', Georgia, serif",
                      }}
                    >
                      {reading.gospelText || "The full passage couldn't be loaded."}
                    </p>
                    {reading.sourceUrl && (
                      <a
                        href={reading.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-3 text-xs"
                        style={{ color: "#8FAF96" }}
                      >
                        Source ↗
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "#8FAF96" }}>
                Unable to load this week's reading
              </p>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: lectioQueryKey })}
                className="text-xs"
                style={{ color: "#A8C5A0" }}
              >
                Retry →
              </button>
            </div>
          )}
        </div>

        {/* On Sunday: full read-only gathering view of the week's reflections.
            Other days: the three-stage active view. */}
        {isSunday ? (
          <>
            <h2 className="text-lg font-bold lowercase text-foreground mb-3">
              this week's journey
            </h2>
            <div className="space-y-5">
              {STAGES.map((s) => {
                const sd = stages[s];
                return (
                  <div
                    key={s}
                    className="rounded-2xl"
                    style={{
                      background: "#0F2818",
                      border: "1px solid rgba(200,212,192,0.25)",
                      padding: 18,
                    }}
                  >
                    <p
                      className="font-semibold"
                      style={{ color: "#F0EDE6", fontSize: 16 }}
                    >
                      {sd.label}
                    </p>
                    <p
                      className="italic mt-1"
                      style={{ color: "#8FAF96", fontSize: 13 }}
                    >
                      {sd.prompt}
                    </p>
                    {sd.reflections && sd.reflections.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {sd.reflections.map((r, i) => (
                          <ReflectionRow key={i} refl={r} />
                        ))}
                        {sd.nonSubmitterNames.length > 0 && (
                          <p
                            className="text-xs mt-2"
                            style={{ color: "rgba(143,175,150,0.55)" }}
                          >
                            {sd.nonSubmitterNames.join(", ")}{" "}
                            {sd.nonSubmitterNames.length === 1 ? "hasn't" : "haven't"} reflected
                          </p>
                        )}
                      </div>
                    ) : (
                      <p
                        className="text-xs mt-3"
                        style={{ color: "rgba(143,175,150,0.55)" }}
                      >
                        No reflections for this stage.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold lowercase text-foreground mb-3">
              this week's stages
            </h2>
            <div className="space-y-3">
              {STAGES.map((s) => {
                const sd = stages[s];
                const isActiveReflect = activeReflectStage === s;
                const isExpandedReflections = expandedReflectionsStage === s;
                return (
                  <StageCardActive
                    key={s}
                    stage={s}
                    data={sd}
                    memberCount={memberCount}
                    isActiveReflect={isActiveReflect}
                    isExpandedReflections={isExpandedReflections}
                    draftReflection={draftReflection}
                    onStartReflect={() => {
                      setActiveReflectStage(s);
                      setDraftReflection(sd.myReflection ?? "");
                      setExpandedReflectionsStage(null);
                    }}
                    onCancelReflect={() => {
                      setActiveReflectStage(null);
                      setDraftReflection("");
                    }}
                    onDraftChange={setDraftReflection}
                    onSubmitReflect={() => {
                      if (draftReflection.trim().length === 0) return;
                      reflectMutation.mutate({
                        stage: s,
                        reflectionText: draftReflection.trim(),
                      });
                    }}
                    submitting={reflectMutation.isPending}
                    onExpandReflections={() =>
                      setExpandedReflectionsStage((cur) => (cur === s ? null : s))
                    }
                  />
                );
              })}
            </div>

            {/* This week's group — progress dots */}
            <div className="mt-8">
              <h3
                className="uppercase font-semibold mb-3"
                style={{
                  color: "#8FAF96",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                }}
              >
                This week
              </h3>
              <div className="space-y-2">
                {members.map((m) => {
                  const name = (m.name ?? m.email.split("@")[0]);
                  const firstName = name.split(" ")[0];
                  return (
                    <div
                      key={m.email}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                      style={{
                        background: "#0F2818",
                        border: "1px solid rgba(200,212,192,0.15)",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold"
                        style={{
                          background: "rgba(168,197,160,0.15)",
                          color: "#A8C5A0",
                        }}
                      >
                        {initialsOf(name)}
                      </div>
                      <span className="text-sm flex-1 min-w-0 truncate" style={{ color: "#F0EDE6" }}>
                        {firstName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {STAGES.map((s) => {
                          const completed = stageSubmitterSets?.[s].has(name) ?? false;
                          return (
                            <span
                              key={s}
                              aria-label={`${s} ${completed ? "completed" : "not completed"}`}
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: completed ? "#A8C5A0" : "transparent",
                                border: completed ? "none" : "1px solid rgba(168,197,160,0.4)",
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Past readings */}
        <div className="mt-10">
          <h2 className="text-lg font-bold lowercase text-foreground mb-3">
            past readings
          </h2>
          {archive && archive.weeks.length > 0 ? (
            <div className="space-y-1">
              {archive.weeks.map((w) => (
                <Link
                  key={w.sundayDate}
                  href={`/moments/${id}/week/${w.sundayDate}`}
                  className="block rounded-lg px-3 py-2.5 hover:bg-[#0F2818]/60 transition-colors"
                >
                  <p className="text-sm text-foreground">
                    {w.sundayName ?? "Reading"}
                    {w.gospelReference && (
                      <span className="text-muted-foreground"> · {w.gospelReference}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {formatSundayDate(w.sundayDate)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60 text-center py-6">
              Your first Sunday is coming.
            </p>
          )}
        </div>

        {/* Settings — small muted link */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {showSettings ? "Hide settings" : "⚙︎ Settings"}
          </button>
        </div>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
              className="mt-3"
            >
              <div className="space-y-2 max-w-sm mx-auto">
                {!isCreator && (
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    className="w-full text-sm text-muted-foreground border border-border/60 rounded-xl px-4 py-2.5 hover:bg-card transition-colors"
                  >
                    Leave practice
                  </button>
                )}
                {isCreator && (
                  <>
                    <button
                      onClick={() => archiveMutation.mutate()}
                      disabled={archiveMutation.isPending}
                      className="w-full text-sm text-muted-foreground border border-border/60 rounded-xl px-4 py-2.5 hover:bg-card transition-colors disabled:opacity-50"
                    >
                      {archiveMutation.isPending ? "Archiving…" : "Archive practice"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full text-sm text-rose-400/80 border border-rose-400/30 rounded-xl px-4 py-2.5 hover:bg-rose-400/5 transition-colors"
                    >
                      Delete practice
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirm */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setShowDeleteConfirm(false)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base font-semibold text-foreground mb-1">Delete this practice?</p>
                <p className="text-sm text-muted-foreground mb-4">
                  All reflections and history will be removed. This can't be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 text-sm text-muted-foreground border border-border/60 rounded-xl px-4 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 text-sm text-white bg-rose-500/80 rounded-xl px-4 py-2.5 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave confirm */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setShowLeaveConfirm(false)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base font-semibold text-foreground mb-4">Leave this practice?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="flex-1 text-sm text-muted-foreground border border-border/60 rounded-xl px-4 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => archiveMutation.mutate()}
                    className="flex-1 text-sm text-white bg-[#2D5E3F] rounded-xl px-4 py-2.5"
                  >
                    Leave
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invite sheet */}
        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center"
              onClick={() => setShowInvite(false)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
                className="bg-background w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border border-border p-5 max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Invite</h2>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="text-sm text-muted-foreground"
                  >
                    Close
                  </button>
                </div>
                <InviteStep
                  type="practice"
                  onPeopleChange={setInvitePeople}
                />
                <button
                  onClick={() => inviteMutation.mutate(invitePeople)}
                  disabled={inviteMutation.isPending || invitePeople.length === 0}
                  className="w-full mt-4 text-sm font-semibold text-white bg-[#2D5E3F] rounded-full px-4 py-3 disabled:opacity-50"
                >
                  {inviteMutation.isPending ? "Sending…" : "Send invites"}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

// ─── Stage card (active week view) ──────────────────────────────────────────

function StageCardActive({
  stage,
  data,
  memberCount,
  isActiveReflect,
  isExpandedReflections,
  draftReflection,
  onStartReflect,
  onCancelReflect,
  onDraftChange,
  onSubmitReflect,
  submitting,
  onExpandReflections,
}: {
  stage: Stage;
  data: StageReveal;
  memberCount: number;
  isActiveReflect: boolean;
  isExpandedReflections: boolean;
  draftReflection: string;
  onStartReflect: () => void;
  onCancelReflect: () => void;
  onDraftChange: (v: string) => void;
  onSubmitReflect: () => void;
  submitting: boolean;
  onExpandReflections: () => void;
}) {
  const dayLabel = STAGE_DAY_LABELS[stage];
  const submittedCount = data.reflections?.length ?? (data.userHasSubmitted ? 1 : 0);

  // Card background: darker when locked
  const cardStyle = data.unlocked
    ? {
        background: "#0F2818",
        border: "1px solid rgba(200,212,192,0.4)",
      }
    : {
        background: "rgba(15,40,24,0.45)",
        border: "1px solid rgba(200,212,192,0.1)",
      };

  return (
    <div className="rounded-2xl" style={{ ...cardStyle, padding: 18 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="font-semibold"
            style={{
              color: data.unlocked ? "#F0EDE6" : "rgba(240,237,230,0.45)",
              fontSize: 16,
            }}
          >
            {data.label}
          </p>
          <p
            className="mt-0.5"
            style={{
              color: data.unlocked ? "#8FAF96" : "rgba(143,175,150,0.45)",
              fontSize: 12,
            }}
          >
            {dayLabel}
          </p>
        </div>
        {!data.unlocked && (
          <span
            className="shrink-0 text-[11px] rounded-full px-2.5 py-1"
            style={{
              background: "rgba(143,175,150,0.12)",
              color: "rgba(143,175,150,0.7)",
            }}
          >
            Opens {dayLabel}
          </span>
        )}
      </div>

      <p
        className="italic mt-3"
        style={{
          color: data.unlocked ? "#C8D4C0" : "rgba(200,212,192,0.35)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {data.prompt}
      </p>

      {/* Action area (only for unlocked stages) */}
      {data.unlocked && (
        <div className="mt-4">
          {/* Reflecting form */}
          <AnimatePresence initial={false}>
            {isActiveReflect ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <textarea
                  value={draftReflection}
                  onChange={(e) => onDraftChange(e.target.value)}
                  rows={5}
                  placeholder="Write from the quiet…"
                  autoFocus
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(200,212,192,0.2)",
                    color: "#F0EDE6",
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: 15,
                    lineHeight: 1.5,
                  }}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={onCancelReflect}
                    className="text-xs text-muted-foreground/70 hover:text-muted-foreground px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSubmitReflect}
                    disabled={submitting || draftReflection.trim().length === 0}
                    className="ml-auto text-sm font-semibold rounded-full px-5 py-2 disabled:opacity-50"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    {submitting ? "Saving…" : data.userHasSubmitted ? "Update" : "Share"}
                  </button>
                </div>
              </motion.div>
            ) : data.userHasSubmitted ? (
              <div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm" style={{ color: "#A8C5A0" }}>
                    ✓ You reflected
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onStartReflect}
                      className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
                    >
                      Edit
                    </button>
                    <button
                      onClick={onExpandReflections}
                      className="text-sm"
                      style={{ color: "#A8C5A0" }}
                    >
                      {isExpandedReflections ? "Hide reflections ↑" : "See reflections →"}
                    </button>
                  </div>
                </div>
                <p
                  className="text-xs mt-2"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  {submittedCount} of {memberCount}{" "}
                  {submittedCount === 1 ? "has" : "have"} reflected
                </p>

                <AnimatePresence initial={false}>
                  {isExpandedReflections && data.reflections && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="mt-4 space-y-3">
                        {data.reflections.map((r, i) => (
                          <ReflectionRow key={i} refl={r} />
                        ))}
                        {data.nonSubmitterNames.length > 0 && (
                          <p
                            className="text-xs pt-1"
                            style={{ color: "rgba(143,175,150,0.55)" }}
                          >
                            {data.nonSubmitterNames
                              .map((n) => `${n} hasn't reflected yet`)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div>
                <button
                  onClick={onStartReflect}
                  className="w-full text-sm font-semibold rounded-full px-4 py-2.5 transition-colors"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  Reflect
                </button>
                <p
                  className="text-xs mt-2 text-center"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  {submittedCount} of {memberCount}{" "}
                  {submittedCount === 1 ? "has" : "have"} reflected
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Reflection row ──────────────────────────────────────────────────────────

function ReflectionRow({
  refl,
}: {
  refl: { userName: string; isYou: boolean; text: string; createdAt: string };
}) {
  const firstName = refl.userName.split(" ")[0];
  return (
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold"
        style={{
          background: refl.isYou ? "rgba(168,197,160,0.25)" : "rgba(168,197,160,0.15)",
          color: "#A8C5A0",
          border: refl.isYou ? "1px solid rgba(168,197,160,0.55)" : "none",
        }}
      >
        {initialsOf(refl.userName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
            {refl.isYou ? "You" : firstName}
          </p>
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>
            {formatRelativeTime(refl.createdAt)}
          </p>
        </div>
        <p
          className="text-sm mt-1"
          style={{
            color: "#E8E4DA",
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 15,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {refl.text}
        </p>
      </div>
    </div>
  );
}
