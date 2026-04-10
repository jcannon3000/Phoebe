/**
 * Lectio Divina — Sunday gathering view.
 *
 * /moments/:id/week/:sundayDate
 *
 * A purely contemplative read-only page showing a single Sunday's full
 * journey: the Gospel passage and all members' reflections across the three
 * stages (Lectio, Meditatio, Oratio). No buttons, no actions — just reading.
 *
 * Linked from the "Past readings" list on the Lectio detail page.
 */

import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

type Stage = "lectio" | "meditatio" | "oratio";
const STAGES: Stage[] = ["lectio", "meditatio", "oratio"];

interface SundayWeekData {
  moment: { id: number; name: string; templateType: string; timezone: string };
  userName: string;
  userToken: string;
  memberCount: number;
  reading: {
    sundayDate: string;
    sundayName: string;
    liturgicalSeason: string | null;
    liturgicalYear: string | null;
    gospelReference: string;
    gospelText: string;
    sourceUrl: string | null;
    fallbackReason: string | null;
  };
  stages: Record<
    Stage,
    {
      label: string;
      prompt: string;
      reflections: Array<{ userName: string; isYou: boolean; text: string; createdAt: string }>;
      nonSubmitterNames: string[];
    }
  >;
}

interface MomentLite {
  moment: {
    id: number;
    name: string;
    momentToken: string;
    templateType: string | null;
  };
  myUserToken: string | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatLong(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function LectioSundayView() {
  const { id, sundayDate } = useParams<{ id: string; sundayDate: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // First fetch the moment so we have momentToken + myUserToken
  const { data: momentData, isLoading: momentLoading } = useQuery<MomentLite>({
    queryKey: [`/api/moments/${id}`],
    queryFn: () => apiRequest<MomentLite>("GET", `/api/moments/${id}`),
    enabled: !!user && !!id,
  });

  const momentToken = momentData?.moment.momentToken;
  const userToken = momentData?.myUserToken;

  const { data: week, isLoading: weekLoading, error } = useQuery<SundayWeekData>({
    queryKey: [`/api/lectio/${momentToken}/${userToken}/week/${sundayDate}`],
    queryFn: () =>
      apiRequest<SundayWeekData>(
        "GET",
        `/api/lectio/${momentToken}/${userToken}/week/${sundayDate}`,
      ),
    enabled: !!momentToken && !!userToken && !!sundayDate,
  });

  if (authLoading || !user) return null;

  if (momentLoading || weekLoading) {
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

  if (error || !week) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center px-4">
          <Link
            href={`/moments/${id}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-block mb-5"
          >
            ← Back
          </Link>
          <p className="text-sm text-muted-foreground">
            We couldn't load this week's reading.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto w-full overflow-x-clip">
        {/* Quiet back link */}
        <Link
          href={`/moments/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6 transition-colors"
        >
          ← Back
        </Link>

        {/* Header — Sunday name + reference + date */}
        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-foreground mb-1 leading-tight">
            {week.reading.sundayName || "Sunday gathering"}
          </h1>
          {week.reading.gospelReference && (
            <p className="text-sm text-muted-foreground">{week.reading.gospelReference}</p>
          )}
          <p className="text-xs text-muted-foreground/60 mt-1">
            {formatLong(week.reading.sundayDate)}
          </p>
        </div>

        {/* Gospel passage — typeset for reading */}
        {week.reading.gospelText && (
          <div
            className="mb-8 rounded-2xl"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(200,212,192,0.25)",
              padding: 24,
            }}
          >
            <p
              className="uppercase mb-3"
              style={{
                color: "#8FAF96",
                fontSize: 11,
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              The Gospel
            </p>
            <p
              style={{
                color: "#F0EDE6",
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 17,
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {week.reading.gospelText}
            </p>
            {week.reading.sourceUrl && (
              <a
                href={week.reading.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-4 text-xs"
                style={{ color: "#8FAF96" }}
              >
                Source ↗
              </a>
            )}
          </div>
        )}

        {/* Three stages */}
        <div className="space-y-8">
          {STAGES.map((s) => {
            const sd = week.stages[s];
            return (
              <section key={s}>
                <h2
                  className="text-lg font-semibold mb-1"
                  style={{ color: "#F0EDE6" }}
                >
                  {sd.label}
                </h2>
                <p
                  className="italic mb-4"
                  style={{ color: "#8FAF96", fontSize: 13 }}
                >
                  {sd.prompt}
                </p>
                {sd.reflections.length > 0 ? (
                  <div className="space-y-4">
                    {sd.reflections.map((r, i) => (
                      <div
                        key={i}
                        className="rounded-2xl"
                        style={{
                          background: "#0F2818",
                          border: "1px solid rgba(200,212,192,0.18)",
                          padding: 18,
                        }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{
                              background: "rgba(168,197,160,0.18)",
                              color: "#A8C5A0",
                            }}
                          >
                            {initialsOf(r.userName)}
                          </div>
                          <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
                            {r.isYou ? "You" : r.userName.split(" ")[0]}
                          </p>
                        </div>
                        <p
                          style={{
                            color: "#E8E4DA",
                            fontFamily: "'EB Garamond', Georgia, serif",
                            fontSize: 16,
                            lineHeight: 1.7,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {r.text}
                        </p>
                      </div>
                    ))}
                    {sd.nonSubmitterNames.length > 0 && (
                      <p
                        className="text-xs px-1"
                        style={{ color: "rgba(143,175,150,0.55)" }}
                      >
                        {sd.nonSubmitterNames.join(", ")}{" "}
                        {sd.nonSubmitterNames.length === 1 ? "didn't" : "didn't"} reflect
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/60">
                    No reflections for this stage.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
