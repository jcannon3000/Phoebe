/**
 * ONE RESPONSE: what a person answered on a leader's page, and the door to
 * design their routine. "Start designing routine" opens the guided interview
 * seeded with their answers; finishing it sends the routine to their phone and
 * email (prescribe-routine.tsx), and shows the link here too.
 */
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD: React.CSSProperties = {
  background: "rgba(9,26,16,0.5)", border: "1px solid rgba(46,107,64,0.35)", borderRadius: 16, padding: 16,
};
const PRIMARY: React.CSSProperties = {
  background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)",
  borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
};
const NEWSLETTER_LABELS: Record<string, string> = {
  cac: "Daily Meditation (CAC)", fdd: "Forward Day by Day", ssje: "SSJE", vts: "Dean's Commentary",
  nouwen: "Nouwen Daily Devotion", payg: "Pray As You Go", taizeprayer: "Taizé Daily Prayer",
};

type Intake = {
  id: number; name: string; email: string; morning: string; evening: string; connect: string; format: string; grow: string;
  newsletters: string[]; status: "new" | "crafted" | "sent"; createdAt: string; prescribedRoutineId: number | null;
};

export default function AdminLeaderIntakePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leaf = LEAF_PHOTOS[0];
  const { data, isLoading, isError } = useQuery<{ intake: Intake }>({
    queryKey: ["/api/leader/intakes", id],
    queryFn: () => apiRequest("GET", `/api/leader/intakes/${id}`),
    retry: false,
  });
  const [note, setNote] = useState<string | null>(null);
  const i = data?.intake;

  const design = () =>
    setLocation(`/routine-interview?prescribe=1&intake=${id}&from=${encodeURIComponent(`/prescribe?intake=${id}`)}`);

  async function resend() {
    setNote(null);
    try {
      const r = await apiRequest("POST", `/api/leader/intakes/${id}/send`, {}) as { emailed?: boolean; pushed?: boolean };
      setNote(`${r.emailed ? "Emailed" : "Email did not go through"}${r.pushed ? " · phone notified" : ""}.`);
      await qc.invalidateQueries({ queryKey: ["/api/leader/intakes"] });
    } catch { setNote("Couldn't send. Try again."); }
  }

  return (
    <Layout bgPhoto={leaf} chromeless onClose={() => setLocation("/admin/leaders")}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(var(--safe-top, 0px) + 56px) 18px 60px", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
        {isLoading && <p style={{ color: SAGE }}>Loading…</p>}
        {isError && <p style={{ color: SAGE }}>That response wasn't found.</p>}
        {i && (<>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM }}>{i.name}</h1>
            <a href={`mailto:${i.email}`} style={{ color: SAGE, fontSize: 14, wordBreak: "break-all" }}>{i.email}</a>
            <p style={{ fontSize: 12.5, color: SAGE, marginTop: 4 }}>Answered {new Date(i.createdAt).toLocaleDateString()}</p>
          </div>

          {([
            ["How do you pray, or how would you like to pray, in the morning?", i.morning],
            ["How do you pray, or how would you like to pray, in the evening?", i.evening],
            ["How do you best connect with God?", i.connect],
            ["What content format works best for you?", i.format],
            ["How would you like to grow in your prayer life?", i.grow],
          ] as const).map(([q, a]) => (
            <div key={q} style={CARD}>
              <p style={{ fontSize: 13, color: SAGE, marginBottom: 6 }}>{q}</p>
              <p style={{ fontSize: 15, color: a ? WARM : "rgba(143,175,150,0.5)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a || "No answer"}</p>
            </div>
          ))}
          <div style={CARD}>
            <p style={{ fontSize: 13, color: SAGE, marginBottom: 6 }}>Daily reflections they'd like</p>
            <p style={{ fontSize: 15, color: i.newsletters.length ? WARM : "rgba(143,175,150,0.5)", lineHeight: 1.5 }}>
              {i.newsletters.length ? i.newsletters.map((k) => NEWSLETTER_LABELS[k] ?? k).join(" · ") : "None chosen"}
            </p>
          </div>

          <button type="button" onClick={design} style={PRIMARY}>
            {i.prescribedRoutineId ? "Design a new routine" : "Start designing routine"}
          </button>
          {i.prescribedRoutineId && (
            <button type="button" onClick={resend}
              style={{ ...PRIMARY, background: "transparent", fontWeight: 600, border: "1px solid rgba(143,175,150,0.35)" }}>
              Send the routine again
            </button>
          )}
          {note && <p style={{ fontSize: 13.5, color: SAGE }}>{note}</p>}
        </>)}
      </div>
    </Layout>
  );
}
