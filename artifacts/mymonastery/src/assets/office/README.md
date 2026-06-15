# Office player backgrounds

Drop a landscape image in here to use it as the fixed backdrop for a daily-office
in the immersive podcast player (instead of a random Cobreathe photo).

The file is matched by the **side** in its filename:

- `fm-morning.jpg` / `morning.jpg` → **Morning Prayer** backdrop
- `evening.jpg` → **Evening Prayer** backdrop

(any of `.jpg .jpeg .png .webp .avif`)

Wired in `src/components/PodcastPlayer.tsx` via the `OFFICE_DEDICATED_BG` glob —
a filename containing `morning` / `evening` wins over the Cobreathe fallback. The
image is bundled (offline-safe). After adding a file: rebuild + cap sync.
