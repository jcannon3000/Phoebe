import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  emoji: text("emoji"),
  calendarUrl: text("calendar_url"),
  // Shareable community invite token. Anyone with this token can join the
  // group via /communities/join/:slug/:token — no per-email invite needed.
  // Admin-rotatable. Nullable so legacy rows keep compiling; the startup
  // migration backfills every existing group with a fresh token.
  inviteToken: text("invite_token").unique(),
  // Public discoverability. When true, the group surfaces in the
  // /communities/browse picker. Joining is still admin-approved via
  // group_join_requests — public means "discoverable", not "open".
  // Default true: every new community is browseable out of the gate.
  // Admins can flip it off later from settings to go private.
  isPublic: boolean("is_public").notNull().default(true),
  // Free-text location (no geocoding infra in this codebase — see the
  // now-removed device-location feature in lib/prayLocation.ts). Lets a
  // public directory (churches, parishes, etc.) be browsed/searched by
  // city/state alongside name, without any lat/lng or address precision.
  city: text("city"),
  state: text("state"),
  // PUBLIC no-login version: a PILOT GROUP's members are the ONLY users who
  // get the FULL app once PHOEBE_GUEST_ENABLED flips — everyone else (guests
  // and ordinary signed-in accounts) gets the light shape. Designated by app
  // super admins (beta_users.is_admin) from the group's settings. See memory
  // "project_public_no_login".
  isPilotGroup: boolean("is_pilot_group").notNull().default(false),
  // The community's RULE OF LIFE — the prescribed_routines row (spec + adopt
  // count) that carries the daily rhythm this community keeps together;
  // members adopt it in one tap. Plain integer here (no .references()) because
  // prescribed_routines imports THIS table — the FK lives in migrate.ts SQL.
  ruleRoutineId: integer("rule_routine_id"),
  createdByUserId: integer("created_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Last time an admin sent the "How can I pray for you?" community
  // prompt to all members. Rate-limited to once per 7 days per group so
  // the prompt stays special instead of becoming noise. Null = never
  // sent; the next eligible-at timestamp is `value + 7 days`.
  lastPrayerInviteAt: timestamp("last_prayer_invite_at", { withTimezone: true }),
  // The prompt an admin chose for the most recent "Ask your community"
  // send — a preset ("What's a big life event this week we can pray
  // for?") or a custom question. The share-prayer landing page reads
  // it so the slide asks the same question the push / email did.
  // Null = never sent, or sent with the default question.
  prayerInvitePrompt: text("prayer_invite_prompt"),
  // ── Sunday Service Reflections (beta) ─────────────────────────────────
  // When true, the bell scanner fires a Sunday-evening push inviting
  // every joined member to write a reflection on this week's service.
  // The composer stays open the whole week — members can edit until the
  // next Sunday rolls over. Reflections themselves live in the shared
  // `group_reflections` table with `source = 'sunday'`. Default false
  // because the feature is opt-in per community.
  sundayReflectionsEnabled: boolean("sunday_reflections_enabled").notNull().default(false),
  // Timestamp of the most recent Sunday-evening push fan-out. Used by
  // the bell scanner to dedup — without it a Sun 18:00–23:00 window
  // would re-push every 15-minute tick.
  sundayReflectionNotifiedAt: timestamp("sunday_reflection_notified_at", { withTimezone: true }),
  // Owner: "make sure that there is a setting in groups to turn on and off
  // prayer list." Admin-toggleable; default false — a new community doesn't
  // inherently carry a shared prayer list, an admin opts in from settings.
  // Also HARD-gated off for any public (browseable) group regardless of
  // this flag — owner: "no publicly listed group can have shared prayer
  // requests" — enforced at the PATCH /groups/:slug route (can't be turned
  // on while isPublic) and again at prayer-request creation (a public
  // group is never a valid scoping target even if this flag is stale-true
  // from before the group went public).
  prayerRequestsEnabled: boolean("prayer_requests_enabled").notNull().default(false),
});

// ── Group join requests ────────────────────────────────────────────────────
// User-initiated request to join a community (distinct from invite-token
// joins, which are pre-approved). Workflow:
//   1. User taps a community on /communities/browse → INSERT row, decision
//      stays null (pending). Admins receive a push notification.
//   2. Admin opens /communities/:slug/requests → sees pending requests.
//   3. Admin accepts → decision='accepted', decided_at + decided_by stamp,
//      group_members row inserted, requester pushed "you're in".
//   4. Admin declines → decision='rejected', no group_members row, no
//      push (silent).
// Unique on (group_id, user_id) so re-tapping doesn't create duplicates;
// re-requesting after a decline can be supported later by clearing the
// row in a follow-up.
export const groupJoinRequestsTable = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decision: text("decision"), // null (pending) | "accepted" | "rejected"
  decidedByUserId: integer("decided_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  // "follower" (anonymous, count-only — the default for anyone who joins) |
  // "member" (the smaller, admin-curated tier, visible to fellow non-admins
  // on the roster) | "admin" | "hidden_admin" (admin powers, invisible to
  // non-admins). Enforced at the route layer (Zod enums), not a DB constraint.
  role: text("role").notNull().default("follower"),
  inviteToken: text("invite_token").notNull().unique(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Beta access — admin-managed list of users who can access demo features
export const betaUsersTable = pgTable("beta_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  addedByUserId: integer("added_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  seenWelcome: boolean("seen_welcome").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-admin per-event acknowledgment log so the "new arrival" popup in the
// community detail view fires exactly once per admin per event. Holds a row
// the first time an admin dismisses a notification; the list endpoint
// left-anti-joins against this table to hide already-seen events. Kinds:
//   - "member_joined"  → eventId = group_members.id
//   - "prayer_request" → eventId = prayer_requests.id
// Unique index on (adminUserId, groupId, kind, eventId) enforces idempotency
// — the ack POST uses ON CONFLICT DO NOTHING so double-clicks are harmless.
export const groupAdminNotificationsAckTable = pgTable("group_admin_notifications_ack", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "member_joined" | "prayer_request"
  eventId: integer("event_id").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
});

// Lightweight announcements + events. Optionally event-shaped: when
// `kind` is "prayer_walk", eventAt + location are populated and the row
// surfaces as an upcoming gathering. The same row supports two scopes:
//   • Group-scoped: groupId set, prayerFeedId null. Authored from
//     community-detail's Announcements tab; admin must be a group admin.
//   • Feed-scoped: prayerFeedId set, groupId null. Authored from
//     /climate/admin; admin must be a beta admin. Surfaces to every
//     subscriber of the feed.
// Exactly one of (groupId, prayerFeedId) is populated per row — enforced
// at the API layer rather than via a DB check constraint.
export const groupAnnouncementsTable = pgTable("group_announcements", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  // FK enforced in migration SQL only — no .references() to avoid
  // pulling in prayer_feeds at this point in the schema graph.
  prayerFeedId: integer("prayer_feed_id"),
  authorUserId: integer("author_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  // kind: "announcement" (default) | "prayer_walk"
  kind: text("kind").notNull().default("announcement"),
  // Populated only when kind = "prayer_walk". Null for plain announcements.
  eventAt: timestamp("event_at", { withTimezone: true }),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
