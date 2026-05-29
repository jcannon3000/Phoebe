import { Router, type IRouter } from "express";
import { db, journalEntriesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

// ── Private journal — a personal daily reflection ─────────────────────────
//
// Strictly the author's own: every query is scoped to the session user's
// id and there is no share / community surface (contrast gratitude). The
// time spent writing is logged separately as a "journal" prayer-session
// by the client (see pages/journal.tsx); this route only owns the entries.
//
//   POST /api/journal        — save a new entry { prompt?, body }
//   GET  /api/journal/mine   — the caller's entries, newest first

router.post("/journal", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const promptRaw = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (body.length === 0) { res.status(400).json({ error: "empty" }); return; }
  if (body.length > 20000) { res.status(400).json({ error: "too_long" }); return; }

  const [row] = await db
    .insert(journalEntriesTable)
    .values({
      userId: user.id,
      prompt: promptRaw ? promptRaw.slice(0, 500) : null,
      body,
    })
    .returning({ id: journalEntriesTable.id, createdAt: journalEntriesTable.createdAt });

  res.json({ id: row?.id ?? null, createdAt: row?.createdAt ?? null });
});

router.get("/journal/mine", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }

  const rows = await db
    .select({
      id: journalEntriesTable.id,
      prompt: journalEntriesTable.prompt,
      body: journalEntriesTable.body,
      createdAt: journalEntriesTable.createdAt,
    })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, user.id))
    .orderBy(desc(journalEntriesTable.createdAt))
    .limit(200);

  res.json({ entries: rows });
});

export default router;
