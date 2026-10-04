/**
 * A LEADER'S PAGE (/with/:slug) — five questions about how someone would like to
 * pray, then their name and email so the leader can write back. Public: no
 * account needed. The answers go to that leader's inbox (/admin/leaders), who
 * designs a routine for them and sends it by link or to their account.
 */
import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const NEWSLETTER_LABELS: Record<string, string> = {
  cac: "Daily Meditation — Center for Action and Contemplation",
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word — SSJE",
  vts: "Dean's Commentary — Virginia Theological Seminary",
  nouwen: "Daily Devotion — Henri Nouwen Society",
  payg: "Pray As You Go",
  taizeprayer: "Taizé Daily Prayer",
};

type Profile = { displayName: string; welcome: string | null; newsletters: string[] };

const QUESTIONS: { key: "morning" | "evening" | "connect" | "grow"; title: string; hint: string; placeholder: string }[] = [
  { key: "morning", title: "How would you like to pray in the morning?",
    hint: "A few quiet minutes, a short reading, the Daily Office, nothing at all — whatever is true for you.",
    placeholder: "In the morning I'd like to…" },
  { key: "evening", title: "How would you like to pray in the evening?",
    hint: "The end of the day can look very different from its beginning.",
    placeholder: "In the evening I'd like to…" },
  { key: "connect", title: "How do you best connect with God?",
    hint: "Silence, scripture, music, walking, other people, being outdoors, writing…",
    placeholder: "I feel closest to God when…" },
  { key: "grow", title: "How would you like to grow in your prayer life?",
    hint: "Say it however it comes. There is no wrong answer.",
    placeholder: "I'd like to…" },
];

export default function LeaderPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: profile, isLoading, isError } = useQuery<Profile>({
    queryKey: ["/api/leaders", slug],
    queryFn: () => apiRequest("GET", `/api/leaders/${encodeURIComponent(slug ?? "")}`),
    enabled: !!slug,
    retry: false,
  });

  // 0 = welcome, 1-4 = the four written questions, 5 = newsletters, 6 = who you are, 7 = thanks
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ morning: "", evening: "", connect: "", grow: "" });
  const [newsletters, setNewsletters] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaf = LEAF_PHOTOS[0];
  const wrap: React.CSSProperties = {
    position: "relative", minHeight: "var(--app-dvh)", display: "flex", flexDirection: "column",
    justifyContent: "center", gap: 16, maxWidth: 480, margin: "0 auto",
    padding: "calc(var(--safe-top, 0px) + 28px) 22px calc(env(safe-area-inset-bottom, 0px) + 28px)",
  };
  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.5)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.35)", borderRadius: 18, padding: 18,
  };
  const primary: React.CSSProperties = {
    background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)",
    borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
  };
  const field: React.CSSProperties = {
    width: "100%", background: "rgba(200,212,192,0.07)", border: "1px solid rgba(46,107,64,0.4)",
    borderRadius: 12, padding: "14px 16px", color: WARM, fontSize: 16, fontFamily: FONT, outline: "none",
  };
  const Backdrop = () => (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, backgroundColor: "#091A10",
      backgroundImage: leaf ? `url(${leaf})` : undefined, backgroundSize: "cover", backgroundPosition: "center", opacity: leaf ? 0.5 : 1 }} />
  );

  if (isLoading) return <div style={wrap}><Backdrop /><p style={{ color: SAGE, fontFamily: FONT, textAlign: "center" }}>Loading…</p></div>;
  if (isError || !profile) {
    return (
      <div style={wrap}><Backdrop />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: WARM, fontFamily: FONT }}>This page isn't available</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT }}>Double-check the link you were sent.</p>
      </div>
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const canSend = name.trim().length > 0 && emailOk && !sending;

  async function submit() {
    setSending(true); setError(null);
    try {
      await apiRequest("POST", `/api/leaders/${encodeURIComponent(slug ?? "")}/intake`, {
        ...answers, newsletters, name: name.trim(), email: email.trim(), website,
      });
      setStep(7);
    } catch {
      setError("That didn't go through. Please check your connection and try again.");
    } finally { setSending(false); }
  }

  const q = step >= 1 && step <= 4 ? QUESTIONS[step - 1] : null;

  return (
    <div style={wrap}><Backdrop />
      {step === 0 && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>A rhythm for you 🌿</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.2 }}>
          Pray with {profile.displayName}
        </h1>
        <p style={{ fontSize: 15, color: "rgba(240,237,230,0.9)", fontFamily: FONT, lineHeight: 1.5 }}>
          {profile.welcome?.trim() || "Tell me a little about how you'd like to pray, and I'll put together a daily rhythm for you."}
        </p>
        <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT }}>Five short questions. It takes about three minutes.</p>
        <button type="button" onClick={() => setStep(1)} style={primary}>Begin</button>
      </>)}

      {q && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>Question {step} of 5</p>
        <h1 style={{ fontSize: 23, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>{q.title}</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, lineHeight: 1.45 }}>{q.hint}</p>
        <textarea
          rows={5} value={answers[q.key]} placeholder={q.placeholder}
          onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
          style={{ ...field, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => setStep(step - 1)} style={{ ...primary, background: "transparent", flex: "0 0 auto" }}>Back</button>
          <button type="button" onClick={() => setStep(step + 1)} style={{ ...primary, flex: 1 }}>Next</button>
        </div>
      </>)}

      {step === 5 && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>Question 5 of 5</p>
        <h1 style={{ fontSize: 23, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>Would you like a daily reflection to read?</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, lineHeight: 1.45 }}>Choose any that appeal to you, or none.</p>
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
          {profile.newsletters.filter((k) => NEWSLETTER_LABELS[k]).map((k) => {
            const on = newsletters.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on}
                onClick={() => setNewsletters((cur) => on ? cur.filter((x) => x !== k) : [...cur, k])}
                style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: on ? "rgba(46,107,64,0.4)" : "transparent",
                  border: "none", borderRadius: 12, padding: "13px 12px", color: WARM, fontFamily: FONT, fontSize: 15, cursor: "pointer" }}>
                <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, flex: "0 0 auto", border: "1.5px solid rgba(143,175,150,0.7)",
                  background: on ? "rgba(143,175,150,0.9)" : "transparent", color: "#091A10", fontSize: 13, lineHeight: "17px", textAlign: "center" }}>{on ? "✓" : ""}</span>
                {NEWSLETTER_LABELS[k]}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => setStep(4)} style={{ ...primary, background: "transparent" }}>Back</button>
          <button type="button" onClick={() => setStep(6)} style={{ ...primary, flex: 1 }}>Next</button>
        </div>
      </>)}

      {step === 6 && (<>
        <h1 style={{ fontSize: 23, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>Where can {profile.displayName} reach you?</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, lineHeight: 1.45 }}>Your name and email are needed so your routine can be sent to you.</p>
        <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={field} />
        <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" style={field} />
        {/* Honeypot — hidden from people, irresistible to scripts. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
        {error && <p style={{ color: "#e87a7a", fontSize: 13.5, fontFamily: FONT }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => setStep(5)} style={{ ...primary, background: "transparent" }}>Back</button>
          <button type="button" disabled={!canSend} onClick={submit} style={{ ...primary, flex: 1, opacity: canSend ? 1 : 0.5, cursor: canSend ? "pointer" : "not-allowed" }}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </>)}

      {step === 7 && (<>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.22 }}>Thank you, {name.trim().split(" ")[0]}.</h1>
        <p style={{ fontSize: 15, color: "rgba(240,237,230,0.9)", fontFamily: FONT, lineHeight: 1.55 }}>
          {profile.displayName} will read what you wrote and put together a rhythm for you. It will come to {email.trim()}.
        </p>
      </>)}
    </div>
  );
}
