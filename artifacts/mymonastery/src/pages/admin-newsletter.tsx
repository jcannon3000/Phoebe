import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type NewsletterGroup = {
  id: number;
  name: string;
  emoji: string | null;
  memberCount: number;
};

type NewsletterRow = {
  id: number;
  subject: string;
  recipientScope: "all" | "groups";
  groupIds: number[];
  recipientCount: number;
  sentCount: number;
  sentByName: string;
  createdAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AdminNewsletterPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin } = useBetaStatus();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"all" | "groups">("groups");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Redirect non-admins away.
  useEffect(() => {
    if (!authLoading && (!user || !rawIsAdmin)) setLocation("/dashboard");
  }, [user, rawIsAdmin, authLoading, setLocation]);

  const { data: groupsData, isLoading: groupsLoading } = useQuery<{
    groups: NewsletterGroup[];
    allUsersCount: number;
  }>({
    queryKey: ["/api/admin/newsletter/groups"],
    queryFn: () => apiRequest("GET", "/api/admin/newsletter/groups"),
    enabled: !!user && rawIsAdmin,
  });

  const { data: historyData } = useQuery<{ newsletters: NewsletterRow[] }>({
    queryKey: ["/api/admin/newsletters"],
    queryFn: () => apiRequest("GET", "/api/admin/newsletters"),
    enabled: !!user && rawIsAdmin,
  });

  const groups = groupsData?.groups ?? [];
  const allUsersCount = groupsData?.allUsersCount ?? 0;

  // Recipient estimate. Group totals can overlap (a user in two selected
  // groups), so this is an upper bound — labeled "up to".
  const estimate = useMemo(() => {
    if (scope === "all") return allUsersCount;
    return groups
      .filter((g) => selectedGroupIds.includes(g.id))
      .reduce((sum, g) => sum + g.memberCount, 0);
  }, [scope, allUsersCount, groups, selectedGroupIds]);

  const send = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/newsletter", {
        subject: subject.trim(),
        bodyMarkdown: body.trim(),
        scope,
        groupIds: scope === "groups" ? selectedGroupIds : [],
      }),
    onSuccess: (res: { recipientCount: number }) => {
      toast({ title: `Newsletter sending to ${res.recipientCount} ${res.recipientCount === 1 ? "person" : "people"}.` });
      setSubject("");
      setBody("");
      setSelectedGroupIds([]);
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/newsletters"] });
    },
    onError: (err: any) => {
      toast({
        title: err?.message || "Failed to send newsletter.",
        variant: "destructive",
      });
      setConfirming(false);
    },
  });

  function insertAtCursor(snippet: string) {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + snippet); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    // Restore focus + place cursor after the inserted snippet.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function toggleGroup(id: number) {
    setSelectedGroupIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  if (authLoading || !user || !rawIsAdmin) return null;

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (scope === "all" || selectedGroupIds.length > 0) &&
    !send.isPending;

  const labelStyle = {
    color: "rgba(143,175,150,0.7)",
    fontFamily: "'Space Grotesk', sans-serif",
  };
  const inputStyle = {
    backgroundColor: "#091A10",
    borderColor: "rgba(46,107,64,0.3)",
    color: "#F0EDE6",
  };

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6 mt-2">
          <Link href="/admin/tools" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Admin Tools
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Newsletter 📨
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Compose an email and choose which communities receive it.
          </p>
        </div>

        {/* Subject */}
        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5 block" style={labelStyle}>
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this newsletter about?"
          maxLength={200}
          className="w-full text-sm px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 mb-5"
          style={inputStyle}
        />

        {/* Body */}
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] block" style={labelStyle}>
            Body
          </label>
          <button
            onClick={() => insertAtCursor("\n\n[[Button label]](https://example.com)\n")}
            className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
            style={{ color: "#8FAF96", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            + Insert CTA button
          </button>
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Write your newsletter…\n\nSupports **bold**, *italic*, # headings, - lists, and [links](https://…)."}
          rows={12}
          maxLength={20000}
          className="w-full text-sm px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 font-mono leading-relaxed resize-y"
          style={inputStyle}
        />
        <p className="text-[11px] mt-1.5 mb-5" style={{ color: "rgba(143,175,150,0.5)" }}>
          Markdown supported. A line like <code style={{ color: "#8FAF96" }}>[[Join us]](https://withphoebe.app)</code> becomes a green button pill.
        </p>

        {/* Recipients */}
        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2 block" style={labelStyle}>
          Recipients
        </label>
        <div className="flex gap-2 mb-3">
          {(["groups", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className="flex-1 text-sm py-2.5 rounded-xl transition-all"
              style={{
                background: scope === s ? "rgba(46,107,64,0.28)" : "rgba(46,107,64,0.08)",
                border: `1px solid ${scope === s ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.15)"}`,
                color: scope === s ? "#F0EDE6" : "#8FAF96",
                fontWeight: scope === s ? 600 : 400,
              }}
            >
              {s === "groups" ? "Specific communities" : "All Phoebe users"}
            </button>
          ))}
        </div>

        {scope === "groups" && (
          <div className="space-y-1.5 mb-3">
            {groupsLoading ? (
              <p className="text-sm py-3 text-center" style={{ color: "rgba(143,175,150,0.5)" }}>
                Loading communities…
              </p>
            ) : groups.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: "rgba(143,175,150,0.5)" }}>
                No communities found.
              </p>
            ) : (
              groups.map((g) => {
                const checked = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between"
                    style={{
                      background: checked ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.07)",
                      border: `1px solid ${checked ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.15)"}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-xs shrink-0"
                        style={{
                          background: checked ? "#2D6B40" : "transparent",
                          border: `1px solid ${checked ? "#2D6B40" : "rgba(143,175,150,0.4)"}`,
                          color: "#F0EDE6",
                        }}
                      >
                        {checked ? "✓" : ""}
                      </div>
                      <span className="text-sm" style={{ color: "#C8D4C0" }}>
                        {g.emoji ? `${g.emoji} ` : ""}{g.name}
                      </span>
                    </div>
                    <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.5)" }}>
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Estimate */}
        <p className="text-xs mb-5" style={{ color: "#8FAF96" }}>
          {scope === "all"
            ? `Will send to all ${allUsersCount} Phoebe ${allUsersCount === 1 ? "user" : "users"}.`
            : selectedGroupIds.length === 0
              ? "Select at least one community."
              : `Will send to up to ${estimate} ${estimate === 1 ? "person" : "people"} across ${selectedGroupIds.length} ${selectedGroupIds.length === 1 ? "community" : "communities"}.`}
        </p>

        {/* Send */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: canSend ? "#2D6B40" : "rgba(46,107,64,0.2)",
              color: canSend ? "#F0EDE6" : "rgba(143,175,150,0.5)",
              cursor: canSend ? "pointer" : "not-allowed",
            }}
          >
            Review &amp; send
          </button>
        ) : (
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.35)" }}
          >
            <p className="text-sm mb-3" style={{ color: "#F0EDE6" }}>
              Send <strong>“{subject.trim()}”</strong>{" "}
              {scope === "all"
                ? `to all ${allUsersCount} Phoebe users?`
                : `to up to ${estimate} people in ${selectedGroupIds.length} ${selectedGroupIds.length === 1 ? "community" : "communities"}?`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={send.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm transition-colors"
                style={{ background: "rgba(46,107,64,0.1)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => send.mutate()}
                disabled={send.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: "#2D6B40", color: "#F0EDE6" }}
              >
                {send.isPending ? "Sending…" : "Yes, send now"}
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {historyData && historyData.newsletters.length > 0 && (
          <div className="mt-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={labelStyle}>
              Recent sends
            </p>
            <div className="space-y-1.5">
              {historyData.newsletters.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 rounded-xl"
                  style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.15)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>{n.subject}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                    {n.sentCount}/{n.recipientCount} sent ·{" "}
                    {n.recipientScope === "all" ? "All users" : `${n.groupIds.length} ${n.groupIds.length === 1 ? "community" : "communities"}`}{" "}
                    · {n.sentByName} · {formatDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
