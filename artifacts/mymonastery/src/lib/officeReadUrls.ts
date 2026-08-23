// Which outbound passage URLs a fetched office's slides will offer — shared
// by bcp-daily-office.tsx (warms them the moment a LIVE office loads, so
// Next never waits on a cold WKWebView) and officePrefetch.ts (warms them for
// every day in the 30-day offline window, alongside the slides themselves).
//
// One extraction, not two: both callers read the exact same metadata shape
// (readUrl / gospelReadUrl / inlineWeb, set in assembleLesson.ts /
// assembleMorningPrayer.ts), and a second copy is exactly how they'd drift —
// a new field added to one and not the other, silently.

type SlideLike = {
  type: string;
  metadata?: unknown;
};

export function extractReadUrls(slides: SlideLike[]): string[] {
  const urls = new Set<string>();
  for (const s of slides) {
    if (s.type !== "lesson" && s.type !== "lesson_title") continue;
    const meta = s.metadata as { readUrl?: unknown; gospelReadUrl?: unknown; inlineWeb?: unknown } | undefined;
    if (meta?.inlineWeb === true) continue; // nothing to jump out to
    if (typeof meta?.readUrl === "string" && meta.readUrl) urls.add(meta.readUrl);
    if (typeof meta?.gospelReadUrl === "string" && meta.gospelReadUrl) urls.add(meta.gospelReadUrl);
  }
  return [...urls];
}
