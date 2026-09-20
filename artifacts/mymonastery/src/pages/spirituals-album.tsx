import { YouTubeCataloguePage } from "@/components/YouTubeCataloguePage";
import { SPIRITUALS } from "@/lib/youtubeCatalogues";

// ── /spirituals-album — Dock Reed's Spirituals, sung ────────────────────────
//
// Owner, 2026-09-19: "Call it Spirityals" (Spirituals). The route is
// /spirituals-album because /spirituals is the app's OTHER spirituals — the
// 136 Slave Songs said as canticles — and the two must not collide.

export default function SpiritualsAlbumPage() {
  return <YouTubeCataloguePage cat={SPIRITUALS} />;
}
