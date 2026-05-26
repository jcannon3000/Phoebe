/**
 * Phoebe Parish — onboarding / parish picker.
 *
 * Lands here when an authenticated user has no parish_feed_id set yet
 * AND isn't in the full app tier. Lists every approved parish (live,
 * kind="parish") and lets them pick one. Submitting writes to
 * users.parish_feed_id + creates a prayer_feed_subscription row.
 *
 * Single-parish constraint: the picker is exclusive (radio-style),
 * not multi-select, and the back-end rejects a second pick if the
 * column already has a value.
 *
 * Phoebe staff approve / provision parishes (no self-serve creation
 * surface here) — the public list is filtered to state="live".
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface ParishCard {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  coverEmoji: string | null;
  subscriberCount: number;
}

export default function ParishOnboarding() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading || betaLoading) return;
    if (!user) { setLocation("/"); return; }
    // Already has a parish — they don't belong on the picker.
    if (user.accessTier === "parish-only") { setLocation("/parish"); return; }
    // Full-app users get bounced UNLESS they're in the beta — beta
    // users are full-tier (beta wins the tier derivation) but should
    // still be able to walk the parish picker as a preview, and
    // POST /api/parish/subscribe is itself beta-gated on the server.
    if (user.accessTier === "full" && !rawIsBeta) { setLocation("/dashboard"); return; }
  }, [user, authLoading, betaLoading, rawIsBeta, setLocation]);

  const parishesQuery = useQuery<{ parishes: ParishCard[] }>({
    queryKey: ["/api/parishes/public"],
    queryFn: () => apiRequest("GET", "/api/parishes/public"),
    enabled: !!user,
  });

  const subscribeMutation = useMutation({
    mutationFn: (parishId: number) =>
      apiRequest("POST", "/api/parish/subscribe", { parishId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/parish");
    },
  });

  if (authLoading || !user) return null;

  const parishes = parishesQuery.data?.parishes ?? [];
  const canSubmit = selected !== null && !subscribeMutation.isPending;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT }}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          padding: "calc(env(safe-area-inset-top) + 32px) 20px calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        <h1
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: WARM_TEXT,
            margin: 0,
            marginBottom: 8,
          }}
        >
          Choose your parish
        </h1>
        <p
          style={{
            fontFamily: GEORGIA,
            fontStyle: "italic",
            color: SAGE,
            fontSize: 15,
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 28,
          }}
        >
          Pray the Daily Office and Devotions alongside your congregation.
          You can change this later.
        </p>

        {parishesQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 76,
                  borderRadius: 16,
                  background: "#0F2818",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        ) : parishes.length === 0 ? (
          <div
            style={{
              background: "rgba(46,107,64,0.06)",
              border: "1px solid rgba(46,107,64,0.18)",
              borderRadius: 16,
              padding: 20,
              fontFamily: GEORGIA,
              fontStyle: "italic",
              color: SAGE,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            No parishes are available yet — Phoebe staff are still
            approving congregations. Check back soon.
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {parishes.map((p) => {
              const isSelected = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  style={{
                    width: "100%",
                    background: isSelected ? "rgba(46,107,64,0.25)" : "#0F2818",
                    border: `1px solid ${isSelected ? "rgba(46,107,64,0.55)" : "rgba(200,212,192,0.15)"}`,
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: WARM_TEXT,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "background 0.18s, border-color 0.18s",
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      width: 44,
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      background: "rgba(46,107,64,0.18)",
                      flexShrink: 0,
                    }}
                  >
                    {p.coverEmoji ?? "⛪"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: SPACE_GROTESK,
                        fontWeight: 600,
                        fontSize: 15,
                        color: WARM_TEXT,
                        margin: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.title}
                    </p>
                    {p.tagline && (
                      <p
                        style={{
                          color: SAGE,
                          fontSize: 12,
                          margin: "2px 0 0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.tagline}
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                      background: isSelected ? "#A8C5A0" : "transparent",
                      flexShrink: 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => selected !== null && subscribeMutation.mutate(selected)}
          style={{
            width: "100%",
            background: canSubmit ? "#3E7C7A" : "rgba(62,124,122,0.3)",
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            borderRadius: 999,
            padding: "14px 24px",
            cursor: canSubmit ? "pointer" : "not-allowed",
            marginTop: 8,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {subscribeMutation.isPending ? "Joining…" : "Continue"}
        </button>

        {subscribeMutation.isError && (
          <p
            style={{
              color: "#E57373",
              fontSize: 13,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            Couldn't join that parish. Please try again.
          </p>
        )}

        <p
          style={{
            color: FAINT_GREEN,
            fontSize: 12,
            textAlign: "center",
            marginTop: 24,
            fontFamily: GEORGIA,
            fontStyle: "italic",
          }}
        >
          Don't see your parish? Ask your clergy to reach out.
        </p>
      </div>
    </div>
  );
}
