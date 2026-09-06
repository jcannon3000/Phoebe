/**
 * Mounted once, app-wide: shows a saved passage over whatever deck asked for
 * it. Decks never render the sheet themselves — they call
 * openOfflinePassageIfCached (lib/passageCache), which posts an event here
 * when the device is offline and the passage is on it. Continue steps the
 * deck through the same phoebe:office-next-slide the native reader's pill
 * posts, so every deck's existing listener does the rest.
 */
import React, { useEffect, useState } from "react";
import { OFFLINE_PASSAGE_EVENT, type CachedPassage } from "@/lib/passageCache";
import { OfflinePassageSheet } from "@/components/OfflinePassageSheet";

export function OfflinePassageHost(): React.ReactElement | null {
  const [open, setOpen] = useState<{ passage: CachedPassage; title: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ passage: CachedPassage; title: string }>).detail;
      if (d?.passage) setOpen({ passage: d.passage, title: d.title || "" });
    };
    window.addEventListener(OFFLINE_PASSAGE_EVENT, on);
    return () => window.removeEventListener(OFFLINE_PASSAGE_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <OfflinePassageSheet
      passage={open.passage}
      title={open.title}
      onClose={() => setOpen(null)}
      onContinue={() => {
        setOpen(null);
        // After the sheet is gone, so the deck steps on a settled screen.
        setTimeout(() => window.dispatchEvent(new Event("phoebe:office-next-slide")), 30);
      }}
    />
  );
}
