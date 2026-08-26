/**
 * ONE summary of a rule of life, for every surface that shows one.
 *
 * It lived inside CommunityRuleCard, which was fine while the card was the
 * only place a rule was described. It isn't any more — the customizer's preset
 * list now offers a group's rule alongside the app's own presets, and the two
 * descriptions of the same rhythm have to agree or people will think they are
 * looking at different rules. This repo has watched hand-copied mirrors drift
 * three times (see ROUTINE_KEYS' own note); one export is cheaper than a
 * fourth.
 */
export type RuleSpec = {
  officePrefs: {
    morning: "office" | "devotion" | "none";
    evening: "office" | "devotion" | "none";
    morningTime: string | null;
    eveningTime: string | null;
    contemplationGoalMinutes: number;
  };
  silenceLadderEnabled: boolean;
  homeLayout: { order: string[]; hidden: string[] };
  ruleConfig: Record<string, string>;
};
const CARD_LABELS: Record<string, string> = {
  reading: "Reading",
  podcasts: "Podcasts", examen: "Examen", listening: "Audio Divina",
  walk: "Walking prayer",
  cobreathe: "Creation Prayer", cac: "Richard Rohr (CAC)", fdd: "Forward Day by Day", ssje: "SSJE",
};
const OFFICE_LABEL: Record<string, string> = { devotion: "Daily Devotion", office: "Daily Office", none: "" };

// The weekly Way of Love practices the rule carries (ruleConfig
// "phoebe:weekly-practices" — a JSON array of kinds). Shown as its own
// summary line so an adopter sees the week's shape, not just the day's.
const WEEKLY_LABELS: Record<string, string> = { commune: "Commune", go: "Go", bless: "Bless", rest: "Rest" };
function weeklyLine(ruleConfig: Record<string, string> | undefined): string | null {
  try {
    const raw = ruleConfig?.["phoebe:weekly-practices"];
    if (!raw) return null;
    const kinds = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === "string" && k in WEEKLY_LABELS);
    if (kinds.length === 0) return null;
    return `Each week — ${kinds.map((k) => WEEKLY_LABELS[k]).join(" · ")}`;
  } catch { return null; }
}

export function summarizeRuleSpec(spec: RuleSpec): string[] {
  const out: string[] = [];
  const op = spec.officePrefs;
  if (op.morning !== "none") out.push(`Morning — ${OFFICE_LABEL[op.morning]}${op.morningTime ? ` at ${op.morningTime}` : ""}`);
  if (op.evening !== "none") out.push(`Evening — ${OFFICE_LABEL[op.evening]}${op.eveningTime ? ` at ${op.eveningTime}` : ""}`);
  if (spec.silenceLadderEnabled) out.push("Silence — a growing daily practice");
  else if (op.contemplationGoalMinutes > 0) out.push(`Silence — ${op.contemplationGoalMinutes} min a day`);
  const hidden = new Set(spec.homeLayout.hidden);
  const cards = spec.homeLayout.order.filter((k) => CARD_LABELS[k] && !hidden.has(k)).map((k) => CARD_LABELS[k]);
  if (cards.length) out.push(`Practices — ${cards.join(" · ")}`);
  const weekly = weeklyLine(spec.ruleConfig);
  if (weekly) out.push(weekly);
  return out.slice(0, 5);
}

