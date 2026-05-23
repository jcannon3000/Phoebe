import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

// Admin App Metrics — whole-app Today / This Week / All Time tile
// view, mirroring the per-community metrics dashboard layout exactly
// so the two surfaces tell the same story at different scopes.
//
// Gated to beta admins (server-side gate via /api/admin/metrics; we
// ALSO hide the page client-side so a non-admin opening the URL
// directly doesn't see a 403 toast). Layout conventions match the
// other admin tools (Reports / Pilot Users / Waitlist).

const SPACE_GROTESK = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

type AppMetrics = {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;

  prayedToday: number;
  prayedThisWeek: number;
  prayedAllTime: number;

  timesPrayedToday: number;
  timesPrayedThisWeek: number;
  timesPrayedTotal: number;

  officesToday: number;
  officesThisWeek: number;
  officesTotal: number;

  prayerRequestsToday: number;
  prayerRequestsThisWeek: number;
  prayerRequestsTotal: number;
};

type FeedAuditRow = {
  id: number;
  slug: string;
  title: string;
  state: string;
  creatorUserId: number | null;
  subscriberCountColumn: number;
  realSubscriptions: number;
  boundGroups: Array<{ id: number; slug: string; name: string }>;
  intercessionCount: number;
  tokenHolders: number;
  leakCount: number;
  leakEmails: string[];
};
type FeedAudit = {
  feedCount: number;
  duplicateSlugs: string[];
  duplicateTitles: string[];
  feeds: FeedAuditRow[];
};

type FeedRepairResult = {
  applied: boolean;
  report: Array<{
    feedId: number;
    slug: string;
    title: string;
    orphanTokensPruned: number;
    subscriberCountBefore: number;
    subscriberCountAfter: number;
  }>;
};

export default function AdminAppMetricsPage() {
  const { user } = useAuth();
  const { rawIsAdmin } = useBetaStatus();

  const { data, isLoading, error } = useQuery<AppMetrics>({
    queryKey: ["/api/admin/metrics"],
    queryFn: () => apiRequest("GET", "/api/admin/metrics"),
    enabled: !!user && rawIsAdmin,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();
  const { data: audit } = useQuery<FeedAudit>({
    queryKey: ["/api/admin/feed-audit"],
    queryFn: () => apiRequest("GET", "/api/admin/feed-audit"),
    enabled: !!user && rawIsAdmin,
    staleTime: 60_000,
  });

  // Repair: dry-run first (apply:false) to preview the prune counts,
  // then apply:true to actually prune orphan tokens + resync the
  // cached subscriber_count. We keep the latest report in state so
  // the admin can read what would change before committing.
  const [repairReport, setRepairReport] = useState<FeedRepairResult | null>(null);
  const repair = useMutation({
    mutationFn: (apply: boolean) =>
      apiRequest("POST", "/api/admin/feed-repair", { apply }) as Promise<FeedRepairResult>,
    onSuccess: (res) => {
      setRepairReport(res);
      if (res.applied) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-audit"] });
      }
    },
  });

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
      <div className="max-w-3xl mx-auto w-full pb-20">
        {/* Back to admin tools — same chrome rhythm as Pilot Users /
            Waitlist / Newsletter. */}
        <div className="mb-4">
          <Link href="/admin/tools">
            <span style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 13, cursor: "pointer" }}>
              ← Admin tools
            </span>
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: FAINT }}>
            Admin · App Metrics
          </p>
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: SPACE_GROTESK }}>
            App Metrics 📊
          </h1>
          <p className="text-sm mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            Today, this week, all time — across every user on Phoebe.
          </p>
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
          <>
            <Section eyebrow="People praying">
              <TileRow today={data.prayedToday} week={data.prayedThisWeek} allTime={data.prayedAllTime} />
            </Section>

            <Section
              eyebrow="Times prayed"
              caption="One session per Amen tap or full-office reading (≥3 slides). Multiple sessions within 15 minutes for the same person collapse to one."
            >
              <TileRow today={data.timesPrayedToday} week={data.timesPrayedThisWeek} allTime={data.timesPrayedTotal} />
            </Section>

            <Section
              eyebrow="Offices"
              caption="Daily Office / Devotion completions. Up to two per person per day (morning + evening). Reaching ≥3 slides counts."
            >
              <TileRow today={data.officesToday} week={data.officesThisWeek} allTime={data.officesTotal} />
            </Section>

            <Section eyebrow="Prayer requests">
              <TileRow today={data.prayerRequestsToday} week={data.prayerRequestsThisWeek} allTime={data.prayerRequestsTotal} />
            </Section>

            <Section eyebrow="Users">
              <TileRow today={data.newUsersToday} week={data.newUsersThisWeek} allTime={data.totalUsers} allTimeLabel="Total" />
            </Section>
          </>
        )}

        {/* Feed audit — surfaces duplicate feed rows + subscriber/group
            /token reconciliation so the "Manage shows 2 feeds" and
            "people praying without being subscribed" issues are
            diagnosable at a glance. */}
        {audit && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-2">
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{ color: FAINT, fontFamily: SPACE_GROTESK }}
              >
                Feed audit · {audit.feedCount} {audit.feedCount === 1 ? "feed" : "feeds"}
              </p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.10)" }} />
            </div>

            {(audit.duplicateSlugs.length > 0 || audit.duplicateTitles.length > 0) && (
              <div
                className="rounded-xl px-4 py-3 mb-3"
                style={{ background: "rgba(193,154,58,0.12)", border: "1px solid rgba(193,154,58,0.35)" }}
              >
                <p className="text-[13px] font-semibold" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
                  ⚠️ Duplicate feeds detected
                </p>
                {audit.duplicateSlugs.length > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    Same slug: {audit.duplicateSlugs.join(", ")}
                  </p>
                )}
                {audit.duplicateTitles.length > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    Same title: {audit.duplicateTitles.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {audit.feeds.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(46,107,64,0.10)",
                    border: `1px solid ${f.leakCount > 0 ? "rgba(193,154,58,0.45)" : "rgba(46,107,64,0.22)"}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                      {f.title}
                    </p>
                    <span className="text-[11px]" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
                      #{f.id} · {f.slug} · {f.state}
                    </span>
                  </div>
                  <p className="text-[12px] mt-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {f.realSubscriptions} subscribers
                    {f.subscriberCountColumn !== f.realSubscriptions && (
                      <span style={{ color: "#E8B872" }}> (cached column says {f.subscriberCountColumn})</span>
                    )}
                    {" · "}{f.intercessionCount} intercessions
                    {" · "}{f.tokenHolders} token-holders
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
                    Bound groups: {f.boundGroups.length > 0 ? f.boundGroups.map(g => g.slug).join(", ") : "(none)"}
                  </p>
                  {f.leakCount > 0 ? (
                    <div className="mt-2">
                      <p className="text-[12px] font-semibold" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
                        ⚠️ {f.leakCount} praying without subscription or bound-group membership
                      </p>
                      <p className="text-[11px] mt-1 break-words" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                        {f.leakEmails.join(", ")}{f.leakCount > f.leakEmails.length ? " …" : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12px] mt-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      ✓ every token-holder is a subscriber or bound-group member
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Repair controls — dry-run preview then apply. Prunes
                orphan feed tokens (people praying without a
                subscription or bound-group membership) and resyncs
                the cached subscriber_count column. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => repair.mutate(false)}
                disabled={repair.isPending}
                className="text-[12px] font-medium px-3 py-2 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#C8D4C0",
                  fontFamily: SPACE_GROTESK,
                }}
              >
                {repair.isPending ? "Working…" : "Preview repair (dry run)"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && !window.confirm("Prune orphan feed tokens and resync subscriber counts? This revokes feed access for anyone who isn't a subscriber or bound-group member.")) return;
                  repair.mutate(true);
                }}
                disabled={repair.isPending}
                className="text-[12px] font-medium px-3 py-2 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "rgba(193,154,58,0.18)",
                  border: "1px solid rgba(193,154,58,0.45)",
                  color: "#E8B872",
                  fontFamily: SPACE_GROTESK,
                }}
              >
                Apply repair
              </button>
            </div>

            {repairReport && (
              <div
                className="mt-3 rounded-xl px-4 py-3"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
              >
                <p className="text-[12px] font-semibold mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {repairReport.applied ? "Repair applied" : "Dry run — nothing changed yet"}
                </p>
                {repairReport.report.map((r) => (
                  <p key={r.feedId} className="text-[12px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {r.title}: {r.orphanTokensPruned} orphan token{r.orphanTokensPruned === 1 ? "" : "s"}
                    {r.subscriberCountBefore !== r.subscriberCountAfter && (
                      <> · subscriber_count {r.subscriberCountBefore} → {r.subscriberCountAfter}</>
                    )}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function Section({
  eyebrow,
  caption,
  children,
}: {
  eyebrow: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: FAINT, fontFamily: SPACE_GROTESK }}
        >
          {eyebrow}
        </p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.10)" }} />
      </div>
      {caption && (
        <p
          className="text-[13px] mb-3"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: 1.55 }}
        >
          {caption}
        </p>
      )}
      {children}
    </div>
  );
}

function TileRow({
  today,
  week,
  allTime,
  allTimeLabel = "All time",
}: {
  today: number;
  week: number;
  allTime: number;
  allTimeLabel?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label="Today" value={today} />
      <Tile label="This week" value={week} />
      <Tile label={allTimeLabel} value={allTime} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl px-4 py-5 text-center"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.22)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
        style={{ color: FAINT, fontFamily: SPACE_GROTESK }}
      >
        {label}
      </p>
      <p
        className="text-[32px] font-semibold tabular-nums"
        style={{ color: WARM, fontFamily: SPACE_GROTESK, lineHeight: 1 }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
