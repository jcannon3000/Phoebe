import { YouTubeCataloguePage } from "@/components/YouTubeCataloguePage";
import { SAKAMOTO } from "@/lib/youtubeCatalogues";

// ── /sakamoto — Ryuichi Sakamoto's music for film ───────────────────────────
//
// Owner, 2026-09-19: "Call this Ryuchi Sakamoto". The note at the top of the
// page is his own account of listening to it, and keeps his name — see
// lib/youtubeCatalogues.

export default function SakamotoPage() {
  return <YouTubeCataloguePage cat={SAKAMOTO} />;
}
