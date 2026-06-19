// CobreatheMap — a small "breathing together across the miles" map. Plots YOU
// plus the Fellows breathing with you right now (precise, opted-in coords) on a
// calm dark field, with a dashed line from you to each and the distance between.
//
// Dependency-free: an equirectangular projection auto-fitted to everyone's
// bounding box (no tiles, no map library). Coarse enough to read as "we're
// holding this together though we're apart," not a precise pin-drop.

type MapPoint = { userId: number; name: string; avatarUrl: string | null; lat: number; lng: number };

const SPACE = "'Space Grotesk', system-ui, sans-serif";

function haversineMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function fmtDist(mi: number): string {
  if (mi < 1) return "<1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  if (mi < 1000) return `${Math.round(mi)} mi`;
  return `${Math.round(mi / 100) / 10}k mi`;
}

export function CobreatheMap({ me, fellows }: { me: { lat: number; lng: number }; fellows: MapPoint[] }) {
  const W = 320, H = 196, PAD = 34;
  const all = [{ lat: me.lat, lng: me.lng }, ...fellows];
  let minLat = Math.min(...all.map((p) => p.lat));
  let maxLat = Math.max(...all.map((p) => p.lat));
  let minLng = Math.min(...all.map((p) => p.lng));
  let maxLng = Math.max(...all.map((p) => p.lng));
  // Pad a near-zero span (everyone in roughly one spot) so points don't collapse.
  if (maxLat - minLat < 0.4) { const c = (minLat + maxLat) / 2; minLat = c - 0.2; maxLat = c + 0.2; }
  if (maxLng - minLng < 0.4) { const c = (minLng + maxLng) / 2; minLng = c - 0.2; maxLng = c + 0.2; }
  const project = (lat: number, lng: number) => ({
    x: PAD + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * PAD),
    y: PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * PAD),
  });
  const mePos = project(me.lat, me.lng);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      aria-hidden="true"
      style={{ maxWidth: 360, borderRadius: 16, background: "rgba(8,30,18,0.6)", border: "1px solid rgba(46,107,64,0.45)", display: "block" }}
    >
      {/* connecting lines — you ↔ each fellow */}
      {fellows.map((f) => {
        const p = project(f.lat, f.lng);
        return <line key={`l-${f.userId}`} x1={mePos.x} y1={mePos.y} x2={p.x} y2={p.y} stroke="rgba(134,199,155,0.45)" strokeWidth={1.2} strokeDasharray="3 3" />;
      })}
      {/* fellow points + name · distance */}
      {fellows.map((f) => {
        const p = project(f.lat, f.lng);
        const label = `${f.name} · ${fmtDist(haversineMi(me, f))}`;
        return (
          <g key={`p-${f.userId}`}>
            <circle cx={p.x} cy={p.y} r={5} fill="#86C79B" stroke="#0C1F12" strokeWidth={1.5} />
            <text x={p.x} y={p.y - 9} textAnchor="middle" fill="#C8D4C0" fontSize={9} fontFamily={SPACE} style={{ paintOrder: "stroke", stroke: "rgba(8,30,18,0.85)", strokeWidth: 3 }}>{label}</text>
          </g>
        );
      })}
      {/* you */}
      <circle cx={mePos.x} cy={mePos.y} r={6} fill="#5B9DEF" stroke="#0C1F12" strokeWidth={1.5} />
      <text x={mePos.x} y={mePos.y + 16} textAnchor="middle" fill="#EAF6F4" fontSize={9.5} fontWeight={700} fontFamily={SPACE} style={{ paintOrder: "stroke", stroke: "rgba(8,30,18,0.85)", strokeWidth: 3 }}>You</text>
    </svg>
  );
}
