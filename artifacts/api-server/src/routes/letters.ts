import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  letterDraftsTable,
  letterRemindersTable,
} from "@workspace/db";
import {
  getPeriodStart,
  getPeriodEnd,
  getPeriodNumber,
  formatPeriodLabel,
  formatNextPeriodStart,
  formatHumanDate,
  formatPeriodStartDateString,
  isInLastThreeDays,
  getOneToOneTurnState,
} from "../lib/letterPeriods";
import { sendInvitationEmail, sendReminderEmail } from "../lib/letterEmails";
import { getInviteBaseUrl } from "../lib/urls";
import { sendNewLetterPush } from "../lib/pushSender";
import { ensureCorrespondenceFellows } from "../lib/correspondents";
// Auth + membership infra is shared with routes/phoebe.ts via
// lib/letterAuth.ts (was duplicated byte-for-byte in both files).
import {
  requireAuth,
  requireSessionAuth,
  getMembership,
} from "../lib/letterAuth";

const router: IRouter = Router();

// ─── CORRESPONDENCES ────────────────────────────────────────────────────────

router.post(
  "/letters/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    const { name, groupType, members } = req.body as {
      name: string;
      groupType: "one_to_one" | "small_group";
      members: Array<{ email: string; name?: string }>;
    };

    // Validation
    if (!name || name.length > 60) {
      res.status(400).json({ error: "Name is required (max 60 chars)" });
      return;
    }
    if (!["one_to_one", "small_group"].includes(groupType)) {
      res.status(400).json({ error: "Invalid group type" });
      return;
    }
    if (groupType === "one_to_one" && members.length !== 1) {
      res.status(400).json({ error: "One-to-one requires exactly 1 member" });
      return;
    }
    if (groupType === "small_group" && (members.length < 2 || members.length > 7)) {
      res.status(400).json({ error: "Correspondence requires 2-7 members" });
      return;
    }

    const emailSet = new Set(members.map((m) => m.email.toLowerCase()));
    if (emailSet.size !== members.length) {
      res.status(400).json({ error: "Duplicate emails" });
      return;
    }

    // Check for existing active correspondences between these users
    for (const m of members) {
      const memberEmail = m.email.toLowerCase();
      // Find all active correspondences where the creator is a member
      const creatorMemberships = await db
        .select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.email, auth.email.toLowerCase()));

      for (const cm of creatorMemberships) {
        const [corr] = await db
          .select()
          .from(correspondencesTable)
          .where(
            and(
              eq(correspondencesTable.id, cm.correspondenceId),
              eq(correspondencesTable.isActive, true),
            ),
          );
        if (!corr) continue;

        // Check if the invited member is also in this correspondence
        const [existingMember] = await db
          .select()
          .from(correspondenceMembersTable)
          .where(
            and(
              eq(correspondenceMembersTable.correspondenceId, corr.id),
              eq(correspondenceMembersTable.email, memberEmail),
            ),
          );

        if (existingMember) {
          res.status(409).json({
            error: "duplicate_correspondence",
            message: `You already have an active correspondence with ${m.name || memberEmail}.`,
          });
          return;
        }
      }
    }

    // Create correspondence
    const [correspondence] = await db
      .insert(correspondencesTable)
      .values({
        name,
        createdByUserId: auth.userId,
        groupType,
      })
      .returning();

    // Add creator as first member
    const creatorToken = randomUUID();
    await db.insert(correspondenceMembersTable).values({
      correspondenceId: correspondence.id,
      userId: auth.userId,
      email: auth.email.toLowerCase(),
      name: auth.name,
      inviteToken: creatorToken,
      joinedAt: new Date(),
    });

    // Add invited members
    const frontendUrl = getInviteBaseUrl();
    for (const m of members) {
      const inviteToken = randomUUID();
      await db.insert(correspondenceMembersTable).values({
        correspondenceId: correspondence.id,
        userId: null,
        email: m.email.toLowerCase(),
        name: m.name || null,
        inviteToken,
      });

      // Send invitation email (fire-and-forget)
      sendInvitationEmail({
        to: m.email,
        creatorName: auth.name,
        correspondenceName: name,
        inviteUrl: `${frontendUrl}/i/${inviteToken}`,
      }).catch((err) => console.error("Failed to send invitation:", err));
    }

    const allMembers = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

    res.json({ ...correspondence, members: allMembers });
  }),
);

router.get(
  "/letters/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    // Find all correspondences where user is a member
    const memberRows = await db
      .select()
      .from(correspondenceMembersTable)
      .where(
        and(
          auth.userId
            ? eq(correspondenceMembersTable.userId, auth.userId)
            : eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
          sql`archived_at IS NULL`,
        ),
      );

    const correspondenceIds = memberRows.map((m) => m.correspondenceId);
    if (correspondenceIds.length === 0) {
      res.json([]);
      return;
    }

    // Batch-fetch all three datasets in 3 queries total instead of
    // 3×N sequential round-trips (was: a for-loop issuing
    // correspondence + members + letters per correspondence — the
    // worst N+1 in the app, and serial rather than parallelized).
    // Indexes: correspondence_members(correspondence_id),
    // letters(correspondence_id).
    const corrs = await db
      .select()
      .from(correspondencesTable)
      .where(and(inArray(correspondencesTable.id, correspondenceIds), eq(correspondencesTable.isActive, true)));
    const allMemberRows = await db
      .select()
      .from(correspondenceMembersTable)
      .where(inArray(correspondenceMembersTable.correspondenceId, correspondenceIds));
    const allLetterRows = await db
      .select()
      .from(lettersTable)
      .where(inArray(lettersTable.correspondenceId, correspondenceIds));

    const membersByCorr = new Map<number, typeof allMemberRows>();
    for (const m of allMemberRows) {
      const arr = membersByCorr.get(m.correspondenceId) ?? [];
      arr.push(m);
      membersByCorr.set(m.correspondenceId, arr);
    }
    const lettersByCorr = new Map<number, typeof allLetterRows>();
    for (const l of allLetterRows) {
      const arr = lettersByCorr.get(l.correspondenceId) ?? [];
      arr.push(l);
      lettersByCorr.set(l.correspondenceId, arr);
    }

    const results = [];

    for (const correspondence of corrs) {
      const members = membersByCorr.get(correspondence.id) ?? [];
      const letters = lettersByCorr.get(correspondence.id) ?? [];

      const now = new Date();
      const periodDays = correspondence.groupType === "small_group" ? 14 : 7;
      const periodStart = getPeriodStart(correspondence.startedAt, now, periodDays);
      const periodEnd = getPeriodEnd(periodStart, periodDays);
      const periodNumber = getPeriodNumber(correspondence.startedAt, now, periodDays);
      const periodStartStr = formatPeriodStartDateString(periodStart);

      // Unread count
      const identifier = auth.userId ? auth.userId : auth.email;
      const unreadCount = letters.filter((l) => {
        const readers = (l.readBy as Array<string | number>) || [];
        return !readers.includes(identifier) && l.authorEmail !== auth.email;
      }).length;

      // Current period status
      const hasWrittenThisPeriod = letters.some(
        (l) => l.periodStartDate === periodStartStr && l.authorEmail === auth.email,
      );

      const membersWritten = members.map((m) => ({
        name: m.name || m.email,
        hasWritten: letters.some(
          (l) => l.periodStartDate === periodStartStr && l.authorEmail === m.email,
        ),
      }));

      // Recent letters for preview / latest-sent bookkeeping. The older
      // "postmark" surface (location attached to each letter) has been
      // removed — consumers now only care about sentAt.
      const recentLetters = [...letters]
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
        .slice(0, 3);

      // First unread letter for preview
      const firstUnread = letters.find((l) => {
        const readers = (l.readBy as Array<string | number>) || [];
        return !readers.includes(identifier) && l.authorEmail !== auth.email;
      });

      results.push({
        ...correspondence,
        members: members.map((m) => ({
          name: m.name,
          email: m.email,
          joinedAt: m.joinedAt,
          lastLetterAt: m.lastLetterAt,
        })),
        letterCount: letters.length,
        unreadCount,
        recentLetters: recentLetters.map((l) => ({
          authorName: l.authorName,
          sentAt: l.sentAt,
        })),
        unreadPreview: firstUnread
          ? {
              authorName: firstUnread.authorName,
              content: firstUnread.content.slice(0, 120),
            }
          : null,
        currentPeriod: {
          periodNumber,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          periodLabel: formatPeriodLabel(periodStart, periodEnd),
          hasWrittenThisPeriod,
          membersWritten,
          isLastThreeDays: isInLastThreeDays(periodStart, now, periodDays),
        },
      });
    }

    // Sort: "needs response" (they wrote, I haven't) first, then rest
    results.sort((a, b) => {
      const needsResponseA = a.currentPeriod.membersWritten.some(
        (m: { name: string; hasWritten: boolean }) => m.name !== (auth.email) && m.hasWritten,
      ) && !a.currentPeriod.hasWrittenThisPeriod ? 1 : 0;
      const needsResponseB = b.currentPeriod.membersWritten.some(
        (m: { name: string; hasWritten: boolean }) => m.name !== (auth.email) && m.hasWritten,
      ) && !b.currentPeriod.hasWrittenThisPeriod ? 1 : 0;
      return needsResponseB - needsResponseA;
    });

    res.json(results);
  }),
);

// ─── ARCHIVE CORRESPONDENCE ──────────────────────────────────────────────────

router.post(
  "/letters/correspondences/:id/archive",
  requireSessionAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    await db
      .update(correspondenceMembersTable)
      .set({ archivedAt: new Date() } as any)
      .where(
        and(
          eq(correspondenceMembersTable.correspondenceId, correspondenceId),
          auth.userId
            ? eq(correspondenceMembersTable.userId, auth.userId)
            : eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
        ),
      );
    res.json({ ok: true });
  }),
);

router.get(
  "/letters/correspondences/:id",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    // The select returns raw columns including the now-deprecated
    // `postmarkCity` / `postmarkCountry` columns — strip those from
    // the outgoing response so clients never see them again.
    const rawLetters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));
    const letters = rawLetters.map((l) => {
      const { postmarkCity: _pc, postmarkCountry: _po, ...rest } = l as typeof l & {
        postmarkCity?: string | null;
        postmarkCountry?: string | null;
      };
      void _pc; void _po;
      return rest;
    });

    const now = new Date();
    const periodDays = correspondence.groupType === "small_group" ? 14 : 7;
    const periodStart = getPeriodStart(correspondence.startedAt, now, periodDays);
    const periodEnd = getPeriodEnd(periodStart, periodDays);
    const periodNumber = getPeriodNumber(correspondence.startedAt, now, periodDays);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    const hasWrittenThisPeriod = letters.some(
      (l) => l.periodStartDate === periodStartStr && l.authorEmail === auth.email,
    );

    const membersWritten = members.map((m) => ({
      name: m.name || m.email,
      email: m.email,
      hasWritten: letters.some(
        (l) => l.periodStartDate === periodStartStr && l.authorEmail === m.email,
      ),
    }));

    res.json({
      ...correspondence,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        joinedAt: m.joinedAt,
        lastLetterAt: m.lastLetterAt,
      })),
      letters,
      currentPeriod: {
        periodNumber,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        periodLabel: formatPeriodLabel(periodStart, periodEnd),
        hasWrittenThisPeriod,
        membersWritten,
        isLastThreeDays: isInLastThreeDays(periodStart, now, periodDays),
      },
    });
  }),
);

// ─── LETTERS ────────────────────────────────────────────────────────────────

router.get(
  "/letters/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const rawLetters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    // Mark unread letters as read
    const identifier = auth.userId ? auth.userId : auth.email;
    for (const letter of rawLetters) {
      const readers = (letter.readBy as Array<string | number>) || [];
      if (!readers.includes(identifier) && letter.authorEmail !== auth.email) {
        await db
          .update(lettersTable)
          .set({ readBy: [...readers, identifier] })
          .where(eq(lettersTable.id, letter.id));
      }
    }

    // Strip deprecated postmark columns from the response.
    const letters = rawLetters.map((l) => {
      const { postmarkCity: _pc, postmarkCountry: _po, ...rest } = l as typeof l & {
        postmarkCity?: string | null;
        postmarkCountry?: string | null;
      };
      void _pc; void _po;
      return rest;
    });

    res.json(letters);
  }),
);

router.post(
  "/letters/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member || !member.joinedAt) {
      res.status(403).json({ error: "Not a joined member" });
      return;
    }

    const { content } = req.body as { content: string };
    if (!content || !content.trim()) {
      res.status(400).json({ error: "Letter content is required" });
      return;
    }
    const wordCount = content.trim().split(/\s+/).length;
    if (wordCount < 100) {
      res.status(400).json({ error: "Letter must be at least 100 words", wordCount });
      return;
    }
    if (wordCount > 1000) {
      res.status(400).json({ error: "Letter must be 1000 words or fewer", wordCount });
      return;
    }

    const now = new Date();
    const periodDays = correspondence.groupType === "small_group" ? 14 : 7;
    const periodStart = getPeriodStart(correspondence.startedAt, now, periodDays);
    const periodStartStr = formatPeriodStartDateString(periodStart);
    const periodNumber = getPeriodNumber(correspondence.startedAt, now, periodDays);

    // Cadence gate for one_to_one — mirror the phoebe route's turn-state logic.
    if (correspondence.groupType === "one_to_one") {
      const allLetters = await db
        .select()
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, correspondenceId));
      const other = members.find((m) => m.email !== auth.email);
      const turn = getOneToOneTurnState(
        auth.email,
        other?.email ?? "",
        allLetters.map((l) => ({ authorEmail: l.authorEmail, sentAt: new Date(l.sentAt) })),
        correspondence.firstExchangeComplete,
        now,
      );
      if (turn.state !== "OPEN" && turn.state !== "OVERDUE") {
        res.status(403).json({
          error: "not_your_turn",
          message: `It's ${other?.name || "your correspondent"}'s turn to write.`,
          nextPeriodStart: turn.windowOpenDate ? turn.windowOpenDate.toISOString() : null,
        });
        return;
      }
    } else {
      // Group: one letter per 14-day period.
      const existingLetters = await db
        .select()
        .from(lettersTable)
        .where(
          and(
            eq(lettersTable.correspondenceId, correspondenceId),
            eq(lettersTable.authorEmail, auth.email),
            eq(lettersTable.periodStartDate, periodStartStr),
          ),
        );

      if (existingLetters.length > 0) {
        res.status(429).json({
          error: "already_written_this_period",
          message: "Your letter for this period has already been sent.",
          nextPeriodStart: formatNextPeriodStart(correspondence.startedAt, periodDays),
        });
        return;
      }
    }

    // Calculate letter number for this author
    const authorLetters = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, correspondenceId),
          eq(lettersTable.authorEmail, auth.email),
        ),
      );

    const letterNumber = authorLetters.length + 1;

    // author_name is NOT NULL — fall back to email local-part when the
    // user's display name is null/empty so the insert doesn't 500.
    const resolvedAuthorName =
      (auth.name && auth.name.trim()) || auth.email.split("@")[0] || "Anonymous";

    // Create letter
    const [letter] = await db
      .insert(lettersTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        authorName: resolvedAuthorName,
        content: content.trim(),
        letterNumber,
        periodNumber,
        periodStartDate: periodStartStr,
      })
      .returning();

    // Update member's lastLetterAt.
    await db
      .update(correspondenceMembersTable)
      .set({ lastLetterAt: now })
      .where(eq(correspondenceMembersTable.id, member.id));

    // Flip firstExchangeComplete for one_to_one when two distinct authors exist.
    if (correspondence.groupType === "one_to_one" && !correspondence.firstExchangeComplete) {
      const authorsAfter = await db
        .select({ authorEmail: lettersTable.authorEmail })
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, correspondenceId));
      const distinctAuthors = new Set(authorsAfter.map((r) => r.authorEmail.toLowerCase()));
      if (distinctAuthors.size >= 2) {
        await db
          .update(correspondencesTable)
          .set({ firstExchangeComplete: true })
          .where(eq(correspondencesTable.id, correspondenceId));
      }
    }

    // Delete draft for this period
    await db
      .delete(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodStartStr),
        ),
      );

    // Send calendar events + notification emails to other members (fire-and-forget)
    const frontendUrl = getInviteBaseUrl();
    const authEmailLcNotif = auth.email.toLowerCase();
    for (const m of members) {
      if (m.email.toLowerCase() === authEmailLcNotif) continue;
      if (!m.joinedAt) continue;
      // If the recipient has archived this dialogue on their side, don't
      // send a "new letter" push — they've stepped away from the thread.
      if (m.archivedAt) continue;

      const correspondenceUrl = m.userId
        ? `${frontendUrl}/letters/${correspondenceId}`
        : `${frontendUrl}/letters/${correspondenceId}?token=${m.inviteToken}`;

      // Letter delivery used to fan out to email + (later) push. The
      // email path was removed because (a) it duplicated the push that
      // already lands on a user's lock screen and (b) the Gmail API
      // call kept failing for projects without it enabled, dirtying
      // logs with PERMISSION_DENIED stack traces. Push is now the only
      // notification channel for "you have a new letter."
      void correspondenceUrl;
      // Push only on one_to_one — small_group members get a single
      // "your write window opened" push at the start of each period
      // instead, fired by the scheduled letter-window sweep. A
      // community feed shouldn't ping you every time someone in it
      // writes.
      if (m.userId && correspondence.groupType === "one_to_one") {
        sendNewLetterPush(m.userId, {
          letterId: letter.id,
          correspondenceId,
          correspondenceName: correspondence.name,
          authorName: auth.name,
        }).catch((err) => console.error("Failed to send new letter push:", err));
      }
    }

    // "Anyone you are writing a letter with becomes a Fellow." A letter
    // was just sent — link the author with every other joined member.
    // Fire-and-forget + idempotent; also upgrades an offices-only writer.
    void ensureCorrespondenceFellows(correspondenceId).catch((err) =>
      console.warn("[letters] ensureCorrespondenceFellows failed:", err),
    );

    res.json(letter);
  }),
);

// ─── DRAFTS ─────────────────────────────────────────────────────────────────

router.put(
  "/letters/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { content } = req.body as { content: string };
    const now = new Date();
    const periodDays = correspondence.groupType === "small_group" ? 14 : 7;
    const periodStart = getPeriodStart(correspondence.startedAt, now, periodDays);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    await db
      .insert(letterDraftsTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        content: content || "",
        periodStartDate: periodStartStr,
      })
      .onConflictDoUpdate({
        target: [letterDraftsTable.correspondenceId, letterDraftsTable.authorEmail, letterDraftsTable.periodStartDate],
        set: {
          content: content || "",
          lastSavedAt: now,
        },
      });

    res.json({ saved: true, savedAt: now.toISOString() });
  }),
);

router.get(
  "/letters/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const now = new Date();
    const periodDays = correspondence.groupType === "small_group" ? 14 : 7;
    const periodStart = getPeriodStart(correspondence.startedAt, now, periodDays);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    const [draft] = await db
      .select()
      .from(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodStartStr),
        ),
      );

    res.json(draft || null);
  }),
);

// ─── INVITATIONS ────────────────────────────────────────────────────────────

router.get("/letters/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));

  if (!member) {
    res.status(404).json({ error: "Invalid invitation" });
    return;
  }

  const [correspondence] = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.id, member.correspondenceId));

  if (!correspondence) {
    res.status(404).json({ error: "Correspondence not found" });
    return;
  }

  // Get creator info
  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

  const creator = members.find((m) => m.userId === correspondence.createdByUserId);

  const letterCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lettersTable)
    .where(eq(lettersTable.correspondenceId, correspondence.id));

  res.json({
    correspondenceName: correspondence.name,
    creatorName: creator?.name || "Someone",
    groupType: correspondence.groupType,
    memberCount: members.length,
    letterCount: letterCount[0]?.count || 0,
    alreadyJoined: !!member.joinedAt,
    memberEmail: member.email,
  });
});

router.post("/letters/invite/:token/accept", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { name, email } = req.body as { name: string; email: string };

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));

  if (!member) {
    res.status(404).json({ error: "Invalid invitation" });
    return;
  }

  if (member.joinedAt) {
    res.json({ correspondenceId: member.correspondenceId, token });
    return;
  }

  // The invite is bound to a specific email — refuse if the body
  // tries to claim it for a different address. Without this, a
  // leaked invite token could be redeemed against any account.
  if (email.toLowerCase() !== member.email.toLowerCase()) {
    res.status(403).json({ error: "This invitation is for a different email address." });
    return;
  }

  // Check if Phoebe account exists with this email
  const { usersTable } = await import("@workspace/db");
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  await db
    .update(correspondenceMembersTable)
    .set({
      joinedAt: new Date(),
      name,
      email: email.toLowerCase(),
      userId: existingUser?.id || null,
    })
    .where(eq(correspondenceMembersTable.id, member.id));

  // Newly-joined member with an account → link them as Fellows with every
  // other joined member ("writing a letter with" them). Fire-and-forget +
  // idempotent. A Fellow link is a full-app trigger.
  if (existingUser?.id) {
    void ensureCorrespondenceFellows(member.correspondenceId).catch((err) =>
      console.warn("[letters] ensureCorrespondenceFellows (accept) failed:", err),
    );
  }

  res.json({ correspondenceId: member.correspondenceId, token });
});

// ─── DELETE ALL LETTERS (admin) ─────────────────────────────────────────────

router.delete("/letters/all", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  // Fail-CLOSED when the env var isn't set: `undefined !== undefined`
  // is false, so without the !envVar guard a missing key would let
  // every public request through. Same shape as office.ts.
  if (!process.env["INTERNAL_API_KEY"] || internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  await db.delete(letterDraftsTable);
  await db.delete(lettersTable);
  res.json({ ok: true, message: "All letters and drafts deleted" });
});

// ─── REMINDER CRON ──────────────────────────────────────────────────────────

router.post("/letters/send-reminders", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (!process.env["INTERNAL_API_KEY"] || internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const correspondences = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.isActive, true));

  const now = new Date();
  const frontendUrl = getInviteBaseUrl();
  let remindersSent = 0;

  for (const c of correspondences) {
    const periodDays = c.groupType === "small_group" ? 14 : 7;
    const periodStart = getPeriodStart(c.startedAt, now, periodDays);

    if (!isInLastThreeDays(periodStart, now, periodDays)) continue;

    const periodStartStr = formatPeriodStartDateString(periodStart);
    const periodEnd = getPeriodEnd(periodStart, periodDays);
    const periodEndLabel = formatHumanDate(periodEnd);

    const members = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, c.id));

    const letters = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, c.id),
          eq(lettersTable.periodStartDate, periodStartStr),
        ),
      );

    const writtenEmails = new Set(letters.map((l) => l.authorEmail));

    for (const m of members) {
      if (!m.joinedAt) continue;
      if (writtenEmails.has(m.email)) continue;

      // Check if reminder already sent
      const [existing] = await db
        .select()
        .from(letterRemindersTable)
        .where(
          and(
            eq(letterRemindersTable.correspondenceId, c.id),
            eq(letterRemindersTable.memberEmail, m.email),
            eq(letterRemindersTable.periodStartDate, periodStartStr),
          ),
        );

      if (existing) continue;

      const writeUrl = m.userId
        ? `${frontendUrl}/letters/${c.id}/write`
        : `${frontendUrl}/letters/${c.id}/write?token=${m.inviteToken}`;

      await sendReminderEmail({
        to: m.email,
        correspondenceName: c.name,
        writeUrl,
        periodEnd: periodEndLabel,
      });

      await db.insert(letterRemindersTable).values({
        correspondenceId: c.id,
        memberEmail: m.email,
        periodStartDate: periodStartStr,
      });

      remindersSent++;
    }
  }

  res.json({ remindersSent });
});

export default router;
