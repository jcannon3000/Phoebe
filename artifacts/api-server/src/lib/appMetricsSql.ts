/**
 * App Metrics — the one query behind GET /api/admin/metrics.
 *
 * Owner (2026-09-16): "there are just a lot of overlapping categories and
 * redundancies and it's confusing, simplify it and make it clearer what each
 * is. And make sure things count properly."
 *
 * ONE UNIT FOR EVERYTHING PRAYED: a practice KEPT — one per person, per
 * practice, per day. The old page mixed three units without saying so:
 * "Times prayed" was 15-minute-deduped sessions plus one-per-practice rows,
 * "Offices" was person-office-days and "Contemplation & Examen" person-days.
 * Two sits an hour apart counted twice while an office that also prayed the
 * list counted twice for a different reason, and a Scripture deck kept on its
 * own never counted at all. Now every record — a session, a reading, a
 * practice completion, a side credit — is mapped to a PRACTICE KEY and a
 * FAMILY, and DISTINCT (person, day, practice) is the count. The family rows
 * on the page therefore add up to the total, and the same act recorded two
 * ways (the Examen's session and its practice completion, a reading and the
 * side credit it earned) collapses to one.
 *
 * Practice keys:
 *   office:<morning|evening|compline|noonday>  — FINISHED offices only, on the
 *       app's own terms (users.ts office-history-week): the slideshow
 *       completed, the book or Venite attested, the office podcast heard,
 *       the Cathedral watched ≥3 min. An office abandoned after three slides
 *       is not a kept practice.
 *   contemplation:<morning|evening|any>        — a silent sit or Breathing
 *       Together (source "cobreathe"), by the side it was attributed to.
 *   examen                                      — session or completion.
 *   prayer-list                                 — the list opened, prayed in
 *       an office or in the slideshow, or an Amen on a request.
 *   read:<fdd|ssje|vts|nouwen|sojo|grist|hagiography|cac|scripture>
 *       — one per reading. A side CREDIT for a reading ("credit:fdd" etc.)
 *       maps onto the same key, so it can never count beside the reading.
 *   <psalms|guided-prayer|custom>:<side>        — a side's prayer that has no
 *       other record than its credit.
 *   legacy-credit:<side>                        — an untagged 99-slide
 *       devotion row from a phone not yet updated (credits were untagged
 *       before 2026-09-15); a kept practice of unknown kind.
 *   <practice_completion.section>               — Visio, Lectio, the Rosary,
 *       icons, spirituals, the walk, listening, book reading, podcasts, the
 *       Way of Love sections, custom:<id> (incl. custom:gratitude).
 *
 * Families: office · contemplation · examen · prayer-list · reading · other.
 *
 * DAYS. Timed sessions and Amens are bucketed to the Eastern calendar day
 * ($3), as every admin surface here is; readings and practice completions
 * carry the phone's own local day and are compared as written. Both are "the
 * day the person kept it" — an Auckland reader is a few hours ahead, no more.
 *
 * TEST RUNS ARE LEFT OUT. simulator_marks (lib/simulatorMarks.ts) names the
 * (user, day) pairs that came from the iOS Simulator or the Android emulator:
 * a device user ever marked is a test install and none of its records count;
 * an account's records are left out on its marked days only.
 *
 * ONE PERSON, ONE ID. users.merged_into_user_id points a phone's anonymous
 * device user at the account it later signed in to (lib/anonymousMerge.ts).
 * Every user id is read through `people`, so what someone prayed before and
 * after signing in is one person, and a merged device row is not a user.
 *
 * Parameters:
 *   $1 today (ET, YYYY-MM-DD)   $2 seven days ago   $3 time zone
 *   $4 first of the month       $5 earliest timestamp any source needs
 *   $6 earliest day string any source needs
 */
export const APP_METRICS_SQL = `
WITH people AS (
  SELECT id AS user_id, COALESCE(merged_into_user_id, id) AS person FROM users
),
-- Phones using Phoebe without an account: an unmerged anonymous device user.
devices_all AS (
  SELECT id AS person FROM users WHERE is_anonymous AND merged_into_user_id IS NULL
),
-- ── Test runs, left out (lib/simulatorMarks.ts) ────────────────────────────
-- A phone without an account that has ever run on a simulator is a test
-- install, not a person: every record of it goes. An account's records go
-- only on the days it was marked, so the owner testing his own account on
-- the Simulator doesn't lose his other days.
sim_devices AS (
  SELECT DISTINCT p.person
  FROM simulator_marks sm
  JOIN people p ON p.user_id = sm.user_id
  JOIN devices_all d ON d.person = p.person
),
sim_days AS (
  SELECT DISTINCT p.person, sm.day
  FROM simulator_marks sm
  JOIN people p ON p.user_id = sm.user_id
  WHERE sm.day >= $6
),
devices AS (
  SELECT person FROM devices_all WHERE person NOT IN (SELECT person FROM sim_devices)
),
sess AS (
  SELECT
    p.person,
    ps.surface,
    COALESCE(ps.source, '') AS source,
    ps.completed,
    ps.slides_completed,
    ps.duration_seconds,
    ps.contemplation_side,
    to_char((ps.ended_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day
  FROM prayer_sessions ps
  JOIN people p ON p.user_id = ps.user_id
  WHERE ps.ended_at >= $5
),
completions AS (
  SELECT p.person, pc.section, pc.local_date AS day
  FROM practice_completion pc
  JOIN people p ON p.user_id = pc.user_id
  WHERE pc.local_date >= $6
),
kept_raw AS (
  -- ── Offices, finished ──────────────────────────────────────────────────
  SELECT person, day, 'office' AS family,
    'office:' || CASE
      WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral', 'morning-office-podcast') THEN 'morning'
      WHEN surface IN ('evening-prayer', 'early-evening-devotion', 'evening-office-podcast') THEN 'evening'
      WHEN surface IN ('compline', 'compline-office-podcast') THEN 'compline'
      ELSE surface
    END AS practice
  FROM sess
  WHERE (
      surface IN ('morning-prayer', 'evening-prayer', 'compline', 'noonday', 'morning-devotion', 'early-evening-devotion')
      AND completed = TRUE
      AND source NOT LIKE 'credit:%'
      AND NOT (surface IN ('morning-devotion', 'early-evening-devotion') AND slides_completed = 99 AND source NOT LIKE 'attest:%')
    )
    OR (surface IN ('morning-office-podcast', 'evening-office-podcast', 'compline-office-podcast') AND completed = TRUE)
    OR (surface = 'national-cathedral' AND duration_seconds >= 180)

  UNION ALL
  -- ── Contemplation: a sit or Breathing Together, by side ────────────────
  SELECT person, day, 'contemplation', 'contemplation:' || COALESCE(contemplation_side, 'any')
  FROM sess WHERE surface = 'contemplation'

  UNION ALL
  -- ── The Examen (its session, or the completion Simple Guided Prayer logs) ─
  SELECT person, day, 'examen', 'examen' FROM sess WHERE surface = 'examen'
  UNION ALL
  SELECT person, day, 'examen', 'examen' FROM completions WHERE section = 'examen'

  UNION ALL
  -- ── The prayer list ───────────────────────────────────────────────────
  SELECT person, day, 'prayer-list', 'prayer-list' FROM sess WHERE surface = 'prayer-list'
  UNION ALL
  SELECT person, day, 'prayer-list', 'prayer-list' FROM completions WHERE section = 'prayer-list'
  UNION ALL
  SELECT p.person, to_char((a.prayed_at AT TIME ZONE $3)::date, 'YYYY-MM-DD'), 'prayer-list', 'prayer-list'
  FROM prayer_request_amens a
  JOIN people p ON p.user_id = a.user_id
  WHERE a.prayed_at IS NOT NULL AND a.prayed_at >= $5

  UNION ALL
  -- ── Daily readings ────────────────────────────────────────────────────
  SELECT p.person, rr.ymd, 'reading', 'read:' || rr.source
  FROM reflection_reads rr JOIN people p ON p.user_id = rr.user_id
  WHERE rr.ymd >= $6
  UNION ALL
  SELECT p.person, cr.ymd, 'reading', 'read:cac'
  FROM cac_reads cr JOIN people p ON p.user_id = cr.user_id
  WHERE cr.ymd >= $6
  UNION ALL
  -- The Daily Scripture Reading and This Sunday decks, finished (or read
  -- past their third slide — the deck's own bar for a real reading).
  SELECT person, day, 'reading', 'read:scripture'
  FROM sess WHERE surface = 'scripture' AND (completed = TRUE OR slides_completed >= 3)
  UNION ALL
  -- A reading kept as the side's prayer: the same key as the reading.
  SELECT person, day, 'reading', 'read:' || substr(source, 8)
  FROM sess WHERE source IN ('credit:fdd', 'credit:cac', 'credit:ssje', 'credit:vts')
  UNION ALL
  SELECT person, day, 'reading', 'read:scripture' FROM sess WHERE source = 'credit:readings'

  UNION ALL
  -- ── Everything else ───────────────────────────────────────────────────
  -- Psalms, Simple Guided Prayer and a custom prayer as the side's prayer:
  -- their credit is their only record.
  SELECT person, day, 'other',
    substr(source, 8) || ':' || CASE WHEN surface = 'morning-devotion' THEN 'morning' ELSE 'evening' END
  FROM sess WHERE source IN ('credit:psalms', 'credit:guided-prayer', 'credit:custom')
  UNION ALL
  -- An untagged 99-slide devotion row is a credit from a phone not yet
  -- updated: kept, kind unknown.
  SELECT person, day, 'other',
    'legacy-credit:' || CASE WHEN surface = 'morning-devotion' THEN 'morning' ELSE 'evening' END
  FROM sess
  WHERE surface IN ('morning-devotion', 'early-evening-devotion')
    AND slides_completed = 99 AND completed = TRUE AND source = ''
  UNION ALL
  SELECT person, day, 'other', section
  FROM completions WHERE section NOT IN ('examen', 'prayer-list')
),
kept AS (
  SELECT DISTINCT person, day, family, practice FROM kept_raw k
  WHERE NOT EXISTS (SELECT 1 FROM sim_devices sd WHERE sd.person = k.person)
    AND NOT EXISTS (SELECT 1 FROM sim_days s WHERE s.person = k.person AND s.day = k.day)
),
opens_raw AS (
  SELECT p.person, to_char((ao.opened_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day
  FROM app_opens ao JOIN people p ON p.user_id = ao.user_id
  WHERE ao.opened_at >= $5
),
opens AS (
  SELECT person, day FROM opens_raw o
  WHERE NOT EXISTS (SELECT 1 FROM sim_devices sd WHERE sd.person = o.person)
    AND NOT EXISTS (SELECT 1 FROM sim_days s WHERE s.person = o.person AND s.day = o.day)
)
SELECT
  -- ── People ────────────────────────────────────────────────────────────
  (SELECT COUNT(DISTINCT person) FROM opens WHERE day >= $1)::int AS opened_today,
  (SELECT COUNT(DISTINCT person) FROM opens WHERE day >= $2)::int AS opened_week,
  (SELECT COUNT(DISTINCT person) FROM opens WHERE day >= $4)::int AS opened_month,
  (SELECT COUNT(DISTINCT o.person) FROM opens o JOIN devices d ON d.person = o.person WHERE o.day >= $1)::int AS opened_device_today,
  (SELECT COUNT(DISTINCT o.person) FROM opens o JOIN devices d ON d.person = o.person WHERE o.day >= $2)::int AS opened_device_week,
  (SELECT COUNT(DISTINCT o.person) FROM opens o JOIN devices d ON d.person = o.person WHERE o.day >= $4)::int AS opened_device_month,

  (SELECT COUNT(DISTINCT person) FROM kept WHERE day >= $1)::int AS prayed_today,
  (SELECT COUNT(DISTINCT person) FROM kept WHERE day >= $2)::int AS prayed_week,
  (SELECT COUNT(DISTINCT person) FROM kept WHERE day >= $4)::int AS prayed_month,
  (SELECT COUNT(DISTINCT k.person) FROM kept k JOIN devices d ON d.person = k.person WHERE k.day >= $1)::int AS prayed_device_today,
  (SELECT COUNT(DISTINCT k.person) FROM kept k JOIN devices d ON d.person = k.person WHERE k.day >= $2)::int AS prayed_device_week,
  (SELECT COUNT(DISTINCT k.person) FROM kept k JOIN devices d ON d.person = k.person WHERE k.day >= $4)::int AS prayed_device_month,

  -- Accounts: signed-up users. A device that signs UP is upgraded in place
  -- and keeps its first-seen date; one that signs IN to an existing account
  -- is merged and is not a user of its own.
  (SELECT COUNT(*) FROM users WHERE NOT is_anonymous AND merged_into_user_id IS NULL)::int AS accounts_total,
  (SELECT COUNT(*) FROM users WHERE NOT is_anonymous AND merged_into_user_id IS NULL
     AND to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS accounts_today,
  (SELECT COUNT(*) FROM users WHERE NOT is_anonymous AND merged_into_user_id IS NULL
     AND to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS accounts_week,
  (SELECT COUNT(*) FROM devices)::int AS devices_total,
  (SELECT COUNT(*) FROM devices d JOIN users u ON u.id = d.person
     WHERE to_char((u.created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS devices_today,
  (SELECT COUNT(*) FROM devices d JOIN users u ON u.id = d.person
     WHERE to_char((u.created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS devices_week,

  -- App opens: each row is already one 15-minute bucket per user.
  (SELECT COUNT(*) FROM opens WHERE day >= $1)::int AS opens_today,
  (SELECT COUNT(*) FROM opens WHERE day >= $2)::int AS opens_week,
  (SELECT COUNT(*) FROM opens WHERE day >= $4)::int AS opens_month,

  -- ── Practices kept ────────────────────────────────────────────────────
  (SELECT COUNT(*) FROM kept WHERE day >= $1)::int AS kept_today,
  (SELECT COUNT(*) FROM kept WHERE day >= $2)::int AS kept_week,
  (SELECT COUNT(*) FROM kept WHERE day >= $4)::int AS kept_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'office' AND day >= $1)::int AS offices_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'office' AND day >= $2)::int AS offices_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'office' AND day >= $4)::int AS offices_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'contemplation' AND day >= $1)::int AS contemplation_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'contemplation' AND day >= $2)::int AS contemplation_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'contemplation' AND day >= $4)::int AS contemplation_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'examen' AND day >= $1)::int AS examen_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'examen' AND day >= $2)::int AS examen_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'examen' AND day >= $4)::int AS examen_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'reading' AND day >= $1)::int AS readings_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'reading' AND day >= $2)::int AS readings_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'reading' AND day >= $4)::int AS readings_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'prayer-list' AND day >= $1)::int AS prayer_list_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'prayer-list' AND day >= $2)::int AS prayer_list_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'prayer-list' AND day >= $4)::int AS prayer_list_month,
  (SELECT COUNT(*) FROM kept WHERE family = 'other' AND day >= $1)::int AS other_today,
  (SELECT COUNT(*) FROM kept WHERE family = 'other' AND day >= $2)::int AS other_week,
  (SELECT COUNT(*) FROM kept WHERE family = 'other' AND day >= $4)::int AS other_month,

  -- ── The Dean's Commentary (VTS) ───────────────────────────────────────
  -- Readers is reach; reader-days over readers is how many days each reader
  -- averages. Today's reader-days equal today's readers by construction, so
  -- the page shows them for the week and the month only.
  (SELECT COUNT(DISTINCT person) FROM kept WHERE practice = 'read:vts' AND day >= $1)::int AS deans_readers_today,
  (SELECT COUNT(DISTINCT person) FROM kept WHERE practice = 'read:vts' AND day >= $2)::int AS deans_readers_week,
  (SELECT COUNT(DISTINCT person) FROM kept WHERE practice = 'read:vts' AND day >= $4)::int AS deans_readers_month,
  (SELECT COUNT(*) FROM kept WHERE practice = 'read:vts' AND day >= $2)::int AS deans_reader_days_week,
  (SELECT COUNT(*) FROM kept WHERE practice = 'read:vts' AND day >= $4)::int AS deans_reader_days_month,

  -- ── Community (switched off for everyone; history only) ───────────────
  (SELECT COUNT(*) FROM prayer_requests)::int AS prayer_requests_total,
  (SELECT COUNT(*) FROM prayer_requests
     WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS prayer_requests_today,
  (SELECT COUNT(*) FROM prayer_requests
     WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS prayer_requests_week
`;

/** The windows every metric is cut by, in Eastern time. */
export function appMetricsWindows(now: Date = new Date()): {
  tz: string; today: string; weekStart: string; monthStart: string; sinceTs: string; sinceYmd: string;
} {
  // Phoebe runs out of ET and the owner's "today" is the ET calendar day —
  // the same choice the community metrics make, so both pages agree.
  const tz = "America/New_York";
  const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = ymdFmt.format(now);
  const [y, m, d] = today.split("-").map((n) => parseInt(n, 10));
  // "Last 7 days": today and the six before it.
  const weekStart = new Date(Date.UTC(y!, m! - 1, d! - 6)).toISOString().slice(0, 10);
  // "This month": the ET calendar month to date. (Not "all time": app opens
  // are pruned at 90 days, sessions and readings at a year.)
  const monthStart = `${today.slice(0, 7)}-01`;
  // Every source is read only as far back as the earlier window needs (a
  // week can reach into last month), and timestamps one day further so a
  // late-evening ET session isn't cut off by a UTC day boundary.
  const sinceYmd = weekStart < monthStart ? weekStart : monthStart;
  const [sy, sm, sd] = sinceYmd.split("-").map((n) => parseInt(n, 10));
  const sinceTs = new Date(Date.UTC(sy!, sm! - 1, sd!) - 24 * 60 * 60 * 1000).toISOString();
  return { tz, today, weekStart, monthStart, sinceTs, sinceYmd };
}

/** The query's positional parameters, from the windows. */
export function appMetricsParams(w: ReturnType<typeof appMetricsWindows>): string[] {
  return [w.today, w.weekStart, w.tz, w.monthStart, w.sinceTs, w.sinceYmd];
}

type Window3 = { today: number; week: number; month: number };

/** The JSON GET /api/admin/metrics answers with, from the query's one row. */
export function shapeAppMetrics(row: Record<string, unknown>, w: ReturnType<typeof appMetricsWindows>) {
  const n = (k: string): number => Number(row[k] ?? 0);
  const w3 = (k: string): Window3 => ({ today: n(`${k}_today`), week: n(`${k}_week`), month: n(`${k}_month`) });
  return {
    windows: { tz: w.tz, today: w.today, weekStart: w.weekStart, monthStart: w.monthStart },
    people: {
      opened: w3("opened"),
      openedWithoutAccount: w3("opened_device"),
      prayed: w3("prayed"),
      prayedWithoutAccount: w3("prayed_device"),
      accounts: { today: n("accounts_today"), week: n("accounts_week"), total: n("accounts_total") },
      withoutAccount: { today: n("devices_today"), week: n("devices_week"), total: n("devices_total") },
    },
    opens: w3("opens"),
    practices: {
      all: w3("kept"),
      offices: w3("offices"),
      contemplation: w3("contemplation"),
      examen: w3("examen"),
      readings: w3("readings"),
      prayerList: w3("prayer_list"),
      other: w3("other"),
    },
    deans: {
      readers: w3("deans_readers"),
      readerDays: { week: n("deans_reader_days_week"), month: n("deans_reader_days_month") },
    },
    community: {
      prayerRequestsTotal: n("prayer_requests_total"),
      prayerRequestsToday: n("prayer_requests_today"),
      prayerRequestsWeek: n("prayer_requests_week"),
    },
  };
}

export type AppMetricsResponse = ReturnType<typeof shapeAppMetrics>;
