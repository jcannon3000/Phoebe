import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Row = {
  id: number; title: string; body: string; linkPath: string | null; linkLabel: string | null;
  createdAt: string; expiresAt: string | null; retiredAt: string | null;
  pushSentAt: string | null; pushCount: number | null;
};

const labelStyle = { color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" };
const inputStyle = { backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" };
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function statusOf(r: Row): string {
  if (r.retiredAt) return "Retired";
  if (r.expiresAt && new Date(r.expiresAt) < new Date()) return "Expired";
  return "Live";
}

export default function AdminAnnouncementsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin } = useBetaStatus();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkPath, setLinkPath] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [days, setDays] = useState("7");
  const [push, setPush] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !rawIsAdmin)) setLocation("/dashboard");
  }, [user, rawIsAdmin, authLoading, setLocation]);

  const enabled = !!user && rawIsAdmin;
  const { data: history } = useQuery<{ announcements: Row[] }>({
    queryKey: ["/api/admin/announcements"],
    queryFn: () => apiRequest("GET", "/api/admin/announcements"),
    enabled,
  });
  const { data: audience } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/announcements/audience"],
    queryFn: () => apiRequest("GET", "/api/admin/announcements/audience"),
    enabled,
  });
  const reach = audience?.count ?? 0;

  const post = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/announcements", {
        title: title.trim(),
        body: body.trim(),
        linkPath: linkPath.trim() || undefined,
        linkLabel: linkLabel.trim() || undefined,
        expiresInDays: days === "never" ? undefined : Number(days),
        push,
      }),
    onSuccess: (res: { announcement: Row }) => {
      toast({ title: res.announcement.pushSentAt ? `Posted, and sent to ${res.announcement.pushCount ?? 0} people.` : "Posted." });
      setTitle(""); setBody(""); setLinkPath(""); setLinkLabel(""); setPush(false); setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Could not post.", variant: "destructive" });
      setConfirming(false);
    },
  });

  const retire = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/announcements/${id}/retire`, {}),
    onSuccess: () => {
      toast({ title: "Taken down." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
    },
  });

  const ready = title.trim().length > 0 && body.trim().length > 0;
  const live = (history?.announcements ?? []).find((r) => statusOf(r) === "Live");

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-6 mt-2">
          <Link href="/admin/tools" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>← Admin Tools</Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Announcement 📣</h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            A note at the top of everyone's home, like the Begin here card. Posting a new one replaces the current one. You can also send it as a notification.
          </p>
        </div>

        {live && (
          <div className="rounded-xl px-4 py-3 mb-5" style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.35)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>Live now</p>
            <p className="text-sm font-semibold mt-1" style={{ color: "#F0EDE6" }}>{live.title}</p>
            <p className="text-sm mt-0.5" style={{ color: "#C8D4C0" }}>{live.body}</p>
            <button
              onClick={() => retire.mutate(live.id)}
              disabled={retire.isPending}
              className="text-[12px] mt-2 px-3 py-1 rounded-lg"
              style={{ color: "#F0EDE6", background: "rgba(120,50,50,0.35)", border: "1px solid rgba(180,80,80,0.4)" }}
            >
              Take it down
            </button>
          </div>
        )}

        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>Title</label>
        <input
          type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder="A short headline"
          className="w-full text-base px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 mb-5"
          style={inputStyle}
        />

        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>Message</label>
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} maxLength={400} rows={4}
          placeholder="Plain text, up to 400 characters. This is also the notification text."
          className="w-full text-base px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 leading-relaxed resize-y mb-1"
          style={inputStyle}
        />
        <p className="text-[11px] mb-5" style={{ color: "rgba(143,175,150,0.5)" }}>{body.length}/400</p>

        <div className="grid grid-cols-2 gap-3 mb-1">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>Button link</label>
            <input
              type="text" value={linkPath} onChange={(e) => setLinkPath(e.target.value)} placeholder="/rosary"
              autoCapitalize="none" autoCorrect="off"
              className="w-full text-base px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>Button label</label>
            <input
              type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Open" maxLength={30}
              className="w-full text-base px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30"
              style={inputStyle}
            />
          </div>
        </div>
        <p className="text-[11px] mb-5" style={{ color: "rgba(143,175,150,0.5)" }}>
          The button is optional. Link to a page inside Phoebe, like /rosary or /menu/learn. Tapping the notification opens it too.
        </p>

        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>Stays up for</label>
        <select
          value={days} onChange={(e) => setDays(e.target.value)}
          className="w-full text-base px-4 py-2.5 rounded-xl border focus:outline-none mb-5" style={inputStyle}
        >
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">A week</option>
          <option value="14">Two weeks</option>
          <option value="30">A month</option>
          <option value="never">Until I take it down</option>
        </select>

        <label className="flex items-start gap-3 mb-5 cursor-pointer">
          <input type="checkbox" checked={push} onChange={(e) => { setPush(e.target.checked); setConfirming(false); }} className="mt-1" style={{ width: 18, height: 18 }} />
          <span className="text-sm" style={{ color: "#F0EDE6" }}>
            Also send it as a notification
            <span className="block text-[12px]" style={{ color: "rgba(143,175,150,0.7)" }}>
              About {reach} {reach === 1 ? "person" : "people"} with notifications on a device. It goes out once, right away, and cannot be recalled.
            </span>
          </span>
        </label>

        {!confirming ? (
          <button
            onClick={() => (push ? setConfirming(true) : post.mutate())}
            disabled={!ready || post.isPending}
            className="rounded-full px-5 py-3 text-sm font-semibold"
            style={{ background: ready ? "rgba(46,107,64,0.75)" : "rgba(46,107,64,0.25)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.7)" }}
          >
            {push ? "Review and send" : "Post announcement"}
          </button>
        ) : (
          <div className="rounded-xl px-4 py-4" style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(46,107,64,0.5)" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>Send to about {reach} {reach === 1 ? "person" : "people"}?</p>
            <p className="text-sm mb-1" style={{ color: "#C8D4C0" }}>The notification will read:</p>
            <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{title.trim()}</p>
            <p className="text-sm mb-3" style={{ color: "#C8D4C0" }}>{body.trim()}</p>
            <div className="flex gap-2">
              <button
                onClick={() => post.mutate()} disabled={post.isPending}
                className="rounded-full px-5 py-2.5 text-sm font-semibold"
                style={{ background: "rgba(46,107,64,0.85)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.8)" }}
              >
                {post.isPending ? "Sending…" : "Send now"}
              </button>
              <button
                onClick={() => setConfirming(false)} disabled={post.isPending}
                className="rounded-full px-5 py-2.5 text-sm"
                style={{ color: "#8FAF96", border: "1px solid rgba(46,107,64,0.4)" }}
              >
                Not yet
              </button>
            </div>
          </div>
        )}

        {(history?.announcements ?? []).length > 0 && (
          <div className="mt-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={labelStyle}>Earlier</p>
            {history!.announcements.map((r) => (
              <div key={r.id} className="py-2.5" style={{ borderTop: "1px solid rgba(46,107,64,0.2)" }}>
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{r.title}</p>
                <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.7)" }}>
                  {when(r.createdAt)} · {statusOf(r)}{r.pushSentAt ? ` · notified ${r.pushCount ?? 0}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
