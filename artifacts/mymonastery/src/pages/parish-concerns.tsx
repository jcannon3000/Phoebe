/**
 * Phoebe Parish — pastoral concerns inbox for parish admins.
 *
 * Lists every prayer request submitted privately by a parishioner via
 * the /parish dashboard "Share something on your heart" card. The
 * inbox is admin-only (canManageParish on the server). Each concern
 * carries the requester's name + avatar (unless anonymous) so the
 * admin can reach out pastorally; a "Mark resolved" action closes
 * the row so it drops out of the active list.
 *
 * These requests are NEVER surfaced anywhere else — not in the
 * admin's own community slideshow, not on anyone else's prayer
 * list, not in the office intercessions. The garden / slideshow /
 * intercession queries filter on parish_feed_id IS NULL, which
 * keeps this inbox the only place they can be read.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ChevronLeft } from "lucide-react";

const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";

type AdminParish = {
  id: number;
  slug: string;
  title: string;
};

type Concern = {
  id: number;
  body: string;
  isAnonymous: boolean;
  isAnswered: boolean;
  createdAt: string;
  owner: { id: number; name: string | null; avatarUrl: string | null; email: string } | null;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ParishConcernsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // The page works for any admin-manageable parish; if a beta admin
  // oversees multiple parishes, they need to pick one first. Most
  // admins only manage their own parish so we default to the first
  // entry in /parish/admin/parishes.
  const parishesQuery = useQuery<{ parishes: AdminParish[]; isStaffAdmin: boolean }>({
    queryKey: ["/api/parish/admin/parishes"],
    queryFn: () => apiRequest("GET", "/api/parish/admin/parishes"),
    enabled: !!user,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const effectiveId = selectedId ?? parishesQuery.data?.parishes[0]?.id ?? null;

  const concernsQuery = useQuery<{ concerns: Concern[] }>({
    queryKey: ["/api/parish/admin/concerns", effectiveId],
    queryFn: () => apiRequest("GET", `/api/parish/admin/concerns?parishId=${effectiveId}`),
    enabled: !!effectiveId,
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/parish/admin/concerns/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/parish/admin/concerns", effectiveId] });
    },
  });

  if (isLoading) return null;
  if (!user) { setLocation("/"); return null; }

  const parishes = parishesQuery.data?.parishes ?? [];
  const noAccess = !parishesQuery.isLoading && parishes.length === 0;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-5 pb-24">
        <Link
          href="/parish"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition-opacity hover:opacity-80"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          <ChevronLeft size={14} />
          Back
        </Link>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
        >
          Pastoral concerns
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          Private prayer requests from your parish. Only you see these.
        </p>

        {parishes.length > 1 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {parishes.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity"
                style={{
                  background: effectiveId === p.id ? "#2D5E3F" : "rgba(46,107,64,0.15)",
                  color: effectiveId === p.id ? WARM_TEXT : SAGE,
                  border: `1px solid ${effectiveId === p.id ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
                  fontFamily: SPACE_GROTESK,
                  cursor: "pointer",
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {noAccess && (
          <p className="text-sm italic" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
            You don't have admin access to any parish.
          </p>
        )}

        {concernsQuery.isLoading && (
          <p className="text-sm" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
            Loading…
          </p>
        )}

        {concernsQuery.data?.concerns.length === 0 && (
          <p className="text-sm italic mt-6" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
            No active concerns right now. 🌿
          </p>
        )}

        <div className="flex flex-col gap-3">
          {concernsQuery.data?.concerns.map((c) => (
            <div
              key={c.id}
              className="rounded-xl px-4 py-3.5"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.22)",
              }}
            >
              <div className="flex items-start gap-3 mb-2">
                {c.owner?.avatarUrl ? (
                  <img
                    src={c.owner.avatarUrl}
                    alt={c.owner.name ?? c.owner.email}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                    style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                  >
                    {c.isAnonymous
                      ? "·"
                      : (c.owner?.name ?? c.owner?.email ?? "?")
                          .split(/\s+/).slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? "")
                          .join("")}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
                  >
                    {c.isAnonymous ? "Anonymous parishioner" : (c.owner?.name ?? c.owner?.email ?? "Unknown")}
                  </p>
                  <p
                    className="text-[11px]"
                    style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
                  >
                    {relativeTime(c.createdAt)}
                  </p>
                </div>
              </div>
              <p
                className="text-[15px] leading-relaxed mb-3"
                style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, whiteSpace: "pre-wrap" }}
              >
                {c.body}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => closeMutation.mutate(c.id)}
                  disabled={closeMutation.isPending}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity"
                  style={{
                    background: "rgba(143,175,150,0.12)",
                    color: SAGE,
                    border: "1px solid rgba(46,107,64,0.25)",
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                  }}
                >
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
