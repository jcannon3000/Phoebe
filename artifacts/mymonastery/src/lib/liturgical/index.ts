export type {
  LiturgicalDay,
  LiturgicalRank,
  LiturgicalColor,
  LiturgicalSeason,
  FixedFeastEntry,
} from "./types";
export { getDay, readLesserFeastsPref, writeLesserFeastsPref, registerLesserFeasts } from "./calendar";
export { computeEaster, toYmd, addDays } from "./easter";
export { seasonInfo } from "./seasons";

// Side-effect import: registers Lesser Feasts from LFF 2022 with the
// calendar on module load. Anyone who imports from @/lib/liturgical
// (which every consumer does) picks up the full commemoration set.
import "./lesser-feasts";
