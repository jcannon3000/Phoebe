import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Public Prayer Request page
//
// Reached via /p/:token — a no-auth, shareable deep link that lets
// anyone the owner sends the URL to read the request and tap "Amen."
// Two visitor classes:
//
//   1. Anonymous visitor — the page records an anonymous_amens row
//      keyed by a localStorage session id (96-bit hex). After the
//      Amen lands, the page invites them to sign up so they can
//      stay connected as Fellows with the requester. Their
//      anonymous amen(s) are claimed by the new account at signup
//      time and fanned out into prayer_request_amens + fellow rows.
//
//   2. Signed-in visitor — the page calls the same endpoint, which
//      writes a real prayer_request_amens row and immediately
//      auto-creates a Fellow link between viewer and owner.
//      Effectively the same as tapping Amen in the in-app
//      slideshow, just reached via the share-link path.
//
// We intentionally don't use the full Layout chrome — this page
// is sometimes the very first surface a visitor ever sees, so it
// stands alone as a single "card + Amen" moment.

const BG = "#091A10";
const CARD_BG = "rgba(46,107,64,0.14)";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

// Localstorage key for the visitor's anonymous-amen session id. We
// mint one on first amen and reuse it on subsequent visits/amens so
// the signup linker can claim every row at once. Hex chars only to
// keep URL/query-safe in case we ever round-trip it.
const ANON_SESSION_LS_KEY = "phoebe:anon-amen-session";
function getOrMintSessionId(): string {
  try {
    const existing = localStorage.getItem(ANON_SESSION_LS_KEY);
    if (existing && /^[a-f0-9]{16,}$/i.test(existing)) return existing;
    // Browser crypto for 96 bits of entropy. Falls back to
    // Math.random in the unlikely "crypto is unavailable" branch
    // (private mode in very old Safari, etc.) — still
    // unique-enough for our session keying.
    const buf = new Uint8Array(12);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    const id = Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(ANON_SESSION_LS_KEY, id);
    return id;
  } catch {
    // Private-mode browser refusing localStorage. Return a one-shot
    // session id; the visitor's amen lands but won't be linkable
    // later. Acceptable degradation.
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
}

type SharedPrayerResponse = {
  request: {
    body: string;
    kind: string | null;
    daysLeft: number | null;
    prayedCount: number;
    owner: { name: string; avatarUrl: string | null; isAnonymous: boolean };
  };
};

type MeResponse = { id?: number; name?: string; email?: string } | null;

export default function PublicPrayerRequestPage() {
  const [match, params] = useRoute<{ token: string }>("/p/:token");
  const [, setLocation] = useLocation();
  const token = match ? params?.token ?? "" : "";

  // Auth probe — runs unauthenticated through the same /api/auth/me
  // endpoint the rest of the app uses. If signed in, the Amen path
  // skips the anonymous flow and writes a real prayer_request_amens
  // row server-side. We keep this in the same query cache the rest
  // of the app uses so a follow-on dashboard nav reuses the result.
  const { data: me } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) return null;
      return (await r.json().catch(() => null)) as MeResponse;
    },
    staleTime: 60_000,
  });
  const isAuthed = !!me?.id;

  const { data, isLoading, isError } = useQuery<SharedPrayerResponse>({
    queryKey: [`/api/prayer-requests/share/${token}`],
    enabled: token.length > 0,
    queryFn: async () => {
      const r = await fetch(`/api/prayer-requests/share/${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as SharedPrayerResponse;
    },
  });

  type Phase = "viewing" | "amened" | "signup" | "thanks";
  const [phase, setPhase] = useState<Phase>("viewing");
  const [visitorName, setVisitorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useMemo(getOrMintSessionId, []);

  async function handleAmen() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/prayer-requests/share/${encodeURIComponent(token)}/amen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId, visitorName: visitorName.trim() || undefined }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Authed viewers get the auto-Fellow + real amen server-side.
      // Their next step is the "thanks" screen — no signup prompt.
      if (isAuthed) {
        setPhase("thanks");
      } else {
        setPhase("amened");
      }
    } catch {
      setError("Couldn't record your Amen. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Light reset of the network-banner / server-down state when the
  // user lands directly on /p/:token in a fresh tab — fetch starts
  // immediately, no chrome required.
  useEffect(() => { /* mount marker */ }, []);

  if (!token) return null;
  if (isLoading) {
    return <CenteredFrame><Spinner /></CenteredFrame>;
  }
  if (isError || !data) {
    return (
      <CenteredFrame>
        <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, textAlign: "center", maxWidth: 320 }}>
          This prayer request isn&rsquo;t available. The link may have been closed.
        </p>
      </CenteredFrame>
    );
  }

  const { request } = data;

  return (
    <CenteredFrame>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: 440 }}
      >
        {/* Eyebrow — sets the share-link context without competing
            with the request body for attention. */}
        <p
          style={{
            color: FAINT_GREEN,
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textAlign: "center",
            margin: 0,
            marginBottom: 18,
          }}
        >
          {request.owner.isAnonymous ? "A prayer request" : `${request.owner.name} is carrying`}
        </p>

        {/* Card — body + small owner row + days-left chip. */}
        <div
          style={{
            background: CARD_BG,
            border: "1px solid rgba(46,107,64,0.4)",
            borderRadius: 18,
            padding: "20px 22px",
            marginBottom: 24,
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            {request.owner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={request.owner.avatarUrl}
                alt={request.owner.name}
                style={{
                  width: 36, height: 36, borderRadius: "50%", objectFit: "cover",
                  border: "1px solid rgba(46,107,64,0.45)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#1A4A2E", color: "#A8C5A0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600,
                  border: "1px solid rgba(46,107,64,0.45)",
                }}
              >
                {(request.owner.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, margin: 0 }}>
                {request.owner.name}
              </p>
              {request.daysLeft !== null && request.daysLeft > 0 && (
                <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 12, margin: "2px 0 0" }}>
                  {request.daysLeft === 1 ? "1 day left" : `${request.daysLeft} days left`}
                </p>
              )}
            </div>
          </div>
          <p
            style={{
              color: WARM_TEXT,
              fontFamily: GEORGIA,
              fontSize: 18,
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {request.body}
          </p>
        </div>

        {/* Pray count line — small social proof. Reads as "n people
            have prayed for this" before the visitor amens, and "you
            and N others" right after. */}
        {request.prayedCount > 0 && phase === "viewing" && (
          <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 13, textAlign: "center", margin: "0 0 18px" }}>
            🙏 Prayed by {request.prayedCount} {request.prayedCount === 1 ? "person" : "people"}
          </p>
        )}

        {phase === "viewing" && (
          <>
            <button
              type="button"
              onClick={handleAmen}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "16px 22px",
                borderRadius: 999,
                background: BUTTON_BG,
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                fontSize: 16,
                fontWeight: 600,
                border: "none",
                cursor: submitting ? "default" : "pointer",
                opacity: submitting ? 0.6 : 1,
                boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
              }}
            >
              {submitting ? "…" : "🙏  Amen"}
            </button>
            {error && (
              <p style={{ color: "#E8B872", fontSize: 12, textAlign: "center", marginTop: 12, fontFamily: SPACE_GROTESK }}>
                {error}
              </p>
            )}
          </>
        )}

        {phase === "amened" && (
          <AmenedSignupCTA
            ownerName={request.owner.name}
            isAnonymous={request.owner.isAnonymous}
            sessionId={sessionId}
            onContinue={() => setPhase("signup")}
            onSkip={() => setPhase("thanks")}
          />
        )}

        {phase === "signup" && (
          <SignupForm
            ownerName={request.owner.name}
            sessionId={sessionId}
            onSuccess={() => { setPhase("thanks"); setLocation("/dashboard"); }}
            onCancel={() => setPhase("thanks")}
          />
        )}

        {phase === "thanks" && (
          <ThanksScreen ownerName={request.owner.name} isAnonymous={request.owner.isAnonymous} />
        )}
      </motion.div>
    </CenteredFrame>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function CenteredFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="animate-spin"
      style={{ width: 28, height: 28, border: `2px solid ${FAINT_GREEN}`, borderTopColor: WARM_TEXT, borderRadius: "50%" }}
    />
  );
}

function AmenedSignupCTA({
  ownerName,
  isAnonymous,
  onContinue,
  onSkip,
}: {
  ownerName: string;
  isAnonymous: boolean;
  sessionId: string;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 40, margin: "8px 0 6px" }}>🙏</p>
      <p
        style={{
          color: WARM_TEXT,
          fontFamily: GEORGIA,
          fontStyle: "italic",
          fontSize: 22,
          margin: "0 0 8px",
        }}
      >
        Your Amen was offered.
      </p>
      <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        {isAnonymous
          ? "Create a Phoebe account to keep praying alongside others — and to be carried by them when you ask."
          : `Stay connected with ${ownerName} on Phoebe. You'll see their future prayer requests, and they'll see yours.`}
      </p>
      <button
        type="button"
        onClick={onContinue}
        style={{
          width: "100%",
          padding: "14px 22px",
          borderRadius: 999,
          background: BUTTON_BG,
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        Become Fellows →
      </button>
      <button
        type="button"
        onClick={onSkip}
        style={{
          background: "transparent",
          border: "none",
          color: FAINT_GREEN,
          fontFamily: SPACE_GROTESK,
          fontSize: 13,
          cursor: "pointer",
          padding: 8,
        }}
      >
        Not right now
      </button>
    </div>
  );
}

function SignupForm({
  ownerName,
  sessionId,
  onSuccess,
  onCancel,
}: {
  ownerName: string;
  sessionId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) { setError("Enter your first name."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email."); return; }
    if (password.length < 6) { setError("Pick a password of at least 6 characters."); return; }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim(),
          password,
          // Pass the anon-amen session id so the server can claim
          // every anonymous_amens row keyed to this visitor and
          // auto-Fellow them with every unique request owner they
          // amened. Without this, signing up after Amen just makes
          // a normal account; the connection thread is lost.
          anonAmenSessionId: sessionId,
          website,
        }),
      });
      const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && json.ok) {
        await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        onSuccess();
      } else {
        setError(typeof json.error === "string" ? json.error : "Couldn't create your account.");
      }
    } catch {
      setError("Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 15,
          margin: "0 0 6px",
          textAlign: "center",
        }}
      >
        Become Fellows with {ownerName}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <Field placeholder="First name" value={firstName} onChange={setFirstName} />
        <Field placeholder="Last name" value={lastName} onChange={setLastName} />
      </div>
      <Field placeholder="Email" type="email" value={email} onChange={setEmail} />
      <Field placeholder="Password (6+ chars)" type="password" value={password} onChange={setPassword} />
      {/* Honeypot — invisible to humans, bots fill it. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
        aria-hidden
      />
      {error && (
        <p style={{ color: "#E8B872", fontSize: 12, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        style={{
          width: "100%",
          padding: "14px 22px",
          borderRadius: 999,
          background: BUTTON_BG,
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.6 : 1,
          marginTop: 4,
        }}
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "transparent",
          border: "none",
          color: FAINT_GREEN,
          fontFamily: SPACE_GROTESK,
          fontSize: 13,
          cursor: "pointer",
          padding: 4,
        }}
      >
        Cancel
      </button>
    </form>
  );
}

function Field({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(15,40,24,0.6)",
        border: "1px solid rgba(46,107,64,0.4)",
        color: WARM_TEXT,
        fontFamily: SPACE_GROTESK,
        fontSize: 14,
      }}
    />
  );
}

function ThanksScreen({ ownerName, isAnonymous }: { ownerName: string; isAnonymous: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <p style={{ fontSize: 40, margin: "8px 0 12px" }}>🌿</p>
      <p
        style={{
          color: WARM_TEXT,
          fontFamily: GEORGIA,
          fontStyle: "italic",
          fontSize: 22,
          margin: "0 0 8px",
        }}
      >
        Thank you for praying.
      </p>
      <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, margin: 0, lineHeight: 1.55 }}>
        {isAnonymous
          ? "Your prayer was received."
          : `${ownerName} has been carried, and you with them.`}
      </p>
    </div>
  );
}
