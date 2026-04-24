import { Router, type IRouter } from "express";
import { eq, inArray, isNotNull, and, ne } from "drizzle-orm";
import { db, ritualsTable, usersTable, momentUserTokensTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/contacts/search", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }

  const userId = (req.user as { id: number }).id;
  const lq = q.toLowerCase();

  // ── 1. Members from existing traditions (rituals) ─────────────────────────
  const rituals = await db.select({ participants: ritualsTable.participants })
    .from(ritualsTable)
    .where(eq(ritualsTable.ownerId, userId));

  const ritualMembers: Array<{ name: string; email: string }> = [];
  for (const r of rituals) {
    const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
    for (const p of parts) {
      if (p.email) ritualMembers.push({ name: p.name ?? p.email, email: p.email });
    }
  }

  // ── 2. Members from existing practices (moments) ──────────────────────────
  const [userRow] = await db.select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const momentMembers: Array<{ name: string; email: string }> = [];
  if (userRow?.email) {
    const tokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, userRow.email));

    const momentIds = [...new Set(tokenRows.map(r => r.momentId))];
    if (momentIds.length > 0) {
      const allMembers = await db.select({ name: momentUserTokensTable.name, email: momentUserTokensTable.email })
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, momentIds));

      for (const m of allMembers) {
        if (m.email && m.email !== userRow.email) {
          momentMembers.push({ name: m.name ?? m.email, email: m.email });
        }
      }
    }
  }

  // ── 3. Merge, deduplicate, and filter by query ────────────────────────────
  const seen = new Set<string>();
  const merged: Array<{ name: string; email: string }> = [];

  const addIfMatch = (p: { name: string; email: string }) => {
    const emailLower = p.email.toLowerCase();
    if (seen.has(emailLower)) return;
    if (emailLower.includes(lq) || (p.name ?? "").toLowerCase().includes(lq)) {
      seen.add(emailLower);
      merged.push(p);
    }
  };

  for (const p of ritualMembers) addIfMatch(p);
  for (const p of momentMembers) addIfMatch(p);

  res.json(merged.slice(0, 15));
});

// ─── POST /contacts/match ───────────────────────────────────────────────────
//
// Body: { hashes: string[] }   // SHA-256 of E.164 phone numbers, hex
//
// Returns: { matches: Array<{ userId, name, avatarUrl, hashIndex }> }
//
// "Find your friends on Phoebe." The mobile shell reads the device
// address book, normalizes each phone number to E.164, hashes each
// with SHA-256, and POSTs the batch here. We look up each hash
// against users.phone_hash and return the matched users' display
// info — never the raw hash mapping back to phone, never the
// uploader's address-book label for that match. Excludes the caller
// themselves so they don't see their own row.
//
// The optional `hashIndex` in each match is the index of the matching
// hash in the request array — the client can use it to pair a match
// back to the contact row it came from (so the UI can say "Maya is on
// Phoebe" using the user's *Phoebe* display name, but still link back
// to the address-book entry for things like "share a letter with
// Maya").
//
// Rate limit: cap at 5000 hashes per request to keep the IN clause
// reasonable. Clients with larger address books can chunk.
router.post("/contacts/match", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const sessionUserId = (req.user as { id: number }).id;

  const body = (req.body ?? {}) as { hashes?: unknown };
  const raw = Array.isArray(body.hashes) ? body.hashes : [];
  // Filter to plausible SHA-256 hex strings; dedupe; cap at 5k.
  const HEX64 = /^[0-9a-f]{64}$/i;
  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const h of raw) {
    if (typeof h !== "string") continue;
    const lower = h.toLowerCase();
    if (!HEX64.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    hashes.push(lower);
    if (hashes.length >= 5000) break;
  }
  if (hashes.length === 0) {
    res.json({ matches: [] });
    return;
  }

  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    avatarUrl: usersTable.avatarUrl,
    phoneHash: usersTable.phoneHash,
  })
    .from(usersTable)
    .where(and(
      isNotNull(usersTable.phoneHash),
      inArray(usersTable.phoneHash, hashes),
      ne(usersTable.id, sessionUserId),
    ));

  // Build hash → index map so we can return the request-array position
  // (lets the client correlate a match back to the contact-book row).
  const indexByHash = new Map<string, number>();
  hashes.forEach((h, i) => indexByHash.set(h, i));

  const matches = rows.map((r) => ({
    userId: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl,
    hashIndex: indexByHash.get(r.phoneHash ?? "") ?? -1,
  }));

  res.json({ matches });
});

export default router;
