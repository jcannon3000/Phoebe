import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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

export default function AdminAppMetricsPage() {
  const { user } = useAuth();
  const { rawIsAdmin } = useBetaStatus();

  const { data, isLoading, error } = useQuery<AppMetrics>({
    queryKey: ["/api/admin/metrics"],
    queryFn: () => apiRequest("GET", "/api/admin/metrics"),
    enabled: !!user && rawIsAdmin,
    staleTime: 60_000,
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
