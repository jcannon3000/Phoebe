import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  postmarkCity: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

type TurnState = "WAITING" | "OPEN" | "OVERDUE" | "SENT";

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: Array<{ id: number; name: string | null; email: string; joinedAt: string | null; lastLetterAt: string | null; homeCity: string | null }>;
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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)));
}

const STATE_ABBR: Record<string, string> = { "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC" };

function parsePostmark(raw: string) {
  const parts = raw.split(", ");
  if (parts.length >= 2) {
    const city = parts[0];
    const stateZip = parts.slice(1).join(", ");
    const tokens = stateZip.split(" ");
    const last = tokens[tokens.length - 1];
    if (/^\d{5}(-\d{4})?$/.test(last)) {
      const fullState = tokens.slice(0, -1).join(" ");
      return { city, state: STATE_ABBR[fullState] || fullState, zip: last };
    }
    return { city, state: STATE_ABBR[stateZip] || stateZip, zip: "" };
  }
  return { city: raw, state: "", zip: "" };
}

function PostmarkStamp({ city, date }: { city: string; date: string }) {
  const { city: c, state, zip } = parsePostmark(city);
  return (
    <div className="inline-flex flex-col items-end flex-shrink-0 " style={{ gap: "1px" }}>
      <span style={{ color: "#5C7A5F", fontSize: "13px", fontWeight: 700, lineHeight: 1.2 }}>{formatShortDate(date)}</span>
      <span className="uppercase" style={{ color: "#5C7A5F", fontSize: "9px", letterSpacing: "0.08em", lineHeight: 1.3 }}>{c}{state ? `, ${state}` : ""}</span>
      {zip && <span style={{ color: "#5C7A5F", fontSize: "9px", letterSpacing: "0.05em", lineHeight: 1.3 }}>{zip}</span>}
    </div>
  );
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

  const otherMembers = members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ");

  const memberCities = members.filter((m) => m.homeCity).map((m) => `${m.name || m.email.split("@")[0]} · ${m.homeCity}`);

  const periodLabel = isOneToOne
    ? `Letter ${currentPeriod.periodNumber}`
    : `Round ${currentPeriod.periodNumber}`;

  const turnState: TurnState | undefined = data.turnState;
  const isOpen = isOneToOne && (turnState === "OPEN" || turnState === "OVERDUE");
  const isOverdue = isOneToOne && turnState === "OVERDUE";

  // Other member's most recent letter — used for "waiting since" copy on OVERDUE.
  const lastLetterByOther = [...letters]
    .filter((l) => l.authorEmail !== userEmail)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  const showCalendarPrompt =
    isOneToOne &&
    data.firstExchangeComplete === true &&
    (data.myCalendarPromptState ?? null) === null;

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

        {/* Header */}
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          {(data.name?.replace(/^Letters with\b/, "Dialogue with")) || (isOneToOne ? `Dialogue with ${otherMembers}` : `Sharing with ${otherMembers}`)}
        </h1>
        {isOneToOne && otherMembers && (
          <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>with {otherMembers}</p>
        )}
        {memberCities.length > 0 && (
          <p className="text-xs mb-5" style={{ color: "#8FAF96" }}>📮 {memberCities.join(" · ")}</p>
        )}
        {memberCities.length === 0 && <div className="mb-5" />}

        {/* Period bar */}
        <div
          className={`rounded-2xl overflow-hidden mb-4 transition-shadow ${data.myTurn ? "animate-turn-pulse" : ""}`}
          style={{
            background: isOverdue ? "#1A2D1A" : "#0F2818",
            border: `1px solid ${isOverdue ? "rgba(217,180,74,0.35)" : "rgba(200,212,192,0.25)"}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex">
            <div className="w-[3px] flex-shrink-0" style={{ background: isOverdue ? "#D9B44A" : "#8FAF96" }} />
            <div className="flex-1 p-5">
              <p className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: isOverdue ? "#D9B44A" : "#8FAF96", letterSpacing: "0.1em" }}>
                {periodLabel}
              </p>

              {/* CTA — one_to_one: driven by turnState */}
              {isOneToOne ? (
                <>
                  {isOverdue && lastLetterByOther && (
                    <p className="text-sm mb-3" style={{ color: "#D9B44A" }}>
                      {otherMembers} has been waiting {daysSince(lastLetterByOther.sentAt)} days. No rush — write when you're ready. 🌿
                    </p>
                  )}
                  {isOpen ? (
                    <Link href={writeUrl}>
                      <button
                        className="w-full py-3 rounded-xl text-base font-semibold"
                        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                      >
                        Write your letter 🖋️
                      </button>
                    </Link>
                  ) : letters.length > 0 && letters[0].authorEmail === userEmail ? (
                    <p className="text-sm" style={{ color: "#8FAF96" }}>
                      Your letter is sent. 🌿 Waiting for {otherMembers} to write back.
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: "#8FAF96" }}>
                      Waiting for {otherMembers} to write... 🌿
                    </p>
                  )}
                </>
              ) : data.myTurn && !currentPeriod.hasWrittenThisPeriod ? (
                <Link href={writeUrl}>
                  <button
                    className="w-full py-3 rounded-xl text-base font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    Share your update 📮
                  </button>
                </Link>
              ) : currentPeriod.hasWrittenThisPeriod ? (
                <p className="text-sm" style={{ color: "#8FAF96" }}>
                  Your update is in for this round. 🌿
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Calendar prompt — shown once, after first exchange is complete */}
        {showCalendarPrompt && (
          <div
            className="rounded-2xl mb-8 p-5"
            style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.18)" }}
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
                style={{ background: "transparent", color: "#8FAF96", border: "1px solid rgba(200,212,192,0.2)" }}
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
            <p className="text-base mb-2" style={{ color: "#8FAF96" }}>No letters yet.</p>
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

              return (
                <div key={letter.id}>
                  <Link href={`/letters/${correspondenceId}/read/${letter.id}${tokenParam}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative cursor-pointer"
                      style={{
                        background: "#0F2818",
                        border: `1px solid rgba(200,212,192,${isOwn ? "0.25" : "0.15"})`,
                        borderLeft: `3px solid ${isOwn ? "#8FAF96" : "rgba(200,212,192,0.3)"}`,
                        borderRadius: "16px",
                        padding: "24px 28px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    >
                      <p className="text-[11px] font-semibold uppercase mb-3" style={{ color: "#8FAF96", letterSpacing: "0.1em" }}>
                        {letter.authorName} · {isOneToOne ? `Letter ${letter.letterNumber}` : `Update ${letter.letterNumber}`}
                        {letter.postmarkCity && isOneToOne && (() => {
                          const { city, state } = parsePostmark(letter.postmarkCity!);
                          return ` · ${city}, ${state} · ${formatLetterDate(letter.sentAt)}`;
                        })()}
                      </p>

                      <p className="text-[17px] leading-[1.9] whitespace-pre-wrap line-clamp-6" style={{ color: "#F0EDE6", fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif" }}>
                        {letter.content}
                      </p>

                      {isOwn && readByOthers.length > 0 && (
                        <p className="text-xs mt-3" style={{ color: "#8FAF96" }}>
                          Read by {readByOthers.join(", ")} 🌿
                        </p>
                      )}

                      <p className="text-xs mt-4 font-medium" style={{ color: "#8FAF96" }}>
                        Read full letter →
                      </p>
                    </motion.div>
                  </Link>

                  {index < letters.length - 1 && (
                    <div className="flex items-center justify-center py-4" style={{ color: "rgba(200,212,192,0.2)" }}>
                      <span className="text-sm tracking-[0.5em]">· · ·</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
