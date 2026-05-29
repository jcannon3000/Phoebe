// Followed podcast shows pinned to the home screen.
//
// Each followed show renders as its own card under the "podcasts" home
// module — the podcast analogue of subscribing to a prayer feed. The
// follow list is stored per-device in localStorage (no server tracking
// yet); a window event keeps the show-page "Add to home" toggle and the
// dashboard cards in sync without a reload (same pattern as cacReadState).

import { useEffect, useState } from "react";

export interface FollowedShow {
  slug: string;
  title: string;
  artwork: string | null;
}

const KEY = "phoebe:podcast-home-shows";
export const PODCAST_HOME_EVENT = "phoebe:podcast-home-changed";

function read(): FollowedShow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is FollowedShow =>
        !!s && typeof s.slug === "string" && typeof s.title === "string",
    );
  } catch {
    return [];
  }
}

function write(shows: FollowedShow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shows));
    window.dispatchEvent(new Event(PODCAST_HOME_EVENT));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function getFollowedShows(): FollowedShow[] {
  return read();
}

export function isShowFollowed(slug: string): boolean {
  return read().some((s) => s.slug === slug);
}

export function followShow(show: FollowedShow): void {
  const cur = read();
  if (cur.some((s) => s.slug === show.slug)) return;
  write([...cur, { slug: show.slug, title: show.title, artwork: show.artwork ?? null }]);
}

export function unfollowShow(slug: string): void {
  write(read().filter((s) => s.slug !== slug));
}

// Toggle + return the new state (true = now followed).
export function toggleShowFollowed(show: FollowedShow): boolean {
  if (isShowFollowed(show.slug)) {
    unfollowShow(show.slug);
    return false;
  }
  followShow(show);
  return true;
}

// Live list of followed shows for the dashboard, kept in sync with the
// show-page toggle (PODCAST_HOME_EVENT) and other tabs (storage event).
export function useFollowedShows(): FollowedShow[] {
  const [shows, setShows] = useState<FollowedShow[]>(() => read());
  useEffect(() => {
    const refresh = () => setShows(read());
    window.addEventListener(PODCAST_HOME_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PODCAST_HOME_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return shows;
}

// Single-show follow state for the show-page "Add to home" button.
export function useIsShowFollowed(slug: string): boolean {
  const [followed, setFollowed] = useState<boolean>(() => isShowFollowed(slug));
  useEffect(() => {
    const refresh = () => setFollowed(isShowFollowed(slug));
    refresh();
    window.addEventListener(PODCAST_HOME_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PODCAST_HOME_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [slug]);
  return followed;
}
