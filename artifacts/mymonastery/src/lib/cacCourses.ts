// ─── CAC Courses — CAC's podcast seasons, browsable Coursera-style ───────────
//
// Beta feature (owner, 2026-08-01): the Center for Action and Contemplation's
// shows already live in Phoebe's podcast library (routes/podcast.ts PUBLISHERS
// .cac); each show's feed tags episodes with <itunes:season> — one season per
// teaching series (a mystic, a Rohr book, …). GET /api/podcasts/cac/courses
// groups those into one "course" per (show, season), oldest episode first.
// Progress is tracked device-locally via lib/courseProgress.ts, keyed by each
// course's id — the same mechanism way-of-love-course.tsx already uses.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { snapshotProgress } from "@/lib/courseProgress";

// Mirrors the server's EpisodeFull shape (routes/podcast.ts).
export interface CacEpisode {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
  season: number | null;
}

export interface CacCourse {
  id: string;
  showSlug: string;
  showTitle: string;
  author: string;
  artwork: string | null;
  season: number;
  title: string;
  episodes: CacEpisode[];
}

interface CacCoursesResponse {
  courses: CacCourse[];
}

export function useCacCourses() {
  return useQuery<CacCoursesResponse>({
    queryKey: ["/api/podcasts/cac/courses"],
    queryFn: () => apiRequest("GET", "/api/podcasts/cac/courses"),
    staleTime: 10 * 60_000,
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/** A course's completion state, read synchronously (no hook) so the list page
 *  can sort every card in one pass without calling useCourseProgress per row
 *  (hooks can't run in a loop). `nextTitle` and `updatedAt` support a
 *  "Continue" row like HomeLearnSection's — the next un-listened episode's
 *  title, and when progress was last touched (for sorting most-recent-first). */
export function courseCompletion(course: CacCourse): { completedCount: number; total: number; isDone: boolean; isStarted: boolean; nextTitle: string | null; updatedAt: number } {
  const progress = snapshotProgress(course.id);
  const total = course.episodes.length;
  const completedCount = course.episodes.filter((ep) => progress.completed.includes(ep.id)).length;
  const nextEpisode = course.episodes.find((ep) => !progress.completed.includes(ep.id));
  return {
    completedCount,
    total,
    isDone: total > 0 && completedCount === total,
    isStarted: !!progress.started,
    nextTitle: nextEpisode?.title ?? null,
    updatedAt: progress.updatedAt ?? 0,
  };
}
