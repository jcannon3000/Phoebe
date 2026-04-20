import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpsertUserBody, GetUserResponse, UpsertUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  const email = req.query.email as string | undefined;
  if (!email) {
    res.status(400).json({ error: "email query param required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(user));
});

router.put("/users/me", async (req, res): Promise<void> => {
  const parsed = UpsertUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ name: parsed.data.name })
      .where(eq(usersTable.email, parsed.data.email))
      .returning();
    res.json(UpsertUserResponse.parse(updated));
    return;
  }

  const [created] = await db.insert(usersTable).values(parsed.data).returning();
  res.json(UpsertUserResponse.parse(created));
});

// ─── DELETE /api/users/me — in-app account deletion ────────────────────────
// Apple Guideline 5.1.1(v) requires account-creating apps to offer in-app
// deletion. This endpoint:
//   1. Verifies the caller is logged in (session user).
//   2. Requires the user to type their email as a confirmation step — a
//      small but real guard against accidental taps on shared devices.
//   3. Hard-deletes the users row. Every other table we own that
//      references users.id has `ON DELETE CASCADE` at the DB level
//      (see artifacts/api-server/src/lib/migrate.ts), so prayer requests,
//      moment posts, group memberships, device tokens, gratitude rows
//      etc. all disappear with the user in a single transaction.
//   4. Destroys the session so the app falls back to the login screen.
// External mirrors (Google Calendar events, sent emails) are not reached
// by the cascade — those are logged and left to the user to clean up
// manually. We note this in the UI wording on the client.
router.delete("/users/me", async (req, res): Promise<void> => {
  const user = req.user as { id: number; email: string } | undefined;
  if (!user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const confirmEmail = typeof req.body?.confirmEmail === "string"
    ? req.body.confirmEmail.trim().toLowerCase()
    : "";
  if (confirmEmail !== user.email.toLowerCase()) {
    res.status(400).json({
      error: "confirm_email_mismatch",
      detail: "Type your account email to confirm deletion.",
    });
    return;
  }

  try {
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
  } catch (err) {
    console.error("[users:delete-me] delete failed:", err);
    res.status(500).json({ error: "delete_failed" });
    return;
  }

  // Log out + destroy session so the stale cookie can't be replayed.
  req.logout((logoutErr) => {
    if (logoutErr) {
      console.warn("[users:delete-me] logout after delete warned:", logoutErr);
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.warn("[users:delete-me] session destroy warned:", destroyErr);
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

export default router;
