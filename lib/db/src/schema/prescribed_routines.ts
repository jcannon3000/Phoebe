import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// A daily routine a community admin / clergy designs FOR someone else, captured
// as a portable spec and shared via a token link. The recipient opens
// /routine/:token, sees what it contains, and (on accept) has the routine
// applied to their account — offices, home layout, contemplation/silence, and
// the per-device rule-config. It never touches their prayers, fellows, or
// journals. See routes/prescribed-routines.ts for create / resolve / accept.
//
// `spec` mirrors exactly what the customizer's commit() would have written, so
// applying it reproduces the designed routine on the recipient.
export type PrescribedRoutineSpec = {
  v: 1;
  officePrefs: {
    defaultPrayerLevel: string;
    contemplationGoalMinutes: number;
    contemplationReminderEnabled: boolean;
    morning: "office" | "devotion" | "none";
    evening: "office" | "devotion" | "none";
    morningTime: string | null;
    eveningTime: string | null;
  };
  silenceLadderEnabled: boolean;
  homeLayout: { order: string[]; hidden: string[]; v?: number };
  // The routineSync localStorage snapshot (office levels/entry/reflection/minutes,
  // fdd-mode, psalm-cycle, contemplation-style, per-practice slots, scripture-scope).
  ruleConfig: Record<string, string>;
};

export const prescribedRoutinesTable = pgTable("prescribed_routines", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // A short human label the admin can give it ("Newcomer's rhythm", "Lent").
  label: text("label"),
  spec: jsonb("spec").$type<PrescribedRoutineSpec>().notNull(),
  // How many people have applied this link (for the admin's awareness).
  acceptCount: integer("accept_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byGroup: index("prescribed_routines_by_group").on(t.groupId),
  byCreator: index("prescribed_routines_by_creator").on(t.createdByUserId),
}));

export type PrescribedRoutine = typeof prescribedRoutinesTable.$inferSelect;
