// App SUPER ADMIN (beta_users.is_admin, matched by email) — the same check
// /auth/me uses for `isSuperAdmin`. Shared by every route that gates an
// operator-only capability (preset rule links, creator seasons, …).
import { eq } from "drizzle-orm";
import { db, usersTable, betaUsersTable } from "@workspace/db";

export async function isSuperAdminUser(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (!u?.email) return false;
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch { return false; }
}
