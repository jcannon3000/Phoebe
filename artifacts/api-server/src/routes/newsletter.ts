import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  newslettersTable,
  betaUsersTable,
  usersTable,
  groupsTable,
  groupMembersTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { sendNewsletterEmail } from "../lib/email";

const router: IRouter = Router();

type SessionUser = { id: number; email: string; name: string };

function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// Newsletter sending is gated to super-admins (beta_users.is_admin),
// the same gate used by the Reports / Pilot Users / Waitlist tools.
async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

// Resolve the distinct recipient list (deduped by lowercased email) for
// a given scope. "all" = every Phoebe user; "groups" = joined members
// of the selected groups, excluding hidden admins.
async function resolveRecipients(
  scope: "all" | "groups",
  groupIds: number[],
): Promise<{ email: string; name: string }[]> {
  let rows: { email: string; name: string | null }[];
  if (scope === "all") {
    rows = await db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable);
  } else {
    if (groupIds.length === 0) return [];
    rows = await db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
      .where(
        and(
          inArray(groupMembersTable.groupId, groupIds),
          isNotNull(groupMembersTable.joinedAt),
          ne(groupMembersTable.role, "hidden_admin"),
        ),
      );
  }
  const seen = new Map<string, { email: string; name: string }>();
  for (const r of rows) {
    const key = (r.email ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { email: r.email, name: r.name ?? "" });
  }
  return Array.from(seen.values());
}

// GET /api/admin/newsletter/groups — every group + member count, plus
// the total user count, for the recipient picker.
router.get("/admin/newsletter/groups", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  try {
    const groups = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        emoji: groupsTable.emoji,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int FROM group_members gm
          WHERE gm.group_id = ${groupsTable.id}
            AND gm.joined_at IS NOT NULL
            AND gm.role <> 'hidden_admin'
        )`,
      })
      .from(groupsTable)
      .orderBy(groupsTable.name);
    const [allUsers] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usersTable);
    res.json({ groups, allUsersCount: allUsers?.count ?? 0 });
  } catch (err) {
    console.error("GET /api/admin/newsletter/groups error:", err);
    res.status(500).json({ error: "Failed to load groups" });
  }
});

// GET /api/admin/newsletters — recent send history
router.get("/admin/newsletters", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  try {
    const newsletters = await db
      .select()
      .from(newslettersTable)
      .orderBy(desc(newslettersTable.createdAt))
      .limit(50);
    res.json({ newsletters });
  } catch (err) {
    console.error("GET /api/admin/newsletters error:", err);
    res.status(500).json({ error: "Failed to load newsletter history" });
  }
});

// POST /api/admin/newsletter/preview — send a one-off preview of the
// rendered newsletter to the requesting admin's own email. Nothing is
// logged and no other recipients are touched — it's just a test send
// so the admin can see exactly how the email looks before sending.
router.post("/admin/newsletter/preview", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const schema = z.object({
    subject: z.string().trim().min(1).max(200),
    bodyMarkdown: z.string().trim().min(1).max(20000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A subject and body are required" });
    return;
  }

  try {
    const ok = await sendNewsletterEmail({
      to: user.email,
      subject: `[Preview] ${parsed.data.subject}`,
      bodyMarkdown: parsed.data.bodyMarkdown,
    });
    if (!ok) {
      res.status(502).json({ error: "Email service is unavailable right now" });
      return;
    }
    res.json({ ok: true, sentTo: user.email });
  } catch (err) {
    console.error("POST /api/admin/newsletter/preview error:", err);
    res.status(500).json({ error: "Failed to send preview" });
  }
});

// POST /api/admin/newsletter — compose + send a newsletter. Recipients
// are resolved, the row is logged, and the response returns immediately
// with the recipient count; the actual email fan-out runs in the
// background so the request doesn't hang on a long Gmail loop. sent_count
// is updated on the row once the fan-out finishes.
router.post("/admin/newsletter", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const schema = z.object({
    subject: z.string().trim().min(1).max(200),
    bodyMarkdown: z.string().trim().min(1).max(20000),
    scope: z.enum(["all", "groups"]),
    groupIds: z.array(z.number().int().positive()).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A subject and body are required" });
    return;
  }
  const { subject, bodyMarkdown, scope } = parsed.data;
  // Dedup group ids so the picker can't double-count.
  const groupIds = Array.from(new Set(parsed.data.groupIds));
  if (scope === "groups" && groupIds.length === 0) {
    res.status(400).json({ error: "Select at least one group" });
    return;
  }

  try {
    const recipients = await resolveRecipients(scope, groupIds);
    if (recipients.length === 0) {
      res.status(400).json({ error: "No recipients found for that selection" });
      return;
    }

    const [row] = await db
      .insert(newslettersTable)
      .values({
        subject,
        bodyMarkdown,
        recipientScope: scope,
        groupIds: scope === "groups" ? groupIds : [],
        recipientCount: recipients.length,
        sentCount: 0,
        sentByUserId: user.id,
        sentByName: user.name,
      })
      .returning({ id: newslettersTable.id });

    const newsletterId = row!.id;

    // Background fan-out — sequential keeps us well under Gmail rate
    // limits and means one bad address doesn't abort the rest.
    void (async () => {
      let sentCount = 0;
      for (const r of recipients) {
        try {
          const ok = await sendNewsletterEmail({ to: r.email, subject, bodyMarkdown });
          if (ok) sentCount++;
        } catch (err) {
          console.error("Newsletter send failed for", r.email, err);
        }
      }
      try {
        await db
          .update(newslettersTable)
          .set({ sentCount })
          .where(eq(newslettersTable.id, newsletterId));
      } catch (err) {
        console.error("Failed to update newsletter sent_count:", err);
      }
      console.log(`Newsletter ${newsletterId}: sent ${sentCount}/${recipients.length}`);
    })();

    res.json({ ok: true, id: newsletterId, recipientCount: recipients.length });
  } catch (err) {
    console.error("POST /api/admin/newsletter error:", err);
    res.status(500).json({ error: "Failed to send newsletter" });
  }
});

export default router;
