// ─── Course progress (device-local, per course) ──────────────────────────────
//
// Courses (the Spiritual Journey video series, the Way of Love podcast, …) are
// web-only, so progress lives in localStorage on the device — which lessons are
// completed, and the last one opened (so we can "Resume"). Keyed by courseId so
// multiple courses coexist. A module-level store + subscription keeps every
// mounted component in sync, and a `storage` listener syncs across tabs.
//
// `updatedAt` is stamped on every write so a future account-sync layer can do
// last-write-wins reconciliation without a schema change here.

import { useSyncExternalStore, useCallback, useMemo } from "react";

const EVENT = "phoebe:course-progress";
const keyFor = (courseId: string) => `phoebe:course:${courseId}:v1`;

export interface CourseProgress {
  completed: string[];
  lastId?: string;
  updatedAt?: number;
}

function read(courseId: string): CourseProgress {
  try {
    const raw = localStorage.getItem(keyFor(courseId));
    if (!raw) return { completed: [] };
    const parsed = JSON.parse(raw) as Partial<CourseProgress>;
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      lastId: typeof parsed.lastId === "string" ? parsed.lastId : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { completed: [] };
  }
}

// Cached snapshot per course so useSyncExternalStore gets a stable reference
// between writes (a fresh object every getSnapshot would loop forever).
const snapshots = new Map<string, CourseProgress>();
function snap(courseId: string): CourseProgress {
  let s = snapshots.get(courseId);
  if (!s) {
    s = read(courseId);
    snapshots.set(courseId, s);
  }
  return s;
}

function commit(courseId: string, next: CourseProgress) {
  next.updatedAt = Date.now();
  snapshots.set(courseId, next);
  try {
    localStorage.setItem(keyFor(courseId), JSON.stringify(next));
  } catch {
    /* non-fatal (private mode / quota) */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: courseId }));
  } catch {
    /* non-fatal */
  }
}

function subscribe(courseId: string, cb: () => void): () => void {
  const onLocal = (e: Event) => {
    // A write in this tab already updated the snapshot; notify only for this course.
    if ((e as CustomEvent).detail === courseId) cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === keyFor(courseId)) {
      snapshots.set(courseId, read(courseId));
      cb();
    }
  };
  window.addEventListener(EVENT, onLocal as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function markComplete(courseId: string, id: string) {
  const s = snap(courseId);
  if (s.completed.includes(id)) return;
  commit(courseId, { ...s, completed: [...s.completed, id] });
}

export function markIncomplete(courseId: string, id: string) {
  const s = snap(courseId);
  if (!s.completed.includes(id)) return;
  commit(courseId, { ...s, completed: s.completed.filter((x) => x !== id) });
}

export function toggleComplete(courseId: string, id: string) {
  if (snap(courseId).completed.includes(id)) markIncomplete(courseId, id);
  else markComplete(courseId, id);
}

export function setLast(courseId: string, id: string) {
  const s = snap(courseId);
  if (s.lastId === id) return;
  commit(courseId, { ...s, lastId: id });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseCourseProgress {
  completed: Set<string>;
  completedCount: number;
  lastId?: string;
  isComplete: (id: string) => boolean;
  markComplete: (id: string) => void;
  markIncomplete: (id: string) => void;
  toggleComplete: (id: string) => void;
  setLast: (id: string) => void;
}

export function useCourseProgress(courseId: string): UseCourseProgress {
  const state = useSyncExternalStore(
    (cb) => subscribe(courseId, cb),
    () => snap(courseId),
    () => snap(courseId),
  );
  const completedSet = useMemo(() => new Set(state.completed), [state.completed]);
  const isComplete = useCallback((id: string) => completedSet.has(id), [completedSet]);
  return {
    completed: completedSet,
    completedCount: completedSet.size,
    lastId: state.lastId,
    isComplete,
    markComplete: useCallback((id: string) => markComplete(courseId, id), [courseId]),
    markIncomplete: useCallback((id: string) => markIncomplete(courseId, id), [courseId]),
    toggleComplete: useCallback((id: string) => toggleComplete(courseId, id), [courseId]),
    setLast: useCallback((id: string) => setLast(courseId, id), [courseId]),
  };
}
