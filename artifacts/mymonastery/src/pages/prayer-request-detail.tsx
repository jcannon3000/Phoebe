import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { playOpeningSwell } from "@/lib/amenFeedback";

// Dedicated landing page for "X left a word of comfort on your prayer
// request" pushes. Mirrors the prayer-mode slideshow's visual language —
// dark forest background, Playfair Display body, avatar pulse — so the
// tap-from-notification experience feels like stepping into the same
// chapel as the daily prayer slideshow rather than into a settings list.

type PrayerWord = {
  id: number;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string | null;
};

type PrayerRequestDetail = {
  id: number;
  body: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  words: PrayerWord[];
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PrayerRequestDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/prayer-requests/:id");
  const id = params?.id ? Number(params.id) : NaN;

  const { data, isLoading, error } = useQuery<PrayerRequestDetail>({
    queryKey: [`/api/prayer-requests/by-id/${id}`],
    queryFn: () => apiRequest("GET", `/api/prayer-requests/by-id/${id}`) as Promise<PrayerRequestDetail>,
    enabled: Number.isFinite(id),
  });

  // Match prayer-mode's chrome: paint Safari/WebView background to the
  // slide bg, lock body scroll, and play the opening swell + a medium
  // haptic on arrival so the tap feels grounded the moment the page lands.
  useEffect(() => {
    const SLIDE_BG = "#0C1F12";
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlBg = html.style.backgroundColor;
    body.style.overflow = "hidden";
    body.style.backgroundColor = SLIDE_BG;
    html.style.backgroundColor = SLIDE_BG;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content") ?? "#091A10";
    meta?.setAttribute("content", SLIDE_BG);
    playOpeningSwell(0);
    try {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }));
    } catch { /* ignore */ }
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
    };
  }, []);

  const latestWord = data?.words[0] ?? null;

  return (
    <div
      style={{
        background: "#0C1F12",
        minHeight: "100dvh",
        position: "relative",
      }}
    >
      <button
        onClick={() => setLocation("/dashboard")}
        aria-label="Close"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      <div
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          minHeight: "100dvh",
          justifyContent: "flex-start",
          paddingTop: "clamp(64px, 16dvh, 180px)",
          paddingBottom: 40,
        }}
      >
        {isLoading && (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.55)" }}>
            Loading…
          </p>
        )}

        {!isLoading && (error || !data) && (
          <p className="text-sm" style={{ color: "rgba(200,212,192,0.55)" }}>
            We couldn’t load this prayer request.
          </p>
        )}

        {data && (
          <div className="w-full flex flex-col items-center text-center gap-5">
            {latestWord && (
              <div className="flex flex-col items-center gap-3">
                {latestWord.authorAvatarUrl ? (
                  <img
                    src={latestWord.authorAvatarUrl}
                    alt={latestWord.authorName}
                    className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
                    style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                  >
                    {initials(latestWord.authorName)}
                  </div>
                )}
                <p
                  className="text-[14px]"
                  style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {latestWord.authorName}
                </p>
              </div>
            )}

            <p
              className="text-[10px] uppercase tracking-[0.18em] font-semibold"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              {latestWord ? "Word of Comfort" : "Prayer Request"}
            </p>

            {latestWord ? (
              <p
                className="text-[22px] leading-[1.5] font-medium italic"
                style={{
                  color: "#E8E4D8",
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {latestWord.content}
              </p>
            ) : (
              <p
                className="text-[22px] leading-[1.5] font-medium italic"
                style={{
                  color: "#E8E4D8",
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {data.body}
              </p>
            )}

            {latestWord && (
              <div
                className="w-full rounded-2xl px-6 py-5 text-left mt-4"
                style={{
                  background: "rgba(46,107,64,0.12)",
                  border: "1px solid rgba(46,107,64,0.15)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
                  style={{ color: "rgba(143,175,150,0.45)" }}
                >
                  Your prayer request
                </p>
                <p
                  className="italic"
                  style={{
                    color: "#C8D4C0",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15,
                    lineHeight: 1.7,
                  }}
                >
                  {data.body}
                </p>
              </div>
            )}

            <button
              onClick={() => setLocation("/prayer-list")}
              className="mt-4 px-5 py-2.5 rounded-full text-sm"
              style={{
                color: "#C8D4C0",
                background: "rgba(200,212,192,0.08)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Manage prayer request
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
