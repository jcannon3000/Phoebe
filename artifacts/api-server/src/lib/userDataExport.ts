// Builds a JSON export of everything the database holds about a user.
//
// Used by GET /api/users/me/export so users can satisfy their own
// right-to-portability without us having to field a support email
// every time. The shape is: a single object with a section per table
// the user has rows in, each section an array of that table's rows.
//
// Scope rule: we include any table keyed on the user's id OR lowercase
// email. Password hash, reset tokens, and Google OAuth tokens are
// redacted — a user's right to their own data doesn't include the raw
// credentials we use to authenticate them, and exporting those would
// create a phishing risk if the JSON is ever emailed or left on disk.
//
// Design choice: ad-hoc per-table queries rather than a reflection-
// based walk. The schema has enough column-naming variance
// (ownerId vs userId vs authorUserId vs createdByUserId etc.) that a
// generic walker would either miss rows or over-include unrelated
// ones. Being explicit also makes the intent of each query auditable.

import { eq, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  prayerRequestsTable,
  prayerWordsTable,
  prayerRequestAmensTable,
  ritualsTable,
  momentUserTokensTable,
  momentPostsTable,
  lettersTable,
  letterDraftsTable,
  correspondenceMembersTable,
  correspondencesTable,
  groupsTable,
  groupMembersTable,
  circleDailyFocusTable,
  circleIntentionsTable,
  groupAnnouncementsTable,
  prayersForTable,
  fellowsTable,
  fellowInvitesTable,
  userMutesTable,
  gratitudeResponsesTable,
  gratitudeSeenTable,
  calendarSubscriptionsTable,
  deviceTokensTable,
  bellNotificationsTable,
  feedbackTable,
  prayerFeedsTable,
  prayerFeedSubscriptionsTable,
  prayerFeedPrayersTable,
  prayerFeedEntriesTable,
  scheduleResponsesTable,
  ritualTimeSuggestionsTable,
  lectioReflectionsTable,
  userConnectionsCacheTable,
  waitlistTable,
} from "@workspace/db";

export async function exportUserData(userId: number, email: string): Promise<Record<string, unknown>> {
  const emailLower = email.toLowerCase();

  // Profile — strip sensitive auth material.
  const [profileRow] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const profile = profileRow
    ? (() => {
        const {
          passwordHash: _pw,
          resetToken: _rt,
          resetTokenExpiry: _rte,
          googleAccessToken: _gat,
          googleRefreshToken: _grt,
          googleTokenExpiry: _gte,
          ...safe
        } = profileRow;
        return safe;
      })()
    : null;

  // Parallelize the table queries — they're all read-only and independent.
  const [
    prayerRequests,
    prayerWords,
    prayerAmens,
    rituals,
    momentTokens,
    letters,
    letterDrafts,
    correspondenceMemberships,
    correspondencesCreated,
    groupsCreated,
    groupMemberships,
    circleDailyFocusSubject,
    circleDailyFocusAddedBy,
    circleIntentions,
    groupAnnouncements,
    prayersForGiven,
    prayersForReceived,
    fellows,
    fellowInvitesSent,
    fellowInvitesReceivedByEmail,
    mutesMade,
    mutesReceived,
    gratitudeResponses,
    gratitudeSeen,
    calendarSubscriptions,
    deviceTokens,
    bellNotifications,
    feedback,
    prayerFeedsOwned,
    prayerFeedSubscriptions,
    prayerFeedPrayers,
    prayerFeedEntries,
    scheduleResponses,
    ritualTimeSuggestions,
    lectioReflections,
    userConnectionsCache,
    waitlistEntries,
  ] = await Promise.all([
    db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.ownerId, userId)),
    db.select().from(prayerWordsTable).where(eq(prayerWordsTable.authorUserId, userId)),
    db.select().from(prayerRequestAmensTable).where(eq(prayerRequestAmensTable.userId, userId)),
    db.select().from(ritualsTable).where(eq(ritualsTable.ownerId, userId)),
    db.select().from(momentUserTokensTable).where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`),
    db.select().from(lettersTable).where(or(eq(lettersTable.authorUserId, userId), sql`LOWER(${lettersTable.authorEmail}) = ${emailLower}`)),
    db.select().from(letterDraftsTable).where(or(eq(letterDraftsTable.authorUserId, userId), sql`LOWER(${letterDraftsTable.authorEmail}) = ${emailLower}`)),
    db.select().from(correspondenceMembersTable).where(or(eq(correspondenceMembersTable.userId, userId), sql`LOWER(${correspondenceMembersTable.email}) = ${emailLower}`)),
    db.select().from(correspondencesTable).where(eq(correspondencesTable.createdByUserId, userId)),
    db.select().from(groupsTable).where(eq(groupsTable.createdByUserId, userId)),
    db.select().from(groupMembersTable).where(sql`${groupMembersTable.userId} = ${userId} OR LOWER(${groupMembersTable.email}) = ${emailLower}`),
    db.select().from(circleDailyFocusTable).where(eq(circleDailyFocusTable.subjectUserId, userId)),
    db.select().from(circleDailyFocusTable).where(eq(circleDailyFocusTable.addedByUserId, userId)),
    db.select().from(circleIntentionsTable).where(eq(circleIntentionsTable.createdByUserId, userId)),
    db.select().from(groupAnnouncementsTable).where(eq(groupAnnouncementsTable.authorUserId, userId)),
    db.select().from(prayersForTable).where(eq(prayersForTable.prayerUserId, userId)),
    db.select().from(prayersForTable).where(eq(prayersForTable.recipientUserId, userId)),
    db.select().from(fellowsTable).where(or(eq(fellowsTable.userId, userId), eq(fellowsTable.fellowUserId, userId))),
    db.select().from(fellowInvitesTable).where(eq(fellowInvitesTable.senderId, userId)),
    db.select().from(fellowInvitesTable).where(sql`LOWER(${fellowInvitesTable.recipientEmail}) = ${emailLower}`),
    db.select().from(userMutesTable).where(eq(userMutesTable.muterId, userId)),
    db.select().from(userMutesTable).where(eq(userMutesTable.mutedUserId, userId)),
    db.select().from(gratitudeResponsesTable).where(eq(gratitudeResponsesTable.userId, userId)),
    db.select().from(gratitudeSeenTable).where(eq(gratitudeSeenTable.userId, userId)),
    db.select().from(calendarSubscriptionsTable).where(eq(calendarSubscriptionsTable.userId, userId)),
    db.select().from(deviceTokensTable).where(eq(deviceTokensTable.userId, userId)),
    db.select().from(bellNotificationsTable).where(eq(bellNotificationsTable.userId, userId)),
    db.select().from(feedbackTable).where(eq(feedbackTable.userId, userId)),
    db.select().from(prayerFeedsTable).where(eq(prayerFeedsTable.creatorUserId, userId)).catch(() => []),
    db.select().from(prayerFeedSubscriptionsTable).where(eq(prayerFeedSubscriptionsTable.userId, userId)),
    db.select().from(prayerFeedPrayersTable).where(eq(prayerFeedPrayersTable.userId, userId)),
    db.select().from(prayerFeedEntriesTable).where(eq(prayerFeedEntriesTable.createdByUserId, userId)).catch(() => []),
    db.select().from(scheduleResponsesTable).where(sql`LOWER(${scheduleResponsesTable.guestEmail}) = ${emailLower}`).catch(() => []),
    db.select().from(ritualTimeSuggestionsTable).where(sql`LOWER(${ritualTimeSuggestionsTable.suggestedByEmail}) = ${emailLower}`),
    db.select().from(lectioReflectionsTable).where(sql`LOWER(${lectioReflectionsTable.userEmail}) = ${emailLower}`).catch(() => []),
    db.select().from(userConnectionsCacheTable).where(sql`LOWER(${userConnectionsCacheTable.userEmail}) = ${emailLower} OR LOWER(${userConnectionsCacheTable.contactEmail}) = ${emailLower}`),
    db.select().from(waitlistTable).where(sql`LOWER(${waitlistTable.email}) = ${emailLower}`),
  ]);

  // moment_posts is keyed by userToken (string), not userId. We have to
  // look up every token this user holds and grab posts keyed to them.
  const userTokens = momentTokens.map(t => t.userToken);
  const momentPosts = userTokens.length > 0
    ? await db.select().from(momentPostsTable).where(sql`${momentPostsTable.userToken} = ANY(${userTokens})`)
    : [];

  return {
    exportedAt: new Date().toISOString(),
    account: profile,
    prayerRequests,
    prayerWords,
    prayerAmens,
    rituals,
    momentTokens,
    momentPosts,
    letters,
    letterDrafts,
    correspondencesCreated,
    correspondenceMemberships,
    groupsCreated,
    groupMemberships,
    circleDailyFocusSubject,
    circleDailyFocusAddedBy,
    circleIntentions,
    groupAnnouncements,
    prayersForGiven,
    prayersForReceived,
    fellows,
    fellowInvitesSent,
    fellowInvitesReceivedByEmail,
    mutesMade,
    mutesReceived,
    gratitudeResponses,
    gratitudeSeen,
    calendarSubscriptions,
    deviceTokens,
    bellNotifications,
    feedback,
    prayerFeedsOwned,
    prayerFeedSubscriptions,
    prayerFeedPrayers,
    prayerFeedEntries,
    scheduleResponses,
    ritualTimeSuggestions,
    lectioReflections,
    userConnectionsCache,
    waitlistEntries,
  };
}
