import { useCallback, useEffect, useState } from "react";
import { openExternal } from "@/lib/openExternal";

// A rounded "Take action →" / "Learn more →" pill on slideshow
// intercession slides. Opens the URL through openExternal so the
// native shell uses SFSafariViewController (web build falls back to a
// new tab). Glows gently until the user has tapped it once — that
// first tap is persisted in localStorage so the call-out doesn't keep
// nagging after the link's already been opened.
//
// Two sizes:
//   "small"  — compact pill for the prayer-mode slideshow card.
//   "medium" — larger pill for the Daily Office / Devotion slide,
//              matching the visual weight of the Bible.com "Read on"
//              pill it sits next to.
export function ExternalLinkPill({
  url,
  label,
  size = "small",
  className,
}: {
  url: string;
  label: string;
  size?: "small" | "medium";
  className?: string;
}) {
  const storageKey = `phoebe:pill-clicked:${url}`;
  const read = useCallback((): boolean => {
    try { return localStorage.getItem(storageKey) === "1"; }
    catch { return false; }
  }, [storageKey]);
  const [clicked, setClicked] = useState<boolean>(read);
  // Re-sync when the URL changes (new slide → new pill key).
  useEffect(() => { setClicked(read()); }, [read]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try { localStorage.setItem(storageKey, "1"); } catch { /* non-fatal */ }
    setClicked(true);
    openExternal(url);
  };

  const sizeClasses =
    size === "medium"
      ? "text-[13px] font-semibold px-4 py-2.5"
      : "text-[11px] font-semibold px-3 py-1";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`${sizeClasses} rounded-full inline-block ${clicked ? "" : "animate-pill-glow"} ${className ?? ""}`}
      style={{
        background: "rgba(46,107,64,0.35)",
        color: "#F0EDE6",
        border: "1px solid rgba(46,107,64,0.55)",
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: "pointer",
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}
