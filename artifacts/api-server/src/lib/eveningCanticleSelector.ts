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
  // Per BCP p. 145 "Suggested Canticles at Evening Prayer" (Rite II,
  // taking the higher number where the table lists "X or Y"). The
  // earlier shape of this table had several drift errors (Wed/Thu/
  // Fri/Sat afterOT were on the wrong rows, plus extra Lent
  // overrides on Wed and Fri that the BCP doesn't list); fixed to
  // match the canonical table at bcponline.org/DailyOffice/canticle.html.
  monday: {
    afterOT: {
      default: "canticle_8",  // Cantemus Domino
      lent: "canticle_14",    // Kyrie Pantokrator (BCP appoints this on Mon in Lent)
    },
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  tuesday: {
    afterOT: { default: "canticle_10" }, // Quærite Dominum
    afterNT: { default: "canticle_15" }, // Magnificat
  },
  wednesday: {
    afterOT: { default: "canticle_12" }, // Benedicite, omnia opera Domini
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  thursday: {
    afterOT: { default: "canticle_11" }, // Surge, illuminare
    afterNT: { default: "canticle_15" }, // Magnificat
  },
  friday: {
    afterOT: { default: "canticle_13" }, // Benedictus es
    afterNT: { default: "canticle_17" }, // Nunc dimittis
  },
  saturday: {
    afterOT: { default: "canticle_9" },  // Ecce, Deus
    afterNT: { default: "canticle_15" }, // Magnificat
  },
};

// EOW1 — Suggested Canticles at Evening Prayer (pp. 44–45). Same
// shape as the BCP table above; primary picks favor the EOW
// letter-named canticles where the table lists "X or Y". Magnificat
// (canticle_15) and Nunc dimittis (canticle_17) get EOW recasts at
// canticle_15_eow1 / canticle_17_eow1 — the EOW recast of Nunc
// dimittis isn't seeded yet so we fall back to the BCP key when
// EOW1 appoints The Song of Simeon.
const EOW_EP_CANTICLE_TABLE: Record<
  string,
  { afterOT: SeasonMap; afterNT: SeasonMap }
> = {
  sunday: {
    afterOT: { default: "canticle_15_eow1" },  // Mary / Magnificat
    afterNT: { default: "canticle_17" },       // Simeon (no EOW recast yet)
  },
  monday: {
    afterOT: { default: "canticle_a_eow1" },   // Wisdom
    afterNT: { default: "canticle_15_eow1" },  // Mary
  },
  tuesday: {
    afterOT: { default: "canticle_d_eow1" },   // Wilderness
    afterNT: { default: "canticle_n_eow1" },   // God's Love
  },
  wednesday: {
    afterOT: { default: "canticle_c_eow1" },   // Hannah
    afterNT: { default: "canticle_l_eow1" },   // Christ's Humility
  },
  thursday: {
    afterOT: { default: "canticle_j_eow1" },   // Judith
    afterNT: { default: "canticle_15_eow1" },  // Mary
  },
  friday: {
    afterOT: { default: "canticle_g_eow1" },   // Ezekiel
    afterNT: { default: "canticle_q_eow1" },   // Christ's Goodness
  },
  saturday: {
    afterOT: { default: "canticle_b_eow1" },   // Pilgrimage
    afterNT: { default: "canticle_15_eow1" },  // Mary
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

export type LiturgyDialect = "bcp" | "eow1";

export function getEveningCanticles(
  officeDay: LiturgicalDay,
  dialect: LiturgyDialect = "bcp",
): {
  afterOT: string;
  afterNT: string;
} {
  // Principal Feasts override
  if (officeDay.isMajorFeast) {
    return dialect === "eow1"
      ? {
          afterOT: "canticle_15_eow1", // Mary
          afterNT: "canticle_o_eow1",  // Heavenly City
        }
      : {
          afterOT: "canticle_15",
          afterNT: "canticle_17",
        };
  }

  const dayKey = DAY_KEYS[officeDay.dayOfWeek];
  const entry = (dialect === "eow1" ? EOW_EP_CANTICLE_TABLE : EP_CANTICLE_TABLE)[dayKey];

  return {
    afterOT: pickCanticle(entry.afterOT, officeDay.season),
    afterNT: pickCanticle(entry.afterNT, officeDay.season),
  };
}
