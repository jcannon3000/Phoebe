import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

// Count one view of a public page (the About page, its deck) for the admin metrics. A random
// id the browser makes for itself tells visitors apart (stored on this device only); nothing
// about the person is sent. Fire-and-forget: a failed ping must never touch the page.
const KEY = "phoebe:visitor-id";

function visitorId(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
  try {
    let v = localStorage.getItem(KEY);
    if (!v || !/^[A-Za-z0-9_-]{8,40}$/.test(v)) { v = make(); localStorage.setItem(KEY, v); }
    return v;
  } catch {
    try {
      let v = sessionStorage.getItem(KEY);
      if (!v) { v = make(); sessionStorage.setItem(KEY, v); }
      return v;
    } catch { return make(); }
  }
}

export function usePageView(page: "about" | "about-deck"): void {
  useEffect(() => {
    try {
      void apiRequest("POST", "/api/page-view", { page, visitor: visitorId() }).catch(() => {});
    } catch { /* never let a count break the page */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
