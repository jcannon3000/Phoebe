import { Router, type IRouter, type Request, type Response } from "express";
import { db, breathSessionsTable, breathPlacesTable, usersTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getGardenUserIds, getFellowUserIds } from "../lib/garden";
import { perUserRateLimit } from "../lib/rate-limit";
import { isSuperAdminUser } from "../lib/superAdmin";

// ── Cobreathe ────────────────────────────────────────────────────────
//
//   GET  /api/breath/today?day=YYYY-MM-DD  — today's breath state
//   POST /api/breath/today { day, seconds? } — record today's breath
//
// Both return the same payload:
//   done           — has the caller cobreathed on `day`?
//   count          — everyone who cobreathed on `day` (caller included once
//                    they have)
//   companions     — up to 6 garden members (group peers + correspondents +
//                    fellows) who cobreathed that day, with name + avatar —
//                    the "you breathed with Maria and James" row
//   companionCount — total garden cobreathers that day (companions is capped)
//   myDays         — how many days the caller has ever cobreathed
//   allBreaths     — every breath held across Phoebe since the practice began
//
// "Cobreathe" — from conspire, con + spirare, to breathe together. Each
// person keeps one short guided breath a day, asynchronously; everyone who
// holds the practice on a local-day string shares one count. The client
// separately logs the sit as a contemplation prayer_session so the breath
// counts toward the daily contemplation goal like any other silence.
//
// `day` is the caller's LOCAL calendar day (YYYY-MM-DD), matching the TEXT
// local-day convention used by practice_completion. People in different timezones who share a
// day string share a breath count — fitting for a practice about
// interconnection, and it means everyone's "today" is their own.

const router: IRouter = Router();

// A real local calendar day: well-formed AND an actual date. The shape
// regex alone admits nonsense like 2099-99-99 or 2024-02-30, which would
// seed a junk breath row (inflating allBreaths / a user's myDays) under a
// day key that no honest client would ever send. Round-trip through UTC to
// reject impossible dates.
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

type Companion = { userId: number; name: string | null; avatarUrl: string | null };

type BreathPayload = {
  done: boolean;
  count: number;
  companions: Companion[];
  companionCount: number;
  companionIds: number[];
  myDays: number;
  allBreaths: number;
};

async function breathPayload(userId: number, day: string): Promise<BreathPayload> {
  const [mineRows, dayRows, myDaysRows, allRows, gardenIds] = await Promise.all([
    db.select({ id: breathSessionsTable.id })
      .from(breathSessionsTable)
      .where(and(eq(breathSessionsTable.userId, userId), eq(breathSessionsTable.day, day))),
    db.select({ n: sql<number>`COUNT(*)::int` })
      .from(breathSessionsTable)
      .where(eq(breathSessionsTable.day, day)),
    db.select({ n: sql<number>`COUNT(*)::int` })
      .from(breathSessionsTable)
      .where(eq(breathSessionsTable.userId, userId)),
    db.select({ n: sql<number>`COUNT(*)::int` }).from(breathSessionsTable),
    getGardenUserIds(userId),
  ]);

  let companions: Companion[] = [];
  let companionCount = 0;
  let companionIds: number[] = [];
  if (gardenIds.length > 0) {
    const rows = await db
      .select({ userId: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(breathSessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, breathSessionsTable.userId))
      .where(and(
        eq(breathSessionsTable.day, day),
        inArray(breathSessionsTable.userId, gardenIds),
      ));
    companionCount = rows.length;
    companions = rows.slice(0, 6);
    companionIds = rows.map((r) => r.userId);
  }

  return {
    done: mineRows.length > 0,
    count: dayRows[0]?.n ?? 0,
    companions,
    companionCount,
    companionIds,
    myDays: myDaysRows[0]?.n ?? 0,
    allBreaths: allRows[0]?.n ?? 0,
  };
}

router.get("/breath/today", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const dayRaw = req.query.day;
  const day = typeof dayRaw === "string" && isValidYmd(dayRaw) ? dayRaw : null;
  if (!day) { res.status(400).json({ error: "bad_request" }); return; }

  try {
    res.json(await breathPayload(userId, day));
  } catch (err) {
    console.error("[/breath/today GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/breath/today", perUserRateLimit("breath_record", { max: 20, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const day = String(req.body?.day ?? "");
  if (!isValidYmd(day)) { res.status(400).json({ error: "bad_request" }); return; }
  const secondsRaw = Number(req.body?.seconds);
  const seconds = Number.isFinite(secondsRaw) ? Math.max(0, Math.min(3600, Math.round(secondsRaw))) : 0;
  /**
   * Where they breathed, if they chose a designated place — and whether their
   * DEVICE confirmed they were within its radius.
   *
   * Note what is NOT in this request body: coordinates. The proximity check
   * happens on-device (see the client's verifyAtPlace) and only its verdict
   * travels. That is the whole reason this feature can exist where the old
   * location surface could not — the server never learns where anyone is,
   * only that someone was at a public place an admin designated.
   *
   * `placeVerified` is accepted from the client and therefore NOT trustworthy
   * in an adversarial sense — someone could post `true` from anywhere. That's
   * a deliberate trade: the alternative is sending real coordinates to be
   * checked server-side, which reintroduces exactly the tracking this avoids.
   * Nothing is gated on this flag — it decorates a shared count of people at
   * prayer, so the worst case is an inflated tally, not a privilege.
   */
  const placeIdRaw = Number(req.body?.placeId);
  const placeId = Number.isInteger(placeIdRaw) && placeIdRaw > 0 ? placeIdRaw : null;
  const placeVerified = placeId !== null && req.body?.placeVerified === true;

  try {
    // A place must exist and be active — otherwise drop the attribution
    // rather than writing a dangling or retired one.
    let resolvedPlaceId: number | null = null;
    if (placeId !== null) {
      const [place] = await db
        .select({ id: breathPlacesTable.id })
        .from(breathPlacesTable)
        .where(and(eq(breathPlacesTable.id, placeId), eq(breathPlacesTable.active, true)))
        .limit(1);
      resolvedPlaceId = place?.id ?? null;
    }
    // Idempotent — one breath per local day; a second sit the same day keeps
    // the first row (and its created_at) rather than duplicating. The PLACE,
    // though, is updated: someone who breathes again from the chapel after a
    // first breath at home should see the chapel's count include them, and
    // the row is theirs either way.
    await db
      .insert(breathSessionsTable)
      .values({ userId, day, seconds, placeId: resolvedPlaceId, placeVerified: resolvedPlaceId !== null && placeVerified })
      .onConflictDoUpdate({
        target: [breathSessionsTable.userId, breathSessionsTable.day],
        set: {
          placeId: resolvedPlaceId,
          placeVerified: resolvedPlaceId !== null && placeVerified,
        },
      });

    res.json({ ok: true, ...(await breathPayload(userId, day)) });
  } catch (err) {
    console.error("[/breath/today POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /breath/places?day=YYYY-MM-DD — the designated places, each with how
 * many people have breathed there today.
 *
 * Public to signed-in users (a shared count of people at prayer, no identities
 * and no coordinates of any person). `day` is the CALLER'S local day, matching
 * the TEXT local-day convention breath_sessions already uses everywhere — the
 * server never guesses a timezone.
 */
router.get("/breath/places", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const day = String(req.query["day"] ?? "");
  if (!isValidYmd(day)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    const rows = await db
      .select({
        id: breathPlacesTable.id,
        name: breathPlacesTable.name,
        subtitle: breathPlacesTable.subtitle,
        lat: breathPlacesTable.lat,
        lng: breathPlacesTable.lng,
        radiusMeters: breathPlacesTable.radiusMeters,
        // Everyone who chose this place today, and the subset whose device
        // confirmed it. Both are shown: the first is who is holding this
        // place in prayer, the second who is standing in it.
        breathsToday: sql<number>`(
          SELECT COUNT(*)::int FROM breath_sessions bs
          WHERE bs.place_id = ${breathPlacesTable.id} AND bs.day = ${day}
        )`,
        verifiedToday: sql<number>`(
          SELECT COUNT(*)::int FROM breath_sessions bs
          WHERE bs.place_id = ${breathPlacesTable.id} AND bs.day = ${day} AND bs.place_verified = TRUE
        )`,
      })
      .from(breathPlacesTable)
      .where(eq(breathPlacesTable.active, true))
      .orderBy(asc(breathPlacesTable.name));
    res.json({ places: rows });
  } catch (err) {
    console.error("[/breath/places GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /breath/places — create a designated place. SUPER ADMINS ONLY (owner:
 * "only admins can make them"), because every one of these is a claim that a
 * real public place exists at real coordinates, and a bad row sends people
 * somewhere wrong.
 */
router.post("/breath/places", perUserRateLimit("breath_place_create", { max: 20, windowMs: 60 * 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "forbidden" }); return; }

  const name = String(req.body?.name ?? "").trim();
  const subtitleRaw = String(req.body?.subtitle ?? "").trim();
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const radiusRaw = Number(req.body?.radiusMeters);
  if (name.length < 2 || name.length > 80) { res.status(400).json({ error: "bad_name" }); return; }
  // Real coordinates only — a typo'd or swapped pair would quietly send
  // people to the wrong hemisphere, and there's no user-visible signal it
  // happened beyond "verification never works here".
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) { res.status(400).json({ error: "bad_lat" }); return; }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) { res.status(400).json({ error: "bad_lng" }); return; }
  const radiusMeters = Number.isFinite(radiusRaw) ? Math.max(25, Math.min(5000, Math.round(radiusRaw))) : 150;

  try {
    const [row] = await db
      .insert(breathPlacesTable)
      .values({
        name,
        subtitle: subtitleRaw.length > 0 ? subtitleRaw.slice(0, 120) : null,
        lat, lng, radiusMeters,
        createdByUserId: userId,
      })
      .returning({ id: breathPlacesTable.id });
    res.json({ ok: true, id: row?.id ?? null });
  } catch (err) {
    console.error("[/breath/places POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/** PATCH /breath/places/:id — rename, move, re-radius, or retire. Admins only. */
router.patch("/breath/places/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "forbidden" }); return; }
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad_request" }); return; }

  const patch: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") {
    const n = req.body.name.trim();
    if (n.length < 2 || n.length > 80) { res.status(400).json({ error: "bad_name" }); return; }
    patch["name"] = n;
  }
  if (typeof req.body?.subtitle === "string") {
    const sub = req.body.subtitle.trim();
    patch["subtitle"] = sub.length > 0 ? sub.slice(0, 120) : null;
  }
  if (req.body?.lat !== undefined) {
    const v = Number(req.body.lat);
    if (!Number.isFinite(v) || v < -90 || v > 90) { res.status(400).json({ error: "bad_lat" }); return; }
    patch["lat"] = v;
  }
  if (req.body?.lng !== undefined) {
    const v = Number(req.body.lng);
    if (!Number.isFinite(v) || v < -180 || v > 180) { res.status(400).json({ error: "bad_lng" }); return; }
    patch["lng"] = v;
  }
  if (req.body?.radiusMeters !== undefined) {
    const v = Number(req.body.radiusMeters);
    if (!Number.isFinite(v)) { res.status(400).json({ error: "bad_radius" }); return; }
    patch["radiusMeters"] = Math.max(25, Math.min(5000, Math.round(v)));
  }
  // Retire rather than delete — the breaths kept there are real history, and
  // ON DELETE SET NULL would silently detach them from the place they happened.
  if (typeof req.body?.active === "boolean") patch["active"] = req.body.active;
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "no_changes" }); return; }

  try {
    await db.update(breathPlacesTable).set(patch).where(eq(breathPlacesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[/breath/places PATCH] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /breath/together — for each of the caller's fellows, the most recent LOCAL
// day they BOTH held the breath (a cobreathe "together"). Cobreathe is async —
// same day, not the same moment — so co-presence is the latest shared day across
// both users' breath_sessions rows. Powers the "last breathed together" line on
// the People page.
router.get("/breath/together", async (req: Request, res: Response): Promise<void> => {
  const me = uid(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const fellowIds = (await getFellowUserIds(me)).filter((id) => id !== me);
    if (fellowIds.length === 0) { res.json({ together: {} }); return; }
    const rows = await db.execute<{ fellow_id: number; last_day: string }>(sql`
      SELECT bf.user_id AS fellow_id, MAX(bf.day) AS last_day
      FROM breath_sessions bf
      JOIN breath_sessions mine ON mine.user_id = ${me} AND mine.day = bf.day
      WHERE bf.user_id IN (${sql.join(fellowIds, sql`, `)})
      GROUP BY bf.user_id
    `);
    const together: Record<number, string> = {};
    for (const r of rows.rows) together[Number(r.fellow_id)] = String(r.last_day);
    res.json({ together });
  } catch (err) {
    console.error("[/breath/together GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
