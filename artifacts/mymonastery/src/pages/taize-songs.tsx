import { YouTubeCataloguePage } from "@/components/YouTubeCataloguePage";
import { TAIZE_SONGS } from "@/lib/youtubeCatalogues";

// ── /taize-songs — the chants of Taizé, on YouTube inside Phoebe ────────────
//
// Owner, 2026-09-19: "Add a Taize catalogue for audio Divina", with the
// community's own "Taizé Music" playlist. Every track is on Taizé's own
// channel (lib/youtubeCatalogues), so it plays here the way the hymns and
// Hildegard do.
//
// CALLED "Taizé Songs" because the app already has two other Taizés that are
// not music: the weekly "Taizé meditation" and the new "Taizé Daily Prayer".
// The pill has to say which one this is at a glance.

export default function TaizeSongsPage() {
  return <YouTubeCataloguePage cat={TAIZE_SONGS} />;
}
