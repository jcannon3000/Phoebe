import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

/**
 * Admin App Metrics — /admin/users.
 *
 * Owner (2026-09-16): "there are just a lot of overlapping categories and
 * redundancies and it's confusing, simplify it and make it clearer what each
 * is." The page had thirteen sections of three tiles: every "without an
 * account" section repeated the one above it as a subset, the Dean's "days
 * read" repeated "readers", and People praying / Times prayed / Offices /
 * Contemplation were four units side by side with nothing saying so.
 *
 * Now three groups, each in ONE unit, and the unit is on the tile:
 *   People       — who opened the app, who kept a practice, accounts; phones
 *                  without an account are a line under each number, not a
 *                  section of their own.
 *   Practices    — a practice KEPT, once per person, per practice, per day
 *                  (lib/appMetricsSql.ts on the server); the total, then a
 *                  breakdown whose rows add up to it.
 *   The Dean's Commentary — its readers, with reader-days as a line under.
 * Community tools (prayer requests, the feed audit and repair) are folded
 * away: the features are off for everyone.
 *
 * Gated to beta admins server-side (/api/admin/metrics); hidden client-side
 * too so a non-admin opening the URL doesn't meet a 403 toast.
 */

const SPACE_GROTESK = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

type Window3 = { today: number; week: number; month: number };
type Totals3 = { today: number; week: number; total: number };

type AppMetrics = {
  windows: { tz: string; today: string; weekStart: string; monthStart: string };
  people: {
    opened: Window3;
    openedWithoutAccount: Window3;
    prayed: Window3;
    prayedWithoutAccount: Window3;
    accounts: Totals3;
    withoutAccount: Totals3;
  };
  opens: Window3;
  practices: {
    all: Window3;
    offices: Window3;
    contemplation: Window3;
    examen: Window3;
    readings: Window3;
    prayerList: Window3;
    other: Window3;
  };
  deans: { readers: Window3; readerDays: { week: number; month: number } };
  community: { prayerRequestsTotal: number; prayerRequestsToday: number; prayerRequestsWeek: number };
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

  // Community tools are off for everyone; the audit is fetched only when the
  // admin unfolds them.
  const [showCommunity, setShowCommunity] = useState(false);
  const queryClient = useQueryClient();
  const { data: audit } = useQuery<FeedAudit>({
    queryKey: ["/api/admin/feed-audit"],
    queryFn: () => apiRequest("GET", "/api/admin/feed-audit"),
    enabled: !!user && rawIsAdmin && showCommunity,
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

  const without = (n: number) => t("admin_user_metrics.sub_without_account", { count: n });
  const perReader = (days: number, readers: number) =>
    t("admin_user_metrics.sub_reader_days", { count: days, avg: readers > 0 ? (days / readers).toFixed(1) : "0" });

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
            {/* ── People ─────────────────────────────────────────────── */}
            <Group title={t("admin_user_metrics.group_people")}>
              <Row
                label={t("admin_user_metrics.row_opened")}
                caption={t("admin_user_metrics.caption_opened")}
                unit={t("admin_user_metrics.unit_people")}
                tiles={windowTiles(t, data.people.opened, data.people.openedWithoutAccount, without)}
              />
              <Row
                label={t("admin_user_metrics.row_prayed")}
                caption={t("admin_user_metrics.caption_prayed")}
                unit={t("admin_user_metrics.unit_people")}
                tiles={windowTiles(t, data.people.prayed, data.people.prayedWithoutAccount, without)}
              />
              <Row
                label={t("admin_user_metrics.row_accounts")}
                caption={t("admin_user_metrics.caption_accounts")}
                unit={t("admin_user_metrics.unit_people")}
                tiles={[
                  { label: t("admin_user_metrics.tile_today"), value: data.people.accounts.today, sub: t("admin_user_metrics.sub_new_devices", { count: data.people.withoutAccount.today }) },
                  { label: t("admin_user_metrics.tile_week"), value: data.people.accounts.week, sub: t("admin_user_metrics.sub_new_devices", { count: data.people.withoutAccount.week }) },
                  { label: t("admin_user_metrics.total"), value: data.people.accounts.total, sub: t("admin_user_metrics.sub_new_devices", { count: data.people.withoutAccount.total }) },
                ]}
              />
              <Row
                label={t("admin_user_metrics.row_opens")}
                caption={t("admin_user_metrics.caption_opens")}
                unit={t("admin_user_metrics.unit_opens")}
                tiles={windowTiles(t, data.opens)}
              />
            </Group>

            {/* ── Practices kept ─────────────────────────────────────── */}
            <Group title={t("admin_user_metrics.group_practices")} caption={t("admin_user_metrics.caption_practices")}>
              <Row
                label={t("admin_user_metrics.row_all_practices")}
                unit={t("admin_user_metrics.unit_practices")}
                tiles={windowTiles(t, data.practices.all)}
              />
              <Breakdown
                rows={[
                  { label: t("admin_user_metrics.fam_offices"), caption: t("admin_user_metrics.caption_offices"), values: data.practices.offices },
                  { label: t("admin_user_metrics.fam_contemplation"), caption: t("admin_user_metrics.caption_contemplation"), values: data.practices.contemplation },
                  { label: t("admin_user_metrics.fam_examen"), caption: t("admin_user_metrics.caption_examen"), values: data.practices.examen },
                  { label: t("admin_user_metrics.fam_readings"), caption: t("admin_user_metrics.caption_readings"), values: data.practices.readings },
                  { label: t("admin_user_metrics.fam_prayer_list"), caption: t("admin_user_metrics.caption_prayer_list"), values: data.practices.prayerList },
                  { label: t("admin_user_metrics.fam_other"), caption: t("admin_user_metrics.caption_other"), values: data.practices.other },
                ]}
              />
            </Group>

            {/* ── The Dean's Commentary ──────────────────────────────── */}
            <Group title={t("admin_user_metrics.group_deans")}>
              <Row
                label={t("admin_user_metrics.row_deans_readers")}
                caption={t("admin_user_metrics.caption_deans")}
                unit={t("admin_user_metrics.unit_people")}
                tiles={[
                  { label: t("admin_user_metrics.tile_today"), value: data.deans.readers.today },
                  { label: t("admin_user_metrics.tile_week"), value: data.deans.readers.week, sub: perReader(data.deans.readerDays.week, data.deans.readers.week) },
                  { label: t("admin_user_metrics.tile_this_month"), value: data.deans.readers.month, sub: perReader(data.deans.readerDays.month, data.deans.readers.month) },
                ]}
              />
            </Group>

            {/* ── Community tools, folded away ───────────────────────── */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowCommunity((v) => !v)}
                className="text-[12px] font-medium px-3 py-2 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)", color: SAGE, fontFamily: SPACE_GROTESK }}
              >
                {showCommunity ? t("admin_user_metrics.community_hide") : t("admin_user_metrics.community_show")}
              </button>
              {showCommunity && (
                <div className="mt-4">
                  <p className="text-[13px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: 1.55 }}>
                    {t("admin_user_metrics.community_note")}
                  </p>
                  <p className="text-[13px] mt-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                    {t("admin_user_metrics.prayer_requests_line", { total: data.community.prayerRequestsTotal, week: data.community.prayerRequestsWeek })}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Feed audit — surfaces duplicate feed rows + subscriber/group
            /token reconciliation so the "Manage shows 2 feeds" and
            "people praying without being subscribed" issues are
            diagnosable at a glance. */}
        {showCommunity && audit && (
          <div className="mt-8">
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

type TileSpec = { label: string; value: number; sub?: string };

/** Today / last 7 days / this month, with an optional "without an account" line under each. */
function windowTiles(
  t: (key: string, opts?: Record<string, unknown>) => string,
  w: Window3,
  under?: Window3,
  subFor?: (n: number) => string,
): TileSpec[] {
  const sub = (n: number | undefined) => (under && subFor && typeof n === "number" ? subFor(n) : undefined);
  return [
    { label: t("admin_user_metrics.tile_today"), value: w.today, sub: sub(under?.today) },
    { label: t("admin_user_metrics.tile_week"), value: w.week, sub: sub(under?.week) },
    { label: t("admin_user_metrics.tile_this_month"), value: w.month, sub: sub(under?.month) },
  ];
}

/** A group of rows under one eyebrow. */
function Group({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
          {title}
        </p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.10)" }} />
      </div>
      {caption && (
        <p className="text-[13px] mb-4" style={{ color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: 1.55 }}>
          {caption}
        </p>
      )}
      {children}
    </div>
  );
}

/** One measure: its name, what it counts, its unit, and three tiles. */
function Row({ label, caption, unit, tiles }: { label: string; caption?: string; unit: string; tiles: TileSpec[] }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
        <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>{unit}</p>
      </div>
      {caption && (
        <p className="text-[13px] mb-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: 1.55 }}>
          {caption}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => <Tile key={tile.label} {...tile} />)}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: TileSpec) {
  return (
    <div className="rounded-xl px-3 py-4 text-center" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}>
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
        {label}
      </p>
      <p className="text-[30px] font-semibold tabular-nums" style={{ color: WARM, fontFamily: SPACE_GROTESK, lineHeight: 1 }}>
        {value.toLocaleString()}
      </p>
      {/* Reserved whether or not there is a line, so the three tiles stay level. */}
      <p className="text-[11px] mt-2 tabular-nums" style={{ color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: "15px", minHeight: 15 }}>
        {sub ?? ""}
      </p>
    </div>
  );
}

/**
 * The families a total splits into — a compact table whose rows add up to the
 * row above it. Each row is the name with its three numbers, then the caption
 * on a line of its own across the full width: with the caption beside the
 * numbers, a phone squeezed it into a column a few words wide.
 */
const BREAKDOWN_COLUMNS = "minmax(0,1fr) 3.25rem 3.25rem 3.25rem";
function Breakdown({ rows }: { rows: Array<{ label: string; caption: string; values: Window3 }> }) {
  const { t } = useTranslation();
  const cols: Array<keyof Window3> = ["today", "week", "month"];
  const heads = [t("admin_user_metrics.col_today"), t("admin_user_metrics.col_week"), t("admin_user_metrics.col_month")];
  return (
    <div className="rounded-xl px-4 py-2" style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.18)" }}>
      <div className="grid items-baseline gap-x-2 py-2" style={{ gridTemplateColumns: BREAKDOWN_COLUMNS }}>
        <span />
        {heads.map((h) => (
          <span key={h} className="text-[10px] uppercase tracking-[0.12em] font-semibold text-right" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid items-baseline gap-x-2 py-3"
          style={{ gridTemplateColumns: BREAKDOWN_COLUMNS, borderTop: "1px solid rgba(200,212,192,0.08)" }}
        >
          <p className="text-[14px] font-semibold min-w-0" style={{ color: WARM, fontFamily: SPACE_GROTESK, lineHeight: "20px" }}>{r.label}</p>
          {cols.map((c) => (
            <span key={c} className="text-[18px] font-semibold tabular-nums text-right" style={{ color: WARM, fontFamily: SPACE_GROTESK, lineHeight: "20px" }}>
              {r.values[c].toLocaleString()}
            </span>
          ))}
          <p className="text-[12px] mt-1" style={{ gridColumn: "1 / -1", color: SAGE, fontFamily: SPACE_GROTESK, lineHeight: 1.5 }}>{r.caption}</p>
        </div>
      ))}
    </div>
  );
}
