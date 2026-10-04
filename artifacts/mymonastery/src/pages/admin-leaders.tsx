/**
 * ADMIN → LEADER PAGE + INBOX. Make your page (/with/:slug), copy its link,
 * and read what people answer: five questions, plus the name and email you
 * need to write back. Designing and sending the routine is the next step.
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
  async function setStatus(id: number, status: Intake["status"]) {
    await apiRequest("PATCH", `/api/leader/intakes/${id}`, { status }).catch(() => {});
    await qc.invalidateQueries({ queryKey: ["/api/leader/intakes"] });
  }

  return (
    <Layout bgPhoto={leaf} chromeless onClose={() => setLocation("/admin/tools")}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(var(--safe-top, 0px) + 56px) 18px 60px", display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM }}>Leader page</h1>

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

        <h2 style={{ fontSize: 18, fontWeight: 700, color: WARM, marginTop: 8 }}>Responses</h2>
        {inbox.isLoading && <p style={{ color: SAGE }}>Loading…</p>}
        {inbox.data && inbox.data.intakes.length === 0 && (
          <p style={{ color: SAGE, fontSize: 14 }}>Nothing yet. Share your link and answers will appear here.</p>
        )}
        {inbox.data?.intakes.map((i) => (
          <div key={i.id} style={{ ...CARD, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <strong style={{ color: WARM, fontSize: 16 }}>{i.name}</strong>
              <span style={{ fontSize: 12, color: SAGE }}>{new Date(i.createdAt).toLocaleDateString()}</span>
            </div>
            <a href={`mailto:${i.email}`} style={{ color: SAGE, fontSize: 14, wordBreak: "break-all" }}>{i.email}</a>
            {([["Morning", i.morning], ["Evening", i.evening], ["Connects with God", i.connect], ["Growing", i.grow]] as const)
              .filter(([, v]) => v).map(([k, v]) => (
                <p key={k} style={{ fontSize: 14, color: "rgba(240,237,230,0.95)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                  <span style={{ color: SAGE }}>{k} — </span>{v}
                </p>
              ))}
            {i.newsletters.length > 0 && (
              <p style={{ fontSize: 14, color: "rgba(240,237,230,0.95)" }}><span style={{ color: SAGE }}>Reflections — </span>{i.newsletters.join(", ")}</p>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {(["new", "crafted", "sent"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(i.id, s)}
                  style={{ borderRadius: 999, padding: "6px 12px", fontSize: 13, fontFamily: FONT, cursor: "pointer", color: WARM,
                    background: i.status === s ? "rgba(46,107,64,0.85)" : "transparent", border: "1px solid rgba(46,107,64,0.5)" }}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
