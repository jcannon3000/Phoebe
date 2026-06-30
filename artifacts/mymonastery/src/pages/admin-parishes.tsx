import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FROST = { background: "rgba(9,26,16,0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

type Parish = {
  id: number;
  slug: string;
  title: string;
  coverEmoji: string | null;
  state: "draft" | "live" | "paused";
  visibility: "public" | "private";
  subscriberCount: number;
};

const STATE_LABEL: Record<Parish["state"], { label: string; bg: string; border: string }> = {
  live: { label: "Live", bg: "rgba(46,107,64,0.32)", border: "rgba(168,197,160,0.5)" },
  draft: { label: "Draft", bg: "rgba(200,212,192,0.1)", border: "rgba(200,212,192,0.25)" },
  paused: { label: "Off", bg: "rgba(96,140,180,0.18)", border: "rgba(96,140,180,0.4)" },
};

// ⛪ Phoebe Parish — staff-admin surface to provision parish feeds (a one-way
// channel of a parish's upcoming events + its prayer list). Reuses the prayer
// feed engine: each parish is a kind="parish" feed; managing it (events,
// intercessions, live/public) happens on the shared /prayer-feeds/:slug/manage.
export default function AdminParishesPage() {
  const { user } = useAuth();
  const { rawIsAdmin } = useBetaStatus();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("⛪");
  const [copied, setCopied] = useState<string | null>(null);

  const parishesQ = useQuery<{ parishes: Parish[] }>({
    queryKey: ["/api/prayer-feeds/admin/parishes"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/admin/parishes"),
    enabled: !!user && rawIsAdmin,
  });

  const createMut = useMutation({
    mutationFn: (body: { title: string; coverEmoji: string }) =>
      apiRequest("POST", "/api/prayer-feeds", { ...body, kind: "parish", visibility: "public" }) as Promise<{ feed: { slug: string } }>,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/admin/parishes"] });
      setTitle("");
      // Drop straight into the manage page to add events + the prayer list.
      setLocation(`/prayer-feeds/${res.feed.slug}/manage`);
    },
  });

  const copyShare = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/feed/${slug}`);
      setCopied(slug);
      window.setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1800);
    } catch { /* clipboard blocked — non-fatal */ }
  };

  if (!user || !rawIsAdmin) {
    return (
      <Layout>
        <div className="px-4 pt-10 text-center" style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ color: SAGE, fontFamily: FONT }}>This area is for Phoebe staff admins.</p>
        </div>
      </Layout>
    );
  }

  const parishes = parishesQ.data?.parishes ?? [];
  const canCreate = title.trim().length > 0 && !createMut.isPending;

  return (
    <Layout>
      <div className="min-h-screen px-4 pt-8 pb-24" style={{ maxWidth: 560, margin: "0 auto" }}>
        <button onClick={() => setLocation("/admin/tools")} className="text-sm mb-3" style={{ color: SAGE, fontFamily: FONT }}>
          ← Admin Tools
        </button>
        <div className="mb-7">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>Admin</p>
          <h1 className="text-2xl font-semibold" style={{ color: WARM, fontFamily: FONT }}>Phoebe Parish ⛪</h1>
          <p className="text-sm mt-1" style={{ color: SAGE, fontFamily: FONT }}>
            A parish feed pushes the parish's upcoming events and prayer list. People subscribe and receive it — they can't post into it.
          </p>
        </div>

        {/* Create a parish */}
        <div className="rounded-2xl p-4 mb-6" style={{ ...FROST, border: "1px solid rgba(46,107,64,0.3)" }}>
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
            New parish
          </p>
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              aria-label="Emoji"
              className="w-14 rounded-xl text-center text-xl outline-none"
              style={{ background: "rgba(0,0,0,0.25)", color: WARM, border: "1px solid rgba(46,107,64,0.3)", padding: "10px 0" }}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Parish name (e.g. St. Mary's, Anytown)"
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) createMut.mutate({ title: title.trim(), coverEmoji: emoji.trim() || "⛪" }); }}
              className="flex-1 rounded-xl px-3 text-[15px] outline-none"
              style={{ background: "rgba(0,0,0,0.25)", color: WARM, fontFamily: FONT, border: "1px solid rgba(46,107,64,0.3)" }}
            />
          </div>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => createMut.mutate({ title: title.trim(), coverEmoji: emoji.trim() || "⛪" })}
            className="w-full rounded-full mt-3 py-3 text-[14px] font-semibold transition-opacity active:scale-[0.99] disabled:opacity-40"
            style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT, cursor: canCreate ? "pointer" : "default" }}
          >
            {createMut.isPending ? "Creating…" : "Create parish → add events & prayers"}
          </button>
          {createMut.isError && (
            <p className="text-[12px] mt-2" style={{ color: "rgba(220,150,150,0.9)", fontFamily: FONT }}>Couldn't create — try again.</p>
          )}
          <p className="text-[11px] mt-2 leading-snug" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
            Starts as a draft. Add its events + prayer list on the next screen, then flip it to <b>Live</b> to publish.
          </p>
        </div>

        {/* Existing parishes */}
        <p className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3 px-1" style={{ color: "rgba(143,175,150,0.45)", fontFamily: FONT }}>
          Parishes
        </p>
        {parishesQ.isLoading ? (
          <p className="text-sm px-1" style={{ color: SAGE, fontFamily: FONT }}>Loading…</p>
        ) : parishes.length === 0 ? (
          <p className="text-sm px-1" style={{ color: SAGE, fontFamily: FONT }}>No parishes yet — create the first one above.</p>
        ) : (
          <div className="space-y-2">
            {parishes.map((p) => {
              const st = STATE_LABEL[p.state];
              return (
                <div key={p.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ ...FROST, border: "1px solid rgba(46,107,64,0.22)" }}>
                  <span className="text-xl leading-none flex-shrink-0">{p.coverEmoji || "⛪"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{p.title}</p>
                      <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: st.bg, border: `1px solid ${st.border}`, color: WARM }}>{st.label}</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
                      {p.visibility === "public" ? "In Explore" : "Private"} · {p.subscriberCount} subscriber{p.subscriberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button type="button" onClick={() => copyShare(p.slug)}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0"
                    style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}>
                    {copied === p.slug ? "Copied ✓" : "Link"}
                  </button>
                  <button type="button" onClick={() => setLocation(`/prayer-feeds/${p.slug}/manage`)}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0"
                    style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT }}>
                    Manage
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
