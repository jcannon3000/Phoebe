/**
 * Evening Prayer Canticle Selector — BCP p. 144 Table of Suggested Canticles
 *
 * Returns canticle textKeys for after the OT and NT lessons
 * at Evening Prayer Rite II, based on day of week and season.
 *
 * EP typically uses Magnificat (canticle_15) and Nunc dimittis (canticle_17)
 * on Sundays, with variation through the week.
 */

import type { LiturgicalDay } from "./liturgicalCalendar";

type SeasonMap = Record<string, string>;

const EP_CANTICLE_TABLE: Record<
  string,
  { afterOT: SeasonMap; afterNT: SeasonMap }
> = {
  sunday: {
    afterOT: {
      default: "canticle_15", // Magnificat
      advent: "canticle_15",
      lent: "canticle_15",
      easter: "canticle_15",
    },
    afterNT: {
      default: "canticle_17", // Nunc dimittis
      advent: "canticle_17",
      lent: "canticle_17",
      easter: "canticle_17",
    },
  },
  monday: {
    afterOT: { default: "canticle_8" },  // Cantemus Domino
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  tuesday: {
    afterOT: { default: "canticle_10" }, // Quærite Dominum
    afterNT: { default: "canticle_15" }, // Magnificat
  },
  wednesday: {
    afterOT: {
      default: "canticle_13", // Benedictus es
      lent: "canticle_14",   // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  thursday: {
    afterOT: { default: "canticle_9" },  // Ecce, Deus
    afterNT: { default: "canticle_15" }, // Magnificat
  },
  friday: {
    afterOT: {
      default: "canticle_11", // Surge, illuminare
      lent: "canticle_14",   // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  saturday: {
    afterOT: { default: "canticle_19" }, // Magna et mirabilia
    afterNT: { default: "canticle_15" }, // Magnificat
  },
};

const DAY_KEYS = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

function pickCanticle(map: SeasonMap, season: string): string {
  const seasonKey =
    season === "holy_week"
      ? "lent"
      : season === "season_after_pentecost"
        ? "default"
        : season;
  return map[seasonKey] ?? map["default"];
}

export function getEveningCanticles(officeDay: LiturgicalDay): {
  afterOT: string;
  afterNT: string;
} {
  // Principal Feasts override
  if (officeDay.isMajorFeast) {
    return {
      afterOT: "canticle_15", // Magnificat
      afterNT: "canticle_17", // Nunc dimittis
    };
  }

  const dayKey = DAY_KEYS[officeDay.dayOfWeek];
  const entry = EP_CANTICLE_TABLE[dayKey];

  return {
    afterOT: pickCanticle(entry.afterOT, officeDay.season),
    afterNT: pickCanticle(entry.afterNT, officeDay.season),
  };
}
