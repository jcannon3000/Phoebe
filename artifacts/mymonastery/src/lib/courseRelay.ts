// ─── Course progress, handed between the app and the in-app reader ─────────
//
// On iOS a video course plays in the in-app reader at withphoebe.app, because
// YouTube won't embed from the app's capacitor:// origin (lib/videoEmbed).
// Course progress (lib/courseProgress) lives in localStorage, which is per
// ORIGIN, so what was watched in the reader was saved where the app couldn't
// see it: "0 of N" forever, no Continue card on the home, and every reopen
// back at the app's stale lesson (audit, 2026-09-18). The reader has its own
// cookie jar, so the routine sync can't carry it, and a guest has no session.
//
// So the pages hand it over directly, through api-server routes/course-relay:
//
//   app    → opens the reader with a one-time code and ITS progress in the URL
//   reader → seeds itself from that, then PUTs its snapshot after each change
//   app    → on the reader closing (phoebe:browserfinished) or coming back to
//            the front, GETs the snapshot and adopts it
//
// One code per course per device, reused across openings; the app records the
// server time of the last snapshot it adopted, so an old one is never adopted
// twice (and can't undo "take this off my home screen" afterwards).

import { apiRequest } from "@/lib/queryClient";
import { snapshotProgress, adoptProgress, isCourseHiddenFromHome, setCourseHiddenFromHome } from "@/lib/courseProgress";

type Stored = { token: string; adoptedAt: number };
type Relay = { courseId: string; completed: string[]; lastId: string | null; started: boolean; hidden?: boolean; at: number };

const LESSON_ID = /^[A-Za-z0-9_-]{1,64}$/;
const keyFor = (courseId: string) => `phoebe:course-relay:${courseId}`;

function readStored(courseId: string): Stored | null {
  try {
    const raw = localStorage.getItem(keyFor(courseId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.token === "string" ? { token: v.token, adoptedAt: Number(v.adoptedAt) || 0 } : null;
  } catch {
    return null;
  }
}

function writeStored(courseId: string, v: Stored): void {
  try { localStorage.setItem(keyFor(courseId), JSON.stringify(v)); } catch { /* private mode */ }
}

function newToken(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  } catch { /* fall through */ }
  let t = "";
  while (t.length < 32) t += Math.random().toString(36).slice(2);
  return t.slice(0, 32);
}

// ── The app's side ─────────────────────────────────────────────────────────

/**
 * The path + query to open a course at in the reader: the hand-back code and
 * this device's progress, and deliberately NO `?v=` — the reader resumes from
 * the progress it is handed, not from whichever lesson the app last displayed
 * (which, on iOS, never moved).
 */
export function readerCoursePath(courseId: string, pathname: string): string {
  let st = readStored(courseId);
  if (!st) { st = { token: newToken(), adoptedAt: 0 }; writeStored(courseId, st); }
  const p = snapshotProgress(courseId);
  const q = new URLSearchParams();
  q.set("relay", st.token);
  if (p.completed.length) q.set("done", p.completed.join("."));
  if (p.lastId) q.set("last", p.lastId);
  if (p.started) q.set("started", "1");
  // Whether it is on their home screen travels too, so the line at the foot of
  // the course reads right inside the reader and a removal made there comes
  // back (it is a separate store from progress — courseProgress's hidden set).
  if (isCourseHiddenFromHome(courseId)) q.set("off", "1");
  return `${pathname}?${q.toString()}`;
}

/** Fetch what the reader saved and adopt it, if it's newer than the last one
 *  adopted. True when something was adopted. Never throws. */
export async function collectFromReader(courseId: string): Promise<boolean> {
  const st = readStored(courseId);
  if (!st) return false;
  try {
    const r = await apiRequest<Relay>("GET", `/api/course-relay/${st.token}`);
    if (!r || r.courseId !== courseId || !(r.at > st.adoptedAt)) return false;
    adoptProgress(courseId, { completed: r.completed, lastId: r.lastId, started: r.started });
    // Only when the reader actually reported it: an older build's snapshot has
    // no such field, and `undefined` must not read as "put it back".
    if (typeof r.hidden === "boolean" && r.hidden !== isCourseHiddenFromHome(courseId)) {
      setCourseHiddenFromHome(courseId, r.hidden);
    }
    writeStored(courseId, { ...st, adoptedAt: r.at });
    return true;
  } catch {
    return false; // 404: nothing handed back yet
  }
}

// ── The reader's side ──────────────────────────────────────────────────────

/** The hand-back code, when the app opened this page with one. */
export function readerRelayToken(): string | null {
  try {
    const t = new URLSearchParams(window.location.search).get("relay");
    return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Seed this page's progress from what the app handed over, united with
 * anything this origin already had. Returns the lesson to resume at.
 */
export function seedFromApp(courseId: string): { resumeId: string | null } | null {
  if (!readerRelayToken()) return null;
  const q = new URLSearchParams(window.location.search);
  const done = (q.get("done") ?? "").split(".").filter((x) => LESSON_ID.test(x));
  const appLast = q.get("last");
  const own = snapshotProgress(courseId);
  const resumeId = own.lastId ?? (appLast && LESSON_ID.test(appLast) ? appLast : null);
  adoptProgress(courseId, {
    completed: [...own.completed, ...done],
    lastId: resumeId,
    started: q.get("started") === "1" || own.started === true,
  });
  // The app's answer wins on arrival: it is the device whose home screen this
  // is, and the reader's own copy is only ever what a previous opening left.
  setCourseHiddenFromHome(courseId, q.get("off") === "1");
  return { resumeId };
}

/** Send this page's progress back under the code. Best-effort. */
export async function pushToApp(courseId: string, token: string): Promise<void> {
  const p = snapshotProgress(courseId);
  try {
    await apiRequest("PUT", `/api/course-relay/${token}`, {
      courseId,
      completed: p.completed,
      lastId: p.lastId ?? null,
      started: p.started === true,
      hidden: isCourseHiddenFromHome(courseId),
    });
  } catch { /* the next change tries again */ }
}
