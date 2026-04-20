import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  letterDraftsTable,
  letterRemindersTable,
  usersTable,
} from "@workspace/db";
import {
  formatNextPeriodStart,
  formatHumanDate,
  getCurrentPeriodInfo,
  getOneToOneTurnState,
  getNextFridayOnOrAfter,
  type OneToOneTurnState,
} from "../lib/letterPeriods";
import {
  sendInvitationEmail,
  sendNewLetterEmail,
  sendReminderEmail,
} from "../lib/letterEmails";
import {
  sendLetterCalendarEvent,
  sendLetterWindowOpenCalendarEvent,
  sendLetterOverdueCalendarEvent,
  sendLetterInvitationCalendarEvent,
  cancelLetterCalendarEvent,
} from "../lib/letterCalendar";
import { getInviteBaseUrl } from "../lib/urls";

const router: IRouter = Router();

// ─── Auth ────────────────────────────────────────────────────────────────────

interface LetterAuth {
  userId: number | null;
  email: string;
  name: string;
}

async function resolveLetterAuth(req: Request): Promise<LetterAuth | null> {
  if (req.user) {
    const u = req.user as { id: number; email: string; name: string };
    return { userId: u.id, email: u.email, name: u.name };
  }
  const token = req.query.token as string | undefined;
  if (token) {
    const [member] = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.inviteToken, token))
      .limit(1);
    if (member && member.joinedAt) {
      return { userId: member.userId, email: member.email, name: member.name || "Anonymous" };
    }
  }
  return null;
}

function requireAuth(handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    const auth = await resolveLetterAuth(req);
    if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }
    await handler(req, res, auth);
  };
}

function requireSessionAuth(handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const u = req.user as { id: number; email: string; name: string };
    await handler(req, res, { userId: u.id, email: u.email, name: u.name });
  };
}

// ─── Membership helper ────────────────────────────────────────────────────────

async function getMembership(correspondenceId: number, auth: LetterAuth) {
  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondenceId));
  const member = members.find(
    (m) => (auth.userId && m.userId === auth.userId) || m.email.toLowerCase() === auth.email.toLowerCase(),
  );
  return { member, members };
}

// ─── Turn logic ───────────────────────────────────────────────────────────────

/**
 * Resolve the current one_to_one turn state for a given participant.
 * Letter 1 → anytime. Letter 2 → immediate response. Letter 3+ →
 * 14-day alternating windows, missed windows stay OPEN as OVERDUE.
 */
function resolveOneToOneTurn(
  correspondence: { firstExchangeComplete: boolean; createdByUserId: number | null },
  requesterEmail: string,
  members: Array<{ email: string; userId: number | null }>,
  letters: Array<{ authorEmail: string; sentAt: Date }>,
  now: Date,
) {
  const other = members.find((m) => m.email.toLowerCase() !== requesterEmail.toLowerCase());
  const otherEmail = other?.email ?? "";
  // Find the creator's email so letter 1 is always assigned to the creator.
  const creator = members.find((m) => m.userId === correspondence.createdByUserId);
  return getOneToOneTurnState(
    requesterEmail,
    otherEmail,
    letters.map((l) => ({ authorEmail: l.authorEmail, sentAt: new Date(l.sentAt) })),
    correspondence.firstExchangeComplete,
    now,
    creator?.email,
  );
}

function isWritable(state: OneToOneTurnState): boolean {
  return state === "OPEN" || state === "OVERDUE";
}

// ─── POST /api/phoebe/correspondences ────────────────────────────────────────

router.post(
  "/phoebe/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    const { type, name, members } = req.body as {
      type: "one_to_one" | "group";
      name: string;
      members: Array<{ email: string; name?: string }>;
    };

    if (!name || name.length > 60) {
      res.status(400).json({ error: "Name is required (max 60 chars)" }); return;
    }
    if (!["one_to_one", "group"].includes(type)) {
      res.status(400).json({ error: "Invalid type" }); return;
    }
    if (type === "one_to_one" && members.length !== 1) {
      res.status(400).json({ error: "one_to_one requires exactly 1 member" }); return;
    }
    if (type === "group" && (members.length < 2 || members.length > 14)) {
      res.status(400).json({ error: "group requires 2–14 members (plus creator)" }); return;
    }

    const emailSet = new Set(members.map((m) => m.email.toLowerCase()));
    if (emailSet.size !== members.length) {
      res.status(400).json({ error: "Duplicate emails" }); return;
    }

    const [correspondence] = await db
      .insert(correspondencesTable)
      .values({ name, createdByUserId: auth.userId, groupType: type })
      .returning();

    const creatorToken = randomUUID();
    await db.insert(correspondenceMembersTable).values({
      correspondenceId: correspondence.id,
      userId: auth.userId,
      email: auth.email,
      name: auth.name,
      inviteToken: creatorToken,
      joinedAt: new Date(),
    });

    // Create member rows for invited participants — invitations are NOT sent
    // until the creator writes the first letter (so the recipient has
    // something to read when they click through).
    for (const m of members) {
      const inviteToken = randomUUID();
      await db.insert(correspondenceMembersTable).values({
        correspondenceId: correspondence.id,
        userId: null,
        email: m.email.toLowerCase(),
        name: m.name || null,
        inviteToken,
      });
    }

    const allMembers = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

    res.json({ ...correspondence, members: allMembers });
  }),
);

// ─── GET /api/phoebe/correspondences ─────────────────────────────────────────

router.get(
  "/phoebe/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    // Match by userId OR email so memberships created before account linkage are found
    const memberRows = await db
      .select()
      .from(correspondenceMembersTable)
      .where(
        and(
          auth.userId
            ? or(
                eq(correspondenceMembersTable.userId, auth.userId),
                eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
              )
            : eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
          sql`archived_at IS NULL`,
        ),
      );

    const results = [];
    const now = new Date();

    for (const mRow of memberRows) {
      const [correspondence] = await db
        .select()
        .from(correspondencesTable)
        .where(and(eq(correspondencesTable.id, mRow.correspondenceId), eq(correspondencesTable.isActive, true)));
      if (!correspondence) continue;

      const members = await db
        .select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

      const letters = await db
        .select()
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, correspondence.id));

      const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
      const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

      const identifier = auth.userId ?? auth.email;
      const unreadCount = letters.filter((l) => {
        const readers = (l.readBy as Array<string | number>) || [];
        return !readers.includes(identifier as string | number) && l.authorEmail !== auth.email;
      }).length;

      // For one_to_one: "have I written" = is the most recent letter mine?
      // For group: did I write in the current period bucket?
      const chronoLetters = [...letters].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      );
      const hasWrittenThisPeriod = type === "one_to_one"
        ? chronoLetters.length > 0 && chronoLetters[chronoLetters.length - 1].authorEmail === auth.email
        : letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === auth.email);

      const membersWritten = members.map((m) => ({
        name: m.name || m.email,
        email: m.email,
        hasWritten: letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === m.email),
      }));

      // Resolve turn state using new cadence model for one_to_one.
      let turnInfo: ReturnType<typeof getOneToOneTurnState> | null = null;
      let myTurn: boolean;
      if (type === "one_to_one") {
        turnInfo = resolveOneToOneTurn(correspondence, auth.email, members, letters, now);
        myTurn = isWritable(turnInfo.state);
      } else {
        myTurn = !hasWrittenThisPeriod;
      }

      const recentLetters = [...letters]
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
        .slice(0, 3);

      results.push({
        ...correspondence,
        members: members.map((m) => ({
          name: m.name,
          email: m.email,
          joinedAt: m.joinedAt,
          lastLetterAt: m.lastLetterAt,
          homeCity: m.homeCity,
        })),
        letterCount: letters.length,
        unreadCount,
        myTurn,
        turnState: turnInfo?.state ?? (myTurn ? "OPEN" : "WAITING"),
        windowOpenDate: turnInfo?.windowOpenDate?.toISOString() ?? null,
        overdueDate: turnInfo?.overdueDate?.toISOString() ?? null,
        firstExchangeComplete: correspondence.firstExchangeComplete,
        myCalendarPromptState: mRow.calendarPromptState ?? null,
        recentPostmarks: recentLetters
          .filter((l) => l.postmarkCity)
          .map((l) => ({ authorName: l.authorName, city: l.postmarkCity, sentAt: l.sentAt })),
        currentPeriod: {
          ...periodInfo,
          periodStart: periodInfo.periodStart.toISOString(),
          periodEnd: periodInfo.periodEnd.toISOString(),
          hasWrittenThisPeriod,
          membersWritten,
        },
      });
    }

    // Hide empty correspondences from invited users — they shouldn't see
    // the card until the creator has written the first letter.
    const visible = results.filter((r) => {
      if (r.letterCount > 0) return true;
      // Creator can always see their own correspondence (they need to write first).
      return r.createdByUserId === auth.userId;
    });

    // Sort: my turn first
    visible.sort((a, b) => (b.myTurn ? 1 : 0) - (a.myTurn ? 1 : 0));
    res.json(visible);
  }),
);

// ─── GET /api/phoebe/correspondences/:id ─────────────────────────────────────

router.get(
  "/phoebe/correspondences/:id",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    // Non-creators can't see an empty correspondence (no letter written yet).
    if (letters.length === 0 && correspondence.createdByUserId !== auth.userId) {
      res.status(404).json({ error: "Not found" }); return;
    }

    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    const chronoLetters = [...letters].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
    const hasWrittenThisPeriod = type === "one_to_one"
      ? chronoLetters.length > 0 && chronoLetters[chronoLetters.length - 1].authorEmail === auth.email
      : letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === auth.email);

    const membersWritten = members.map((m) => ({
      name: m.name || m.email,
      email: m.email,
      hasWritten: letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === m.email),
    }));

    let turnInfo: ReturnType<typeof getOneToOneTurnState> | null = null;
    let myTurn: boolean;
    if (type === "one_to_one") {
      turnInfo = resolveOneToOneTurn(correspondence, auth.email, members, letters, now);
      myTurn = isWritable(turnInfo.state);
    } else {
      myTurn = !hasWrittenThisPeriod;
    }

    res.json({
      ...correspondence,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        joinedAt: m.joinedAt,
        lastLetterAt: m.lastLetterAt,
        homeCity: m.homeCity,
      })),
      letters,
      myTurn,
      turnState: turnInfo?.state ?? (myTurn ? "OPEN" : "WAITING"),
      windowOpenDate: turnInfo?.windowOpenDate?.toISOString() ?? null,
      overdueDate: turnInfo?.overdueDate?.toISOString() ?? null,
      firstExchangeComplete: correspondence.firstExchangeComplete,
      myCalendarPromptState: member.calendarPromptState ?? null,
      currentPeriod: {
        ...periodInfo,
        periodStart: periodInfo.periodStart.toISOString(),
        periodEnd: periodInfo.periodEnd.toISOString(),
        hasWrittenThisPeriod,
        membersWritten,
      },
    });
  }),
);

// ─── GET /api/phoebe/correspondences/:id/letters ─────────────────────────────

router.get(
  "/phoebe/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    const identifier = auth.userId ?? auth.email;
    for (const letter of letters) {
      const readers = (letter.readBy as Array<string | number>) || [];
      if (!readers.includes(identifier as string | number) && letter.authorEmail !== auth.email) {
        await db
          .update(lettersTable)
          .set({ readBy: [...readers, identifier] })
          .where(eq(lettersTable.id, letter.id));
      }
    }

    res.json(letters);
  }),
);

// ─── POST /api/phoebe/correspondences/:id/letters ────────────────────────────

router.post(
  "/phoebe/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member || !member.joinedAt) { res.status(403).json({ error: "Not a joined member" }); return; }

    const { content, postmarkCity } = req.body as { content: string; postmarkCity?: string };
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const wordCount = content?.trim().split(/\s+/).length ?? 0;
    const minWords = type === "one_to_one" ? 100 : 50;
    const maxWords = type === "one_to_one" ? 5000 : 1000;

    if (!content?.trim()) {
      res.status(400).json({ error: "Content is required" }); return;
    }
    if (wordCount < minWords) {
      res.status(400).json({ error: `Minimum ${minWords} words`, wordCount }); return;
    }
    if (wordCount > maxWords) {
      res.status(400).json({ error: `Maximum ${maxWords} words`, wordCount }); return;
    }
    if (type === "one_to_one" && (!postmarkCity || !postmarkCity.trim())) {
      res.status(400).json({ error: "Postmark city is required — where are you writing from?" }); return;
    }

    const now = new Date();
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    // Cadence check
    if (type === "one_to_one") {
      const existingLetters = await db
        .select()
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, correspondenceId));

      const turn = resolveOneToOneTurn(correspondence, auth.email, members, existingLetters, now);
      if (!isWritable(turn.state)) {
        const other = members.find((m) => m.email !== auth.email);
        res.status(403).json({
          error: "not_your_turn",
          message: turn.windowOpenDate
            ? `It's ${other?.name || "your correspondent"}'s turn to write.`
            : `It's ${other?.name || "your correspondent"}'s turn — they're writing the next letter.`,
          nextPeriodStart: turn.windowOpenDate ? turn.windowOpenDate.toISOString() : null,
        });
        return;
      }
    } else {
      // Group: keep one-letter-per-period constraint.
      const existing = await db
        .select()
        .from(lettersTable)
        .where(
          and(
            eq(lettersTable.correspondenceId, correspondenceId),
            eq(lettersTable.authorEmail, auth.email),
            eq(lettersTable.periodStartDate, periodInfo.periodStartStr),
          ),
        );

      if (existing.length > 0) {
        res.status(429).json({
          error: "already_written",
          message: "You've already written this period.",
          nextPeriodStart: formatNextPeriodStart(correspondence.startedAt, 14),
        });
        return;
      }
    }

    const authorLetters = await db
      .select()
      .from(lettersTable)
      .where(and(eq(lettersTable.correspondenceId, correspondenceId), eq(lettersTable.authorEmail, auth.email)));

    const letterNumber = authorLetters.length + 1;
    const city = postmarkCity?.trim().slice(0, 100) || null;

    const [letter] = await db
      .insert(lettersTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        authorName: auth.name,
        content: content.trim(),
        letterNumber,
        periodNumber: periodInfo.periodNumber,
        periodStartDate: periodInfo.periodStartStr,
        postmarkCity: city,
      })
      .returning();

    await db
      .update(correspondenceMembersTable)
      .set({
        lastLetterAt: now,
        ...(city ? { homeCity: city } : {}),
        // The author just wrote — cancel any pending calendar reminders for them.
        lastCalendarEventId: null,
        overdueCalendarEventId: null,
      })
      .where(eq(correspondenceMembersTable.id, member.id));

    // Cancel (best-effort) any pending calendar reminders the author had.
    if (member.lastCalendarEventId) {
      cancelLetterCalendarEvent(member.lastCalendarEventId).catch(() => {});
    }
    if (member.overdueCalendarEventId) {
      cancelLetterCalendarEvent(member.overdueCalendarEventId).catch(() => {});
    }

    await db
      .delete(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodInfo.periodStartStr),
        ),
      );

    // Flip firstExchangeComplete for one_to_one when Letter 2 arrives
    // (two distinct authors now have letters in the correspondence).
    let firstExchangeJustCompleted = false;
    if (type === "one_to_one" && !correspondence.firstExchangeComplete) {
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
        correspondence.firstExchangeComplete = true;
        firstExchangeJustCompleted = true;
      }
    }

    // Check if this is the very first letter — if so, send invitations now.
    const allLettersAfter = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId));
    const isFirstLetter = allLettersAfter.length === 1;

    // Notify recipients (fire-and-forget)
    const frontendUrl = getInviteBaseUrl();
    for (const m of members) {
      if (m.email === auth.email) continue;

      // If the member hasn't joined yet and this is the first letter,
      // send the invitation email (they now have something to read).
      if (!m.joinedAt) {
        if (isFirstLetter) {
          const inviteUrl = `${frontendUrl}/i/${m.inviteToken}`;
          sendInvitationEmail({
            to: m.email,
            creatorName: auth.name,
            correspondenceName: correspondence.name,
            inviteUrl,
            type,
          }).catch((err) => console.error("Invitation email failed:", err));
          sendLetterInvitationCalendarEvent({
            recipientEmail: m.email,
            creatorName: auth.name,
            correspondenceName: correspondence.name,
            inviteUrl,
            type,
          }).catch((err) => console.error("Invitation calendar event failed:", err));
        }
        continue;
      }

      // Email + in-app link — use /letters/:id (existing thread view)
      const letterUrl = m.userId
        ? `${frontendUrl}/letters/${correspondenceId}`
        : `${frontendUrl}/letters/${correspondenceId}?token=${m.inviteToken}`;

      // The splash/deep-link URL — /letter/:id (singular, auth-gated)
      const letterSplashUrl = m.userId
        ? `${frontendUrl}/letter/${correspondenceId}`
        : `${frontendUrl}/letter/${correspondenceId}?token=${m.inviteToken}`;

      // "A letter arrived" postmark calendar event — existing behavior.
      if (type === "one_to_one" && city) {
        sendLetterCalendarEvent({
          recipientEmail: m.email,
          recipientName: m.name || m.email.split("@")[0],
          authorName: auth.name,
          correspondenceName: correspondence.name,
          postmarkCity: city,
          letterDate: now,
          letterUrl: letterSplashUrl,
          correspondenceId,
        }).catch((err) => console.error("Letter calendar event failed:", err));
      }

      // New: window-open reminder for the next writer, if the first exchange
      // is complete (i.e., strict alternation is now in force) AND they've
      // enabled calendar prompts. Scheduled for the first Friday on or after
      // (now + 14 days).
      if (
        type === "one_to_one" &&
        correspondence.firstExchangeComplete &&
        m.calendarPromptState === "enabled"
      ) {
        const windowOpen = new Date(now);
        windowOpen.setDate(windowOpen.getDate() + 14);
        const scheduledDate = getNextFridayOnOrAfter(windowOpen);

        const writeSplashUrl = m.userId
          ? `${frontendUrl}/letter/${correspondenceId}`
          : `${frontendUrl}/letter/${correspondenceId}?token=${m.inviteToken}`;

        sendLetterWindowOpenCalendarEvent({
          recipientEmail: m.email,
          waitingAuthorName: auth.name,
          correspondenceName: correspondence.name,
          scheduledDate,
          letterUrl: writeSplashUrl,
        })
          .then(async (eventId) => {
            if (eventId) {
              await db
                .update(correspondenceMembersTable)
                .set({ lastCalendarEventId: eventId })
                .where(eq(correspondenceMembersTable.id, m.id));
            }
          })
          .catch((err) => console.error("Window-open calendar event failed:", err));
      }

      sendNewLetterEmail({
        to: m.email,
        authorName: auth.name,
        correspondenceName: correspondence.name,
        correspondenceUrl: letterSplashUrl,
        postmarkCity: city || undefined,
        letterDate: now,
        type,
      }).catch((err) => console.error("Letter email failed:", err));
    }

    res.json({ ...letter, firstExchangeJustCompleted });
  }),
);

// ─── DRAFTS ───────────────────────────────────────────────────────────────────

router.put(
  "/phoebe/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { content } = req.body as { content: string };
    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    await db
      .insert(letterDraftsTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        content: content || "",
        periodStartDate: periodInfo.periodStartStr,
      })
      .onConflictDoUpdate({
        target: [letterDraftsTable.correspondenceId, letterDraftsTable.authorEmail, letterDraftsTable.periodStartDate],
        set: { content: content || "", lastSavedAt: now },
      });

    res.json({ saved: true, savedAt: now.toISOString() });
  }),
);

router.get(
  "/phoebe/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    const [draft] = await db
      .select()
      .from(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodInfo.periodStartStr),
        ),
      );

    res.json(draft || null);
  }),
);

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

router.post(
  "/phoebe/correspondences/:id/archive",
  requireSessionAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    await db
      .update(correspondenceMembersTable)
      .set({ archivedAt: new Date() } as any)
      .where(
        and(
          eq(correspondenceMembersTable.correspondenceId, correspondenceId),
          auth.userId
            ? or(
                eq(correspondenceMembersTable.userId, auth.userId),
                eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
              )
            : eq(correspondenceMembersTable.email, auth.email.toLowerCase()),
        ),
      );
    res.json({ ok: true });
  }),
);

// ─── INVITATIONS ──────────────────────────────────────────────────────────────

router.get("/phoebe/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));
  if (!member) { res.status(404).json({ error: "Invalid invitation" }); return; }

  const [correspondence] = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.id, member.correspondenceId));
  if (!correspondence) { res.status(404).json({ error: "Correspondence not found" }); return; }

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
    type: correspondence.groupType,
    memberCount: members.length,
    letterCount: letterCount[0]?.count || 0,
    alreadyJoined: !!member.joinedAt,
    memberEmail: member.email,
  });
});

router.post("/phoebe/invite/:token/accept", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { name, email } = req.body as { name: string; email: string };

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" }); return;
  }

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));
  if (!member) { res.status(404).json({ error: "Invalid invitation" }); return; }

  if (member.joinedAt) {
    res.json({ correspondenceId: member.correspondenceId, token }); return;
  }

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

  res.json({ correspondenceId: member.correspondenceId, token });
});

// ─── REMINDER CRON (Thursday 9am) ────────────────────────────────────────────

router.post("/phoebe/send-reminders", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const correspondences = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.isActive, true));

  const now = new Date();
  const frontendUrl = getInviteBaseUrl();
  let remindersSent = 0;

  for (const c of correspondences) {
    const type = (c.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(c.startedAt, now, type);

    const members = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, c.id));

    // For group: letters in the current period.
    // For one_to_one: all letters, for turn-state resolution.
    const letters = type === "one_to_one"
      ? await db
          .select()
          .from(lettersTable)
          .where(eq(lettersTable.correspondenceId, c.id))
      : await db
          .select()
          .from(lettersTable)
          .where(and(eq(lettersTable.correspondenceId, c.id), eq(lettersTable.periodStartDate, periodInfo.periodStartStr)));

    const writtenEmails = new Set(letters.map((l) => l.authorEmail));

    for (const m of members) {
      if (!m.joinedAt) continue;
      if (type === "group" && writtenEmails.has(m.email)) continue;

      // For one_to_one: only remind if their window is actually OPEN/OVERDUE.
      if (type === "one_to_one") {
        const turn = resolveOneToOneTurn(c, m.email, members, letters, now);
        if (!isWritable(turn.state)) continue;
      }

      const [existing] = await db
        .select()
        .from(letterRemindersTable)
        .where(
          and(
            eq(letterRemindersTable.correspondenceId, c.id),
            eq(letterRemindersTable.memberEmail, m.email),
            eq(letterRemindersTable.periodStartDate, periodInfo.periodStartStr),
          ),
        );
      if (existing) continue;

      // Send recipients through the auth-gated /letter/:id splash first.
      const writeUrl = m.userId
        ? `${frontendUrl}/letter/${c.id}`
        : `${frontendUrl}/letter/${c.id}?token=${m.inviteToken}`;

      // For one_to_one: find the other person's name
      const otherMember = type === "one_to_one"
        ? members.find((om) => om.email !== m.email)
        : undefined;

      await sendReminderEmail({
        to: m.email,
        correspondenceName: c.name,
        writeUrl,
        periodEnd: formatHumanDate(periodInfo.periodEnd),
        otherPersonName: otherMember?.name || undefined,
        type,
      });

      await db.insert(letterRemindersTable).values({
        correspondenceId: c.id,
        memberEmail: m.email,
        periodStartDate: periodInfo.periodStartStr,
      });

      remindersSent++;
    }
  }

  res.json({ remindersSent });
});

// ─── PREVIEW (public, content-free) ──────────────────────────────────────────
// Returns just enough to render the /letter/:id splash page without exposing
// letter content. No authentication required — letter bodies are never sent.
router.get("/phoebe/correspondences/:id/preview", async (req, res): Promise<void> => {
  const correspondenceId = parseInt(req.params.id, 10);
  if (Number.isNaN(correspondenceId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }

  const [correspondence] = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.id, correspondenceId));
  if (!correspondence || !correspondence.isActive) {
    res.status(404).json({ error: "Not found" }); return;
  }

  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondenceId));

  const lettersCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lettersTable)
    .where(eq(lettersTable.correspondenceId, correspondenceId));

  const latest = await db
    .select({ authorName: lettersTable.authorName, sentAt: lettersTable.sentAt })
    .from(lettersTable)
    .where(eq(lettersTable.correspondenceId, correspondenceId))
    .orderBy(desc(lettersTable.sentAt))
    .limit(1);

  res.json({
    correspondenceName: correspondence.name,
    groupType: correspondence.groupType,
    memberNames: members.map((m) => m.name || m.email.split("@")[0]),
    letterCount: lettersCount[0]?.count ?? 0,
    latestAuthorName: latest[0]?.authorName ?? null,
    latestSentAt: latest[0]?.sentAt ?? null,
  });
});

// ─── CALENDAR PROMPT STATE ───────────────────────────────────────────────────
// The current member toggles whether they want calendar reminders for this
// correspondence. "enabled" → window-open + overdue events will be sent.
// "dismissed" → never ask again. null → prompt still pending.
router.post(
  "/phoebe/correspondences/:id/calendar-prompt",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(String(req.params.id ?? ""), 10);
    const { state } = req.body as { state: "enabled" | "dismissed" };
    if (state !== "enabled" && state !== "dismissed") {
      res.status(400).json({ error: "state must be 'enabled' or 'dismissed'" }); return;
    }

    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    await db
      .update(correspondenceMembersTable)
      .set({ calendarPromptState: state })
      .where(eq(correspondenceMembersTable.id, member.id));

    res.json({ ok: true, state });
  }),
);

// ─── OVERDUE CALENDAR CRON ───────────────────────────────────────────────────
// Daily job — for each active one_to_one correspondence with the first
// exchange complete, find any member whose turn has just transitioned to
// OVERDUE and schedule a single follow-up calendar event.
router.post("/phoebe/check-overdue-letters", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const correspondences = await db
    .select()
    .from(correspondencesTable)
    .where(and(eq(correspondencesTable.isActive, true), eq(correspondencesTable.firstExchangeComplete, true)));

  const now = new Date();
  const frontendUrl = getInviteBaseUrl();
  let overdueSent = 0;

  for (const c of correspondences) {
    if (c.groupType !== "one_to_one") continue;

    const members = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, c.id));

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, c.id));

    for (const m of members) {
      if (!m.joinedAt) continue;
      if (m.calendarPromptState !== "enabled") continue;
      if (m.overdueCalendarEventId) continue; // already scheduled

      const turn = resolveOneToOneTurn(c, m.email, members, letters, now);
      if (turn.state !== "OVERDUE") continue;

      const otherMember = members.find((om) => om.email !== m.email);
      const waitingAuthor = otherMember?.name || otherMember?.email.split("@")[0] || "Your correspondent";
      const scheduledDate = getNextFridayOnOrAfter(now);

      const writeSplashUrl = m.userId
        ? `${frontendUrl}/letter/${c.id}`
        : `${frontendUrl}/letter/${c.id}?token=${m.inviteToken}`;

      const eventId = await sendLetterOverdueCalendarEvent({
        recipientEmail: m.email,
        waitingAuthorName: waitingAuthor,
        correspondenceName: c.name,
        scheduledDate,
        letterUrl: writeSplashUrl,
      });

      if (eventId) {
        await db
          .update(correspondenceMembersTable)
          .set({ overdueCalendarEventId: eventId })
          .where(eq(correspondenceMembersTable.id, m.id));
        overdueSent++;
      }
    }
  }

  res.json({ overdueSent });
});

export default router;
