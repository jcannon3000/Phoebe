import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// ── Office audio alignments ────────────────────────────────────────────────
//
// One row per office episode (Forward Movement's Morning / Evening Prayer
// podcast, or another source) holding the timestamps of when the recording
// reaches each part of the office. Produced by transcribing the episode's
// audio (Whisper) and aligning that transcript to the office the app
// assembles for the same day (Claude, with a deterministic fallback).
//
// Keyed by (show, source, episode_date) — one alignment per office per day.
// Consumed by the office podcast player to drive a chapter/seek strip and
// keep the written office in sync with the audio.

export type OfficeAlignmentSection = {
  id: string; // the office Slide id this timestamp marks the start of
  type: string; // the office SlideType ("confession", "creed", "lords_prayer", …)
  title: string | null; // human label ("Confession of Sin", "The Apostles' Creed")
  startSeconds: number; // where this part begins in the audio
  endSeconds: number | null; // start of the next located section (null = last)
  confidence: number; // 0..1 — how sure the aligner is about this mark
};

export const officeAudioAlignmentsTable = pgTable("office_audio_alignments", {
  id: serial("id").primaryKey(),
  // "morning-office" | "evening-office" (the podcast show slug)
  show: text("show").notNull(),
  source: text("source").notNull().default("forward-movement"),
  // YYYY-MM-DD — the office's date (matches the assembled office for the day)
  episodeDate: text("episode_date").notNull(),
  // feed guid / audio url — lets us detect when a new episode replaced the
  // one we already aligned, so a re-run knows to redo the work.
  episodeGuid: text("episode_guid"),
  audioUrl: text("audio_url"),
  // pending | done | failed
  status: text("status").notNull().default("pending"),
  // "claude" | "heuristic" — which aligner produced the sections
  aligner: text("aligner"),
  durationSeconds: integer("duration_seconds"),
  sections: jsonb("sections").$type<OfficeAlignmentSection[]>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
