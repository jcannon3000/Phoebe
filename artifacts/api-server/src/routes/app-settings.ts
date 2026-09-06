import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isSuperAdminUser } from "../lib/superAdmin";

/**
 * APP-WIDE SWITCHES an admin flips in Admin Tools — instead of a code change.
 *
 * Owner (2026-09-05): "build in admin tools where I could make Andrew's
 * Version un-admin-gated … instead of having to do it here." Andrew's Version
 * had been made public and reverted the same evening by editing six gates in
 * code; this is the switch those gates read instead. One table, one public
 * GET the client caches briefly, one super-admin PUT.
 *
 * The keys are a closed list: a PUT for a key not named here is refused, so
 * the table can't fill up with typos, and every reader gets a boolean with a
 * default rather than "whatever is in the row".
 */

const router: IRouter = Router();

export type AppSettings = {
  /** Andrew's Version shows for everyone (true) or super admins only (false). */
  andrewsPublic: boolean;
};
export const APP_SETTING_DEFAULTS: AppSettings = { andrewsPublic: false };
const KEYS = Object.keys(APP_SETTING_DEFAULTS) as Array<keyof AppSettings>;

// A short in-process cache: the push cron and the GET both read this, and
// neither needs the row more than once a minute.
let cache: { at: number; value: AppSettings } | null = null;
const CACHE_MS = 60_000;

export async function readAppSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const out: AppSettings = { ...APP_SETTING_DEFAULTS };
  try {
    const rows = await db.execute(sql`SELECT key, value FROM app_settings`);
    for (const r of rows.rows as Array<{ key: string; value: unknown }>) {
      if ((KEYS as string[]).includes(r.key) && typeof r.value === "boolean") out[r.key as keyof AppSettings] = r.value;
    }
  } catch (err) {
    console.warn("[app-settings] read failed, serving defaults:", err);
  }
  cache = { at: Date.now(), value: out };
  return out;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

// GET /api/app-settings — public: the client's gates read it for everyone.
router.get("/app-settings", async (_req: Request, res: Response): Promise<void> => {
  // Identical for every viewer, but it is a SWITCH — a minute is as long as
  // the WebView may hold it (the hour-long cache trap of 580e545d).
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(await readAppSettings());
});

// PUT /api/admin/app-settings/:key { value: boolean } — super-admin.
router.put("/admin/app-settings/:key", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId == null) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "forbidden" }); return; }
  const key = String(req.params.key ?? "");
  if (!(KEYS as string[]).includes(key)) { res.status(400).json({ error: "Unknown setting." }); return; }
  const value = (req.body as { value?: unknown } | undefined)?.value;
  if (typeof value !== "boolean") { res.status(400).json({ error: "value must be true or false." }); return; }
  await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_by) VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${userId})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`);
  cache = null;
  res.setHeader("Cache-Control", "no-store");
  res.json(await readAppSettings());
});

export default router;
