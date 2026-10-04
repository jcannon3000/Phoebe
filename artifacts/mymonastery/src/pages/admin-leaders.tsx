/**
 * ADMIN → INBOX. People who answered your five questions, by name. Tap one to
 * read the answers and start designing their routine (admin-leader-intake.tsx).
 * Below the list: your page (/with/:slug), its address and welcome.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD: React.CSSProperties = {
  background: "rgba(9,26,16,0.5)", border: "1px solid rgba(46,107,64,0.35)", borderRadius: 16, padding: 16,
};
const FIELD: React.CSSProperties = {
  width: "100%", background: "rgba(200,212,192,0.07)", border: "1px solid rgba(46,107,64,0.4)",
  borderRadius: 10, padding: "12px 14px", color: WARM, fontSize: 16, fontFamily: FONT, outline: "none",
};

type Profile = { slug: string; displayName: string; welcome: string | null; active: boolean };
type Intake = {
  id: number; name: string; email: string; morning: string; evening: string; connect: string; grow: string;
  newsletters: string[]; status: "new" | "crafted" | "sent"; createdAt: string; leaderName: string | null;
};
const STATUS_LABEL = { new: "New", crafted: "Routine made", sent: "Sent" } as const;

export default function AdminLeadersPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leaf = LEAF_PHOTOS[0];

  const me = useQuery<{ profile: Profile | null }>({
    queryKey: ["/api/leader/me"], queryFn: () => apiRequest("GET", "/api/leader/me"), retry: false,
  });
  const inbox = useQuery<{ intakes: Intake[] }>({
    queryKey: ["/api/leader/intakes"], queryFn: () => apiRequest("GET", "/api/leader/intakes"), retry: false,
  });

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [welcome, setWelcome] = useState("");
  const [active, setActive] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const p = me.data?.profile;
    if (p) { setSlug(p.slug); setDisplayName(p.displayName); setWelcome(p.welcome ?? ""); setActive(p.active); }
  }, [me.data]);

  const link = slug ? `${window.location.origin}/with/${slug}` : "";

  async function save() {
    setMsg(null);
    try {
      await apiRequest("PUT", "/api/leader/me", { slug: slug.trim().toLowerCase(), displayName, welcome, active });
      await qc.invalidateQueries({ queryKey: ["/api/leader/me"] });
      setMsg("Saved.");
    } catch (e) {
      const m = String((e as Error)?.message ?? "");
      setMsg(m.includes("slug_taken") ? "That address is taken." : m.includes("slug_invalid")
        ? "Use 3–40 lowercase letters, numbers and hyphens." : "Couldn't save. Try again.");
    }
  }
  return (
    <Layout bgPhoto={leaf} chromeless onClose={() => setLocation("/admin/tools")}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(var(--safe-top, 0px) + 56px) 18px 60px", display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM }}>Inbox</h1>

        {inbox.isLoading && <p style={{ color: SAGE }}>Loading…</p>}
        {inbox.data && inbox.data.intakes.length === 0 && (
          <p style={{ color: SAGE, fontSize: 14 }}>
            {me.data?.profile ? "Nothing yet. Share your page's link and people's answers will appear here." : "Nothing yet. Set up your page below, then share its link."}
          </p>
        )}
        {inbox.data?.intakes.map((i) => (
          <button key={i.id} type="button" onClick={() => setLocation(`/admin/leaders/${i.id}`)}
            style={{ ...CARD, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: FONT, width: "100%" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ color: WARM, fontSize: 16 }}>{i.name}</strong>
              <span style={{ fontSize: 12.5, color: SAGE }}>{new Date(i.createdAt).toLocaleDateString()}</span>
            </span>
            <span style={{ fontSize: 12.5, color: i.status === "new" ? WARM : SAGE, border: "1px solid rgba(46,107,64,0.5)",
              borderRadius: 999, padding: "4px 10px", background: i.status === "new" ? "rgba(46,107,64,0.6)" : "transparent", whiteSpace: "nowrap" }}>
              {STATUS_LABEL[i.status]}
            </span>
          </button>
        ))}

        <h2 style={{ fontSize: 18, fontWeight: 700, color: WARM, marginTop: 14 }}>Your page</h2>
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 13, color: SAGE }}>Your name, as people will see it</label>
          <input style={FIELD} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jeremy Cannon" />
          <label style={{ fontSize: 13, color: SAGE }}>Page address</label>
          <input style={FIELD} value={slug} autoCapitalize="none" autoCorrect="off" onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="jeremy" />
          <label style={{ fontSize: 13, color: SAGE }}>A line or two of welcome (optional)</label>
          <textarea style={{ ...FIELD, resize: "vertical" }} rows={3} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: WARM }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Page is open
          </label>
          <button type="button" onClick={save} disabled={!slug || !displayName.trim()}
            style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 12, padding: "13px 16px", fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
            Save
          </button>
          {msg && <p style={{ fontSize: 13, color: SAGE }}>{msg}</p>}
          {me.data?.profile && (
            <p style={{ fontSize: 13, color: WARM, wordBreak: "break-all" }}>
              {link}{" "}
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); setMsg("Link copied."); }}
                style={{ background: "none", border: "none", color: SAGE, textDecoration: "underline", cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>Copy</button>
            </p>
          )}
        </div>

      </div>
    </Layout>
  );
}
