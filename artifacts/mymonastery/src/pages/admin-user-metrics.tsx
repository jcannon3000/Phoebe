import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

// Admin User Metrics — gated to beta admins (server-side gate via
// /api/admin/user-metrics; we ALSO hide the page client-side so a
// non-admin opening the URL directly doesn't see a 403 toast). Same
// page-chrome conventions as the Reports / Pilot Users / Waitlist
// surfaces so the admin tools all feel like siblings.

const SPACE_GROTESK = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

type UserRow = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  tier: "full" | "offices-only" | "parish-only" | "unassigned" | string;
  lastActiveAt: string | null;
  sessionsLast7: number;
  sessionsLast30: number;
  prayerRequestsTotal: number;
  amensGivenTotal: number;
  communityCount: number;
  fellowCount: number;
};
type MetricsResponse = {
  summary: {
    totalUsers: number;
    tierFull: number;
    tierOfficesOnly: number;
    tierParishOnly: number;
    tierUnassigned: number;
    activeLast7: number;
    activeLast30: number;
    newLast7: number;
    newLast30: number;
  };
  users: UserRow[];
};

type SortKey = "lastActive" | "created" | "requests" | "amens" | "fellows" | "communities";

export default function AdminUserMetricsPage() {
  const { user } = useAuth();
  const { rawIsAdmin } = useBetaStatus();

  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/user-metrics"],
    queryFn: () => apiRequest("GET", "/api/admin/user-metrics"),
    enabled: !!user && rawIsAdmin,
    staleTime: 60_000,
  });

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActive");
  const [tierFilter, setTierFilter] = useState<"all" | "full" | "offices-only" | "parish-only" | "unassigned">("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.users;
    if (tierFilter !== "all") rows = rows.filter(r => r.tier === tierFilter);
    if (q) {
      rows = rows.filter(r =>
        (r.name ?? "").toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
      );
    }
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "lastActive": {
          const la = a.lastActiveAt ?? "";
          const lb = b.lastActiveAt ?? "";
          return lb.localeCompare(la);
        }
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        case "requests":
          return b.prayerRequestsTotal - a.prayerRequestsTotal;
        case "amens":
          return b.amensGivenTotal - a.amensGivenTotal;
        case "fellows":
          return b.fellowCount - a.fellowCount;
        case "communities":
          return b.communityCount - a.communityCount;
      }
    });
    return rows;
  }, [data, query, sortKey, tierFilter]);

  if (!user) return null;
  if (!rawIsAdmin) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto pt-10">
          <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, textAlign: "center" }}>
            This surface is restricted to administrators.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto w-full pb-20">
        {/* Back to admin tools */}
        <div className="mb-4">
          <Link href="/admin/tools">
            <span style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 13, cursor: "pointer" }}>
              ← Admin tools
            </span>
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: FAINT }}>
            Admin · Engagement
          </p>
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: SPACE_GROTESK }}>
            User metrics 📊
          </h1>
        </div>

        {/* Summary tiles. Tier breakdown + active-window counts + new-
            signup counts. Soft cards in a wrap-flex so they reflow on
            narrow widths. */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            <Stat label="Total users" value={data.summary.totalUsers} />
            <Stat label="Active · 7 days" value={data.summary.activeLast7} />
            <Stat label="Active · 30 days" value={data.summary.activeLast30} />
            <Stat label="New · 30 days" value={data.summary.newLast30} />
            <Stat label="Full tier" value={data.summary.tierFull} />
            <Stat label="Offices-only" value={data.summary.tierOfficesOnly} />
            <Stat label="Parish-only" value={data.summary.tierParishOnly} />
            <Stat label="Unassigned" value={data.summary.tierUnassigned} />
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[200px] text-sm px-3 py-2 rounded-xl outline-none"
            style={{
              background: "rgba(15,40,24,0.65)",
              border: "1px solid rgba(46,107,64,0.3)",
              color: WARM,
              fontFamily: SPACE_GROTESK,
            }}
          />
          <Select value={tierFilter} onChange={(v) => setTierFilter(v as typeof tierFilter)}>
            <option value="all">All tiers</option>
            <option value="full">Full</option>
            <option value="offices-only">Offices-only</option>
            <option value="parish-only">Parish-only</option>
            <option value="unassigned">Unassigned</option>
          </Select>
          <Select value={sortKey} onChange={(v) => setSortKey(v as SortKey)}>
            <option value="lastActive">Sort: Last active</option>
            <option value="created">Sort: Newest signup</option>
            <option value="requests">Sort: Most requests</option>
            <option value="amens">Sort: Most amens</option>
            <option value="fellows">Sort: Most fellows</option>
            <option value="communities">Sort: Most communities</option>
          </Select>
        </div>

        {isLoading && (
          <p className="text-sm" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            Loading metrics…
          </p>
        )}
        {error && !isLoading && (
          <p className="text-sm" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
            Couldn&rsquo;t load metrics. Try refreshing.
          </p>
        )}

        {data && (
          <p className="text-[11px] mb-3" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
            Showing {filtered.length} of {data.summary.totalUsers}
          </p>
        )}

        {data && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
          >
            <div
              className="grid items-center px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
              style={{
                color: FAINT,
                fontFamily: SPACE_GROTESK,
                gridTemplateColumns: "minmax(180px, 2fr) 100px 130px 70px 70px 70px 70px",
                borderBottom: "1px solid rgba(46,107,64,0.2)",
              }}
            >
              <span>User</span>
              <span>Tier</span>
              <span>Last active</span>
              <span style={{ textAlign: "right" }}>Reqs</span>
              <span style={{ textAlign: "right" }}>Amens</span>
              <span style={{ textAlign: "right" }}>Fellows</span>
              <span style={{ textAlign: "right" }}>Comms</span>
            </div>
            <div style={{ maxHeight: "65vh", overflowY: "auto" }}>
              {filtered.map((u) => (
                <UserMetricRow key={u.id} row={u} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.22)",
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
        {label}
      </p>
      <p className="text-[20px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm px-3 py-2 rounded-xl outline-none"
      style={{
        background: "rgba(15,40,24,0.65)",
        border: "1px solid rgba(46,107,64,0.3)",
        color: WARM,
        fontFamily: SPACE_GROTESK,
      }}
    >
      {children}
    </select>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function tierColor(tier: string) {
  switch (tier) {
    case "full": return { bg: "rgba(46,107,64,0.22)", fg: "#A8C5A0" };
    case "offices-only": return { bg: "rgba(143,175,150,0.14)", fg: "#8FAF96" };
    case "parish-only": return { bg: "rgba(168,140,90,0.18)", fg: "#C4A57F" };
    default: return { bg: "rgba(143,175,150,0.10)", fg: "rgba(200,212,192,0.6)" };
  }
}

function UserMetricRow({ row }: { row: UserRow }) {
  const colors = tierColor(row.tier);
  return (
    <div
      className="grid items-center px-3 py-2 text-[13px]"
      style={{
        color: WARM,
        fontFamily: SPACE_GROTESK,
        gridTemplateColumns: "minmax(180px, 2fr) 100px 130px 70px 70px 70px 70px",
        borderBottom: "1px solid rgba(46,107,64,0.10)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {row.avatarUrl ? (
          <img
            src={row.avatarUrl}
            alt={row.name ?? ""}
            className="w-7 h-7 rounded-full object-cover shrink-0"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
            style={{ background: "#1A4A2E", color: "#A8C5A0" }}
          >
            {(row.name ?? row.email ?? "?").trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate" style={{ color: WARM }}>{row.name ?? "—"}</p>
          <p className="truncate text-[11px]" style={{ color: FAINT }}>{row.email}</p>
        </div>
      </div>
      <span
        className="text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full inline-block"
        style={{ background: colors.bg, color: colors.fg, width: "fit-content" }}
      >
        {row.tier}
      </span>
      <span style={{ color: FAINT }}>{formatRelative(row.lastActiveAt)}</span>
      <span style={{ textAlign: "right", color: WARM }} className="tabular-nums">{row.prayerRequestsTotal}</span>
      <span style={{ textAlign: "right", color: WARM }} className="tabular-nums">{row.amensGivenTotal}</span>
      <span style={{ textAlign: "right", color: WARM }} className="tabular-nums">{row.fellowCount}</span>
      <span style={{ textAlign: "right", color: WARM }} className="tabular-nums">{row.communityCount}</span>
    </div>
  );
}
