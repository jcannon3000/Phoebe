// ─── Course progress, handed back from the in-app reader ──────────────────
//
// On iOS a video course plays in the in-app reader, at withphoebe.app, because
// YouTube refuses to embed from the app's own capacitor:// origin
// (mymonastery lib/videoEmbed). Course progress lives in localStorage, which is
// per ORIGIN — so everything watched in the reader was saved where the app
// could never read it: the app kept saying "0 of N", the home never showed the
// course as started, and every reopen went back to the app's stale lesson
// (audit, 2026-09-18). The reader has its own cookie jar too, so the routine
// sync can't carry it either, and a guest has no session at all.
//
// So the two pages hand progress over directly. The app opens the reader with
// a random one-time code and its own progress; the reader seeds itself from
// that, and PUTs its snapshot here under the code after every change; when the
// reader closes, the app GETs it and adopts it. The code is the only key —
// nothing here is tied to an account, and the payload is just which lessons of
// a public YouTube course are done.
//
// In memory on purpose: a hand-back lives for minutes, production runs one
// instance (the schedulers run in the web process, which only holds with one),
// and a deploy mid-lesson merely falls back to how it was before this existed.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

type Relay = { courseId: string; completed: string[]; lastId: string | null; started: boolean; at: number };

const RELAYS = new Map<string, Relay>();
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_RELAYS = 5000;
const MAX_LESSONS = 300;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function sweep(now: number): void {
  for (const [k, v] of RELAYS) if (now - v.at > TTL_MS) RELAYS.delete(k);
}

router.put("/course-relay/:token", (req: Request, res: Response): void => {
  const token = String(req.params.token ?? "");
  const body = (req.body ?? {}) as Partial<Relay>;
  const completed = Array.isArray(body.completed) ? body.completed : null;
  if (
    !TOKEN.test(token) ||
    typeof body.courseId !== "string" || !ID.test(body.courseId) ||
    !completed || completed.length > MAX_LESSONS || !completed.every((x) => typeof x === "string" && ID.test(x)) ||
    (body.lastId != null && (typeof body.lastId !== "string" || !ID.test(body.lastId)))
  ) {
    res.status(400).json({ error: "bad relay" });
    return;
  }
  const now = Date.now();
  if (!RELAYS.has(token) && RELAYS.size >= MAX_RELAYS) {
    sweep(now);
    // Still full: drop the oldest rather than refuse — the newest hand-back is
    // the one someone is waiting on.
    if (RELAYS.size >= MAX_RELAYS) {
      const oldest = RELAYS.keys().next().value;
      if (oldest !== undefined) RELAYS.delete(oldest);
    }
  }
  RELAYS.delete(token); // re-insert, so Map order stays oldest-first
  RELAYS.set(token, {
    courseId: body.courseId,
    completed: [...new Set(completed as string[])],
    lastId: body.lastId ?? null,
    started: body.started === true,
    at: now,
  });
  res.json({ ok: true, at: now });
});

router.get("/course-relay/:token", (req: Request, res: Response): void => {
  const token = String(req.params.token ?? "");
  res.set("Cache-Control", "no-store");
  const r = TOKEN.test(token) ? RELAYS.get(token) : undefined;
  if (!r || Date.now() - r.at > TTL_MS) {
    res.status(404).json({ error: "none" });
    return;
  }
  res.json(r);
});

export default router;
