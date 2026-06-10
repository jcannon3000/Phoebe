import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type NextSunday = { title: string; scripture: string; web_link: string; notes: string };

export default function JardinNextSundayPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [form, setForm] = useState<NextSunday>({ title: "", scripture: "", web_link: "", notes: "" });
  const [saved, setSaved] = useState(false);

  const { data } = useQuery<NextSunday>({
    queryKey: ["/api/jardin/next-sunday"],
    queryFn: () => apiRequest("GET", "/api/jardin/next-sunday"),
  });

  useEffect(() => {
    if (data) setForm({ title: data.title ?? "", scripture: data.scripture ?? "", web_link: data.web_link ?? "", notes: data.notes ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: (v: NextSunday) => apiRequest("PUT", "/api/jardin/next-sunday", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/jardin/next-sunday"] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };
  const set = (k: keyof NextSunday) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/menu/jardin")}
          style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
          ← El Jardín
        </button>

        <p style={{ ...eyebrow, margin: "4px 0 2px" }}>El Jardín</p>
        <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: "0 0 20px", lineHeight: 1.25 }}>Next Sunday</h1>

        <div style={{ marginBottom: 14 }}>
          <p style={{ ...eyebrow, margin: "0 0 5px" }}>Sermon title</p>
          <input value={form.title} onChange={set("title")} placeholder="e.g. The Feeding of the Five Thousand"
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ ...eyebrow, margin: "0 0 5px" }}>Scripture</p>
          <input value={form.scripture} onChange={set("scripture")} placeholder="e.g. John 6:1-21"
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ ...eyebrow, margin: "0 0 5px" }}>Link (bulletin, livestream, etc.)</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.web_link} onChange={set("web_link")} placeholder="https://…"
              style={{ flex: 1, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
            {form.web_link.startsWith("http") && (
              <button type="button" onClick={() => openExternal(form.web_link)}
                style={{ padding: "10px 14px", borderRadius: 12, background: CARD, border: `1px solid ${CARD_B}`,
                  color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>
                Open ↗
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ ...eyebrow, margin: "0 0 5px" }}>Prep notes</p>
          <textarea value={form.notes} onChange={set("notes")} rows={5}
            placeholder="Questions, themes, things to pray about before Sunday…"
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
        </div>

        <button type="button" onClick={() => save.mutate(form)} disabled={save.isPending}
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM,
            border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
            opacity: save.isPending ? 0.6 : 1 }}>
          {saved ? "Saved ✓" : "Save"}
        </button>

        <p style={{ color: SAGE_DIM, fontSize: 12, marginTop: 14, textAlign: "center", fontFamily: FONT }}>
          One record per account — updates replace the previous week's prep.
        </p>
      </div>
    </Layout>
  );
}
