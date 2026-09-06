/**
 * Mounted once, app-wide: shows a saved passage over whatever deck asked for
 * it. Decks never render the sheet themselves — they call
 * openOfflinePassageIfCached (lib/passageCache), which posts an event here
 * when the device is offline and the passage is on it. Back and Next step the
 * deck through the same phoebe:office-{prev,next}-slide the native reader's
 * pill posts, so every deck's existing listener does the rest.
 */
import React, { useEffect, useState } from "react";
import { OFFLINE_PASSAGE_EVENT, type CachedPassage, type OfflinePassageDetail } from "@/lib/passageCache";
import { OfflinePassageSheet } from "@/components/OfflinePassageSheet";

export function OfflinePassageHost(): React.ReactElement | null {
  const [open, setOpen] = useState<{ passage: CachedPassage; title: string; slideLabel: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<OfflinePassageDetail>).detail;
      if (d?.passage) setOpen({ passage: d.passage, title: d.title || "", slideLabel: d.slideLabel || "" });
    };
    window.addEventListener(OFFLINE_PASSAGE_EVENT, on);
    return () => window.removeEventListener(OFFLINE_PASSAGE_EVENT, on);
  }, []);
  if (!open) return null;
  // Close FIRST, then step — the deck moves on a settled screen, and the
  // event can't be caught by a sheet that is still mounted.
  const step = (event: string) => {
    setOpen(null);
    setTimeout(() => window.dispatchEvent(new Event(event)), 30);
  };
  return (
    <OfflinePassageSheet
      passage={open.passage}
      slideLabel={open.slideLabel}
      onClose={() => setOpen(null)}
      onPrev={() => step("phoebe:office-prev-slide")}
      onNext={() => step("phoebe:office-next-slide")}
    />
  );
}
