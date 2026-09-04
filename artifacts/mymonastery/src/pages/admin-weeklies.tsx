import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";
import { WEEKLIES_KEY, WEEKLY_LATEST_KEY, type WeeklySource } from "@/lib/weeklies";

/**
 * /admin/weeklies — paste a Substack link, get a weekly.
 *
 * Owner (2026-09-04): "put any link in through an admin tool to a substack
 * and it would turn it into a weekly … maybe even employ the ChatGPT AI …
 * ask the user for the title, subtitle and description." So: paste → the
 * server finds the feed and proposes the three lines (OpenAI when a key is
 * set, else the feed's own words) → the admin edits them → Save. Followers
 * then see it on the Weekly page, in Manage subscriptions, on the
 * customizer's reflections step, as a home card, and in the Fresh Off The
 * Presses push.
 */

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const FIELD: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.28)",
  borderRadius: 12, padding: "10px 12px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none",
};
const LABEL: React.CSSProperties = { display: "block", color: SAGE, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: FONT, margin: "14px 0 6px", fontWeight: 600 };

type Preview = {
  siteUrl: string; feedUrl: string; slug: string; exists: boolean;
  channel: { title: string; description: string };
  posts: { id: string; title: string; url: string; published: string | null }[];
  proposal: { title: string; subtitle: string; description: string };
  proposedBy: "ai" | "feed";
};

export default function AdminWeekliesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { rawIsAdmin: isAdmin } = useBetaStatus();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  // "new" = a pasted link being previewed; "edit" = an existing publication's
  // name / subtitle / description (owner: "an edit button that would lead to
  // a page to edit that publication's name, description"). Same form.
  const [mode, setMode] = useState<"new" | "edit">("new");
  const formRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({ slug: "", title: "", subtitle: "", description: "", emoji: "📰" });

  const list = useQuery<WeeklySource[]>({
    queryKey: ["/api/admin/weeklies"],
    enabled: isAdmin,
    queryFn: async () => ((await apiRequest("GET", "/api/admin/weeklies")) as WeeklySource[] | null) ?? [],
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["/api/admin/weeklies"] });
    void qc.invalidateQueries({ queryKey: WEEKLIES_KEY });
    void qc.invalidateQueries({ queryKey: WEEKLY_LATEST_KEY });
  };

  const doPreview = async () => {
    setBusy("preview"); setError(null); setPreview(null);
    try {
      const p = (await apiRequest("POST", "/api/admin/weeklies/preview", { url })) as Preview;
      setMode("new");
      setPreview(p);
      setForm({ slug: p.slug, title: p.proposal.title, subtitle: p.proposal.subtitle, description: p.proposal.description, emoji: "📰" });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not read that link.");
    } finally { setBusy(null); }
  };

  const doSave = async () => {
    if (!preview) return;
    setBusy("save"); setError(null);
    try {
      await apiRequest("POST", "/api/admin/weeklies", { url: preview.siteUrl, ...form });
      invalidate();
      setPreview(null); setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not save.");
    } finally { setBusy(null); }
  };

  const startEdit = (w: WeeklySource) => {
    setError(null);
    setMode("edit");
    setPreview({
      siteUrl: w.siteUrl, feedUrl: w.feedUrl, slug: w.slug, exists: true,
      channel: { title: w.title, description: w.description }, posts: [],
      proposal: { title: w.title, subtitle: w.subtitle, description: w.description }, proposedBy: "feed",
    });
    setForm({ slug: w.slug, title: w.title, subtitle: w.subtitle, description: w.description, emoji: w.emoji || "📰" });
    setUrl(w.siteUrl);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const remove = async (slug: string) => {
    if (!window.confirm("Remove this publication for everyone who follows it?")) return;
    await apiRequest("DELETE", `/api/admin/weeklies/${slug}`);
    invalidate();
  };

  if (!isAdmin) {
    return (
      <Layout>
        <p style={{ color: SAGE, fontFamily: FONT, padding: 24 }}>Admins only.</p>
      </Layout>
    );
  }

  const pill = (label: string, onClick: () => void, disabled?: boolean, primary?: boolean) => (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ background: primary ? "#2D5E3F" : "rgba(200,212,192,0.08)", border: "1px solid rgba(143,175,150,0.35)", color: WARM, fontFamily: FONT,
        fontSize: 14, fontWeight: 600, borderRadius: 999, padding: "9px 18px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      {label}
    </button>
  );

  return (
    <Layout>
      <div style={{ maxWidth: 640, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "8px 16px 48px", color: WARM, fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/admin/tools")}
          style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}>
          ← Admin Tools
        </button>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Publications</h1>
        <p style={{ color: SAGE, fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>
          Paste a Substack link. Phoebe finds its feed, proposes a title, subtitle and description for you to edit, and the publication joins the Newsletters menu.
        </p>

        <label style={LABEL}>Substack link</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://someone.substack.com" style={FIELD}
          inputMode="url" autoCapitalize="none" autoCorrect="off" />
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          {pill(busy === "preview" ? "Reading the feed…" : "Preview", () => { void doPreview(); }, !url.trim() || busy != null, true)}
        </div>
        {error && <p style={{ color: "#E0A48A", fontSize: 13, marginTop: 10 }}>{error}</p>}

        {preview && (
          <div ref={formRef} style={{ marginTop: 20, padding: 16, borderRadius: 16, background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}>
            {mode === "edit" ? (
              <p style={{ color: WARM, fontSize: 15, fontWeight: 700, margin: 0 }}>Edit publication</p>
            ) : (
              <p style={{ color: SAGE, fontSize: 12, margin: 0 }}>
                {preview.posts.length} recent posts · copy proposed by {preview.proposedBy === "ai" ? "AI" : "the feed"}
                {preview.exists && " · this slug already exists — saving updates it"}
              </p>
            )}
            <label style={LABEL}>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={FIELD} maxLength={60} />
            <label style={LABEL}>Subtitle</label>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} style={FIELD} maxLength={80} />
            <label style={LABEL}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...FIELD, minHeight: 80, resize: "vertical" }} maxLength={240} />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Emoji</label>
                <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} style={FIELD} maxLength={4} />
              </div>
              <div style={{ flex: 2 }}>
                <label style={LABEL}>Slug</label>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} style={{ ...FIELD, opacity: mode === "edit" ? 0.6 : 1 }} maxLength={40} autoCapitalize="none" readOnly={mode === "edit"} />
              </div>
            </div>
            {preview.posts[0] && (
              <p style={{ color: SAGE, fontSize: 12, marginTop: 12 }}>Newest: “{preview.posts[0].title}”{preview.posts[0].published ? ` · ${preview.posts[0].published}` : ""}</p>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              {pill(busy === "save" ? "Saving…" : (mode === "edit" ? "Save changes" : "Save publication"), () => { void doSave(); }, busy != null || !form.title.trim() || !form.slug.trim(), true)}
              {pill("Cancel", () => setPreview(null), busy != null)}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 10px", color: SAGE, letterSpacing: "0.08em", textTransform: "uppercase" }}>Current publications</h2>
        {(list.data ?? []).length === 0 && <p style={{ color: SAGE, fontSize: 14 }}>None yet.</p>}
        {(list.data ?? []).map((w) => (
          <div key={w.slug} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 8, borderRadius: 14, background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}>
            <span style={{ fontSize: 22 }}>{w.emoji || "📰"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{w.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: SAGE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.subtitle || w.description || w.slug}</p>
            </div>
            <button type="button" onClick={() => startEdit(w)}
              style={{ background: "none", border: "1px solid rgba(143,175,150,0.4)", color: WARM, borderRadius: 999, padding: "6px 12px", fontFamily: FONT, fontSize: 12, cursor: "pointer" }}>
              Edit
            </button>
            <button type="button" onClick={() => { void remove(w.slug); }}
              style={{ background: "none", border: "1px solid rgba(224,164,138,0.4)", color: "#E0A48A", borderRadius: 999, padding: "6px 12px", fontFamily: FONT, fontSize: 12, cursor: "pointer" }}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </Layout>
  );
}
