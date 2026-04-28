import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

type PrayerForMe = {
  id: number;
  startedAt: string;
  expiresAt: string;
  prayerText: string | null;
  prayerUserId: number;
  prayerName: string | null;
  prayerEmail: string | null;
  prayerAvatarUrl: string | null;
};

const VIEWED_KEY = "phoebe:prayers-for-me:viewed-ids";

function readViewedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function writeViewedIds(ids: Set<number>) {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(ids)));
  } catch {}
}

export default function PrayersForMePage() {
  const { data = [], isLoading } = useQuery<PrayerForMe[]>({
    queryKey: ["/api/prayers-for/for-me"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/for-me"),
  });

  useEffect(() => {
    if (data.length === 0) return;
    const seen = readViewedIds();
    let changed = false;
    for (const p of data) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        changed = true;
      }
    }
    if (changed) writeViewedIds(seen);
  }, [data]);

  const initials = (name: string | null) =>
    (name ?? "?")
      .split(" ")
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? "")
      .join("");

  const daysLeft = (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-6 transition-opacity hover:opacity-80"
          style={{ color: "#8FAF96" }}
        >
          <ChevronLeft size={14} />
          Back
        </Link>

        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "#F0EDE6", letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Prayers for You 🙏🏽
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(200,212,192,0.6)" }}>
          People in your community are praying for you.
        </p>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div
                key={i}
                className="h-20 rounded-xl animate-pulse"
                style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.2)" }}
              />
            ))}
          </div>
        )}

        {!isLoading && data.length === 0 && (
          <p className="text-sm text-center mt-12" style={{ color: "#8FAF96" }}>
            No active prayers right now. The quiet itself is a gift. 🌿
          </p>
        )}

        {!isLoading && data.length > 0 && (
          <div className="space-y-3">
            {data.map(p => {
              const days = daysLeft(p.expiresAt);
              return (
                <div
                  key={p.id}
                  className="rounded-xl p-4"
                  style={{
                    background: "#0F2818",
                    border: "1px solid rgba(46,107,64,0.35)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    {p.prayerAvatarUrl ? (
                      <img
                        src={p.prayerAvatarUrl}
                        alt={p.prayerName ?? ""}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        style={{ border: "1px solid rgba(46,107,64,0.3)" }}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                        style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                      >
                        {initials(p.prayerName)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                          {p.prayerName ?? "Someone"}
                        </p>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: days <= 1 ? "rgba(217,140,74,0.15)" : "rgba(46,107,64,0.15)",
                            color: days <= 1 ? "#D98C4A" : "rgba(143,175,150,0.7)",
                            border: `1px solid ${days <= 1 ? "rgba(217,140,74,0.3)" : "rgba(46,107,64,0.2)"}`,
                          }}
                        >
                          {days === 0 ? "today" : `${days}d left`}
                        </span>
                      </div>
                      {p.prayerText && (
                        <p
                          className="text-sm leading-relaxed mt-2"
                          style={{ color: "#E8E4D8" }}
                        >
                          {p.prayerText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
