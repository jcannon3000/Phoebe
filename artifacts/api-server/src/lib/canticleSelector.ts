/**
 * Canticle Selector — BCP p. 144 Table of Suggested Canticles
 *
 * Returns the canticle textKeys for after the OT and NT lessons
 * at Morning Prayer Rite II, based on day of week and season.
 */

import type { LiturgicalDay } from "./liturgicalCalendar";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type SeasonMap = Record<string, string>;

const CANTICLE_TABLE: Record<
  string,
  { afterOT: SeasonMap; afterNT: SeasonMap }
> = {
  sunday: {
    afterOT: {
      default: "canticle_16", // Benedictus Dominus Deus
      advent: "canticle_11", // Surge, illuminare
      lent: "canticle_14", // Kyrie Pantokrator
      easter: "canticle_8", // Cantemus Domino
    },
    afterNT: {
      default: "canticle_21", // Te Deum
      advent: "canticle_16", // Benedictus Dominus Deus
      lent: "canticle_16", // Benedictus Dominus Deus
    },
  },
  monday: {
    afterOT: { default: "canticle_9" }, // Ecce, Deus
    afterNT: { default: "canticle_19" }, // Magna et mirabilia
  },
  tuesday: {
    afterOT: { default: "canticle_13" }, // Benedictus es
    afterNT: { default: "canticle_18" }, // Dignus es
  },
  wednesday: {
    afterOT: {
      default: "canticle_11", // Surge, illuminare
      lent: "canticle_14", // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_16" }, // Benedictus Dominus Deus
  },
  thursday: {
    afterOT: { default: "canticle_8" }, // Cantemus Domino
    afterNT: {
      default: "canticle_20", // Gloria in excelsis
      advent: "canticle_19", // Magna et mirabilia
      lent: "canticle_19", // Magna et mirabilia
    },
  },
  friday: {
    afterOT: {
      default: "canticle_10", // Quærite Dominum
      lent: "canticle_14", // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_18" }, // Dignus es
  },
  saturday: {
    afterOT: { default: "canticle_12" }, // Benedicite
    afterNT: { default: "canticle_19" }, // Magna et mirabilia
  },
};

// EOW1 — Suggested Canticles at Morning Prayer
//
// EOW1 pp. 43–44 supplies a parallel table that draws from the
// letter-named canticles A–S (which Phoebe stores as
// canticle_<letter>_eow1). Where EOW lists "X or Y", we take the
// EOW-introduced canticle as the primary so the felt difference
// from BCP is most pronounced. Where the table appoints a BCP
// canticle (e.g. canticle_18 on Friday Christmas NT), we use the
// EOW1 expansive-language recast if one exists, else the plain
// BCP key.
const EOW_CANTICLE_TABLE: Record<
  string,
  { afterOT: SeasonMap; afterNT: SeasonMap }
> = {
  sunday: {
    afterOT: {
      default: "canticle_e_eow1",   // Jerusalem Our Mother
      advent: "canticle_d_eow1",    // Wilderness
      christmas: "canticle_c_eow1", // Hannah
      epiphany: "canticle_c_eow1",  // Christmas-appointed runs through 1st Sun after Epiphany
      lent: "canticle_h_eow1",      // Hosea
      easter: "canticle_a_eow1",    // Wisdom
    },
    afterNT: {
      default: "canticle_k_eow1",   // Our Adoption
      advent: "canticle_p_eow1",    // Spirit
      christmas: "canticle_n_eow1", // God's Love
      epiphany: "canticle_n_eow1",
      lent: "canticle_l_eow1",      // Christ's Humility
      easter: "canticle_m_eow1",    // Faith
    },
  },
  monday: {
    afterOT: { default: "canticle_c_eow1" },   // Hannah
    afterNT: { default: "canticle_l_eow1" },   // Christ's Humility
  },
  tuesday: {
    afterOT: { default: "canticle_b_eow1" },   // Pilgrimage
    afterNT: { default: "canticle_m_eow1" },   // Faith
  },
  wednesday: {
    afterOT: {
      default: "canticle_g_eow1",              // Ezekiel
      lent: "canticle_i_eow1",                 // Jonah
    },
    afterNT: { default: "canticle_p_eow1" },   // Spirit
  },
  thursday: {
    afterOT: { default: "canticle_a_eow1" },   // Wisdom
    afterNT: { default: "canticle_r_eow1" },   // True Motherhood
  },
  friday: {
    afterOT: {
      default: "canticle_i_eow1",              // Jonah
      christmas: "canticle_j_eow1",
      epiphany: "canticle_j_eow1",
      lent: "canticle_s_eow1",                 // Our True Nature
    },
    afterNT: {
      default: "canticle_f_eow1",              // Lamentation
      christmas: "canticle_18_eow1",           // To the Lamb
      epiphany: "canticle_18_eow1",
      lent: "canticle_14",                     // Penitence (no EOW recast)
    },
  },
  saturday: {
    afterOT: {
      default: "canticle_12_eow1",             // Creation
      easter: "canticle_g_eow1",               // Ezekiel
    },
    afterNT: {
      default: "canticle_o_eow1",              // Heavenly City
      easter: "canticle_k_eow1",               // Our Adoption
    },
  },
};

function pickCanticle(map: SeasonMap, season: string): string {
  // Map liturgical seasons to the keys used in the canticle table
  const seasonKey =
    season === "holy_week"
      ? "lent"
      : season === "season_after_pentecost"
        ? "default"
        : season;
  return map[seasonKey] ?? map["default"];
}

export type LiturgyDialect = "bcp" | "eow1";

export function getCanticles(
  officeDay: LiturgicalDay,
  dialect: LiturgyDialect = "bcp",
): {
  afterOT: string;
  afterNT: string;
} {
  // Principal Feasts and Feasts of our Lord override
  if (officeDay.isMajorFeast) {
    return dialect === "eow1"
      ? {
          afterOT: "canticle_16_eow1", // Benedictus Dominus Deus (EOW recast)
          afterNT: "canticle_21_eow1", // Te Deum (EOW recast)
        }
      : {
          afterOT: "canticle_16",
          afterNT: "canticle_21",
        };
  }

  const dayKey = DAY_KEYS[officeDay.dayOfWeek];
  const entry = (dialect === "eow1" ? EOW_CANTICLE_TABLE : CANTICLE_TABLE)[dayKey];

  return {
    afterOT: pickCanticle(entry.afterOT, officeDay.season),
    afterNT: pickCanticle(entry.afterNT, officeDay.season),
  };
}
