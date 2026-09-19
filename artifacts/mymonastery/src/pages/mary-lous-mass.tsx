import { YouTubeCataloguePage } from "@/components/YouTubeCataloguePage";
import { MARY_LOUS_MASS } from "@/lib/youtubeCatalogues";

// ── /mary-lous-mass — Mary Lou Williams's Mass, on YouTube inside Phoebe ────
//
// Owner, 2026-09-19: "Try to find Mary Lou's Mass on YouTube and make that a
// third pill." All 24 tracks of the Smithsonian Folkways album are on the
// official "Mary Lou Williams - Topic" channel, each matched on title and
// length (lib/youtubeCatalogues).

export default function MaryLousMassPage() {
  return <YouTubeCataloguePage cat={MARY_LOUS_MASS} />;
}
