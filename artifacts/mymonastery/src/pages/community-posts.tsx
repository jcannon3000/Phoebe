import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryClient } from "@/lib/queryClient";

/**
 * /communities/:slug/posts — where a group admin writes the weekly reflection,
 * posts a link, and finds the group's inbound email address.
 *
 * Everything here already worked over the API and had no way in: the routes
 * shipped, and an admin could only reach them with curl. That is the
 * unreachable-feature shape this codebase keeps producing, so this closes it
 * rather than adding anything new underneath.
 *
 * THE TWO KINDS OF POST are one form, because they are one object: write
 * something, or paste a link to something. Whichever field is filled decides
 * which it is, so nobody has to learn a distinction the app can infer.
 */

const BG = "#0A1A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.9)";
const FAINT = "rgba(200,212,192,0.62)";
const BORDER = "rgba(200,212,192,0.18)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Post = {
  id: number; title: string; body: string; url: string | null;
  publishedAt: string | null; expiresAt: string | null; authorName: string | null;
};

export default function CommunityPostsPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/communities/:slug/posts");
  const slug = params?.slug ?? "";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [openExternally, setOpenExternally] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: posts, refetch } = useQuery<Post[]>({
    queryKey: [`/api/groups/${slug}/reflections`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/reflections`),
    enabled: !!slug,
  });

  /** The address the parish adds to their mailing list. */
  const { data: group } = useQuery<{ inboundAddress: string | null; name: string }>({
    queryKey: [`/api/groups/${slug}/inbound-address`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/inbound-address`),
    enabled: !!slug,
  });

  const post = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/reflections`, {
      title: title.trim(),
      body: body.trim(),
      url: url.trim(),
      openExternally,
      ctaLabel: ctaLabel.trim(),
    }),
    onSuccess: () => {
      setTitle(""); setBody(""); setUrl(""); setCtaLabel(""); setOpenExternally(false); setError(null);
      void refetch();
      // The home card reads a different key — clear it or the new post
      // doesn't appear until the next natural refetch.
      void getQueryClient()?.invalidateQueries({ queryKey: ["/api/me/group-reflection/latest"] });
    },
    onError: (e: unknown) => setError((e as { message?: string })?.message ?? "Could not post"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${slug}/reflections/${id}`),
    onSuccess: () => {
      void refetch();
      void getQueryClient()?.invalidateQueries({ queryKey: ["/api/me/group-reflection/latest"] });
    },
  });

  const canPost = title.trim().length > 0 && (body.trim().length > 0 || url.trim().length > 0);
  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14,
    background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
    color: WARM, fontFamily: FONT, fontSize: 15, outline: "none",
  };

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 40px)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <button
          type="button" onClick={() => setLocation(`/communities/${slug}`)}
          style={{ background: "transparent", border: "none", color: FAINT, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 2px", marginBottom: 10 }}
        >
          ← {group?.name ?? "Back"}
        </button>

        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Posts</h1>
        <p style={{ color: FAINT, fontSize: 14, lineHeight: 1.55, margin: "0 0 24px" }}>
          A reflection you write, or a link to something worth reading. It lands in
          the inbox of everyone in this group.
        </p>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ ...field, marginBottom: 10 }} />
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Write something… (or leave empty and paste a link below)"
          rows={7} style={{ ...field, marginBottom: 10, resize: "vertical", lineHeight: 1.6 }}
        />
        <input
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="…or a link — https://"
          inputMode="url" autoCapitalize="off" autoCorrect="off"
          style={{ ...field, marginBottom: 6 }}
        />
        <p style={{ color: FAINT, fontSize: 12, lineHeight: 1.5, margin: "0 0 14px" }}>
          A link opens the page as its publisher made it, and disappears after a week.
          Something you write stays until you post the next one.
        </p>

        {/* Only meaningful for a link — there is nothing to leave the app for
            on something written here. */}
        {url.trim() !== "" && (
          <>
            <input
              value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Button text — Learn more, RSVP, Give…"
              maxLength={24} style={{ ...field, marginBottom: 10 }}
            />
            <button
              type="button" onClick={() => setOpenExternally((v) => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", textAlign: "left", borderRadius: 14, padding: "13px 15px", marginBottom: 14,
                background: openExternally ? "rgba(46,107,64,0.28)" : "rgba(240,237,230,0.06)",
                border: `1px solid ${openExternally ? "rgba(168,197,160,0.5)" : BORDER}`,
                color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 3, paddingRight: 12 }}>
                <span>Open outside Phoebe</span>
                <span style={{ color: FAINT, fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>
                  For events, giving and anything on your own platform — so it opens
                  in that app, where people are already signed in.
                </span>
              </span>
              <span aria-hidden style={{ fontSize: 17 }}>{openExternally ? "✓" : ""}</span>
            </button>
          </>
        )}
        {error && <p style={{ color: "#E8A0A0", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <button
          type="button" disabled={!canPost || post.isPending} onClick={() => post.mutate()}
          style={{
            width: "100%", borderRadius: 999, padding: "14px 20px", marginBottom: 30,
            background: canPost ? "rgba(46,107,64,0.9)" : "rgba(240,237,230,0.06)",
            color: canPost ? WARM : "rgba(240,237,230,0.42)",
            border: `1px solid ${canPost ? "rgba(46,107,64,0.6)" : BORDER}`,
            fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: canPost ? "pointer" : "default",
          }}
        >
          {post.isPending ? "Posting…" : "Post to the group"}
        </button>

        {group?.inboundAddress && (
          <div style={{ borderRadius: 16, padding: 16, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, marginBottom: 30 }}>
            <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, margin: "0 0 8px" }}>
              Your newsletter, automatically
            </p>
            <p style={{ color: FAINT, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 10px" }}>
              Add this address to your mailing list — Constant Contact, Mailchimp, or
              whatever you use — as an ordinary subscriber. Whatever you send the
              congregation arrives here too.
            </p>
            <code
              style={{ display: "block", wordBreak: "break-all", fontSize: 13, color: WARM, background: "rgba(0,0,0,0.25)", padding: "10px 12px", borderRadius: 10 }}
            >
              {group.inboundAddress}
            </code>
            <p style={{ color: FAINT, fontSize: 12, lineHeight: 1.5, margin: "10px 0 0" }}>
              Only mail from a group admin's own address is accepted, so this can be
              on a public list safely.
            </p>
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Posted</h2>
        {(posts ?? []).length === 0 && (
          <p style={{ color: FAINT, fontSize: 14 }}>Nothing yet.</p>
        )}
        {(posts ?? []).map((p) => (
          <div key={p.id} style={{ borderRadius: 14, padding: 14, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>{p.title}</p>
                <p style={{ color: FAINT, fontSize: 12.5, margin: 0 }}>
                  {[p.url ? "Link" : "Written", p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "Draft"].join(" · ")}
                </p>
              </div>
              <button
                type="button" onClick={() => remove.mutate(p.id)}
                style={{ background: "transparent", border: "none", color: "rgba(232,160,160,0.85)", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
