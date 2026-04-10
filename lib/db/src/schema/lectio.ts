import { pgTable, serial, text, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { sharedMomentsTable } from "./shared_moments";

// Cached lectionary readings fetched from lectionary.library.vanderbilt.edu.
// Each row is one Sunday's Gospel reading. The first user who needs a given
// Sunday triggers the fetch; every subsequent user reads from this cache.
export const lectionaryReadingsTable = pgTable("lectionary_readings", {
  id: serial("id").primaryKey(),
  // The actual Sunday date (YYYY-MM-DD) this reading is for.
  sundayDate: date("sunday_date").notNull().unique(),
  // e.g. "First Sunday of Advent"
  sundayName: text("sunday_name").notNull(),
  // e.g. "Advent", "Lent", "Easter", "Ordinary Time"
  liturgicalSeason: text("liturgical_season"),
  // e.g. "Year A", "Year B", "Year C"
  liturgicalYear: text("liturgical_year"),
  // e.g. "Matthew 24:36-44"
  gospelReference: text("gospel_reference").notNull(),
  // Clean plain text of the full gospel passage (verses joined by blank lines).
  gospelText: text("gospel_text").notNull(),
  // Source URL we fetched from (for provenance).
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LectionaryReading = typeof lectionaryReadingsTable.$inferSelect;

// User reflections on a Lectio Divina practice. One row per (moment, user,
// sundayDate, stage). "stage" is "lectio" | "meditatio" | "oratio".
export const lectioReflectionsTable = pgTable("lectio_reflections", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  sundayDate: date("sunday_date").notNull(),
  userToken: text("user_token").notNull(),
  userName: text("user_name").notNull(),
  userEmail: text("user_email"),
  stage: text("stage").notNull(), // lectio | meditatio | oratio
  reflectionText: text("reflection_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oneReflectionPerUserPerStage: uniqueIndex("lectio_reflections_unique_stage").on(
    t.momentId, t.sundayDate, t.userToken, t.stage
  ),
}));

export type LectioReflection = typeof lectioReflectionsTable.$inferSelect;
