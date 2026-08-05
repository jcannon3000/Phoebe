// Shared "who else did this with you today" avatar row — the overlapping
// face-stack + "You prayed with {names}" line, first built for Creation
// Prayer's closing summary (CobreatheSummary.tsx) and reused wherever else a
// practice's closing slide wants to show garden/group-mates who completed
// the same thing today.

export type Companion = { userId: number; name: string | null; avatarUrl: string | null };

const WARM = "#F0EDE6";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

// Builds "Maria, James, and 3 others" from a companion list's first names.
export function companionNamesLine(companions: Companion[]): string {
  const names = companions.map((c) => (c.name ?? "").trim().split(/\s+/)[0]).filter(Boolean);
  const shown = names.slice(0, 2);
  const extra = companions.length - shown.length;
  if (shown.length === 0) return "";
  if (extra > 0) return `${shown.join(", ")}, and ${extra} other${extra === 1 ? "" : "s"}`;
  return shown.join(" and ");
}

// The overlapping avatar stack itself — image or initials-fallback tile per
// person, capped at 6 faces. `edgeColor` should match the background it sits
// on (the tile border needs to match, not clash, with whatever's behind it).
export function CompanionFaces({ companions, edgeColor = "#0A1C14" }: { companions: Companion[]; edgeColor?: string }) {
  return (
    <div className="flex items-center">
      {companions.slice(0, 6).map((c, i) => (
        <div
          key={c.userId}
          className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ width: 32, height: 32, marginLeft: i === 0 ? 0 : -8, border: `1.5px solid ${edgeColor}`, background: "rgba(62,124,122,0.45)", zIndex: 10 - i }}
        >
          {c.avatarUrl
            ? <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
            : <span style={{ color: WARM, fontSize: 11, fontWeight: 700, fontFamily: SPACE_GROTESK }}>{initials(c.name ?? "·")}</span>}
        </div>
      ))}
    </div>
  );
}
