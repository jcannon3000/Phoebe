import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

interface MemberStatus {
  name: string;
  email: string;
  hasWritten: boolean;
}

interface LetterData {
  id: number;
  correspondenceId: number;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  periodStartDate: string;
  sentAt: string;
  readBy: Array<string | number>;
}

type TurnState = "WAITING" | "OPEN" | "OVERDUE" | "SENT";

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: Array<{ id: number; name: string | null; email: string; joinedAt: string | null; lastLetterAt: string | null; avatarUrl?: string | null }>;
  letters: LetterData[];
  myTurn: boolean;
  turnState?: TurnState;
  windowOpenDate?: string | null;
  overdueDate?: string | null;
  firstExchangeComplete?: boolean;
  myCalendarPromptState?: "enabled" | "dismissed" | null;
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: MemberStatus[];
    isLastThreeDays: boolean;
    whoseTurn?: "creator" | "member" | "everyone";
  };
}

function formatLetterDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function CorrespondencePage() {
  const [, params] = useRoute("/letters/:id");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const queryClient = useQueryClient();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Try phoebe endpoint, fall back to legacy
  const queryKey = [`/api/phoebe/correspondences/${correspondenceId}`];
  const { data, isLoading } = useQuery<CorrespondenceDetail>({
    queryKey,
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/phoebe/correspondences/${correspondenceId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      setLocation("/letters");
    },
  });

  const calendarPromptMutation = useMutation({
    mutationFn: (state: "enabled" | "dismissed") =>
      apiRequest("POST", `/api/phoebe/correspondences/${correspondenceId}/calendar-prompt`, { state }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
    },
  });

  // Mark as read on mount
  useEffect(() => {
    if (!correspondenceId || (!user && !token)) return;
    apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}/letters${tokenParam}`)
      .catch(() => apiRequest("GET", `/api/letters/correspondences/${correspondenceId}/letters${tokenParam}`))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      })
      .catch(() => {});
  }, [correspondenceId, user, token]);

  useEffect(() => {
    if (!authLoading && !user && !token) setLocation("/");
  }, [user, authLoading, token]);

  if (authLoading && !token) return null;
  if (!user && !token) return null;

  const userEmail = user?.email || "";
  const writeUrl = `/letters/${correspondenceId}/write${tokenParam}`;

  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex flex-col w-full pb-24">
          {[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl animate-pulse mb-4" style={{ background: "#DDD9CC" }} />)}
        </div>
      </Layout>
    );
  }

  const { currentPeriod, letters, members } = data;
  const isOneToOne = data.groupType === "one_to_one";

  // Case-insensitive so the current user is reliably filtered out even
  // when the stored member row's email casing differs from the auth email.
  const me = (userEmail || "").toLowerCase();
  const otherMembers = members
    .filter((m) => (m.email || "").toLowerCase() !== me)
    .map((m) => m.name || m.email.split("@")[0])
    .filter(Boolean)
    .join(", ");

  const periodLabel = isOneToOne
    ? `Letter ${letters.length + 1}`
    : `Round ${currentPeriod.periodNumber}`;

  const turnState: TurnState | undefined = data.turnState;
  // Server computes the window in UTC; if a letter was sent late-evening in
  // the user's local time it can land on the *next* UTC date, which pushes
  // windowOpen one day past what the user perceives. Recompute the OPEN
  // verdict locally from the latest letter's sentAt — getDate()/getMonth()/
  // getFullYear() read in the browser's local TZ, so a letter the user sees
  // as "April 23" + 7 calendar days = "April 30 OPEN" regardless of the
  // server's clock or the timestamp's UTC roll-over.
  const lastLetterAny = [...letters].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )[0];
  const localWindowOpenForMe = (() => {
    if (!isOneToOne || !lastLetterAny) return false;
    if ((lastLetterAny.authorEmail || "").toLowerCase() === me) return false; // not my turn
    const sent = new Date(lastLetterAny.sentAt);
    const sentLocal = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
    const opens = new Date(sentLocal.getFullYear(), sentLocal.getMonth(), sentLocal.getDate() + 7);
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return today.getTime() >= opens.getTime();
  })();
  const isOpen = isOneToOne && (turnState === "OPEN" || turnState === "OVERDUE" || localWindowOpenForMe);
  const isOverdue = isOneToOne && turnState === "OVERDUE";
  // Follow-up: I wrote the most-recent letter, yet my turn is OPEN again —
  // that only happens when my correspondent went quiet for 14 days and the
  // server re-opened my window so I can write a second time. Distinct from
  // a normal "your turn," so we surface it with its own notation.
  const iWroteLast = !!lastLetterAny && (lastLetterAny.authorEmail || "").toLowerCase() === me;
  const isFollowUp = isOneToOne && isOpen && iWroteLast;

  // Other member's most recent letter — used for "waiting since" copy on OVERDUE.
  const lastLetterByOther = [...letters]
    .filter((l) => (l.authorEmail || "").toLowerCase() !== me)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  const showCalendarPrompt = false;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-24">

        {/* Back row */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setLocation("/letters")} className="text-sm" style={{ color: "#8FAF96" }}>
            ← Letters
          </button>
          {!showArchiveConfirm ? (
            <button onClick={() => setShowArchiveConfirm(true)} className="text-xs" style={{ color: "#8FAF96" }}>
              Archive
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: "#8FAF96" }}>Archive this?</span>
              <button onClick={() => archiveMutation.mutate()} className="text-xs font-medium" style={{ color: "#C8D4C0" }}>Yes</button>
              <button onClick={() => setShowArchiveConfirm(false)} className="text-xs" style={{ color: "#8FAF96" }}>Cancel</button>
            </div>
          )}
        </div>

        {/* Header — one_to_one always shows the OTHER person's name.
            Avatar stack of recipient(s) sits to the right of the title
            so the dialogue surface always gives a face to who you're
            writing to. */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {isOneToOne && otherMembers
              ? `Dialogue with ${otherMembers}`
              : (data.name?.replace(/^Letters with\b/, "Dialogue with")) || `Sharing with ${otherMembers}`}
          </h1>
          {(() => {
            const recipients = members.filter((m) => (m.email || "").toLowerCase() !== me).slice(0, 3);
            if (recipients.length === 0) return null;
            return (
              <div className="flex items-center -space-x-2 shrink-0 mt-1">
                {recipients.map((rm) => (
                  rm.avatarUrl ? (
                    <img
                      key={rm.email}
                      src={rm.avatarUrl}
                      alt={rm.name ?? rm.email}
                      className="w-9 h-9 rounded-full object-cover"
                      style={{ border: "1.5px solid #0F2818" }}
                    />
                  ) : (
                    <div
                      key={rm.email}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0F2818" }}
                      title={rm.name ?? rm.email}
                    >
                      {((rm.name ?? rm.email) || "?")
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0] ?? "")
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "?"}
                    </div>
                  )
                ))}
              </div>
            );
          })()}
        </div>
        {isOneToOne && otherMembers && (
          <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>with {otherMembers}</p>
        )}
        <div className="mb-5" />

        {/* Period card — mirrors the dashboard's Daily Prayer List card:
            row 1 title + chip, row 2 subtitle, row 3 full-width CTA. */}
        {(() => {
          // Resolve subtitle + CTA in a single pass so the card layout
          // is uniform across every state.
          let subtitle: string | null = null;
          let ctaLabel: string | null = null;
          let ctaHref: string | null = null;
          let ctaFilled = true;

          if (isOneToOne) {
            const lastLetter = [...letters].sort(
              (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
            )[0];
            const nextIsMine = !!lastLetter && lastLetter.authorEmail !== userEmail;
            const windowOpenAt = data.windowOpenDate ? new Date(data.windowOpenDate) : null;
            const isWaitingForWindow =
              turnState === "WAITING" &&
              nextIsMine &&
              !!windowOpenAt &&
              windowOpenAt.getTime() > Date.now();
            // Count calendar-day boundaries in local TZ so the number
            // here lines up exactly with the dashboard's letter card.
            // The previous Math.ceil over a raw ms diff disagreed by
            // one day whenever the server-side UTC-midnight
            // windowOpenDate sat across a local-tz boundary from
            // today — dashboard would say "5 days" while this page
            // said "6 days" for the same correspondence.
            const daysUntilOpen = isWaitingForWindow && windowOpenAt
              ? Math.max(0, differenceInCalendarDays(windowOpenAt, new Date()))
              : 0;

            if (isOpen) {
              if (isFollowUp) {
                subtitle = "Follow-up · no reply in 14 days 🕊️";
                ctaLabel = "Send a follow-up 🖋️";
              } else {
                subtitle = isOverdue && lastLetterByOther
                  ? `${otherMembers} has been waiting ${daysSince(lastLetterByOther.sentAt)} days · no rush 🌿`
                  : "Your turn to write 🖋️";
                ctaLabel = "Write your letter 🖋️";
              }
              ctaHref = writeUrl;
            } else if (isWaitingForWindow) {
              subtitle = daysUntilOpen === 0
                ? "Window opens today · your draft will wait"
                : `Window opens in ${daysUntilOpen} ${daysUntilOpen === 1 ? "day" : "days"} · your draft will wait`;
              ctaLabel = "Start drafting 🖋️";
              ctaHref = writeUrl;
              ctaFilled = false;
            } else if (letters.length > 0 && !nextIsMine) {
              subtitle = `Your letter is sent · waiting for ${otherMembers} 🌿`;
            } else {
              subtitle = `Waiting for ${otherMembers} to write… 🌿`;
            }
          } else if (data.myTurn && !currentPeriod.hasWrittenThisPeriod) {
            subtitle = "Your turn to share";
            ctaLabel = "Share your update 📮";
            ctaHref = writeUrl;
          } else if (currentPeriod.hasWrittenThisPeriod) {
            subtitle = "Your update is in for this round 🌿";
          }

          // Use ctaFilled to vary outline vs solid — but the pill itself
          // matches the dashboard's BarCard "Write 🖋️" pill exactly so
          // the two surfaces read as one card style.
          void ctaFilled;
          return (
            <div
              className={`relative flex rounded-xl overflow-hidden mb-4 transition-shadow ${data.myTurn ? "animate-turn-pulse" : ""}`}
              style={{
                background: isOverdue ? "#1A2D1A" : "#0F2818",
                border: `1px solid ${isOverdue ? "rgba(217,180,74,0.35)" : "rgba(46,107,64,0.45)"}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
              }}
            >
              {/* Left side-bar — matches the dashboard letter card. */}
              <div
                className="w-1 flex-shrink-0"
                style={{ background: isOverdue ? "#D9B44A" : "#5C8A5F" }}
              />
              <div className="flex-1 px-4 pt-3 pb-2">
                {/* Line 1: title (left) + Overdue chip (right, when applicable). */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="text-base font-semibold"
                    style={{
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    📮 {periodLabel}
                  </span>
                  {isFollowUp ? (
                    <span
                      className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      style={{
                        color: "#A8C5A0",
                        background: "rgba(46,107,64,0.15)",
                        border: "1px solid rgba(46,107,64,0.45)",
                        letterSpacing: "0.08em",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      Follow-up
                    </span>
                  ) : isOverdue ? (
                    <span
                      className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      style={{
                        color: "#D9B44A",
                        background: "rgba(217,180,74,0.10)",
                        border: "1px solid rgba(217,180,74,0.35)",
                        letterSpacing: "0.08em",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      Overdue
                    </span>
                  ) : null}
                </div>

                {/* Line 2: status text (left) + Write pill (right) — matches
                    the dashboard's BarCard layout for one-to-one letters. */}
                <div className="flex items-center justify-between gap-2 mt-1.5 -mr-2">
                  {subtitle ? (
                    <p
                      className="text-sm flex-1 min-w-0 truncate"
                      style={{
                        color: isOverdue ? "#D9B44A" : "#8FAF96",
                        lineHeight: "20px",
                        margin: 0,
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {subtitle}
                    </p>
                  ) : (
                    <span className="flex-1" />
                  )}
                  {ctaLabel && ctaHref && (
                    <Link href={ctaHref}>
                      <span
                        className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                        style={{
                          background: "#2D5E3F",
                          color: "#F0EDE6",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        {ctaLabel}
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Calendar prompt — shown once, after first exchange is complete */}
        {showCalendarPrompt && (
          <div
            className="rounded-2xl mb-8 p-5"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>
              📅 Get a calendar reminder when it's your turn?
            </p>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: "#8FAF96" }}>
              We'll drop an all-day event on your Google Calendar the Friday your writing window opens — a gentle nudge, nothing more.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => calendarPromptMutation.mutate("enabled")}
                disabled={calendarPromptMutation.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Yes, remind me
              </button>
              <button
                onClick={() => calendarPromptMutation.mutate("dismissed")}
                disabled={calendarPromptMutation.isPending}
                className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: "transparent", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {!showCalendarPrompt && <div className="mb-8" />}

        {/* Letter thread */}
        {letters.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-base mb-2" style={{ color: "#8FAF96" }}>
              {data.myTurn ? "No letters yet." : `Waiting for ${otherMembers} to write the first letter.`}
            </p>
            {data.myTurn && (
              <Link href={writeUrl}>
                <button className="px-6 py-3 rounded-xl font-semibold text-sm" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                  Write first 🖋️
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div>
            {letters.map((letter, index) => {
              const isOwn = letter.authorEmail === userEmail;
              const readers = (letter.readBy as Array<string | number>) || [];
              const readByOthers = members
                .filter((m) => m.email !== letter.authorEmail)
                .filter((m) => readers.includes(m.email) || (m.id && readers.includes(m.id)))
                .map((m) => m.name || m.email.split("@")[0]);

              const authorMember = members.find((m) =>
                (m.email || "").toLowerCase() === (letter.authorEmail || "").toLowerCase()
              );
              const authorAvatarUrl = authorMember?.avatarUrl ?? null;
              const authorInitials = ((letter.authorName || "?") as string)
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((s) => s[0] ?? "")
                .join("")
                .toUpperCase()
                .slice(0, 2) || "?";

              return (
                <div key={letter.id} className="mb-3">
                  <Link href={`/letters/${correspondenceId}/read/${letter.id}${tokenParam}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative cursor-pointer flex gap-3"
                      style={{
                        background: "#0F2818",
                        border: `1px solid rgba(92,122,95,${isOwn ? "0.35" : "0.2"})`,
                        borderLeft: `3px solid ${isOwn ? "#8FAF96" : "rgba(46,107,64,0.4)"}`,
                        borderRadius: "14px",
                        padding: "14px 16px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                      }}
                    >
                      {/* Author avatar — gives every letter card a face,
                          not just a name. Falls back to initials when
                          the user hasn't uploaded a photo. */}
                      {authorAvatarUrl ? (
                        <img
                          src={authorAvatarUrl}
                          alt={letter.authorName || ""}
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                          style={{ border: "1px solid rgba(46,107,64,0.35)" }}
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5"
                          style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.35)" }}
                        >
                          {authorInitials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase mb-1" style={{ color: "#8FAF96", letterSpacing: "0.1em" }}>
                          {letter.authorName} · {isOneToOne ? `Letter ${letters.length - index}` : `Update ${letter.letterNumber}`}
                          {isOneToOne && ` · ${formatLetterDate(letter.sentAt)}`}
                        </p>

                        <p className="text-sm leading-snug truncate" style={{ color: "#C8D4C0", fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif" }}>
                          {letter.content}
                        </p>

                        {isOwn && readByOthers.length > 0 && (
                          <p className="text-[11px] mt-1.5" style={{ color: "#8FAF96" }}>
                            Read by {readByOthers.join(", ")} 🌿
                          </p>
                        )}
                      </div>
                    </motion.div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
