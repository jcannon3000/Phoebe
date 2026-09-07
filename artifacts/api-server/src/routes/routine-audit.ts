/**
 * Weekly routine audit — endpoints.
 *
 *   GET  /api/me/routine-audit        → the findings (see lib/routineAudit.ts)
 *   POST /api/me/routine-audit/apply  → apply ONE finding's change
 *
 * Suggestions are never auto-applied. Each one is a single, named change the
 * person opts into; there is deliberately no "apply all".
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, betaUsersTable } from "@workspace/db";
import { buildRoutineAudit } from "../lib/routineAudit";
import { sendRoutineAuditPush } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

function getUserId(req: any): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}

// Owner: "this should be only for super admins." Same beta_users.is_admin gate
// the other admin surfaces use — checked SERVER-SIDE on both endpoints, not
// just hidden in the UI, since /apply writes to a routine.
async function isSuperAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch { return false; }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Only the keys the audit itself can propose. The request names a key, so
// without this an arbitrary rule-config value could be written through here.
const APPLYABLE_SLOT_KEYS = new Set([
  "phoebe:slot:listening", "phoebe:slot:walk", "phoebe:slot:reading",
  "phoebe:slot:podcasts", "phoebe:slot:cobreathe", "phoebe:slot:examen",
]);
const SLOT_VALUES = new Set(["morning", "midday", "afternoon", "evening", "anytime"]);

router.get("/me/routine-audit", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Not 403 — an ungated caller simply has nothing to see, and the home card
  // that reads this should quietly render nothing rather than an error.
  if (!(await isSuperAdmin(userId))) { res.json({ findings: [] }); return; }
  try {
    res.json({ findings: await buildRoutineAudit(userId) });
  } catch (err) {
    console.error("[routine-audit] build failed:", err);
    // Never 500 a home surface over an advisory feature — an empty list just
    // means "nothing to suggest".
    res.json({ findings: [] });
  }
});

router.post("/me/routine-audit/apply", perUserRateLimit("routine_audit_apply", {
  max: 30, windowMs: 60 * 60 * 1000,
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isSuperAdmin(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const change = req.body?.change as
    | { type?: string; key?: string; value?: string; field?: string }
    | undefined;
  if (!change || typeof change !== "object") { res.status(400).json({ error: "invalid" }); return; }

  try {
    if (change.type === "officePrefs") {
      const field = change.field;
      if (field !== "morningTime" && field !== "eveningTime") { res.status(400).json({ error: "invalid" }); return; }
      if (typeof change.value !== "string" || !TIME_RE.test(change.value)) { res.status(400).json({ error: "invalid" }); return; }
      await db.update(usersTable)
        .set(field === "morningTime"
          ? { parishOfficeMorningTime: change.value }
          : { parishOfficeEveningTime: change.value })
        .where(eq(usersTable.id, userId));
      res.json({ ok: true });
      return;
    }

    if (change.type === "ruleConfig") {
      const key = change.key ?? "";
      if (!APPLYABLE_SLOT_KEYS.has(key)) { res.status(400).json({ error: "invalid" }); return; }
      const value = change.value ?? "";
      // "" is the audit's delete sentinel (a dropped practice); anything else
      // has to be a real slot.
      if (value !== "" && !SLOT_VALUES.has(value)) { res.status(400).json({ error: "invalid" }); return; }

      const [row] = await db.select({ ruleConfig: usersTable.ruleConfig, homeLayout: usersTable.homeLayout })
        .from(usersTable).where(eq(usersTable.id, userId));
      const cfg = (row?.ruleConfig as { values?: Record<string, string>; updatedAt?: number } | null) ?? {};
      const values = { ...(cfg.values ?? {}) };
      if (value === "") delete values[key]; else values[key] = value;

      /**
       * AND THE CARD ITSELF. Owner, tapping "Yes, change it" on "you've kept
       * Creation Prayer 6 times but it isn't part of your rhythm — add it?":
       * "nothing happened."
       *
       * Nothing did. A slot says WHEN a practice rides, and the home reads
       * whether a practice is on from the LAYOUT (order ∋ key, hidden ∌ key —
       * homeCardActive). Writing the slot alone added a time of day for a card
       * that was never turned on, and the same in reverse: dropping the slot
       * left the card on the home. The layout moves with it now.
       */
      const practiceKey = key.slice("phoebe:slot:".length);
      const layout = (row?.homeLayout as { order?: string[]; hidden?: string[] } | null) ?? null;
      /**
       * NEVER MATERIALISE A LAYOUT FOR SOMEONE WHO HAS NONE.
       *
       * A null home_layout is not "no cards" — it is "never customised", and
       * four defaults hang off it (the Creation Prayer card, the five-minute
       * silence, the office sides, Forward Day by Day). Writing
       * {order:[thisPractice], hidden:[]} would turn one card on and silently
       * take those four away; homeLayoutCache carries a note about the last
       * time that happened. The slot still gets written, so the practice is
       * still recorded; the card follows when they next customise.
       */
      if (!layout) {
        await db.update(usersTable)
          .set({ ruleConfig: { values, updatedAt: Date.now() } })
          .where(eq(usersTable.id, userId));
        res.json({ ok: true, layoutUnchanged: true });
        return;
      }
      const order = [...(layout?.order ?? [])];
      const hidden = [...(layout?.hidden ?? [])];
      if (value === "") {
        // Take it off: hidden governs, so naming it there is what turns it off.
        if (!hidden.includes(practiceKey)) hidden.push(practiceKey);
      } else {
        if (!order.includes(practiceKey)) order.push(practiceKey);
        const at = hidden.indexOf(practiceKey);
        if (at >= 0) hidden.splice(at, 1);
      }

      await db.update(usersTable).set({ homeLayout: { order, hidden } }).where(eq(usersTable.id, userId));
      await db.update(usersTable)
        // Bump updatedAt so the device-sync LWW clock treats this as newer than
        // whatever the phone last pushed — without it the next reconcile would
        // hand the old routine straight back and the change would vanish.
        .set({ ruleConfig: { values, updatedAt: Date.now() } })
        .where(eq(usersTable.id, userId));
      res.json({ ok: true });
      return;
    }

    res.status(400).json({ error: "invalid" });
  } catch (err) {
    console.error("[routine-audit] apply failed:", err);
    res.status(500).json({ error: "apply_failed" });
  }
});

/**
 * POST /api/me/routine-audit/fire-now — send MYSELF the audit push, now.
 *
 * The owner reported the Sunday push arriving on desktop and not on their
 * iPhone (2026-09-06), and there was no way to check it without waiting a week
 * and then reading Railway. This runs the audit for the caller, sends the real
 * push through the real sender, and RETURNS THE DELIVERY COUNTS — so
 * "did it even try my phone?" has a number instead of a guess.
 *
 * Admin-only like the rest of the feature, and it deliberately does not touch
 * routineAuditNudgeSentDate, so Sunday's send is unaffected and this can be
 * run as many times as it takes.
 */
router.post("/me/routine-audit/fire-now", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdmin(userId))) { res.status(403).json({ error: "admin_only" }); return; }
  try {
    const findings = await buildRoutineAudit(userId);
    const result = await sendRoutineAuditPush(userId, { count: Math.max(findings.length, 1) });
    res.json({
      ok: true,
      findings: findings.length,
      // What the sender actually managed, per surface.
      deviceAttempted: result.deviceAttempted,
      deviceSucceeded: result.deviceSucceeded,
      webSucceeded: result.webSucceeded,
      invalidated: result.invalidated,
    });
  } catch (err) {
    console.error("[routine-audit] fire-now failed:", err);
    res.status(500).json({ error: "fire_failed" });
  }
});

export default router;
