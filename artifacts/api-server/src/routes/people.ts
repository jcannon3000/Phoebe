import { Router, type IRouter } from "express";
import { eq, desc, or, sql, inArray, and, isNull, ne, gt } from "drizzle-orm";
import { db, ritualsTable, meetupsTable, usersTable, sharedMomentsTable, momentUserTokensTable, momentWindowsTable, prayerRequestsTable, prayerWordsTable, userMutesTable, groupsTable, groupMembersTable } from "@workspace/db";
import { computeStreak } from "../lib/streak";
import { getCorrespondentUserIds } from "../lib/correspondents";

const router: IRouter = Router();

type Participant = { name: string; email: string };

// Helper: get all rituals where the user is owner OR participant
async function getUserRituals(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { user: null, rituals: [] as (typeof ritualsTable.$inferSelect)[] };
  const rituals = await db.select().from(ritualsTable).where(
    or(
      eq(ritualsTable.ownerId, userId),
      sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: user.email }])}::jsonb`
    )
  );
  return { user, rituals };
}

// GET /api/people?ownerId=N
// Returns all unique people from the user's rituals (owned + participant)
router.get("/people", async (req, res): Promise<void> => {
  const ownerId = parseInt(String(req.query.ownerId ?? ""), 10);
  if (isNaN(ownerId)) {
    res.status(400).json({ error: "ownerId is required" });
    return;
  }

  const { user: owner, rituals } = await getUserRituals(ownerId);
  const ownerEmail = owner?.email ?? "";
  const ownerEmailLower = ownerEmail.toLowerCase();

  // Garden = groups + correspondents. Practices and traditions no
  // longer pull people into the garden on their own — a shared
  // multi-group intercession shouldn't make Group B's members
  // visible to Group A. Per user direction: "who shows up in your
  // garden is just groups and letters."
  //
  // We still derive sharedPractices / sharedTraditions later for
  // the people who DID make the cut via groups or letters, so their
  // cards show context. But the set of people here is strictly
  // groups ∪ correspondents.
  const map = new Map<string, {
    name: string;
    email: string;
    sharedCircleCount: number;
    firstCircleDate: Date;
    sharedRitualIds: number[];
  }>();

  // Step 1 — every group the owner has a membership row in.
  // Relaxed to NOT require joinedAt IS NOT NULL — if a user's own
  // membership row was never stamped with joinedAt (hidden_admin
  // toggle, legacy invite, backfill), they'd otherwise see an
  // empty garden. Match by userId primarily, email fallback for
  // email-only invite rows.
  const myGroupIdRows = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(
      sql`${groupMembersTable.userId} = ${ownerId}
          OR LOWER(${groupMembersTable.email}) = ${ownerEmailLower}`,
    );
  const myGroupIds = Array.from(new Set(myGroupIdRows.map(r => r.groupId)));
  console.log(
    `[GET /people] ownerId=${ownerId} email=${ownerEmailLower} ` +
    `myGroupIds=[${myGroupIds.join(",")}]`,
  );
  if (myGroupIds.length > 0) {
    // Garden = every member of the viewer's groups, excluding
    // hidden admins of those groups. We left-join through
    // usersTable on userId so that membership rows whose `email`
    // column is empty (admin-added members keyed only by userId,
    // legacy backfills, etc.) still resolve to a real person. The
    // earlier version skipped any row with `!row.email`, which
    // matched garden.ts's behavior for prayer-feed visibility but
    // left the People page silently empty for any group whose
    // rows happened to be userId-only — exactly the "I see prayer
    // requests but no people" failure mode users keep reporting.
    const peerRows = await db
      .select({
        rowUserId: groupMembersTable.userId,
        rowEmail: groupMembersTable.email,
        rowName: groupMembersTable.name,
        joinedAt: groupMembersTable.joinedAt,
        role: groupMembersTable.role,
        groupId: groupMembersTable.groupId,
        userEmail: usersTable.email,
        userName: usersTable.name,
      })
      .from(groupMembersTable)
      .leftJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
      .where(and(
        inArray(groupMembersTable.groupId, myGroupIds),
        sql`(${groupMembersTable.role} IS NULL
             OR ${groupMembersTable.role} <> 'hidden_admin')`,
      ));
    console.log(
      `[GET /people] peerRows=${peerRows.length} ` +
      `sample=${JSON.stringify(peerRows.slice(0, 3).map(r => ({ rowEmail: r.rowEmail, userEmail: r.userEmail, role: r.role, g: r.groupId, j: !!r.joinedAt })))}`,
    );
    for (const row of peerRows) {
      // Prefer the membership row's email (kept in sync at invite
      // time), fall back to the joined users row when the membership
      // row was created with userId only.
      const resolvedEmail = (row.rowEmail || row.userEmail || "").trim();
      if (!resolvedEmail) continue;
      const emailLower = resolvedEmail.toLowerCase();
      if (emailLower === ownerEmailLower) continue;
      if (map.has(emailLower)) continue;
      map.set(emailLower, {
        name: row.rowName || row.userName || resolvedEmail,
        email: resolvedEmail,
        sharedCircleCount: 0,
        firstCircleDate: row.joinedAt ?? new Date(),
        sharedRitualIds: [],
      });
    }
  }

  // Step 2 — active letter correspondents (mutual exchange). Include
  // them even if they're not in any shared group, because an ongoing
  // letter correspondence is an explicit relationship.
  const correspondentUserIds = await getCorrespondentUserIds(ownerId);
  if (correspondentUserIds.length > 0) {
    const correspondentRows = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, correspondentUserIds));
    for (const row of correspondentRows) {
      const emailLower = row.email.toLowerCase();
      if (emailLower === ownerEmailLower) continue;
      if (map.has(emailLower)) continue;
      map.set(emailLower, {
        name: row.name || row.email,
        email: row.email,
        sharedCircleCount: 0,
        firstCircleDate: new Date(),
        sharedRitualIds: [],
      });
    }
  }

  // Veto: drop anyone from the garden who is a hidden_admin in ANY
  // group the owner is in. Same rule as prayer.ts — "for members of
  // the group he is a hidden admin of, we don't want his requests
  // shown anywhere." Correspondence doesn't override this.
  const beforeVeto = map.size;
  if (myGroupIds.length > 0 && map.size > 0) {
    const vetoRows = await db
      .select({
        email: groupMembersTable.email,
      })
      .from(groupMembersTable)
      .where(and(
        inArray(groupMembersTable.groupId, myGroupIds),
        eq(groupMembersTable.role, "hidden_admin"),
      ));
    for (const row of vetoRows) {
      if (!row.email) continue;
      map.delete(row.email.toLowerCase());
    }
  }
  console.log(
    `[GET /people] garden size: before-veto=${beforeVeto} ` +
    `after-veto=${map.size} correspondentIds=${correspondentUserIds.length}`,
  );

  // Traditions (ritual circles) CONTRIBUTE CONTEXT ONLY — we no
  // longer add people to the garden via traditions, but if a person
  // is already in the garden (via groups or letters) we still want
  // their sharedRitualIds populated so the card can show
  // "🤝🏽 <tradition name>" as context.
  for (const ritual of rituals) {
    const participants = (ritual.participants as Participant[]) ?? [];
    for (const p of participants) {
      if (!p.email || p.email === ownerEmail) continue;
      const emailLower = p.email.toLowerCase();
      const entry = map.get(emailLower);
      if (!entry) continue;
      entry.sharedCircleCount++;
      entry.sharedRitualIds.push(ritual.id);
      if (ritual.createdAt < entry.firstCircleDate) {
        entry.firstCircleDate = ritual.createdAt;
      }
    }
  }

  // Batch-fetch avatarUrl for all garden members
  const allGardenEmails = Array.from(map.keys());
  const avatarByEmail = new Map<string, string | null>();
  if (allGardenEmails.length > 0) {
    const avatarRows = await db.select({ email: usersTable.email, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(inArray(usersTable.email, allGardenEmails));
    for (const row of avatarRows) {
      avatarByEmail.set(row.email.toLowerCase(), row.avatarUrl);
    }
  }

  // Batch-fetch active prayer requests with body text for all garden members
  const activePrayerMap = new Map<string, { id: number; body: string; createdAt: string }>();
  if (allGardenEmails.length > 0) {
    const gardenUsers = await db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, allGardenEmails));
    const gardenUserIds = gardenUsers.map(u => u.id);
    const emailByUserId = new Map(gardenUsers.map(u => [u.id, u.email]));
    if (gardenUserIds.length > 0) {
      // Prayer requests are retained until explicitly released/answered —
      // we no longer auto-filter by expiresAt.
      const activeRequests = await db.select({
        id: prayerRequestsTable.id,
        ownerId: prayerRequestsTable.ownerId,
        body: prayerRequestsTable.body,
        createdAt: prayerRequestsTable.createdAt,
      }).from(prayerRequestsTable).where(
        and(
          inArray(prayerRequestsTable.ownerId, gardenUserIds),
          eq(prayerRequestsTable.isAnswered, false),
          isNull(prayerRequestsTable.closedAt),
        )
      ).orderBy(desc(prayerRequestsTable.createdAt));
      for (const r of activeRequests) {
        const email = emailByUserId.get(r.ownerId);
        if (email && !activePrayerMap.has(email)) {
          activePrayerMap.set(email, { id: r.id, body: r.body, createdAt: r.createdAt.toISOString() });
        }
      }
    }
  }

  // Batch-fetch shared ritual names for all people
  const allRitualIds = new Set<number>();
  for (const p of map.values()) for (const rid of p.sharedRitualIds) allRitualIds.add(rid);
  const ritualNameMap = new Map<number, string>();
  if (allRitualIds.size > 0) {
    const ritualRows = await db.select({ id: ritualsTable.id, name: ritualsTable.name })
      .from(ritualsTable).where(inArray(ritualsTable.id, Array.from(allRitualIds)));
    for (const r of ritualRows) ritualNameMap.set(r.id, r.name);
  }

  // Batch-fetch most recent bloom window date per shared moment
  const lastBloomMap = new Map<number, string>();

  // Owner's moment IDs — derived once and reused per-person inside the
  // map below to compute "shared practices." This was previously
  // referenced as a free variable at the per-person level (`if
  // (ownerMomentIds.length > 0)`) but never defined in this handler,
  // which would throw `ReferenceError: ownerMomentIds is not defined`
  // the first time someone landed in the garden. The Promise.all
  // around the map swallowed the rejection into a 500 and the People
  // page rendered blank — the recurring "empty garden" report users
  // keep filing. Mirrors the same lookup used by /people/:email.
  const ownerTokenRowsForMoments = await db
    .select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRowsForMoments.map(t => t.momentId);

  const peopleEnriched = await Promise.all(
    Array.from(map.values()).map(async (p) => {
      let maxStreak = 0;
      let score = 0;
      let sharedMomentIds: number[] = [];
      let sharedPractices: Array<{ id: number; name: string; currentStreak: number; templateType: string | null }> = [];
      let lastActiveDate: string | null = null;

      // Shared tradition names
      const sharedTraditions = p.sharedRitualIds
        .map(rid => ({ id: rid, name: ritualNameMap.get(rid) ?? "Tradition" }))
        .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

      // Completed meetups across shared rituals
      if (p.sharedRitualIds.length > 0) {
        const completedRows = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(meetupsTable)
          .where(and(
            inArray(meetupsTable.ritualId, p.sharedRitualIds),
            eq(meetupsTable.status, "completed")
          ));
        score += completedRows[0]?.count ?? 0;
      }

      // Shared practices — only ACTIVE ones count. We mirror the filter used
      // by /people/:email and the main moments list: archived moments and
      // intercessions past their 1-day post-goal grace period are treated
      // as past, not active. Without this the People list surfaces stale
      // streaks from practices that have long since ended.
      if (ownerMomentIds.length > 0) {
        const personTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
          .from(momentUserTokensTable)
          .where(eq(momentUserTokensTable.email, p.email));
        const personMomentIdSet = new Set(personTokenRows.map(t => t.momentId));
        sharedMomentIds = ownerMomentIds.filter(id => personMomentIdSet.has(id));

        if (sharedMomentIds.length > 0) {
          const sharedMomentsRaw = await db
            .select({
              id: sharedMomentsTable.id,
              name: sharedMomentsTable.name,
              currentStreak: sharedMomentsTable.currentStreak,
              templateType: sharedMomentsTable.templateType,
              state: sharedMomentsTable.state,
              commitmentGoalReachedAt: sharedMomentsTable.commitmentGoalReachedAt,
              goalDays: sharedMomentsTable.goalDays,
              totalBlooms: sharedMomentsTable.totalBlooms,
            })
            .from(sharedMomentsTable)
            .where(inArray(sharedMomentsTable.id, sharedMomentIds));

          const nowMs = Date.now();
          const graceMs = 2 * 24 * 60 * 60 * 1000;
          const isExpiredIntercession = (m: typeof sharedMomentsRaw[number]) => {
            if (m.templateType !== "intercession") return false;
            const reachedAt = m.commitmentGoalReachedAt;
            if (reachedAt && (nowMs - new Date(reachedAt).getTime()) > graceMs) return true;
            if (!reachedAt && m.goalDays > 0 && m.totalBlooms > 0) return true;
            return false;
          };
          const sharedMoments = sharedMomentsRaw.filter(
            m => m.state !== "archived" && !isExpiredIntercession(m),
          );
          // Narrow sharedMomentIds so streak/bloom queries below only see active ones
          sharedMomentIds = sharedMoments.map(m => m.id);
          if (sharedMomentIds.length === 0) {
            // No active shared practices — short-circuit so we don't query
            // windows/posts for nothing.
          }

          // Compute group streak from actual window data (DB field can be corrupted)
          const windowRows = await db
            .select({
              momentId: momentWindowsTable.momentId,
              windowDate: momentWindowsTable.windowDate,
              status: momentWindowsTable.status,
            })
            .from(momentWindowsTable)
            .where(inArray(momentWindowsTable.momentId, sharedMomentIds))
            .orderBy(desc(momentWindowsTable.windowDate));

          const streakByMoment = new Map<number, number>();
          for (const m of sharedMoments) {
            const windows = windowRows
              .filter(w => w.momentId === m.id)
              .sort((a, b) => b.windowDate.localeCompare(a.windowDate));
            let streak = 0;
            for (const w of windows) {
              if (w.status === "bloom") streak++;
              else break;
            }
            streakByMoment.set(m.id, streak);
          }

          maxStreak = Math.max(0, ...Array.from(streakByMoment.values()));
          sharedPractices = sharedMoments.map(m => ({
            id: m.id,
            name: m.name,
            currentStreak: streakByMoment.get(m.id) ?? 0,
            templateType: m.templateType,
          }));

          // Bloom windows = shared practice sessions done together
          const bloomRows = await db
            .select({ count: sql<number>`cast(count(*) as int)` })
            .from(momentWindowsTable)
            .where(and(
              inArray(momentWindowsTable.momentId, sharedMomentIds),
              eq(momentWindowsTable.status, "bloom")
            ));
          score += bloomRows[0]?.count ?? 0;

          // Most recent bloom window for this person's shared practices
          const lastBloomRow = await db
            .select({ windowDate: momentWindowsTable.windowDate })
            .from(momentWindowsTable)
            .where(and(
              inArray(momentWindowsTable.momentId, sharedMomentIds),
              eq(momentWindowsTable.status, "bloom")
            ))
            .orderBy(desc(momentWindowsTable.windowDate))
            .limit(1);
          lastActiveDate = lastBloomRow[0]?.windowDate ?? null;
        }
      }

      const prayer = activePrayerMap.get(p.email) ?? null;

      return {
        name: p.name,
        email: p.email,
        avatarUrl: avatarByEmail.get(p.email.toLowerCase()) ?? null,
        sharedCircleCount: p.sharedCircleCount,
        firstCircleDate: p.firstCircleDate.toISOString(),
        maxSharedStreak: maxStreak,
        score,
        sharedPractices,
        sharedTraditions,
        lastActiveDate: lastActiveDate ?? p.firstCircleDate.toISOString(),
        activePrayerRequest: prayer,
      };
    })
  );

  res.json(peopleEnriched);
});

// GET /api/people/:email?ownerId=N
// Returns a full relationship profile for a specific person
router.get("/people/:email", async (req, res): Promise<void> => {
  const email = decodeURIComponent(req.params.email ?? "");
  const ownerId = parseInt(String(req.query.ownerId ?? ""), 10);

  if (!email || isNaN(ownerId)) {
    res.status(400).json({ error: "email and ownerId are required" });
    return;
  }

  const { user: owner, rituals: allRituals } = await getUserRituals(ownerId);
  const ownerEmail = owner?.email ?? "";

  const sharedRituals = allRituals.filter(r => {
    const participants = (r.participants as Participant[]) ?? [];
    return participants.some(p => p.email === email);
  });

  // Find shared practices (moments) where both owner and person are members
  const ownerTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRows.map(t => t.momentId);

  let sharedPractices: Array<{
    id: number; name: string; currentStreak: number; longestStreak: number;
    totalBlooms: number; frequency: string; templateType: string | null; createdAt: string;
  }> = [];
  let pastSharedPractices: typeof sharedPractices = [];
  let sharedMomentIds: number[] = [];

  if (ownerMomentIds.length > 0) {
    const personTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, email));
    const personMomentIdSet = new Set(personTokenRows.map(t => t.momentId));
    sharedMomentIds = ownerMomentIds.filter(id => personMomentIdSet.has(id));

    if (sharedMomentIds.length > 0) {
      const allMoments = await db.select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intention: sharedMomentsTable.intention,
        currentStreak: sharedMomentsTable.currentStreak,
        longestStreak: sharedMomentsTable.longestStreak,
        totalBlooms: sharedMomentsTable.totalBlooms,
        frequency: sharedMomentsTable.frequency,
        templateType: sharedMomentsTable.templateType,
        state: sharedMomentsTable.state,
        goalDays: sharedMomentsTable.goalDays,
        commitmentGoalReachedAt: sharedMomentsTable.commitmentGoalReachedAt,
        createdAt: sharedMomentsTable.createdAt,
      }).from(sharedMomentsTable).where(inArray(sharedMomentsTable.id, sharedMomentIds));

      // Mirror the filter used by the main moments list: intercessions that
      // have passed their 2-day grace period after hitting their goal are
      // treated as past, not active (see routes/moments.ts).
      const now = Date.now();
      const graceMs = 2 * 24 * 60 * 60 * 1000;
      const isExpiredIntercession = (m: typeof allMoments[number]) => {
        if (m.templateType !== "intercession") return false;
        const reachedAt = m.commitmentGoalReachedAt;
        if (reachedAt && (now - new Date(reachedAt).getTime()) > graceMs) return true;
        // Legacy intercessions that hit their goal before the stamping code
        // was deployed: totalBlooms > 0 with no reachedAt — treat as expired.
        if (!reachedAt && m.goalDays > 0 && m.totalBlooms > 0) return true;
        return false;
      };

      const activeMoments = allMoments.filter(m => m.state !== "archived" && !isExpiredIntercession(m));
      const archivedMoments = allMoments.filter(m => m.state === "archived" || isExpiredIntercession(m));

      // Narrow sharedMomentIds to only active practices so bloom/streak stats match
      sharedMomentIds = activeMoments.map(m => m.id);

      // Compute live bloom counts for active practices
      const bloomCountRows = await db
        .select({
          momentId: momentWindowsTable.momentId,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(momentWindowsTable)
        .where(and(
          inArray(momentWindowsTable.momentId, allMoments.map(m => m.id)),
          eq(momentWindowsTable.status, "bloom")
        ))
        .groupBy(momentWindowsTable.momentId);
      const bloomCountMap = new Map(bloomCountRows.map(r => [r.momentId, r.count]));

      sharedPractices = activeMoments.map(m => ({
        ...m,
        totalBlooms: bloomCountMap.get(m.id) ?? m.totalBlooms,
        createdAt: m.createdAt.toISOString(),
      }));

      pastSharedPractices = archivedMoments.map(m => ({
        ...m,
        totalBlooms: bloomCountMap.get(m.id) ?? m.totalBlooms,
        createdAt: m.createdAt.toISOString(),
      }));
    }
  }

  // Look up person user + correspondent status + shared groups before the
  // existence check, since a person can be in the viewer's world via
  // garden/groups/correspondence alone.
  const [personUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));

  let isCorrespondent = false;
  if (personUser) {
    const correspondentIds = await getCorrespondentUserIds(ownerId);
    isCorrespondent = correspondentIds.includes(personUser.id);
  }

  // Find groups both users are members of
  let sharedGroups: Array<{ id: number; name: string; slug: string; emoji: string | null }> = [];
  const [ownerUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, ownerId));
  if (ownerUser && personUser) {
    const ownerMemberships = await db.select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.email, owner?.email ?? ""));
    const personMemberships = await db.select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.email, email));
    const ownerGroupIds = new Set(ownerMemberships.map(m => m.groupId));
    const sharedGroupIds = personMemberships.map(m => m.groupId).filter(id => ownerGroupIds.has(id));
    if (sharedGroupIds.length > 0) {
      const groups = await db.select({ id: groupsTable.id, name: groupsTable.name, slug: groupsTable.slug, emoji: groupsTable.emoji })
        .from(groupsTable)
        .where(inArray(groupsTable.id, sharedGroupIds));
      sharedGroups = groups;
    }
  }

  if (
    sharedRituals.length === 0 &&
    sharedPractices.length === 0 &&
    pastSharedPractices.length === 0 &&
    sharedGroups.length === 0 &&
    !isCorrespondent
  ) {
    res.status(404).json({ error: "Person not found in any of your shared practices, gatherings, communities, or garden" });
    return;
  }

  // Resolve display name
  let personName = email;
  for (const ritual of sharedRituals) {
    const match = (ritual.participants as Participant[]).find(p => p.email === email);
    if (match?.name) { personName = match.name; break; }
  }
  if (personName === email && ownerMomentIds.length > 0) {
    const nameRow = await db.select({ name: momentUserTokensTable.name })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, email))
      .limit(1);
    if (nameRow[0]?.name) personName = nameRow[0].name;
  }

  // Enrich each shared ritual with its meetups
  const enriched = await Promise.all(
    sharedRituals.map(async (ritual) => {
      const meetups = await db
        .select()
        .from(meetupsTable)
        .where(eq(meetupsTable.ritualId, ritual.id))
        .orderBy(desc(meetupsTable.scheduledDate));

      const { streak, nextMeetupDate, lastMeetupDate, status } = computeStreak(meetups, ritual.frequency);

      return {
        ritual: {
          id: ritual.id,
          name: ritual.name,
          frequency: ritual.frequency,
          dayPreference: ritual.dayPreference,
          intention: ritual.intention,
          participants: (ritual.participants as Participant[]),
          ownerId: ritual.ownerId,
          createdAt: ritual.createdAt.toISOString(),
          streak,
          nextMeetupDate,
          lastMeetupDate,
          status,
        },
        meetups: meetups.map(m => ({
          id: m.id,
          ritualId: m.ritualId,
          scheduledDate: new Date(m.scheduledDate as unknown as string).toISOString(),
          status: m.status,
          notes: m.notes,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    })
  );

  // Aggregate stats
  const totalGatherings = enriched.reduce(
    (sum, { meetups }) => sum + meetups.filter(m => m.status === "completed").length,
    0
  );

  let totalBloomWindows = 0;
  if (sharedMomentIds.length > 0) {
    const bloomRows = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(momentWindowsTable)
      .where(and(
        inArray(momentWindowsTable.momentId, sharedMomentIds),
        eq(momentWindowsTable.status, "bloom")
      ));
    totalBloomWindows = bloomRows[0]?.count ?? 0;
  }

  const score = totalGatherings + totalBloomWindows;

  // Best current streak across all shared traditions + practices
  const currentBestStreak = Math.max(
    0,
    ...enriched.map(e => e.ritual.streak),
    ...sharedPractices.map(p => p.currentStreak)
  );
  // Best all-time streak (traditions only have current; practices have longestStreak)
  const longestEverStreak = Math.max(
    0,
    ...enriched.map(e => e.ritual.streak),
    ...sharedPractices.map(p => p.longestStreak)
  );

  const firstCircleDate = sharedRituals.length > 0
    ? new Date(Math.min(...sharedRituals.map(r => r.createdAt.getTime()))).toISOString()
    : null;

  // Fetch active prayer request for this person. On another person's
  // profile we only surface requests that are still current — expired
  // (past expiresAt, not renewed) requests drop off until the owner
  // renews them from their own dashboard.
  let activePrayerRequest: { id: number; body: string; createdAt: string; expiresAt: string | null; myWord: string | null } | null = null;

  // Check if the viewing user has muted this person
  let isMuted = false;
  let avatarUrl: string | null = null;
  if (personUser) {
    const [muteRow] = await db.select({ id: userMutesTable.id })
      .from(userMutesTable)
      .where(and(eq(userMutesTable.muterId, ownerId), eq(userMutesTable.mutedUserId, personUser.id)));
    isMuted = !!muteRow;

    const [personData] = await db.select({ avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, personUser.id));
    avatarUrl = personData?.avatarUrl ?? null;
  }

  if (personUser) {
    const [req] = await db.select({
      id: prayerRequestsTable.id,
      body: prayerRequestsTable.body,
      createdAt: prayerRequestsTable.createdAt,
      expiresAt: prayerRequestsTable.expiresAt,
    }).from(prayerRequestsTable).where(
      and(
        eq(prayerRequestsTable.ownerId, personUser.id),
        eq(prayerRequestsTable.isAnswered, false),
        isNull(prayerRequestsTable.closedAt),
        or(
          isNull(prayerRequestsTable.expiresAt),
          gt(prayerRequestsTable.expiresAt, new Date()),
        ),
      )
    ).orderBy(desc(prayerRequestsTable.createdAt)).limit(1);
    if (req) {
      // Check if the viewing user already left a word
      let myWord: string | null = null;
      if (owner) {
        const [wordRow] = await db.select({ content: prayerWordsTable.content })
          .from(prayerWordsTable)
          .where(and(
            eq(prayerWordsTable.requestId, req.id),
            eq(prayerWordsTable.authorUserId, owner.id),
          ))
          .limit(1);
        myWord = wordRow?.content ?? null;
      }
      activePrayerRequest = {
        id: req.id,
        body: req.body,
        createdAt: req.createdAt.toISOString(),
        expiresAt: req.expiresAt?.toISOString() ?? null,
        myWord,
      };
    }
  }

  res.json({
    name: personName,
    email,
    userId: personUser?.id ?? null,
    avatarUrl,
    isMuted,
    isCorrespondent,
    stats: {
      sharedCircleCount: sharedRituals.length,
      sharedPracticesCount: sharedPractices.length,
      totalGatherings,
      totalBloomWindows,
      score,
      currentBestStreak,
      longestEverStreak,
      firstCircleDate,
    },
    sharedRituals: enriched,
    sharedPractices,
    pastPractices: pastSharedPractices,
    sharedGroups,
    activePrayerRequest,
  });
});

export default router;
