import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ─── Fellows invite link landing — /fellow/:token ────────────────────────────
// Someone shared their "be my fellow" link. Two paths:
//   • Signed in   → a quiet "Become fellows with <name>" accept card (auto-
//                   accepts when they've just come back from signing up).
//   • Signed out  → a 7-page onboarding deck that explains Phoebe, the daily
//                   practice, and the Fellows feature, gathers the two fellows
//                   settings, then stashes the token + prefs and sends them to
//                   create an account. After signup PendingFellowInviteRedirect
//                   (in App.tsx) brings them back here to finish the link.
// "Presence, not performance" — the copy never frames fellows as a scoreboard.

const PENDING_TOKEN_KEY = "phoebe:pending-fellow-invite";
const PENDING_PREFS_KEY = "phoebe:pending-fellow-prefs";
const BG = "#0C1F12";
const haptic = (style: string) => { try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style } })); } catch { /* ignore */ } };

interface InviteData {
  inviter: { id: number; name: string | null; avatarUrl: string | null };
  isSelf: boolean;
  alreadyFellows: boolean;
}

function firstName(n: string | null | undefined): string {
  return (n ?? "").trim().split(/\s+/)[0] || "a friend";
}
function initials(n: string | null | undefined): string {
  return (n ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?";
}

function Avatar({ url, name, size = 96 }: { url: string | null; name: string | null; size?: number }) {
  return url ? (
    <img src={url} alt={firstName(name)} style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", border: "2px solid rgba(108,168,224,0.45)", backgroundColor: "#1A4A2E" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, fontWeight: 600, color: "#A8C5A0", background: "#1A4A2E", border: "2px solid rgba(108,168,224,0.45)", fontFamily: "'Space Grotesk', sans-serif" }}>
      {initials(name)}
    </div>
  );
}

// Three quiet blue lights — the Fellows presence glyph, shown in the explainer.
function ThreeLights({ lit = [true, true, false] as boolean[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 9 }} aria-hidden>
      {lit.map((on, i) => (
        <span key={i} style={{ width: 13, height: 13, borderRadius: 999, background: on ? "#6CA8E0" : "transparent", border: on ? "none" : "1.5px solid rgba(108,168,224,0.45)", boxShadow: on ? "0 0 8px rgba(108,168,224,0.6)" : "none" }} />
      ))}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "calc(var(--safe-top, 0px) + 28px) 24px calc(env(safe-area-inset-bottom, 0px) + 28px)", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "radial-gradient(120% 80% at 50% 0%, rgba(46,107,64,0.18) 0%, rgba(8,18,12,0) 60%)" }} />
      {children}
    </div>
  );
}

export default function FellowInvitePage() {
  const [, params] = useRoute("/fellow/:token");
  const token = params?.token ?? "";
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<InviteData>({
    queryKey: ["/api/fellows/invite-link", token],
    queryFn: () => apiRequest("GET", `/api/fellows/invite-link/${token}`),
    enabled: /^[a-f0-9]{32}$/i.test(token),
    retry: false,
  });

  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const autoTriedRef = useRef(false);

  const inviter = data?.inviter ?? null;
  const name = firstName(inviter?.name);

  // Read any stashed prefs from slide 6 (set while signed out) so we can apply
  // them once the link is accepted.
  const applyStashedPrefs = async (fellowUserId: number) => {
    let prefs: { samePlace?: boolean; shareProgress?: boolean } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw);
    } catch { /* ignore */ }
    if (prefs && (prefs.samePlace !== undefined || prefs.shareProgress !== undefined)) {
      await apiRequest("PATCH", `/api/fellow-prefs/${fellowUserId}`, prefs).catch(() => undefined);
    }
    try { localStorage.removeItem(PENDING_PREFS_KEY); } catch { /* ignore */ }
  };

  const accept = async () => {
    if (accepting || accepted) return;
    setAccepting(true);
    try {
      const r = await apiRequest("POST", `/api/fellows/invite-link/${token}/accept`) as { status?: string; fellowUserId?: number };
      try { localStorage.removeItem(PENDING_TOKEN_KEY); } catch { /* ignore */ }
      if (r?.status === "self") { setAccepting(false); return; }
      if (typeof r?.fellowUserId === "number") await applyStashedPrefs(r.fellowUserId);
      qc.invalidateQueries({ queryKey: ["/api/fellows"] });
      qc.invalidateQueries({ queryKey: ["/api/fellow-prefs"] });
      haptic("success");
      setAccepted(true);
      setTimeout(() => setLocation("/people"), 1100);
    } catch {
      setAccepting(false);
    }
  };

  // Auto-accept when a signed-in user lands here with a matching stashed token
  // (they just came back from signing up via PendingFellowInviteRedirect).
  useEffect(() => {
    if (autoTriedRef.current) return;
    if (authLoading || !user || !data) return;
    if (data.isSelf || data.alreadyFellows) return;
    let stashed: string | null = null;
    try { stashed = localStorage.getItem(PENDING_TOKEN_KEY); } catch { /* ignore */ }
    if (stashed === token) { autoTriedRef.current = true; void accept(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, data, token]);

  // ── Loading / invalid ──────────────────────────────────────────────────────
  if (!/^[a-f0-9]{32}$/i.test(token) || isError) {
    return (
      <Shell>
        <p style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, textAlign: "center", maxWidth: 340 }}>
          This invite link is no longer valid.
        </p>
        <button type="button" onClick={() => setLocation("/")} style={pillStyle}>Open Phoebe</button>
      </Shell>
    );
  }
  if (isLoading || authLoading || !inviter) {
    return <Shell><Loader2 size={26} color="#8FAF96" style={{ animation: "spin 1s linear infinite" }} /><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></Shell>;
  }

  // ── Signed in → accept card ─────────────────────────────────────────────────
  if (user) {
    if (data?.isSelf) {
      return (
        <Shell>
          <Avatar url={user.avatarUrl} name={user.name} />
          <h1 style={titleStyle}>This is your invite link</h1>
          <p style={subStyle}>Share it with someone you'd like to pray alongside — when they open it, you'll become fellows.</p>
          <button type="button" onClick={() => setLocation("/people")} style={pillStyle}>Done</button>
        </Shell>
      );
    }
    if (accepted || data?.alreadyFellows) {
      return (
        <Shell>
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} style={{ width: 84, height: 84, borderRadius: 999, background: "rgba(108,168,224,0.18)", border: "2px solid rgba(108,168,224,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={40} color="#6CA8E0" />
          </motion.div>
          <h1 style={titleStyle}>You're fellows with {name}</h1>
          <p style={subStyle}>You'll see each other's quiet daily lights — and hold one another in prayer.</p>
          <button type="button" onClick={() => setLocation("/people")} style={pillStyle}>See {name} →</button>
        </Shell>
      );
    }
    return (
      <Shell>
        <Avatar url={inviter.avatarUrl} name={inviter.name} />
        <h1 style={titleStyle}>{name} invited you to be fellows</h1>
        <p style={subStyle}>Fellows are the few you pray alongside on Phoebe — a quiet sense that you're not praying alone.</p>
        <button type="button" onClick={accept} disabled={accepting} style={{ ...pillStyle, opacity: accepting ? 0.6 : 1 }}>
          {accepting ? "Becoming fellows…" : `Become fellows with ${name}`}
        </button>
        <button type="button" onClick={() => setLocation("/people")} style={ghostStyle}>Not now</button>
      </Shell>
    );
  }

  // ── Signed out → the 7-page onboarding deck ─────────────────────────────────
  return <FellowOnboardingDeck token={token} inviter={inviter} setLocation={setLocation} />;
}

// The deck shown to a not-yet-signed-up recipient. Seven slides: welcome, what
// Phoebe is, the daily practice, the Fellows feature, the three lights,
// presence-not-performance, then the two fellows settings + create-account.
function FellowOnboardingDeck({ token, inviter, setLocation }: { token: string; inviter: InviteData["inviter"]; setLocation: (to: string) => void }) {
  const name = firstName(inviter.name);
  const [i, setI] = useState(0);
  const [samePlace, setSamePlace] = useState<boolean | null>(null);
  const [shareProgress, setShareProgress] = useState<boolean>(true);

  const SLIDES = 7;
  const next = () => { haptic("light"); setI((n) => Math.min(SLIDES - 1, n + 1)); };
  const back = () => setI((n) => Math.max(0, n - 1));

  const finish = () => {
    try {
      localStorage.setItem(PENDING_TOKEN_KEY, token);
      localStorage.setItem(PENDING_PREFS_KEY, JSON.stringify({ samePlace: samePlace ?? false, shareProgress }));
    } catch { /* ignore */ }
    haptic("success");
    setLocation("/signin");
  };

  const slide = (() => {
    switch (i) {
      case 0:
        return (
          <Center key={0}>
            <Avatar url={inviter.avatarUrl} name={inviter.name} size={104} />
            <h1 style={titleStyle}>{name} invited you to pray together</h1>
            <p style={subStyle}>Welcome to Phoebe — a quiet companion for daily prayer. Let's take a moment to show you around.</p>
          </Center>
        );
      case 1:
        return (
          <Center key={1}>
            <div style={emojiStyle}>🕊️</div>
            <h1 style={titleStyle}>What Phoebe is</h1>
            <p style={subStyle}>Phoebe carries you through the day in prayer — morning and evening, in the gentle rhythm of the Book of Common Prayer. No noise, no feed. Just a place to pray.</p>
          </Center>
        );
      case 2:
        return (
          <Center key={2}>
            <div style={emojiStyle}>🌿</div>
            <h1 style={titleStyle}>A simple daily rhythm</h1>
            <p style={subStyle}>You're given a gentle starting shape — a morning devotion, a short reflection, an evening prayer. Each one is a card on your home; pray it and it's kept. Every day, you begin again.</p>
          </Center>
        );
      case 3:
        return (
          <Center key={3}>
            <div style={emojiStyle}>🤝</div>
            <h1 style={titleStyle}>Praying alongside fellows</h1>
            <p style={subStyle}>Fellows are the few you pray beside — like {name}. Not followers, not a feed, not a scoreboard. Just a small circle that knows you're walking the same road.</p>
          </Center>
        );
      case 4:
        return (
          <Center key={4}>
            <ThreeLights />
            <h1 style={{ ...titleStyle, marginTop: 22 }}>Three quiet lights</h1>
            <p style={subStyle}>For each fellow you'll see three soft lights for the day — whether they turned toward God, learned, and prayed. That's all. No numbers, no streaks, no ranking.</p>
          </Center>
        );
      case 5:
        return (
          <Center key={5}>
            <div style={emojiStyle}>🙏</div>
            <h1 style={titleStyle}>Presence, not performance</h1>
            <p style={subStyle}>If a fellow's lights are quiet, it isn't a nudge to correct them — it's an invitation to hold them in prayer. Phoebe never tells anyone you're "behind."</p>
          </Center>
        );
      case 6:
        return (
          <Center key={6}>
            <h1 style={{ ...titleStyle, marginTop: 0 }}>A couple of small choices</h1>
            <p style={{ ...subStyle, marginBottom: 22 }}>For praying with {name}:</p>
            <SettingRow label={`Do you and ${name} live near each other?`}>
              <YesNo value={samePlace} onPick={setSamePlace} />
            </SettingRow>
            <SettingRow label={`Let ${name} see your daily prayer rhythm?`}>
              <YesNo value={shareProgress} onPick={setShareProgress} />
            </SettingRow>
            <p style={{ ...subStyle, fontSize: 13.5, opacity: 0.75, marginTop: 18 }}>You can change these anytime — and only ever your own.</p>
          </Center>
        );
      default:
        return null;
    }
  })();

  const onLastBeforeFinish = i === SLIDES - 1;

  return (
    <Shell>
      {/* progress bar */}
      <div style={{ position: "absolute", top: "calc(var(--safe-top, 0px) + 16px)", left: 24, right: 24, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
        <motion.div animate={{ width: `${((i + 1) / SLIDES) * 100}%` }} transition={{ duration: 0.35 }} style={{ height: "100%", borderRadius: 999, background: "rgba(108,168,224,0.8)" }} />
      </div>

      <AnimatePresence mode="wait">{slide}</AnimatePresence>

      <div style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)", left: 24, right: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {onLastBeforeFinish ? (
          <button type="button" onClick={finish} style={{ ...pillStyle, marginTop: 0, width: "100%", maxWidth: 360 }}>
            Create my account
          </button>
        ) : (
          <button type="button" onClick={next} style={{ ...pillStyle, marginTop: 0, width: "100%", maxWidth: 360 }}>
            Continue →
          </button>
        )}
        {i > 0 && (
          <button type="button" onClick={back} style={ghostStyle}>Back</button>
        )}
      </div>
    </Shell>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%", maxWidth: 380 }}
    >
      {children}
    </motion.div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: 360, marginBottom: 14, padding: "16px 18px", borderRadius: 18, background: "rgba(46,107,64,0.16)", border: "1px solid rgba(46,107,64,0.32)", textAlign: "left" }}>
      <p style={{ color: "#E8EDE3", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15.5, fontWeight: 500, marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  );
}

function YesNo({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  const opt = (v: boolean, label: string) => {
    const on = value === v;
    return (
      <button type="button" onClick={() => { haptic("light"); onPick(v); }} style={{ flex: 1, padding: "10px 0", borderRadius: 12, fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", color: on ? "#0C1F12" : "#C8D4C0", background: on ? "#6CA8E0" : "transparent", border: on ? "1px solid #6CA8E0" : "1px solid rgba(143,175,150,0.4)" }}>
        {label}
      </button>
    );
  };
  return <div style={{ display: "flex", gap: 10 }}>{opt(true, "Yes")}{opt(false, "No")}</div>;
}

const titleStyle: React.CSSProperties = { color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 25, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2, margin: "22px 0 14px", maxWidth: 340 };
const subStyle: React.CSSProperties = { color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, lineHeight: 1.55, maxWidth: 340 };
const emojiStyle: React.CSSProperties = { fontSize: 52, lineHeight: 1 };
const pillStyle: React.CSSProperties = { marginTop: 30, background: "rgba(108,168,224,0.92)", color: "#0C1F12", border: "none", borderRadius: 999, padding: "14px 30px", fontSize: 16.5, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" };
const ghostStyle: React.CSSProperties = { marginTop: 4, background: "none", border: "none", color: "rgba(143,175,150,0.8)", fontSize: 14.5, fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" };
