import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

// Per-episode audio marks for the "Forward Day by Day" podcast, used by the
// Reflect & Sit screen to skip the intro and the closing donation appeal.
//
// Precomputed once per day by the worker (transcribe → detect), then served
// on /api/podcast/forward-day-by-day/today. One row per episode (keyed by the
// UTC episode date; episodeGuid lets us detect a fresh episode for the day).
//   scriptureStartSec — where the scripture reading begins (skip the intro)
//   appealStartSec    — where the donation appeal/outro begins, AFTER the
//                        closing prayer (play stops here so the prayer is kept)
export const fddAudioMarksTable = pgTable("fdd_audio_marks", {
  id: serial("id").primaryKey(),
  episodeDate: text("episode_date").notNull(), // YYYY-MM-DD (UTC)
  episodeGuid: text("episode_guid"),
  audioUrl: text("audio_url"),
  status: text("status").notNull().default("pending"), // pending | done | failed
  scriptureStartSec: integer("scripture_start_sec"),
  appealStartSec: integer("appeal_start_sec"),
  durationSeconds: integer("duration_seconds"),
  detector: text("detector"), // model/provider that produced the marks
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqEpisodeDate: unique().on(t.episodeDate),
}));

export type FddAudioMark = typeof fddAudioMarksTable.$inferSelect;
