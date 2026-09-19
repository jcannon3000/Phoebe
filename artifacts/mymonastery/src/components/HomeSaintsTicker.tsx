import { useMemo } from "react";
import { useLocation } from "wouter";
import { PillTicker } from "@/components/PillTicker";
import { allCommemorations, type Commemoration } from "@/lib/commemorations";

// ── The saints, coming up ───────────────────────────────────────────────────
//
// Owner, 2026-09-18: "we also want a ticker on the home screen under practices
// where it would list the saints, showing in the order of them upcoming, if
// they click a pill, it would take them to the first prompt, then show the
// bio, then the last prompt, then the closing."
//
// The same rolling row as the practices ticker (components/PillTicker), reading
// forward from today rather than from January: today's commemoration first, then
// whoever is next, wrapping into next year at the end of December so the row is
// never short in late December. A pill links to /saints?d=<month>-<day>, which
// enters the practice at its first prompt — the deck then runs prompt → the
// life in the reader → prayer → the ones you've read.
//
// Rendered under <HomePracticesTicker /> in dashboard.tsx.

/** How many to carry. Long enough to roll, short enough to stay "coming up". */
const HOW_MANY = 14;

/** From today forward, wrapping past the end of the year. */
function upcoming(all: Commemoration[], now: Date): Commemoration[] {
  if (!all.length) return [];
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const isAfter = (c: Commemoration) => c.month > m || (c.month === m && c.day >= d);
  const ahead = all.filter(isAfter);
  const wrapped = all.filter((c) => !isAfter(c));
  return [...ahead, ...wrapped].slice(0, HOW_MANY);
}

/** "Julian of Norwich, Mystic and Theologian" → "Julian of Norwich" — a pill
 *  has room for a name, not for a name and its offices. */
function shortName(name: string): string {
  const cut = name.split(",")[0]!.trim();
  return cut.length > 2 ? cut : name;
}

export function HomeSaintsTicker() {
  const [, setLocation] = useLocation();

  const pills = useMemo(() => {
    const rows = upcoming(allCommemorations(), new Date());
    return rows.map((c) => ({
      key: `${c.month}-${c.day}`,
      emoji: c.major ? "✨" : "🕯️",
      // The date first, then the name (owner, 2026-09-18: "put their date
      // first like 9/27 then the name") — a row of upcoming saints reads as a
      // calendar, and the date is what tells you which one is today's.
      label: `${c.month}/${c.day} ${shortName(c.name)}`,
      onSelect: () => setLocation(`/saints?d=${c.month}-${c.day}`),
    }));
  }, [setLocation]);

  if (!pills.length) return null;
  /**
   * THE HEADING IS RENDERED HERE, not passed to PillTicker.
   *
   * Owner, 2026-09-18: "the life of a saint should have its own header, call
   * it Haegriphopies". I first passed it as PillTicker's `label`, which does
   * NOT show it — that prop is only ever used as the row's aria-label, so the
   * heading existed for screen readers and for nobody else (caught on the dev
   * home by another session). The label prop stays for exactly that reason.
   *
   * Spelled Hagiographies: it is the word, and the spelling the rest of the
   * app already uses for this practice — the routine seed, the customizer and
   * the reflection sources all say Hagiographies, so anything else would read
   * as our typo rather than theirs.
   *
   * Type matches the section headings already on the home (HomeLearnSection's
   * eyebrow) so it sits in the page rather than announcing itself.
   */
  return (
    <div>
      <p
        className="truncate text-[10.5px] font-semibold uppercase tracking-widest leading-[14px] px-1 mb-1.5"
        style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Hagiographies
      </p>
      <PillTicker label="Hagiographies" pills={pills} />
    </div>
  );
}
