import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { openDailyReflection } from "@/lib/dailyReflections";
import { EVENING_OPEN_HOUR } from "@/lib/customAnchors";

// ── /menu/pray — the newcomer's "Pray" card, opened ─────────────────────────
//
// Owner, 2026-09-28, of the home before a routine exists: "For pray have these
// options — Guided Prayer · (Time of day) Office · Audio Prayer & Reflection -
// Pray as you go · Taizé Daily Prayer".
//
// Four ways to pray RIGHT NOW, which is a different question from the whole
// Practices directory: someone who has not built a rhythm does not want a list
// of everything Phoebe can do, they want the next ten minutes.
//
// THE OFFICE IS WHICHEVER ONE THIS HOUR BELONGS TO, so the row can be tapped
// without first knowing the shape of the day. The boundaries are the app's own
// (lib/customAnchors): midday from 10, evening from EVENING_OPEN_HOUR, and
// Compline once the evening is late — the same hours the home uses to decide
// when an evening card stops saying "Later".

const COMPLINE_FROM_HOUR = 20;

type OfficeRow = { emoji: string; label: string; sub: string; href: string };

/** The office this hour belongs to. Exported for the test of the boundaries. */
export function officeForHour(hour: number): OfficeRow {
  if (hour >= COMPLINE_FROM_HOUR) {
    return { emoji: "🌙", label: "Compline", sub: "The night office — the day laid down", href: "/bcp/daily-office?mode=compline" };
  }
  if (hour >= EVENING_OPEN_HOUR) {
    return { emoji: "🌆", label: "Evening Prayer", sub: "The evening office", href: "/bcp/daily-office?mode=evening" };
  }
  if (hour >= 10) {
    return { emoji: "☀️", label: "Midday Prayer", sub: "A short pause in the middle of the day", href: "/bcp/daily-office?mode=noonday" };
  }
  return { emoji: "🌅", label: "Morning Prayer", sub: "The morning office", href: "/bcp/daily-office?mode=morning" };
}

export default function MenuPrayPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  const office = officeForHour(new Date().getHours());

  return (
    <MenuHub
      title="Pray"
      emoji="🙏🏽"
      subtitle="A few ways to pray right now."
      backLabel="Home"
      backHref="/dashboard"
      groups={[{
        items: [
          {
            emoji: "🙏🏽", label: "Guided Prayer",
            sub: "Praise, ask, confess, give thanks — a few minutes, led",
            onClick: () => go("/guided-prayer"),
          },
          {
            offlineKey: "office",
            emoji: office.emoji, label: office.label, sub: office.sub,
            onClick: () => go(office.href),
          },
          {
            emoji: "🙇🏽", label: "Audio Prayer & Reflection",
            sub: "Pray As You Go — music, scripture, and a few questions to sit with",
            onClick: () => go("/reflect/payg"),
          },
          {
            emoji: "🪔", label: "Taizé Daily Prayer",
            // Their own page, in Phoebe's reader, marking itself read on the
            // way out — the same door the Reflections hub uses, so a prayer
            // taken here counts wherever that one does.
            sub: "The day's prayer from Brother Matthew at Taizé",
            onClick: () => openDailyReflection("taizeprayer", setLocation),
          },
        ],
      }]}
    />
  );
}
