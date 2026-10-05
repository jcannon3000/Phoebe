/**
 * A LEADER'S PAGE (/with/:slug) — five questions about how someone would like to
 * pray, then their name and email so the leader can write back. Public: no
 * account needed. The answers go to that leader's inbox (/admin/leaders), who
 * designs a routine for them and sends it by link or to their account.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { Layout } from "@/components/layout";

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

const QUESTIONS: { key: "morning" | "evening" | "connect" | "format" | "grow"; title: string; hint: string; placeholder: string }[] = [
  { key: "morning", title: "How do you pray, or how would you like to pray, in the morning?",
    hint: "A few quiet minutes, a short reading, the Daily Office, nothing at all — whatever is true for you.",
    placeholder: "In the morning I'd like to…" },
  { key: "evening", title: "How do you pray, or how would you like to pray, in the evening?",
    hint: "The end of the day can look very different from its beginning.",
    placeholder: "In the evening I'd like to…" },
  { key: "connect", title: "How do you best connect with God?",
    hint: "Silence, scripture, music, walking, other people, being outdoors, writing…",
    placeholder: "I feel closest to God when…" },
  { key: "format", title: "What content format works best for you?",
    hint: "Reading on the screen, listening on the way to work, watching, something in your hands…",
    placeholder: "I'd rather…" },
  { key: "grow", title: "How would you like to grow in your prayer life?",
    hint: "Say it however it comes. There is no wrong answer.",
    placeholder: "I'd like to…" },
];

const NQ = QUESTIONS.length; // the written questions; then reflections, then the account step, then thanks
const STEP_NEWS = NQ + 1, STEP_ACCOUNT = NQ + 2, STEP_THANKS = NQ + 3, TOTAL = NQ + 1;

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
  const [answers, setAnswers] = useState({ morning: "", evening: "", connect: "", format: "", grow: "" });
  const [newsletters, setNewsletters] = useState<string[]>([]);
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [sending, setSending] = useState(false);
  const [sentName, setSentName] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Their answers wait in this browser while they make an account, so signing up
  // does not mean starting over. (Wrapped: storage can be blocked.)
  const draftKey = `phoebe:leader-draft:${slug}`;
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { answers?: typeof answers; newsletters?: string[] };
      if (d.answers) setAnswers((a) => ({ ...a, ...d.answers }));
      if (Array.isArray(d.newsletters)) setNewsletters(d.newsletters);
      if (new URLSearchParams(window.location.search).get("resume") === "1") setStep(STEP_ACCOUNT);
    } catch { /* no draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function saveDraft() {
    try { localStorage.setItem(draftKey, JSON.stringify({ answers, newsletters })); } catch { /* blocked */ }
  }

  // The same full-screen leaf the customizer sits on, picked once so it can't reshuffle between steps.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const wrap: React.CSSProperties = {
    minHeight: "var(--app-dvh)", display: "flex", flexDirection: "column",
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
  // Leaf backdrop + a frosted panel, like every other screen. Closing (the X) goes home.
  const shell = (children: ReactNode) => (
    <Layout bgPhoto={leaf} chromeless onClose={() => setLocation("/dashboard")}>
      <div style={wrap}>
        <div style={{ ...card, padding: 24, borderRadius: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
      </div>
    </Layout>
  );

  if (isLoading) return shell(<p style={{ color: SAGE, fontFamily: FONT, textAlign: "center" }}>Loading…</p>);
  if (isError || !profile) {
    return shell(<>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: WARM, fontFamily: FONT }}>This page isn't available</h1>
      <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT }}>Double-check the link you were sent.</p>
      <button type="button" onClick={() => setLocation("/dashboard")} style={primary}>Done</button>
    </>);
  }

  const hasAccount = !!user && !user.isAnonymous;
  const back = encodeURIComponent(`/with/${slug}?resume=1`);

  async function submit() {
    setSending(true); setError(null);
    try {
      const r = await apiRequest<{ name?: string; email?: string }>("POST", `/api/leaders/${encodeURIComponent(slug ?? "")}/intake`, {
        ...answers, newsletters,
      });
      setSentName(r?.name ?? user?.name ?? ""); setSentEmail(r?.email ?? user?.email ?? "");
      try { localStorage.removeItem(draftKey); } catch { /* blocked */ }
      setStep(STEP_THANKS);
    } catch (e) {
      setError(String((e as Error)?.message ?? "").includes("account_required")
        ? "Please sign in first, then send."
        : "That didn't go through. Please check your connection and try again.");
    } finally { setSending(false); }
  }

  const q = step >= 1 && step <= NQ ? QUESTIONS[step - 1] : null;

  return shell(<>
      {step === 0 && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>A rhythm for you 🌿</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.2 }}>
          Have {profile.displayName.trim().split(/\s+/)[0]} design a routine for you
        </h1>
        <p style={{ fontSize: 15, color: "rgba(240,237,230,0.9)", fontFamily: FONT, lineHeight: 1.5 }}>
          {profile.welcome?.trim() || "Tell me a little about how you'd like to pray, and I'll put together a daily rhythm for you."}
        </p>
        <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT }}>{TOTAL} short questions. It takes about three minutes.</p>
        <button type="button" onClick={() => setStep(1)} style={primary}>Begin</button>
      </>)}

      {q && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>Question {step} of {TOTAL}</p>
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

      {step === STEP_NEWS && (<>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT }}>Question {TOTAL} of {TOTAL}</p>
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
          <button type="button" onClick={() => setStep(NQ)} style={{ ...primary, background: "transparent" }}>Back</button>
          <button type="button" onClick={() => setStep(STEP_ACCOUNT)} style={{ ...primary, flex: 1 }}>Next</button>
        </div>
      </>)}

      {step === STEP_ACCOUNT && (<>
        <h1 style={{ fontSize: 23, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
          {hasAccount ? `Send this to ${profile.displayName}` : "Make an account to receive your rhythm"}
        </h1>
        {authLoading ? (
          <p style={{ color: SAGE, fontFamily: FONT }}>One moment…</p>
        ) : hasAccount ? (<>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, lineHeight: 1.45 }}>
            {profile.displayName} will see your answers and your email, and send the rhythm they make for you to your Phoebe account and to <strong style={{ color: WARM }}>{user?.email}</strong>.
          </p>
          {error && <p style={{ color: "#e87a7a", fontSize: 13.5, fontFamily: FONT }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setStep(STEP_NEWS)} style={{ ...primary, background: "transparent" }}>Back</button>
            <button type="button" disabled={sending} onClick={submit} style={{ ...primary, flex: 1, opacity: sending ? 0.6 : 1 }}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </>) : (<>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, lineHeight: 1.45 }}>
            Your rhythm will arrive in your account and by email. Your answers are saved here while you sign up.
          </p>
          <button type="button" onClick={() => { saveDraft(); setLocation(`/signin?mode=signup&redirect=${back}`); }} style={primary}>Create an account</button>
          <button type="button" onClick={() => { saveDraft(); setLocation(`/signin?redirect=${back}`); }}
            style={{ ...primary, background: "transparent", fontWeight: 600 }}>I already have an account</button>
          <button type="button" onClick={() => setStep(STEP_NEWS)} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>Back</button>
        </>)}
      </>)}

      {step === STEP_THANKS && (<>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.22 }}>Thank you{sentName ? `, ${sentName.trim().split(" ")[0]}` : ""}.</h1>
        <p style={{ fontSize: 15, color: "rgba(240,237,230,0.9)", fontFamily: FONT, lineHeight: 1.55 }}>
          {profile.displayName} will read what you wrote and put together a rhythm for you. It will arrive in your Phoebe account{sentEmail ? ` and at ${sentEmail}` : ""}.
        </p>
        <button type="button" onClick={() => setLocation("/dashboard")} style={primary}>Done</button>
      </>)}
  </>);
}
