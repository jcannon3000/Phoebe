import { YouTubeCataloguePage } from "@/components/YouTubeCataloguePage";
import { HILDEGARD_YOUTUBE } from "@/lib/youtubeCatalogues";

// ── /hildegard — Hildegard von Bingen, on YouTube inside Phoebe ─────────────
//
// Owner, 2026-09-18/19: the library became YouTube-only ("Play inside Phoebe,
// all in youtube"), then "could we also do Hildegard as well as youtube pages"
// with Spotify's "This Is Hildegard von Bingen". The Apple Music version of
// this page (lib/hildegardCatalogue, whose HILDEGARD_PLAYLIST the sit and
// office still name) is retired; the tracks and their YouTube ids live in
// lib/youtubeCatalogues.

export default function HildegardPage() {
  return <YouTubeCataloguePage cat={HILDEGARD_YOUTUBE} />;
}
