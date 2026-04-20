import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, waitlistTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

// POST /api/waitlist — public endpoint, no auth required.
// Idempotent on email: re-submitting the same email returns ok without
// creating a duplicate row, so a refresh after submitting doesn't error.
router.post("/waitlist", async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.string().email().max(254),
    name: z.string().min(1).max(120),
    reason: z.string().max(500).optional(),
    source: z.string().max(60).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please share a valid name and email." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  const reason = parsed.data.reason?.trim() || null;
  const source = parsed.data.source?.trim() || "homepage";

  try {
    const [existing] = await db.select({ id: waitlistTable.id })
      .from(waitlistTable).where(eq(waitlistTable.email, email));
    if (existing) {
      res.json({ ok: true, alreadyOnList: true });
      return;
    }
    await db.insert(waitlistTable).values({ email, name, reason, source });
    res.json({ ok: true, alreadyOnList: false });
  } catch (err) {
    console.error("[waitlist] insert failed:", err);
    res.status(500).json({ error: "Couldn't save your spot. Please try again." });
  }
});

export default router;
