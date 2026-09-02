export * from "./generated/api";

// Re-export types that don't conflict with Zod schemas in api.ts
// (CreateRitualBody, LogMeetupBody, SendMessageBody, UpdateRitualBody, UpsertUserBody
//  exist as both interfaces in types/ and Zod consts in api.ts — use z.infer<> for those)
//
// Only names that ./generated/types actually exports may appear below. This list
// had drifted into re-exporting four that it doesn't, for two different reasons:
//
//   `Participant` was real and is now correctly gone. A gathering no longer has
//   a roster — lib/migrate.ts DROPs the rituals.participants column, and
//   routes/people.ts reads the shared-gathering list as structurally empty
//   because of it. The spec removing Participant/participants is the spec
//   catching UP to the server, so it must not be reverted.
//
//   `DayOfWeekCode`, `MonthlyType` and `MonthlyWeekOrdinal` were never here at
//   all — no commit of openapi.yaml or of generated/types has ever defined them.
//   They describe the MOMENTS create schema (routes/moments.ts declares
//   dayOfWeek: z.enum(["MO",...]) and reads it back to decide whether today is a
//   practice day), and openapi.yaml models no /moments path, so orval had nothing
//   to generate from. These three were phantom re-exports from the initial commit,
//   not casualties of a regeneration. create.tsx declares them locally for now;
//   the real fix is to model the moments endpoints in the spec, at which point
//   they can be generated and imported again.
export type {
  CreateRitualBodyFrequency,
  HealthStatus,
  ListRitualsParams,
  LogMeetupBodyStatus,
  Meetup,
  MeetupStatus,
  Message,
  MessageRole,
  Ritual,
  RitualDetail,
  RitualFrequency,
  RitualStatus,
  UpdateRitualBodyFrequency,
  User,
} from "./generated/types";
