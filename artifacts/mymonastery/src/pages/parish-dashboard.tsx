/**
 * Phoebe Parish — simplified dashboard for parish-only users.
 *
 * What lives here (and ONLY here, for users in the parish-only tier):
 *   • The parish identity card — name, today's intercessions
 *   • Daily Office / Daily Devotion entry points (Morning + Evening)
 *   • A small footer link to settings (office reminder prefs, parish
 *     picker, sign out)
 *
 * What does NOT live here — anything user-generated. No garden, no
 * prayer requests, no communities, no letters. Those surfaces are
 * gated behind the full-app tier (beta or community member).
 *
 * Layout intentionally minimal. The whole point of Parish is that a
 * non-Phoebe-power-user can open the app, see the day's intercessions,
 * and tap into Morning Prayer. No nav drawer, no badges to chase.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface ParishToday {
  parish: {
    id: number;
    slug: string;
    title: string;
    tagline: string | null;
    coverEmoji: string | null;
    timezone: string;
  };
  // The 3 published slot entries for today (max). Less than 3 if the
  // parish admin hasn't programmed all slots; empty array if no
  // intentions are live for today yet.
  todayEntries: Array<{
    id: number;
    slot: number;
    title: string;
    body: string;
    scriptureRef: string | null;
    state: "draft" | "scheduled" | "published";
    prayCount: number;
  }>;
  // Rolling 7-day count of distinct parishioners who've prayed any
  // office/devotion. Powers the soft "your parish is praying" line
  // under the header.
  parishionersPrayingThisWeek: number;
}

const SLOT_LABEL: Record<number, string> = { 1: "First", 2: "Second", 3: "Third" };

export default function ParishDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Sanity-redirect: if the user landed here but isn't actually in the
  // parish-only tier, send them where they belong. The router-level
  // gate covers the same case but a direct URL hit shouldn't hang on
  // a blank page.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/"); return; }
    if (user.accessTier === "full") setLocation("/dashboard");
    if (user.accessTier === "unassigned") setLocation("/parish/onboarding");
  }, [user, authLoading, setLocation]);

  const todayQuery = useQuery<ParishToday>({
    queryKey: ["/api/parish/today"],
    queryFn: () => apiRequest("GET", "/api/parish/today"),
    enabled: !!user && user.accessTier === "parish-only",
    staleTime: 60_000,
  });

  if (authLoading || !user) return null;

  const data = todayQuery.data;
  const isMorning = new Date().getHours() < 12;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT }}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          padding: "calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        {/* Header — Phoebe wordmark left, settings right. Mirrors the
            visual rhythm of /dashboard but stripped of all the
            user-generated chrome. */}
        <div className="flex items-center justify-between mb-8">
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: WARM_TEXT,
              margin: 0,
            }}
          >
            Phoebe
          </p>
          <Link href="/parish/settings">
            <span
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 13,
                color: SAGE,
                cursor: "pointer",
              }}
            >
              Settings
            </span>
          </Link>
        </div>

        {/* Parish identity card */}
        {data?.parish ? (
          <div className="mb-6">
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                marginBottom: 6,
              }}
            >
              Your parish
            </p>
            <div className="flex items-center gap-3">
              <div
                style={{
                  fontSize: 32,
                  width: 48,
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  background: "rgba(46,107,64,0.15)",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {data.parish.coverEmoji ?? "⛪"}
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: WARM_TEXT,
                    margin: 0,
                  }}
                >
                  {data.parish.title}
                </h1>
                {data.parishionersPrayingThisWeek > 0 && (
                  <p style={{ color: SAGE, fontSize: 13, marginTop: 2 }}>
                    {data.parishionersPrayingThisWeek}{" "}
                    {data.parishionersPrayingThisWeek === 1 ? "person" : "people"} praying this week
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : user.accessTier === "offices-only" ? (
          <div className="mb-6">
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                marginBottom: 6,
              }}
            >
              Daily prayer
            </p>
            <h1
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: WARM_TEXT,
                margin: 0,
              }}
            >
              Pause and pray.
            </h1>
            <p style={{ color: SAGE, fontSize: 13, marginTop: 4 }}>
              Morning and evening, from the Book of Common Prayer.
            </p>
          </div>
        ) : null}

        {/* Today's parish intercessions — parish-only; an offices-only
            account has no parish slate of its own. */}
        {user.accessTier === "parish-only" && (
        <>
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FAINT_GREEN,
            marginBottom: 8,
          }}
        >
          Today's intercessions
        </p>
        {data?.todayEntries && data.todayEntries.length > 0 ? (
          <div className="space-y-2 mb-6">
            {data.todayEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  background: "#0F2818",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: "16px 18px",
                }}
              >
                <p
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(143,175,150,0.55)",
                    margin: 0,
                  }}
                >
                  {SLOT_LABEL[e.slot] ?? "Intercession"}
                </p>
                <p
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 16,
                    fontWeight: 600,
                    color: WARM_TEXT,
                    margin: "4px 0 0",
                  }}
                >
                  {e.title}
                </p>
                {e.body && (
                  <p
                    style={{
                      fontFamily: GEORGIA,
                      fontStyle: "italic",
                      fontSize: 14,
                      color: "rgba(240,237,230,0.85)",
                      lineHeight: 1.55,
                      margin: "8px 0 0",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {e.body}
                  </p>
                )}
                {e.scriptureRef && (
                  <p
                    style={{
                      fontFamily: GEORGIA,
                      fontStyle: "italic",
                      fontSize: 12,
                      color: SAGE,
                      margin: "8px 0 0",
                    }}
                  >
                    — {e.scriptureRef}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: "rgba(46,107,64,0.06)",
              border: "1px solid rgba(46,107,64,0.18)",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 24,
              fontFamily: GEORGIA,
              fontStyle: "italic",
              color: SAGE,
              fontSize: 14,
            }}
          >
            No intentions published for today yet — check back soon.
          </div>
        )}
        </>
        )}

        {/* Office entry points */}
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FAINT_GREEN,
            marginBottom: 8,
          }}
        >
          {user.accessTier === "offices-only" ? "Pray the office" : "Pray with your parish"}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          <OfficeButton
            label={isMorning ? "Morning Devotion" : "Evening Devotion"}
            sub="Short BCP form"
            href={
              isMorning
                ? "/bcp/daily-devotions?mode=morning-devotion"
                : "/bcp/daily-devotions?mode=early-evening-devotion"
            }
            primary
          />
          <OfficeButton
            label={isMorning ? "Morning Prayer" : "Evening Prayer"}
            sub="The full Daily Office"
            href={isMorning ? "/bcp/daily-office?mode=morning" : "/bcp/daily-office?mode=evening"}
          />
        </div>

        {/* Public prayer feeds — an offices-only member can follow
            public feeds; the feed's intercessions then join their
            daily office. */}
        {user.accessTier === "offices-only" && (
          <Link href="/prayer-feeds">
            <div
              style={{
                background: "rgba(46,107,64,0.10)",
                border: "1px solid rgba(46,107,64,0.25)",
                borderRadius: 16,
                padding: "16px 18px",
                cursor: "pointer",
              }}
            >
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>
                🌍 Explore prayer feeds
              </p>
              <p style={{ color: SAGE, fontSize: 12, margin: "4px 0 0" }}>
                Follow a public feed — its intercessions join your daily office.
              </p>
            </div>
          </Link>
        )}

        {/* Private prayer concern — visible only to the parish admin
            (the priest / pastor). The card is intentionally quieter
            than the office buttons: this is for when something is
            on your heart, not the daily rhythm. */}
        {data?.parish && <PrayerConcernCard parishId={data.parish.id} />}

        {/* Footer — quiet links */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <Link href="/bcp">
            <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
              Browse the Book of Common Prayer →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Inline composer for a private pastoral concern. The submission goes
// only to the parish admin — the body of the form makes that explicit
// so a parishioner doesn't worry the whole congregation is reading
// what they share. Empty / loading / submitted states all render in
// place to avoid a navigation away from the dashboard.
function PrayerConcernCard({ parishId }: { parishId: number }) {
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/parish/concerns", { parishId, body: body.trim() }),
    onSuccess: () => {
      setDone(true);
      setBody("");
    },
  });

  if (done) {
    return (
      <div
        style={{
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.25)",
          borderRadius: 16,
          padding: "16px",
          marginTop: 16,
          textAlign: "center",
        }}
      >
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: WARM_TEXT, margin: 0 }}>
          🌿 Shared with your parish admin.
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, color: SAGE, margin: "6px 0 0" }}>
          They'll be holding this for you.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 16,
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.25)",
          borderRadius: 16,
          padding: "16px",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: SPACE_GROTESK,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>
          🤲 Share something on your heart
        </p>
        <p style={{ fontSize: 12, color: SAGE, margin: "4px 0 0" }}>
          Private — goes only to your parish admin.
        </p>
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        background: "rgba(143,175,150,0.10)",
        border: "1px solid rgba(46,107,64,0.3)",
        borderRadius: 16,
        padding: "16px",
      }}
    >
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(143,175,150,0.7)",
          margin: 0,
          marginBottom: 8,
        }}
      >
        Private — to your parish admin
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="What's on your heart? 🌿"
        style={{
          width: "100%",
          background: "transparent",
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 14,
          lineHeight: 1.5,
          border: "none",
          outline: "none",
          resize: "none",
          padding: 0,
        }}
      />
      {submit.isError && (
        <p style={{ fontSize: 12, color: "#F87171", fontFamily: SPACE_GROTESK, margin: "6px 0 0" }}>
          Couldn't send. Try again?
        </p>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={() => { setOpen(false); setBody(""); }}
          disabled={submit.isPending}
          style={{
            background: "rgba(143,175,150,0.12)",
            color: SAGE,
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={!body.trim() || submit.isPending}
          style={{
            background: "#2D5E3F",
            color: WARM_TEXT,
            border: "none",
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
            opacity: !body.trim() || submit.isPending ? 0.4 : 1,
          }}
        >
          {submit.isPending ? "Sharing…" : "Share with admin"}
        </button>
      </div>
    </div>
  );
}

function OfficeButton({
  label,
  sub,
  href,
  primary,
}: {
  label: string;
  sub: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        style={{
          background: primary ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.10)",
          border: `1px solid ${primary ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.25)"}`,
          borderRadius: 16,
          padding: "16px 14px",
          cursor: "pointer",
          textAlign: "center",
          minHeight: 88,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 15,
            fontWeight: 600,
            color: WARM_TEXT,
            margin: 0,
          }}
        >
          {label}
        </p>
        <p style={{ color: SAGE, fontSize: 11, margin: 0 }}>{sub}</p>
      </div>
    </Link>
  );
}
