import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ownerId: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  viewerIsOwner: boolean;
  words: PrayerWord[];
};

// Inline compose for a viewer's "word of comfort" on this request —
// mirrors the field on the prayer-mode slideshow so the experience
// matches whether the viewer arrives from the bell push or the daily
// slideshow. Submits to POST /api/prayer-requests/:id/word; the route
// idempotently inserts/updates so a re-tap from the same viewer just
// edits their existing word.
function RequestWordField({ requestId }: { requestId: number }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [submittedWord, setSubmittedWord] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("POST", `/api/prayer-requests/${requestId}/word`, { content });
      setSubmittedWord(content);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /closed|expired|answered/i.test(raw)
        ? "This prayer is closed — can't leave a word."
        : /unauthorized|401/i.test(raw)
          ? "Please sign in and try again."
          : /network|failed to fetch|offline/i.test(raw)
            ? "No connection — try again in a moment."
            : "Couldn't send your word. Tap again?";
      setError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedWord) {
    return (
      <div
        className="w-full rounded-2xl px-5 py-3 text-left mt-2"
        style={{
          background: "rgba(46,107,64,0.08)",
          border: "1px solid rgba(46,107,64,0.18)",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
          Your word
        </p>
        <p className="text-[14px] italic" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
          “{submittedWord}”
        </p>
      </div>
    );
  }

  return (
    <div className="w-full mt-2">
      <div
        className="w-full rounded-full px-4 py-1.5 flex items-center gap-2"
        style={{
          background: "rgba(46,107,64,0.1)",
          border: error ? "1px solid rgba(196,122,101,0.6)" : "1px solid rgba(46,107,64,0.25)",
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Leave a word of comfort…"
          maxLength={120}
          className="word-of-comfort-input flex-1 bg-transparent outline-none text-[14px] py-1.5"
          style={{
            color: "#E8E4D8",
            fontSize: 16,
            background: "transparent",
            boxShadow: "none",
            WebkitAppearance: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || submitting}
          aria-label="Send word"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {submitting ? "…" : "→"}
        </button>
      </div>
      {error && (
        <p className="text-[12px] mt-1.5 px-2" style={{ color: "#C47A65" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

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
            {!data.viewerIsOwner && (
              <div className="flex flex-col items-center gap-3">
                {data.ownerAvatarUrl ? (
                  <img
                    src={data.ownerAvatarUrl}
                    alt={data.ownerName ?? "Prayer author"}
                    className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
                    style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                  >
                    {initials(data.ownerName ?? "")}
                  </div>
                )}
                {data.ownerName && (
                  <p
                    className="text-[14px]"
                    style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {data.ownerName}
                  </p>
                )}
              </div>
            )}

            <p
              className="text-[10px] uppercase tracking-[0.18em] font-semibold"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              {data.viewerIsOwner
                ? "Your prayer request"
                : `${data.ownerName ?? "Someone"} is asking for your prayers`}
            </p>

            <p
              className="text-[22px] leading-[1.5] font-medium italic"
              style={{
                color: "#E8E4D8",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {data.body}
            </p>

            {!data.viewerIsOwner && (
              <RequestWordField requestId={data.id} />
            )}

            {data.viewerIsOwner && latestWord && (
              <div
                className="w-full rounded-2xl px-6 py-5 mt-4 flex flex-col items-center text-center gap-3"
                style={{
                  background: "rgba(46,107,64,0.12)",
                  border: "1px solid rgba(46,107,64,0.15)",
                }}
              >
                {latestWord.authorAvatarUrl ? (
                  <img
                    src={latestWord.authorAvatarUrl}
                    alt={latestWord.authorName}
                    className="w-12 h-12 rounded-full object-cover prayer-avatar-pulse"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold prayer-avatar-pulse"
                    style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                  >
                    {initials(latestWord.authorName)}
                  </div>
                )}
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                  style={{ color: "rgba(143,175,150,0.45)" }}
                >
                  Word of Comfort from {latestWord.authorName}
                </p>
                <p
                  className="italic"
                  style={{
                    color: "#E8E4D8",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: 18,
                    lineHeight: 1.55,
                  }}
                >
                  {latestWord.content}
                </p>
              </div>
            )}

            <button
              onClick={() => setLocation("/dashboard")}
              className="mt-6 px-6 py-3 rounded-full text-sm font-medium"
              style={{
                color: "#C8D4C0",
                background: "rgba(200,212,192,0.08)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
