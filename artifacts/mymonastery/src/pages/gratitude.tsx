import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { GratitudeComposer } from "@/components/GratitudeComposer";

// Gratitude — a personal daily practice (private journal) with the option
// to share an entry to the garden. Grounded in the BCP's General
// Thanksgiving. Reachable from the side menu; the Daily Office close also
// offers a quick gratitude beat (GratitudeNudge).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Entry = { id: number; text: string; shared: boolean; createdAt: string };
type GardenEntry = {
  id: number; text: string; createdAt: string;
  authorName: string; avatarUrl: string | null; isYou: boolean; isNew: boolean;
};

// Local YYYY-MM-DD for a timestamp — "days of thanks" is about the
// user's calendar day.
function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computeStats(entries: Entry[]): { days: number; total: number; today: boolean } {
  const daySet = new Set(entries.map((e) => localDay(e.createdAt)));
  const todayKey = localDay(new Date().toISOString());
  return { days: daySet.size, total: entries.length, today: daySet.has(todayKey) };
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const t = localDay(iso);
  const today = localDay(new Date().toISOString());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (t === today) return "Today";
  if (t === localDay(y.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl px-4 py-5 text-center" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}>
      <p className="font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 22, lineHeight: 1.1, margin: 0 }}>{value}</p>
      <p className="text-[11px] mt-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: 0 }}>{label}</p>
    </div>
  );
}

export default function GratitudePage() {
  const queryClient = useQueryClient();
  // "mine" = my journal + composer; "community" = others' shared thanks.
  const [tab, setTab] = useState<"mine" | "community">("mine");

  const { data: mine } = useQuery<{ entries: Entry[]; total: number }>({
    queryKey: ["/api/gratitude/mine"],
    queryFn: () => apiRequest("GET", "/api/gratitude/mine") as Promise<{ entries: Entry[]; total: number }>,
  });
  const { data: garden } = useQuery<{ responses: GardenEntry[] }>({
    queryKey: ["/api/gratitude/responses"],
    queryFn: () => apiRequest("GET", "/api/gratitude/responses") as Promise<{ responses: GardenEntry[] }>,
  });

  const entries = mine?.entries ?? [];
  const stats = computeStats(entries);
  const gardenEntries = garden?.responses ?? [];

  // Mark others' new community entries as seen once the Community tab is
  // open (so the "new" dot on the tab clears when they actually look).
  useEffect(() => {
    if (tab !== "community") return;
    const unseen = gardenEntries.filter((g) => g.isNew).map((g) => g.id);
    if (unseen.length === 0) return;
    // Refetch after marking seen so isNew flips and the tab dot clears
    // this session (not just on next load). Self-terminates: the refetch
    // returns rows with isNew=false, so the effect re-runs to a no-op.
    apiRequest("POST", "/api/gratitude/seen", { responseIds: unseen })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/gratitude/responses"] }))
      .catch(() => {});
  }, [tab, gardenEntries, queryClient]);

  // New community responses the viewer hasn't seen — drives the tab dot.
  const hasNewCommunity = gardenEntries.some((g) => g.isNew && !g.isYou);

  const toggleShare = useMutation({
    mutationFn: ({ id, shared }: { id: number; shared: boolean }) =>
      apiRequest("POST", `/api/gratitude/${id}/share`, { shared }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gratitude/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gratitude/responses"] });
    },
  });

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-5">
          <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0" style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}>
            🌾
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Gratitude</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>Name the good. Keep it, or share it with your community.</p>
          </div>
        </div>

        {/* Tabs — your own gratitude vs. the community's shared thanks. */}
        <div className="flex gap-2 mb-6">
          {([
            { key: "mine", label: "My gratitude" },
            { key: "community", label: "Community" },
          ] as const).map((t) => {
            const active = tab === t.key;
            const dot = t.key === "community" && hasNewCommunity;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
                style={{
                  background: active ? "rgba(46,107,64,0.25)" : "rgba(46,107,64,0.08)",
                  border: `1px solid ${active ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.2)"}`,
                  color: active ? WARM : SAGE,
                  fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {t.label}
                {dot && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#D98C4A", display: "inline-block" }} />}
              </button>
            );
          })}
        </div>

        {tab === "mine" ? (
          <>
            <div className="flex gap-3 mb-6">
              <StatTile label={stats.days === 1 ? "day of thanks" : "days of thanks"} value={String(stats.days)} />
              <StatTile label="total" value={String(stats.total)} />
            </div>

            {/* Composer */}
            <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}>
              <p className="text-[15px] font-semibold mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {stats.today ? "Give thanks again" : "What are you grateful for today?"}
              </p>
              <GratitudeComposer />
            </div>

            {/* Your journal */}
            {entries.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
                  Your journal
                </p>
                <div className="space-y-2 mb-6">
                  {entries.map((e) => (
                    <div key={e.id} className="rounded-2xl px-4 py-3" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>{formatDay(e.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => toggleShare.mutate({ id: e.id, shared: !e.shared })}
                          className="text-[11px] transition-opacity hover:opacity-80"
                          style={{ color: e.shared ? "#A8C5A0" : "rgba(143,175,150,0.6)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                        >
                          {e.shared ? "🌿 Shared · make private" : "Share with the community"}
                        </button>
                      </div>
                      <p className="text-[15px] italic" style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}>{e.text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          /* Community — others' shared thanks. */
          gardenEntries.length > 0 ? (
            <div className="space-y-2">
              {gardenEntries.map((g) => (
                <div key={g.id} className="rounded-2xl px-4 py-3 flex gap-3" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}>
                  {g.avatarUrl
                    ? <img src={g.avatarUrl} alt={g.authorName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                    : <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[11px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{g.authorName.slice(0, 1).toUpperCase()}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] mb-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{g.isYou ? "You" : g.authorName}</p>
                    <p className="text-[15px] italic" style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}>{g.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-center py-12" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
              No one has shared yet. Share an entry from My gratitude to start it off.
            </p>
          )
        )}
      </div>
    </Layout>
  );
}
