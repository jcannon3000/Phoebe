import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { clearDailyCompletionFlags } from "@/lib/completionReset";
import { motion } from "framer-motion";

// ── Public, no-login Letters signup ──────────────────────────────────────────
//
// A visitor lands on /write, reads what Letters is about, and creates a
// free account dedicated to slow correspondence. Under the hood we use
// the same /api/auth/register endpoint as /pray with officesOnly = true
// — the offices-only tier already allows Letters (see routes/index.ts
// blocked-prefix list). The user lands on /letters after signup and
// discovers Daily Offices through the menu if they want it.
//
// Parallel to public-prayer.tsx but a single-screen flow: hero →
// signup → done. No liturgy to pray first.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const BRIGHT_SAGE = "#6FAF85";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Phase = "hero" | "signup" | "done";

export default function PublicLettersPage() {
  const [phase, setPhase] = useState<Phase>("hero");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      {phase === "hero" && <HeroScreen onStart={() => setPhase("signup")} />}
      {phase === "signup" && (
        <SignupStep
          onBack={() => setPhase("hero")}
          onDone={() => setPhase("done")}
        />
      )}
      {phase === "done" && <DoneStep />}
    </div>
  );
}

// ── Hero / framing screen ────────────────────────────────────────────────────

function HeroScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md flex flex-col items-center text-center"
      style={{ gap: 20 }}
    >
      <div className="text-5xl">📮</div>
      <h1
        className="text-[34px] font-bold leading-[1.1]"
        style={{ color: WARM_TEXT, letterSpacing: "-0.025em" }}
      >
        A slower way to keep up with the people who matter.
      </h1>
      <p
        className="text-[16px] leading-relaxed"
        style={{ color: SAGE, maxWidth: 380 }}
      >
        Phoebe Letters is a quiet rhythm of real correspondence —
        about one exchange every couple of weeks. No feeds. No
        notifications begging for attention. Just a letter, when
        there&rsquo;s something worth saying.
      </p>

      <div
        className="w-full mt-2 rounded-2xl px-5 py-4 text-left"
        style={{
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.20)",
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2"
          style={{ color: BRIGHT_SAGE }}
        >
          How it works
        </p>
        <ul className="space-y-2 text-[14px] leading-relaxed" style={{ color: WARM_TEXT }}>
          <li>📝 You write to a friend by their email.</li>
          <li>📬 They get a letter — even if they&rsquo;re not on Phoebe yet.</li>
          <li>⏳ A week later, the window opens for them to reply.</li>
          <li>🌿 The back and forth keeps its own gentle rhythm.</li>
        </ul>
      </div>

      <button
        onClick={onStart}
        className="px-9 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-3"
        style={{ background: BUTTON_BG, color: WARM_TEXT }}
      >
        Start writing →
      </button>

      <Link
        href="/"
        className="text-[13px] font-medium mt-2 transition-opacity hover:opacity-80"
        style={{ color: FAINT }}
      >
        Already have an account? Sign in
      </Link>
    </motion.div>
  );
}

// ── Signup form ──────────────────────────────────────────────────────────────

function SignupStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setExistingAccount(false);
    if (website.trim().length > 0) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (!name.trim()) { setError("Your name is required."); return; }
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Choose a password of at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      // Creates an offices-only account (officesOnly = true). The
      // offices-only tier already allows Letters; the new user can
      // also discover the Daily Office through the side menu.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          officesOnly: true,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        clearDailyCompletionFlags();
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        onDone();
      } else if (res.status === 400 && typeof data.error === "string" && /already exists/i.test(data.error)) {
        setExistingAccount(true);
      } else {
        setError(typeof data.error === "string" ? data.error : "Couldn't create your account. Please try again.");
      }
    } catch {
      setError("Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: "#0F2818",
    color: WARM_TEXT,
    border: "1px solid rgba(46,107,64,0.25)",
  } as const;

  if (existingAccount) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col items-center text-center"
        style={{ gap: 16 }}
      >
        <div className="text-4xl">📮</div>
        <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          You already have an account.
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          That email is already with Phoebe — sign in to keep writing.
        </p>
        <button
          onClick={() => setLocation("/")}
          className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
          style={{ background: BUTTON_BG, color: WARM_TEXT }}
        >
          Go to sign in
        </button>
        <button
          onClick={() => setExistingAccount(false)}
          className="text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ color: FAINT, background: "transparent", border: "none", cursor: "pointer" }}
        >
          Use a different email
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm flex flex-col"
    >
      <div className="text-center mb-7">
        <div className="text-4xl mb-3">📮</div>
        <h2 className="text-[26px] font-bold leading-snug mb-2" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          Your first letter, in a minute.
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          Make a free account and start writing.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
          style={inputStyle}
          autoComplete="name"
          disabled={submitting}
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
          style={inputStyle}
          autoComplete="email"
          disabled={submitting}
        />
        <input
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
          style={inputStyle}
          autoComplete="new-password"
          disabled={submitting}
        />
        {/* Honeypot — bots fill hidden fields; humans never see this. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
        {error && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 flex items-center justify-center"
          style={{ background: BUTTON_BG, color: WARM_TEXT }}
        >
          {submitting ? (
            <span className="w-4 h-4 rounded-full border-2 border-[#F0EDE6] border-t-transparent animate-spin" />
          ) : (
            "Create my account"
          )}
        </button>
      </form>

      <button
        onClick={onBack}
        className="text-[13px] font-medium mt-5 self-center transition-opacity hover:opacity-80"
        style={{ color: FAINT, background: "transparent", border: "none", cursor: "pointer" }}
      >
        ← Back
      </button>
    </motion.div>
  );
}

// ── Done screen ──────────────────────────────────────────────────────────────

function DoneStep() {
  const [, setLocation] = useLocation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm flex flex-col items-center text-center"
      style={{ gap: 18 }}
    >
      <div className="text-5xl">📮</div>
      <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
        Welcome to Phoebe.
      </h2>
      <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
        Your account is ready. Time to write your first letter — to anyone, anywhere. They don&rsquo;t need to be on Phoebe yet.
      </p>
      <button
        onClick={() => setLocation("/letters")}
        className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
        style={{ background: BUTTON_BG, color: WARM_TEXT }}
      >
        Write a letter →
      </button>
    </motion.div>
  );
}
