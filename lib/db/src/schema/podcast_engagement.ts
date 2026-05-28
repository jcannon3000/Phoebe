import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Podcast engagement — listening history + community recommendations.
//
// Podcast episodes live in external RSS feeds (no local episode table),
// so both of these tables store a SNAPSHOT of the episode's fields at
// record time (title, audio URL, artwork, etc.). That lets us render a
// user's history and the community-recommendations feed straight from
// the DB without re-fetching every feed — and it survives episodes
// aging out of a feed's recent window.
//
// Episode identity is (showSlug, episodeId) where episodeId is the
// feed's <guid>. The client keys "have I heard / recommended this?" on
// `${showSlug}:${episodeId}`.

// ── podcast_listens ───────────────────────────────────────────────────────
// One row per (user, episode) the user has played in-app. Upserted —
// lastListenedAt bumps on replays. Drives the "listened" marker on
// episode rows.
export const podcastListensTable = pgTable("podcast_listens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  showSlug: text("show_slug").notNull(),
  episodeId: text("episode_id").notNull(),
  episodeTitle: text("episode_title"),
  episodeAudioUrl: text("episode_audio_url"),
  episodeImageUrl: text("episode_image_url"),
  durationSeconds: integer("duration_seconds"),
  publishedAt: text("published_at"),
  showTitle: text("show_title"),
  showArtwork: text("show_artwork"),
  firstListenedAt: timestamp("first_listened_at", { withTimezone: true }).notNull().defaultNow(),
  lastListenedAt: timestamp("last_listened_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePerEpisode: uniqueIndex("podcast_listens_unique").on(t.userId, t.showSlug, t.episodeId),
  byUser: index("podcast_listens_by_user").on(t.userId, t.lastListenedAt),
}));

export type PodcastListen = typeof podcastListensTable.$inferSelect;

// ── podcast_recommendations ────────────────────────────────────────────────
// One row per (user, episode) the user has recommended to the community.
// Toggleable (delete to un-recommend). The community feed groups these
// by episode and aggregates the recommenders.
export const podcastRecommendationsTable = pgTable("podcast_recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  showSlug: text("show_slug").notNull(),
  episodeId: text("episode_id").notNull(),
  episodeTitle: text("episode_title"),
  episodeAudioUrl: text("episode_audio_url"),
  episodeImageUrl: text("episode_image_url"),
  durationSeconds: integer("duration_seconds"),
  publishedAt: text("published_at"),
  showTitle: text("show_title"),
  showArtwork: text("show_artwork"),
  // Optional "why I'm sharing this" note shown alongside the rec.
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePerEpisode: uniqueIndex("podcast_recommendations_unique").on(t.userId, t.showSlug, t.episodeId),
  byEpisode: index("podcast_recommendations_by_episode").on(t.showSlug, t.episodeId),
  byRecent: index("podcast_recommendations_by_recent").on(t.createdAt),
}));

export type PodcastRecommendation = typeof podcastRecommendationsTable.$inferSelect;

// ── podcast_listen_list ────────────────────────────────────────────────────
// Per-user ordered queue of episodes to listen to. Each row stores the
// same episode snapshot as listens/recommendations so we can render the
// list without re-fetching feeds. position is an integer; lower = earlier
// in the queue. New items get max(position)+1 so they append to the end.
export const podcastListenListTable = pgTable("podcast_listen_list", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  showSlug: text("show_slug").notNull(),
  episodeId: text("episode_id").notNull(),
  episodeTitle: text("episode_title"),
  episodeAudioUrl: text("episode_audio_url"),
  episodeImageUrl: text("episode_image_url"),
  durationSeconds: integer("duration_seconds"),
  publishedAt: text("published_at"),
  showTitle: text("show_title"),
  showArtwork: text("show_artwork"),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePerEpisode: uniqueIndex("podcast_listen_list_unique").on(t.userId, t.showSlug, t.episodeId),
  byUser: index("podcast_listen_list_by_user").on(t.userId, t.position),
}));

export type PodcastListenListItem = typeof podcastListenListTable.$inferSelect;
