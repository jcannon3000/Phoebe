import { useState } from "react";
import { Link, useLocation } from "wouter";
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
type WaitlistResult = "added" | "already" | "has-account";

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
  const [phase, setPhase] = useState<"choose" | "pray" | "finish">("choose");
  const [choice, setChoice] = useState<Choice | null>(null);

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
        <Link href="/" className="text-sm font-medium" style={{ color: SAGE }}>
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
  const [result, setResult] = useState<WaitlistResult>("added");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      {step === "invite" && (
        <HabitInvite onContinue={() => setStep("signup")} onPrayAgain={onPrayAgain} />
      )}
      {step === "signup" && (
        <SignupStep
          onBack={() => setStep("invite")}
          onDone={(r) => { setResult(r); setStep("done"); }}
        />
      )}
      {step === "done" && <DoneStep result={result} />}
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
  onDone: (r: WaitlistResult) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (website.trim().length > 0) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (!name.trim()) { setError("Your name is required."); return; }
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), source: "public-prayer" }),
      });
      const data = await res.json();
      if (data.ok) {
        onDone(data.alreadyHasAccount ? "has-account" : data.alreadyOnList ? "already" : "added");
      } else {
        setError(data.error ?? "Couldn't save your spot. Please try again.");
      }
    } catch {
      setError("Couldn't save your spot. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: "#0F2818",
    color: WARM_TEXT,
    border: "1px solid rgba(46,107,64,0.25)",
  } as const;

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
          Phoebe is rolling out by invitation. Leave your name and we'll make room for you — morning and evening prayer, and a community to pray with.
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
            "Request your invitation"
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

function DoneStep({ result }: { result: WaitlistResult }) {
  const [, setLocation] = useLocation();
  const heading = result === "has-account" ? "Welcome back." : "You're on the list.";
  const message =
    result === "has-account"
      ? "You already have a Phoebe account — sign in to keep praying."
      : result === "already"
        ? "You're already on the list. We'll be in touch when there's room."
        : "We'll be in touch when there's room — and the rhythm will be waiting for you.";

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
        {heading}
      </h2>
      <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
        {message}
      </p>
      <button
        onClick={() => setLocation("/")}
        className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
        style={
          result === "has-account"
            ? { background: BUTTON_BG, color: WARM_TEXT }
            : { background: "transparent", color: SAGE, border: "1px solid rgba(46,107,64,0.3)" }
        }
      >
        {result === "has-account" ? "Go to sign in" : "Visit Phoebe"}
      </button>
    </motion.div>
  );
}
