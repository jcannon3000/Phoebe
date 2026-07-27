import { useState } from "react";
import { useTranslation } from "react-i18next";
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

  contemplationExamenToday: number;
  contemplationExamenThisWeek: number;
  contemplationExamenTotal: number;

  prayerRequestsToday: number;
  prayerRequestsThisWeek: number;
  prayerRequestsTotal: number;

  openedToday: number;
  openedThisWeek: number;
  openedAllTime: number;

  opensToday: number;
  opensThisWeek: number;
  opensTotal: number;
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
  const { t } = useTranslation();
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

  // Delete a whole feed (cascades its intercessions + subscriptions +
  // tokens). The audit is the only surface that lists draft / platform
  // feeds, so it's the natural place to clean up stray ones. Keyed by
  // slug so the card can show per-row pending state.
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const deleteFeed = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/prayer-feeds/${slug}`),
    onSuccess: () => {
      setDeletingSlug(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feed-audit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/mine"] });
    },
    onError: () => setDeletingSlug(null),
  });

  if (!user) return null;
  if (!rawIsAdmin) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto pt-10">
          <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, textAlign: "center" }}>
            {t("admin_user_metrics.restricted")}
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
              ← {t("admin_user_metrics.back_to_admin_tools")}
            </span>
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: FAINT }}>
            {t("admin_user_metrics.eyebrow")}
          </p>
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: SPACE_GROTESK }}>
            {t("admin_user_metrics.title")} 📊
          </h1>
          <p className="text-sm mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {t("admin_user_metrics.subtitle")}
          </p>
        </div>

        {isLoading && (
          <p className="text-sm" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {t("admin_user_metrics.loading")}
          </p>
        )}
        {error && !isLoading && (
          <p className="text-sm" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
            {t("admin_user_metrics.load_error")}
          </p>
        )}

        {data && (
          <>
            <Section eyebrow={t("admin_user_metrics.section_people_praying")}>
              <TileRow today={data.prayedToday} week={data.prayedThisWeek} allTime={data.prayedAllTime} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_times_prayed")}
              caption={t("admin_user_metrics.caption_times_prayed")}
            >
              <TileRow today={data.timesPrayedToday} week={data.timesPrayedThisWeek} allTime={data.timesPrayedTotal} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_offices")}
              caption={t("admin_user_metrics.caption_offices")}
            >
              <TileRow today={data.officesToday} week={data.officesThisWeek} allTime={data.officesTotal} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_contemplation_examen")}
              caption={t("admin_user_metrics.caption_contemplation_examen")}
            >
              <TileRow today={data.contemplationExamenToday} week={data.contemplationExamenThisWeek} allTime={data.contemplationExamenTotal} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_prayer_requests")}
              caption={t("admin_user_metrics.caption_prayer_requests")}
            >
              <TileRow today={data.prayerRequestsToday} week={data.prayerRequestsThisWeek} allTime={data.prayerRequestsTotal} />
            </Section>

            <Section eyebrow={t("admin_user_metrics.section_users")}>
              <TileRow today={data.newUsersToday} week={data.newUsersThisWeek} allTime={data.totalUsers} allTimeLabel={t("admin_user_metrics.total")} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_opened_app")}
              caption={t("admin_user_metrics.caption_opened_app")}
            >
              <TileRow today={data.openedToday} week={data.openedThisWeek} allTime={data.openedAllTime} />
            </Section>

            <Section
              eyebrow={t("admin_user_metrics.section_times_opened")}
              caption={t("admin_user_metrics.caption_times_opened")}
            >
              <TileRow today={data.opensToday} week={data.opensThisWeek} allTime={data.opensTotal} />
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
                {t("admin_user_metrics.feed_audit_header", { count: audit.feedCount })}
              </p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.10)" }} />
            </div>

            {(audit.duplicateSlugs.length > 0 || audit.duplicateTitles.length > 0) && (
              <div
                className="rounded-xl px-4 py-3 mb-3"
                style={{ background: "rgba(193,154,58,0.12)", border: "1px solid rgba(193,154,58,0.35)" }}
              >
                <p className="text-[13px] font-semibold" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
                  ⚠️ {t("admin_user_metrics.duplicate_feeds_detected")}
                </p>
                {audit.duplicateSlugs.length > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {t("admin_user_metrics.same_slug", { slugs: audit.duplicateSlugs.join(", ") })}
                  </p>
                )}
                {audit.duplicateTitles.length > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {t("admin_user_metrics.same_title", { titles: audit.duplicateTitles.join(", ") })}
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
                    {t("admin_user_metrics.subscribers", { count: f.realSubscriptions })}
                    {f.subscriberCountColumn !== f.realSubscriptions && (
                      <span style={{ color: "#E8B872" }}> {t("admin_user_metrics.cached_column_says", { count: f.subscriberCountColumn })}</span>
                    )}
                    {" · "}{t("admin_user_metrics.intercessions", { count: f.intercessionCount })}
                    {" · "}{t("admin_user_metrics.token_holders", { count: f.tokenHolders })}
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
                    {t("admin_user_metrics.bound_groups", { groups: f.boundGroups.length > 0 ? f.boundGroups.map(g => g.slug).join(", ") : t("admin_user_metrics.none") })}
                  </p>
                  {f.leakCount > 0 ? (
                    <div className="mt-2">
                      <p className="text-[12px] font-semibold" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
                        ⚠️ {t("admin_user_metrics.praying_without_access", { count: f.leakCount })}
                      </p>
                      <p className="text-[11px] mt-1 break-words" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                        {f.leakEmails.join(", ")}{f.leakCount > f.leakEmails.length ? " …" : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12px] mt-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      ✓ {t("admin_user_metrics.all_token_holders_ok")}
                    </p>
                  )}
                  {/* Delete — cascades the feed's intercessions,
                      subscriptions, and tokens. The confirm spells out
                      exactly what's lost so a live feed with content
                      isn't wiped on a misclick. */}
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const msg = t("admin_user_metrics.delete_confirm", {
                          title: f.title,
                          slug: f.slug,
                          subscribers: f.realSubscriptions,
                          intercessions: f.intercessionCount,
                        });
                        if (typeof window !== "undefined" && !window.confirm(msg)) return;
                        setDeletingSlug(f.slug);
                        deleteFeed.mutate(f.slug);
                      }}
                      disabled={deletingSlug === f.slug}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{
                        background: "rgba(168,72,72,0.14)",
                        border: "1px solid rgba(168,72,72,0.4)",
                        color: "#E8B0B0",
                        fontFamily: SPACE_GROTESK,
                      }}
                    >
                      {deletingSlug === f.slug ? t("admin_user_metrics.deleting") : t("admin_user_metrics.delete_feed")}
                    </button>
                  </div>
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
                {repair.isPending ? t("admin_user_metrics.working") : t("admin_user_metrics.preview_repair")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && !window.confirm(t("admin_user_metrics.apply_repair_confirm"))) return;
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
                {t("admin_user_metrics.apply_repair")}
              </button>
            </div>

            {repairReport && (
              <div
                className="mt-3 rounded-xl px-4 py-3"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
              >
                <p className="text-[12px] font-semibold mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {repairReport.applied ? t("admin_user_metrics.repair_applied") : t("admin_user_metrics.dry_run_no_changes")}
                </p>
                {repairReport.report.map((r) => (
                  <p key={r.feedId} className="text-[12px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {r.title}: {t("admin_user_metrics.orphan_tokens_pruned", { count: r.orphanTokensPruned })}
                    {r.subscriberCountBefore !== r.subscriberCountAfter && (
                      <> · {t("admin_user_metrics.subscriber_count_change", { before: r.subscriberCountBefore, after: r.subscriberCountAfter })}</>
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
  allTimeLabel,
}: {
  today: number;
  week: number;
  allTime: number;
  allTimeLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label={t("admin_user_metrics.tile_today")} value={today} />
      <Tile label={t("admin_user_metrics.tile_this_week")} value={week} />
      <Tile label={allTimeLabel ?? t("admin_user_metrics.tile_all_time")} value={allTime} />
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
