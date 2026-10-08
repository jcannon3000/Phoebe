// A note from the owner at the top of the home (owner, 2026-10-08: "I want to be able
// to put an announcement on phoebe, maybe like the begin here card, and have it send a
// notification about it"). Written on /admin/announcements; one is live at a time.
//
// Dismissal is per announcement, on the device: closing this one never hides the next.
// It renders nothing while loading and on any failure (never a blank or a spinner).

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CtaArrow } from "@/components/CtaArrow";

const FONT = "'Space Grotesk', sans-serif";
const SEEN_KEY = "phoebe:announcement-dismissed";
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

type Announcement = { id: number; title: string; body: string; linkPath: string | null; linkLabel: string | null };

function seenId(): number {
  try { return Number(localStorage.getItem(SEEN_KEY) ?? "0") || 0; } catch { return 0; }
}

export function AnnouncementCard() {
  const [, setLocation] = useLocation();
  const [dismissedId, setDismissedId] = useState<number>(seenId);
  const { data } = useQuery<{ announcement: Announcement | null }>({
    queryKey: ["/api/announcements/active"],
    queryFn: () => apiRequest("GET", "/api/announcements/active"),
    staleTime: 60_000,
  });
  const a = data?.announcement;
  if (!a || a.id === dismissedId) return null;
  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, String(a.id)); } catch { /* private mode: hides for the session */ }
    setDismissedId(a.id);
  };
  return (
    <div
      className="relative rounded-2xl px-4 py-4 mt-3"
      style={{ ...FROST, background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute top-2 right-2.5"
        style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 14, cursor: "pointer", padding: 6, lineHeight: 1 }}
      >
        ✕
      </button>
      <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.75)", fontFamily: FONT }}>
        From Phoebe
      </p>
      <p className="text-[16px] font-semibold mt-1 pr-6" style={{ color: "#F0EDE6", fontFamily: FONT }}>{a.title}</p>
      <p className="text-[13.5px] mt-1.5" style={{ color: "rgba(200,212,192,0.78)", fontFamily: FONT, lineHeight: 1.55, whiteSpace: "pre-line" }}>{a.body}</p>
      {a.linkPath && (
        <button
          type="button"
          onClick={() => setLocation(a.linkPath!)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2"
          style={{ background: "rgba(46,107,64,0.55)", border: "1px solid rgba(46,107,64,0.6)", color: "#F0EDE6", fontFamily: FONT, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
        >
          {a.linkLabel || "Open"}<CtaArrow />
        </button>
      )}
    </div>
  );
}
