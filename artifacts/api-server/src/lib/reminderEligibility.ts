// ─── Who a reminder is actually FOR ─────────────────────────────────────────
//
// Pure predicates about a person's rule, kept out of bellSender so they can be
// tested without the database, the push senders and the scheduler that module
// pulls in. See reminderEligibility.test.ts.

function sideLevel(values: Record<string, string> | undefined, side: "morning" | "evening"): string | null {
  const raw = values?.[`phoebe:office:level:${side}`];
  const v = typeof raw === "string" ? raw.trim() : "";
  return v.length > 0 ? v : null;
}

/**
 * Does this person actually KEEP a practice on this side?
 *
 * Owner: "If someone doesnt have the evening practice turned on, dont send
 * them a notification."
 *
 * The pref column alone can't answer that. parishOfficeEveningPref is a
 * REMINDER setting, written by the customizer's notifications step, while
 * whether an evening practice exists is a fact about the RULE. The two drift
 * apart in ordinary use: a stored pref survives from a seed or an earlier
 * routine, and office-prefs writes now deliberately OMIT fields the flow never
 * learned (so a reminder time set once isn't clobbered by a default). Omitting
 * a field leaves the old value standing — correct for a time, wrong for a
 * side that has since been emptied. The result is an evening nudge for a
 * practice the person doesn't keep, which is what he's reporting.
 *
 * So the rule gets a vote. A side counts as kept if it has an anchor level, a
 * contemplative practice of its own, or a second practice.
 *
 * ONLY EVER USED TO SUPPRESS A POSITIVE ABSENCE. An empty or missing
 * ruleConfig means "we don't know" — a routine that never synced, an old
 * client — and unknown must not silence a reminder someone is relying on.
 * Sending one nudge too many is a nuisance; silently dropping the reminder
 * that gets someone to prayer is the failure that actually matters, and it
 * would be invisible to us. So: known-empty suppresses, unknown does not.
 */
export function sideHasPractice(ruleConfig: unknown, side: "morning" | "evening"): boolean {
  try {
    const values = (ruleConfig as { values?: Record<string, string> } | null)?.values;
    // Unknown, not empty — see above.
    if (!values || Object.keys(values).length === 0) return true;
    const level = sideLevel(values, side);
    // "ask" is the customizer's own word for a side left blank.
    if (level && level !== "none" && level !== "ask") return true;
    if (values[`phoebe:office:contemplation:${side}`] === "1") return true;
    const extra = values[`phoebe:office:extra:${side}`];
    if (typeof extra === "string" && extra.trim().length > 0 && extra !== "none") return true;
    return false;
  } catch {
    // Never suppress on an error reading the rule.
    return true;
  }
}

