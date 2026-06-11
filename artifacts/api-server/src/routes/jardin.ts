import { Router, type IRouter } from "express";
import { pool, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

function getUser(req: any): { id: number; username: string; displayName: string } | null {
  return (req as any).user ?? null;
}

// ─── POST /api/jardin/signup ──────────────────────────────────────────────────
// Open signup for the El Jardín portal (eljardin.withphoebe.app). Creates a
// jardin-only account that sees only the Jardín experience — mirrors the
// /climate/signup pattern (jardinEnrolled + jardinOnly, skip the general
// onboarding tour). `website` is a honeypot.
router.post(
  "/jardin/signup",
  rateLimit({
    name: "jardin_signup",
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many signup attempts from your network. Please try again in an hour.",
  }),
  async (req, res): Promise<void> => {
    const { email, name, password, website } = req.body as {
      email?: string; name?: string; password?: string; website?: string;
    };
    if (website && website.trim().length > 0) { res.status(400).json({ error: "Invalid submission." }); return; }
    if (!email || !email.includes("@")) { res.status(400).json({ error: "A valid email address is required." }); return; }
    if (!name || name.trim().length < 1) { res.status(400).json({ error: "Your name is required." }); return; }
    if (!password || password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters." }); return; }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing) { res.status(400).json({ error: "An account with that email already exists." }); return; }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      jardinEnrolled: true,
      jardinOnly: true,
      // Skip Phoebe's general onboarding tour — the portal is self-contained.
      onboardingCompleted: true,
    }).returning();

    req.login(user as Express.User, (err) => {
      if (err) { res.status(500).json({ error: "Login failed after signup." }); return; }
      req.session.save(() => res.json({ ok: true }));
    });
  },
);

// POST /api/jardin/enroll-self — an existing Phoebe user opts into Jardín
// (jardinEnrolled true, jardinOnly stays false so they keep the full app).
router.post("/jardin/enroll-self", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  await db.update(usersTable).set({ jardinEnrolled: true }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

// ── Bible Studies ──────────────────────────────────────────────────────────

router.get("/jardin/bible-studies", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { rows } = await pool.query(
    `SELECT id, book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways, created_at, updated_at
     FROM jardin_bible_studies WHERE user_id = $1 ORDER BY updated_at DESC`,
    [user.id],
  );
  return res.json({ studies: rows });
});

router.post("/jardin/bible-studies", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { book_chapter = "", main_theme = "", key_verses = "", symbols_keywords = "", application = "", takeaways = "" } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `INSERT INTO jardin_bible_studies (user_id, book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways, created_at, updated_at`,
    [user.id, book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways],
  );
  return res.status(201).json(rows[0]);
});

router.put("/jardin/bible-studies/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `UPDATE jardin_bible_studies
     SET book_chapter=$1, main_theme=$2, key_verses=$3, symbols_keywords=$4, application=$5, takeaways=$6, updated_at=NOW()
     WHERE id=$7 AND user_id=$8
     RETURNING id, book_chapter, main_theme, key_verses, symbols_keywords, application, takeaways, updated_at`,
    [book_chapter ?? "", main_theme ?? "", key_verses ?? "", symbols_keywords ?? "", application ?? "", takeaways ?? "", req.params.id, user.id],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

router.delete("/jardin/bible-studies/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  await pool.query(`DELETE FROM jardin_bible_studies WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
  return res.json({ ok: true });
});

// ── Character Studies ──────────────────────────────────────────────────────

router.get("/jardin/character-studies", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { rows } = await pool.query(
    `SELECT id, name, name_meaning, origin, time_period, strengths, weaknesses, key_events, lessons_learned, created_at, updated_at
     FROM jardin_character_studies WHERE user_id=$1 ORDER BY updated_at DESC`,
    [user.id],
  );
  return res.json({ studies: rows });
});

router.post("/jardin/character-studies", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { name = "", name_meaning = "", origin = "", time_period = "", strengths = "", weaknesses = "", key_events = "", lessons_learned = "" } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `INSERT INTO jardin_character_studies (user_id, name, name_meaning, origin, time_period, strengths, weaknesses, key_events, lessons_learned)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, name_meaning, origin, time_period, strengths, weaknesses, key_events, lessons_learned, created_at, updated_at`,
    [user.id, name, name_meaning, origin, time_period, strengths, weaknesses, key_events, lessons_learned],
  );
  return res.status(201).json(rows[0]);
});

router.put("/jardin/character-studies/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { name, name_meaning, origin, time_period, strengths, weaknesses, key_events, lessons_learned } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `UPDATE jardin_character_studies
     SET name=$1, name_meaning=$2, origin=$3, time_period=$4, strengths=$5, weaknesses=$6, key_events=$7, lessons_learned=$8, updated_at=NOW()
     WHERE id=$9 AND user_id=$10
     RETURNING id, name, updated_at`,
    [name ?? "", name_meaning ?? "", origin ?? "", time_period ?? "", strengths ?? "", weaknesses ?? "", key_events ?? "", lessons_learned ?? "", req.params.id, user.id],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

router.delete("/jardin/character-studies/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  await pool.query(`DELETE FROM jardin_character_studies WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
  return res.json({ ok: true });
});

// ── Sermon Notes ───────────────────────────────────────────────────────────

router.get("/jardin/sermon-notes", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { rows } = await pool.query(
    `SELECT id, sermon_date, preacher, title, scripture, content, created_at, updated_at
     FROM jardin_sermon_notes WHERE user_id=$1 ORDER BY sermon_date DESC, created_at DESC`,
    [user.id],
  );
  return res.json({ notes: rows });
});

router.post("/jardin/sermon-notes", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { sermon_date = "", preacher = "", title = "", scripture = "", content = "" } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `INSERT INTO jardin_sermon_notes (user_id, sermon_date, preacher, title, scripture, content)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, sermon_date, preacher, title, scripture, content, created_at, updated_at`,
    [user.id, sermon_date, preacher, title, scripture, content],
  );
  return res.status(201).json(rows[0]);
});

router.put("/jardin/sermon-notes/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { sermon_date, preacher, title, scripture, content } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `UPDATE jardin_sermon_notes
     SET sermon_date=$1, preacher=$2, title=$3, scripture=$4, content=$5, updated_at=NOW()
     WHERE id=$6 AND user_id=$7
     RETURNING id, title, updated_at`,
    [sermon_date ?? "", preacher ?? "", title ?? "", scripture ?? "", content ?? "", req.params.id, user.id],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

router.delete("/jardin/sermon-notes/:id", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  await pool.query(`DELETE FROM jardin_sermon_notes WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
  return res.json({ ok: true });
});

// ── Next Sunday Prep ───────────────────────────────────────────────────────

router.get("/jardin/next-sunday", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { rows } = await pool.query(
    `SELECT id, title, scripture, web_link, notes, updated_at FROM jardin_next_sunday WHERE user_id=$1`,
    [user.id],
  );
  return res.json(rows[0] ?? { title: "", scripture: "", web_link: "", notes: "" });
});

router.put("/jardin/next-sunday", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { title = "", scripture = "", web_link = "", notes = "" } = req.body as Record<string, string>;
  const { rows } = await pool.query(
    `INSERT INTO jardin_next_sunday (user_id, title, scripture, web_link, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE
     SET title=$2, scripture=$3, web_link=$4, notes=$5, updated_at=NOW()
     RETURNING id, title, scripture, web_link, notes, updated_at`,
    [user.id, title, scripture, web_link, notes],
  );
  return res.json(rows[0]);
});

// ── Friends / Leaderboard ──────────────────────────────────────────────────

router.get("/jardin/leaderboard", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  // Current user's streak
  const selfRow = await pool.query(
    `SELECT prayer_streak_count, prayer_streak_last_date FROM users WHERE id=$1`,
    [user.id],
  );
  const self = selfRow.rows[0] ?? { prayer_streak_count: 0, prayer_streak_last_date: null };
  // Friends + their streaks
  const { rows: friends } = await pool.query(
    `SELECT u.id, u.username, u.display_name,
            u.prayer_streak_count, u.prayer_streak_last_date
     FROM jardin_friends jf
     JOIN users u ON u.id = jf.friend_id
     WHERE jf.user_id = $1
     ORDER BY u.prayer_streak_count DESC`,
    [user.id],
  );
  return res.json({
    self: {
      id: user.id,
      username: user.username,
      streak: self.prayer_streak_count ?? 0,
      lastDate: self.prayer_streak_last_date,
    },
    friends: friends.map((f) => ({
      id: f.id,
      username: f.username,
      displayName: f.display_name,
      streak: f.prayer_streak_count ?? 0,
      lastDate: f.prayer_streak_last_date,
    })),
  });
});

router.post("/jardin/friends", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { username } = req.body as { username?: string };
  if (!username?.trim()) return res.status(400).json({ error: "Username required" });
  const found = await pool.query(`SELECT id, username, display_name FROM users WHERE LOWER(username)=LOWER($1)`, [username.trim()]);
  if (!found.rows.length) return res.status(404).json({ error: "User not found" });
  const friend = found.rows[0];
  if (friend.id === user.id) return res.status(400).json({ error: "Can't add yourself" });
  await pool.query(
    `INSERT INTO jardin_friends (user_id, friend_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [user.id, friend.id],
  );
  return res.status(201).json({ id: friend.id, username: friend.username, displayName: friend.display_name });
});

router.delete("/jardin/friends/:friendId", async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  await pool.query(`DELETE FROM jardin_friends WHERE user_id=$1 AND friend_id=$2`, [user.id, req.params.friendId]);
  return res.json({ ok: true });
});

export default router;
