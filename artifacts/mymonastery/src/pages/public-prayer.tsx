import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { OfficeViewer, type LiturgyMode } from "./bcp-daily-office";

// ── Public, no-login prayer ──────────────────────────────────────────────────
//
// A visitor lands on /pray, chooses the Daily Office or the Daily
// Devotion, and prays the time-appropriate liturgy. The /api/office +
// /api/devotion endpoints are public — with no signed-in user they
// simply omit the personalized intercessions and serve the generic
// BCP liturgy. At the close, instead of the auth-only /prayer-mode
// recap, the visitor gets a habit invitation and a sign-up.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const BRIGHT_SAGE = "#6FAF85";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Choice = "office" | "devotion";

// Same 14:00 cutoff the Daily Office / Devotion pickers use, so the
// public page resolves to the same morning/evening variant.
function isMorningNow(): boolean {
  return new Date().getHours() < 14;
}
function resolveMode(choice: Choice): LiturgyMode {
  const morning = isMorningNow();
  if (choice === "office") return morning ? "morning" : "evening";
  return morning ? "morning-devotion" : "early-evening-devotion";
}

export default function PublicPrayerPage() {
  // ?start=office or ?start=devotion bypasses the in-page chooser and
  // drops the visitor straight into the time-appropriate liturgy. The
  // new welcome-public chooser at "/" uses ?start=office so the
  // visitor goes straight from "Morning Prayer →" to praying without
  // a second pick.
  const startParam = (() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("start");
    return p === "office" || p === "devotion" ? p as Choice : null;
  })();

  const [phase, setPhase] = useState<"choose" | "pray" | "finish">(
    startParam ? "pray" : "choose",
  );
  const [choice, setChoice] = useState<Choice | null>(startParam);

  if (phase === "pray" && choice) {
    return (
      <OfficeViewer
        mode={resolveMode(choice)}
        onBack={() => { setChoice(null); setPhase("choose"); }}
        onComplete={() => setPhase("finish")}
      />
    );
  }

  if (phase === "finish") {
    return <PublicClosing onPrayAgain={() => { setChoice(null); setPhase("choose"); }} />;
  }

  return <ChooseScreen onChoose={(c) => { setChoice(c); setPhase("pray"); }} />;
}

// ── Choose: Office vs Devotion ───────────────────────────────────────────────

function ChooseScreen({ onChoose }: { onChoose: (c: Choice) => void }) {
  const morning = isMorningNow();
  const officeVariant = morning ? "Morning Prayer" : "Evening Prayer";
  const devotionVariant = morning ? "In the Morning" : "In the Early Evening";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: SPACE_GROTESK }}>
      <header className="px-6 py-6 flex items-center justify-between">
        <span className="text-2xl font-bold" style={{ color: WARM_TEXT, letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
        <Link href="/signin" className="text-sm font-medium" style={{ color: SAGE }}>
          Sign in
        </Link>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-6 mb-8"
        >
          <h1 className="text-3xl font-bold mb-2" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
            Pause and pray.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: SAGE }}>
            A few unhurried minutes from the Book of Common Prayer — no account needed. Choose how you'd like to pray.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="space-y-3"
        >
          <ChoiceCard
            emoji="🕊️"
            title="Daily Office"
            subtitle={`${officeVariant} · the fuller traditional liturgy`}
            onClick={() => onChoose("office")}
          />
          <ChoiceCard
            emoji="🌿"
            title="Daily Devotion"
            subtitle={`${devotionVariant} · a short, gentle prayer`}
            onClick={() => onChoose("devotion")}
          />
        </motion.div>

        <p className="text-center text-xs mt-10" style={{ color: FAINT }}>
          Inspired by Monastic Wisdom
        </p>
      </main>
    </div>
  );
}

function ChoiceCard({ emoji, title, subtitle, onClick }: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
      style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base" style={{ color: WARM_TEXT }}>{title}</p>
          <p className="text-sm mt-0.5" style={{ color: SAGE }}>{subtitle}</p>
        </div>
        <span className="text-sm" style={{ color: SAGE }}>→</span>
      </div>
    </button>
  );
}

// ── Closing: habit invitation → sign-up ──────────────────────────────────────

function PublicClosing({ onPrayAgain }: { onPrayAgain: () => void }) {
  const [step, setStep] = useState<"invite" | "signup" | "done">("invite");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      {step === "invite" && (
        <HabitInvite onContinue={() => setStep("signup")} onPrayAgain={onPrayAgain} />
      )}
      {step === "signup" && (
        <SignupStep onBack={() => setStep("invite")} onDone={() => setStep("done")} />
      )}
      {step === "done" && <DoneStep />}
    </div>
  );
}

function HabitInvite({ onContinue, onPrayAgain }: {
  onContinue: () => void;
  onPrayAgain: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-sm flex flex-col items-center text-center"
      style={{ gap: 26 }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: FAINT }}>
        Amen
      </p>

      {/* A seven-dot week, one filled — the rhythm a daily habit traces. */}
      <div className="flex items-center" style={{ gap: 10 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: i === 6 ? BRIGHT_SAGE : "transparent",
              border: `1.5px solid ${i === 6 ? BRIGHT_SAGE : "rgba(143,175,150,0.3)"}`,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center" style={{ gap: 10 }}>
        <h2 className="text-[26px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          Would you like to develop a daily habit?
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          You prayed once today. Phoebe brings the rhythm back — morning and evening — and holds it alongside a community praying the same words.
        </p>
      </div>

      <button
        onClick={onContinue}
        className="px-10 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: BUTTON_BG, color: WARM_TEXT }}
      >
        Build the habit →
      </button>

      <button
        onClick={onPrayAgain}
        className="text-[13px] font-medium transition-opacity hover:opacity-80"
        style={{
          color: FAINT,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 4,
        }}
      >
        Pray again
      </button>
    </motion.div>
  );
}

function SignupStep({ onBack, onDone }: {
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
    if (!firstName.trim()) { setError("Enter your first name."); return; }
    if (!lastName.trim()) { setError("Enter your last name."); return; }
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
      // Creates a real but limited "offices-only" account and signs the
      // visitor in (the server establishes the session via req.login).
      // They can pray the daily offices and subscribe to public feeds;
      // joining a community later upgrades them to the full app.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Server stores a single `name` column; the form collects
          // first + last so the field reads more naturally. Joined here
          // so /auth/register validation and the rest of the app (which
          // assumes "First Last") keeps working unchanged.
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim(),
          password,
          officesOnly: true,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        // Refresh the auth cache so the app sees the new session before
        // the done step navigates into /parish.
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
        <div className="text-4xl">🌿</div>
        <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          You already have an account.
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          That email is already with Phoebe — sign in to keep praying.
        </p>
        <button
          onClick={() => setLocation("/signin")}
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
        <div className="text-4xl mb-3">🌿</div>
        <h2 className="text-[26px] font-bold leading-snug mb-2" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          Keep the rhythm going.
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          Create your account and the daily office will be waiting for you — morning and evening, whenever you return.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2.5">
          <input
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setError(""); }}
            className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle}
            autoComplete="given-name"
            disabled={submitting}
          />
          <input
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setError(""); }}
            className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle}
            autoComplete="family-name"
            disabled={submitting}
          />
        </div>
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
      <div className="text-5xl">🌿</div>
      <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
        Welcome to Phoebe.
      </h2>
      <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
        Your account is ready. Morning and evening, the daily office will be here for you.
      </p>
      <button
        onClick={() => setLocation("/parish")}
        className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
        style={{ background: BUTTON_BG, color: WARM_TEXT }}
      >
        Begin
      </button>
    </motion.div>
  );
}
