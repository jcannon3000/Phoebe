import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ─── Phone-shaped mockup shell ──────────────────────────────────────────────
// Ported from features-deck.tsx so the community invite slideshow shows the
// *same* visual mocks of each practice that the individual signup deck uses.
// A brand-new visitor lands on `/communities/:slug/join/:token`, sees what
// Phoebe actually looks like, and then meets the specific community.
function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] p-4 mx-auto w-full max-w-[290px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
      }}
    >
      {children}
    </div>
  );
}

function PrayerRequestsMock() {
  const requests = [
    { from: "Margaret W.", body: "For my mother, who begins treatment this week.", words: 4 },
    { from: "David R.",    body: "Discernment about the new role. Grateful for your prayers.", words: 6 },
    { from: "Anonymous",   body: "For peace in a difficult season.", words: 2 },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold shrink-0" style={{ color: "#F0EDE6" }}>
          Prayer Requests 🙏🏽
        </h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="flex gap-2 mb-4">
        <div
          className="flex-1 text-[11px] px-3 py-2 rounded-xl"
          style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)" }}
        >
          Share a prayer request... 🌿
        </div>
        <div className="px-3 py-2 rounded-xl text-xs font-medium flex items-center" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
          🙏🏽
        </div>
      </div>
      <div>
        {requests.map((r, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{ borderBottom: i < requests.length - 1 ? "1px solid rgba(200,212,192,0.1)" : "none" }}
          >
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 p-3 pl-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(200,212,192,0.45)" }}>
                  From {r.from}
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: "#F0EDE6" }}>
                  {r.body}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0" style={{ color: "rgba(143,175,150,0.55)" }}>
                <span className="text-[10px] tabular-nums">{r.words}</span>
                <MessageCircle size={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function IntercessionMock() {
  return (
    <div
      className="rounded-[28px] mx-auto w-full max-w-[290px] relative"
      style={{
        background: "#0C1F12",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        minHeight: 380,
      }}
    >
      <div
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-base"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </div>
      <div className="flex flex-col items-center text-center px-5 pt-10 pb-10">
        <p className="text-[9px] uppercase font-semibold mb-3" style={{ color: "rgba(143,175,150,0.45)", letterSpacing: "0.18em" }}>
          Your Intercession
        </p>
        <p
          className="text-[15px] leading-[1.5] font-medium italic mb-3"
          style={{ color: "#E8E4D8", fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Margaret's mother, as she begins treatment this week.
        </p>
        <p className="text-[11px] mb-2" style={{ color: "#8FAF96" }}>
          with David, Anna, James
        </p>
        <p className="text-[10px] italic mb-4" style={{ color: "rgba(143,175,150,0.55)" }}>
          Your community is holding this.
        </p>
        <div
          className="w-full rounded-xl px-3 py-3 text-left mb-4"
          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.15)" }}
        >
          <p
            className="text-[10px] leading-[1.75] italic"
            style={{ color: "#C8D4C0", fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            O Father of mercies and God of all comfort, look graciously upon this thy servant, that her weakness may be banished and her strength restored.
          </p>
          <p className="text-[7px] uppercase mt-2" style={{ color: "rgba(143,175,150,0.3)", letterSpacing: "0.14em" }}>
            From the Book of Common Prayer
          </p>
        </div>
        <div
          className="px-5 py-1.5 rounded-full text-[11px] font-medium tracking-wide"
          style={{ background: "rgba(46,107,64,0.28)", border: "1px solid rgba(46,107,64,0.5)", color: "#C8D4C0" }}
        >
          Amen →
        </div>
      </div>
    </div>
  );
}

function LectioMock() {
  const stages = [
    { id: "lectio", label: "Lectio", day: "Mon", active: false, done: true },
    { id: "meditatio", label: "Meditatio", day: "Wed", active: true, done: false },
    { id: "oratio", label: "Oratio", day: "Fri", active: false, done: false },
  ];
  return (
    <MockPhone>
      <p className="text-[9px] uppercase font-semibold mb-1" style={{ color: "rgba(143,175,150,0.55)", letterSpacing: "0.16em" }}>
        Lectio Divina 📜
      </p>
      <h2 className="text-base font-bold mb-3" style={{ color: "#F0EDE6" }}>
        The Road to Emmaus
      </h2>
      <div className="flex gap-1.5 mb-4">
        {stages.map((s) => (
          <div
            key={s.id}
            className="flex-1 rounded-lg px-2 py-1.5 text-center"
            style={{
              background: s.active ? "rgba(46,107,64,0.35)" : s.done ? "rgba(46,107,64,0.15)" : "rgba(200,212,192,0.04)",
              border: s.active ? "1px solid rgba(46,107,64,0.6)" : "1px solid rgba(200,212,192,0.08)",
            }}
          >
            <p
              className="text-[8px] uppercase tracking-widest mb-0.5"
              style={{ color: s.active ? "#C8D4C0" : s.done ? "#8FAF96" : "rgba(200,212,192,0.35)" }}
            >
              {s.day}
            </p>
            <p
              className="text-[10px] font-semibold italic"
              style={{ color: s.active ? "#F0EDE6" : s.done ? "#8FAF96" : "rgba(200,212,192,0.35)" }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl p-3 mb-3"
        style={{ background: "rgba(240,237,230,0.03)", border: "1px solid rgba(46,107,64,0.25)" }}
      >
        <p className="text-[10px] uppercase mb-1.5" style={{ color: "rgba(143,175,150,0.55)", letterSpacing: "0.12em" }}>
          Luke 24:13–35
        </p>
        <p
          className="text-[11px] leading-[1.55] italic"
          style={{ color: "#E8E4D8", fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          …and their eyes were opened, and they recognized him. And he vanished from their sight. They said to each other, "Did not our hearts burn within us…"
        </p>
      </div>
      <p className="text-[10px] font-semibold mb-2" style={{ color: "#C8D4C0" }}>
        Meditatio — sit with what caught you.
      </p>
      <div
        className="rounded-xl p-2.5"
        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
      >
        <p className="text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(200,212,192,0.5)" }}>
          From Margaret · Wed
        </p>
        <p className="text-[10px] leading-relaxed" style={{ color: "#F0EDE6" }}>
          I keep returning to "hearts burn within us" — that line stopped me in the middle of an ordinary Wednesday.
        </p>
      </div>
    </MockPhone>
  );
}

type AuthMode = "signin" | "register";

// Two token flavors:
//   - "community": group-wide shareable link. No invitee info; the visitor
//     supplies their own email. New primary path.
//   - "member": legacy per-email invite. Email is pre-filled and locked.
interface InviteInfo {
  kind: "community" | "member";
  group: { name: string; slug: string; emoji: string | null; description?: string | null };
  invitee?: { email: string; name: string | null; joinedAt: string | null };
  // Only present on community-wide invites — powers the onboarding slideshow
  // shown to unauthenticated visitors before the signup form.
  preview?: {
    memberCount: number;
    sampleMembers: Array<{ name: string | null; avatarUrl: string | null }>;
    practices: Array<{ id: number; name: string; templateType: string | null; intention: string }>;
  };
}

// Template-type → emoji/label for the "what you'll do" slide. Keep in step
// with the dashboard's templateType vocabulary.
const PRACTICE_ICON: Record<string, { emoji: string; label: string }> = {
  "intercession": { emoji: "🙏🏽", label: "Intercession" },
  "lectio-divina": { emoji: "📖", label: "Lectio Divina" },
  "fast": { emoji: "🌾", label: "Fasting" },
  "morning-prayer": { emoji: "🌅", label: "Morning Prayer" },
  "evening-prayer": { emoji: "🌙", label: "Evening Prayer" },
  "examen": { emoji: "🕯️", label: "Examen" },
  "rosary": { emoji: "📿", label: "Rosary" },
  "gratitude": { emoji: "🌿", label: "Gratitude" },
};
function iconForPractice(templateType: string | null): { emoji: string; label: string } {
  if (templateType && PRACTICE_ICON[templateType]) return PRACTICE_ICON[templateType];
  return { emoji: "🌿", label: "Practice" };
}

export default function CommunityJoinPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Public invite lookup — no auth required. Shows the group name to a
  // brand-new visitor and lets us pre-fill the email for the signup form.
  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: [`/api/groups/${slug}/invite/${token}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/invite/${token}`),
    enabled: !!slug && !!token,
    retry: false,
  });

  // Onboarding slideshow — community-wide invites get a short welcome
  // carousel before the signup form. Visitors can skip it at any time
  // (including on first land) to go straight to the form. Per-member
  // legacy invites bypass the slideshow entirely; they already know
  // what they're being invited to.
  const [slideIndex, setSlideIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Auth state for unauthenticated visitors
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // Honeypot for the register form. Real browser users never see or fill
  // this; naive bots that autofill every <input> trip it and get rejected
  // server-side with a generic validation error (no "bot detected" tell).
  const [website, setWebsite] = useState("");
  // Email is user-entered only on community-wide links; per-member links
  // pre-fill it from the invite.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Pre-fill name + email from the invite when it loads (per-member tokens only)
  useEffect(() => {
    if (invite?.kind === "member" && invite.invitee) {
      if (invite.invitee.name && !firstName && !lastName) {
        const parts = invite.invitee.name.trim().split(/\s+/);
        if (parts.length === 1) setFirstName(parts[0]);
        else { setFirstName(parts[0]); setLastName(parts.slice(1).join(" ")); }
      }
      if (!email) setEmail(invite.invitee.email);
    }
  }, [invite, firstName, lastName, email]);

  // Auto-join for already-authenticated users.
  const [autoJoinStatus, setAutoJoinStatus] = useState<"idle" | "loading" | "success" | "already" | "error">("idle");
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/join`, { token }),
    onSuccess: (data: any) => {
      setAutoJoinStatus(data.alreadyJoined ? "already" : "success");
    },
    onError: () => setAutoJoinStatus("error"),
  });

  useEffect(() => {
    if (!authLoading && user && slug && token && autoJoinStatus === "idle") {
      setAutoJoinStatus("loading");
      joinMutation.mutate();
    }
  }, [authLoading, user, slug, token, autoJoinStatus]);

  // Effective email: pre-filled from invite on per-member tokens, user-entered
  // on community-wide tokens. Both forms use this single resolver.
  const effectiveEmail = (): string => {
    if (invite?.kind === "member" && invite.invitee) return invite.invitee.email;
    return email.trim().toLowerCase();
  };

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const em = effectiveEmail();
    if (!em || !em.includes("@")) { setAuthError("Enter a valid email."); return; }
    if (!password || password.length < 6) {
      setAuthError("Password must be at least 6 characters."); return;
    }
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password }),
      });
      const data = await res.json();
      if (data.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        // The auto-join effect above will fire once user becomes truthy.
      } else {
        setAuthError(data.error ?? "Sign in failed.");
      }
    } catch {
      setAuthError("Sign in failed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!firstName.trim()) { setAuthError("Enter your first name."); return; }
    if (!lastName.trim()) { setAuthError("Enter your last name."); return; }
    const em = effectiveEmail();
    if (!em || !em.includes("@")) { setAuthError("Enter a valid email."); return; }
    if (!password || password.length < 6) {
      setAuthError("Password must be at least 6 characters."); return;
    }
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: em,
          name: `${firstName.trim()} ${lastName.trim()}`,
          password,
          groupSlug: slug,
          groupInviteToken: token,
          website, // honeypot; legitimate users always send ""
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Server already linked the new user to the group_members row, so
        // we can skip the join call and go straight to the community.
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(`/communities/${slug}`);
      } else {
        setAuthError(data.error ?? "Couldn't create your account.");
      }
    } catch {
      setAuthError("Couldn't create your account.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Build the slideshow payload. We compose slides conditionally so an empty
  // practice/member list doesn't render a hollow card — a brand-new community
  // with no members yet shouldn't brag about "join 0 others". Computed here
  // (before early returns) to respect the Rules of Hooks.
  //
  // Ordering logic:
  //   1–2. Phoebe intro  — what the product *is*, borrowed from features-deck,
  //        so a brand-new visitor who's never heard of Phoebe gets oriented
  //        before the community-specific welcome. Matches the individual
  //        signup deck's tone.
  //   3+.  Community-specific — invited to pray with X, who's there, what
  //        they do, signup CTA.
  const slides = useMemo(() => {
    if (!invite) return [];
    const s: Array<{ key: string; node: React.ReactNode }> = [];
    const preview = invite.preview;

    // Slide — Phoebe intro title. Lifted from features-deck.tsx so the
    // copy stays in one voice across individual and community onboarding.
    s.push({
      key: "phoebe-intro",
      node: (
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
            What Phoebe is
          </p>
          <h1 className="text-4xl font-bold mb-4" style={{ color: "#F0EDE6", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            Three practices.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
            Lectio divina. Intercession. Prayer requests.
          </p>
          <p className="text-sm leading-relaxed mt-4" style={{ color: "rgba(143,175,150,0.75)" }}>
            Three of the Church's oldest rhythms, held in common across the scattered life of a modern parish.
          </p>
        </div>
      ),
    });

    // Slides — three mock-screen previews, one per practice. Lifted from
    // features-deck.tsx so the community invite shows the *same* previews
    // the individual signup deck uses. Keep the caption short; the mock
    // does the heavy lifting.
    s.push({
      key: "mock-prayer",
      node: (
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            The entry point
          </p>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            A shared garden of requests
          </h2>
          <PrayerRequestsMock />
          <p className="text-[11px] leading-relaxed mt-4" style={{ color: "rgba(143,175,150,0.75)" }}>
            People share what they're carrying — others respond, a word at a time.
          </p>
        </div>
      ),
    });
    s.push({
      key: "mock-intercession",
      node: (
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            Held at the same hour
          </p>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            Intercession, as a practice
          </h2>
          <IntercessionMock />
          <p className="text-[11px] leading-relaxed mt-4" style={{ color: "rgba(143,175,150,0.75)" }}>
            One intention at a time, with a prayer from the tradition underneath.
          </p>
        </div>
      ),
    });
    s.push({
      key: "mock-lectio",
      node: (
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            Mon. Wed. Fri.
          </p>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            Scripture, returned to slowly
          </h2>
          <LectioMock />
          <p className="text-[11px] leading-relaxed mt-4" style={{ color: "rgba(143,175,150,0.75)" }}>
            Three unhurried stages on this week's Gospel — together. Catch up any day.
          </p>
        </div>
      ),
    });

    // Slide — Welcome to the specific community. Always shown.
    s.push({
      key: "welcome",
      node: (
        <div className="text-center">
          <div className="text-6xl mb-5">{invite.group.emoji ?? "🏘️"}</div>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            You've been invited to pray with
          </p>
          <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            {invite.group.name}
          </h1>
          {invite.group.description && (
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {invite.group.description}
            </p>
          )}
        </div>
      ),
    });

    // Slide 2 — Members. Only if there are members to showcase.
    if (preview && preview.memberCount > 0) {
      const sample = preview.sampleMembers.slice(0, 5);
      const firstNames = sample
        .map(m => (m.name ?? "").split(/\s+/)[0])
        .filter(Boolean);
      const shown = firstNames.slice(0, 3).join(", ");
      const remainder = preview.memberCount - Math.min(3, firstNames.length);
      const headline =
        firstNames.length === 0
          ? `${preview.memberCount} ${preview.memberCount === 1 ? "person is" : "people are"} praying together`
          : remainder > 0
            ? `Join ${shown} & ${remainder} ${remainder === 1 ? "other" : "others"}`
            : `Join ${shown}`;
      s.push({
        key: "members",
        node: (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: "rgba(143,175,150,0.55)" }}>
              You're in good company
            </p>
            {sample.length > 0 && (
              <div className="flex items-center justify-center mb-5">
                {sample.map((m, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
                    style={{
                      background: "#1A4A2E",
                      color: "#A8C5A0",
                      border: "2px solid #091A10",
                      marginLeft: i === 0 ? 0 : -10,
                      zIndex: sample.length - i,
                    }}
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt={m.name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      (m.name ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
            )}
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {headline}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
              {preview.memberCount === 1
                ? "One soul is already walking this path — your arrival doubles the company."
                : "A small community gathered around shared practice. No feed. No noise. Just rhythm."}
            </p>
          </div>
        ),
      });
    }

    // Slide 3 — Practices. Only if the group has any.
    if (preview && preview.practices.length > 0) {
      s.push({
        key: "practices",
        node: (
          <div>
            <div className="text-center mb-6">
              <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                What you'll do together
              </p>
              <h2 className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
                Shared practices
              </h2>
            </div>
            <div className="space-y-2">
              {preview.practices.slice(0, 4).map(p => {
                const icon = iconForPractice(p.templateType);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <span className="text-2xl leading-none">{icon.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                        {p.name}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "#8FAF96" }}>
                        {p.intention || icon.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {preview.practices.length > 4 && (
              <p className="text-xs text-center mt-4" style={{ color: "rgba(143,175,150,0.55)" }}>
                + {preview.practices.length - 4} more
              </p>
            )}
          </div>
        ),
      });
    }

    // Slide N — Ready. Always last. Reveals the signup form on tap.
    s.push({
      key: "ready",
      node: (
        <div className="text-center">
          <div className="text-5xl mb-5">✨</div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            Ready to join?
          </h2>
          <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
            Create a free Phoebe account — or sign in if you already have one — to step inside {invite.group.name}.
          </p>
        </div>
      ),
    });

    return s;
  }, [invite]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#091A10" }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Invalid invite
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            This invite link may have expired or is no longer valid.
          </p>
          <button
            onClick={() => setLocation("/")}
            className="px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Back to Phoebe
          </button>
        </div>
      </div>
    );
  }

  // Authenticated path — auto-join + simple confirmation
  if (user) {
    const groupName = invite.group.name;
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full text-center py-16">
          {(autoJoinStatus === "loading" || autoJoinStatus === "idle") && (
            <p className="text-sm" style={{ color: "#8FAF96" }}>Joining {groupName}...</p>
          )}
          {(autoJoinStatus === "success" || autoJoinStatus === "already") && (
            <>
              <div className="text-5xl mb-4">{autoJoinStatus === "already" ? "✓" : "🏘️"}</div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {autoJoinStatus === "already" ? `Already a member of ${groupName}` : `Welcome to ${groupName}`}
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                {autoJoinStatus === "already" ? "You're already part of this community." : "You've joined the community."}
              </p>
              <button
                onClick={() => setLocation(`/communities/${slug}`)}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Go to community →
              </button>
            </>
          )}
          {autoJoinStatus === "error" && (
            <>
              <div className="text-5xl mb-4">😕</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Couldn't join
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                Something went wrong. Please try the link again.
              </p>
            </>
          )}
        </div>
      </Layout>
    );
  }

  // ── Unauthenticated path: signup or sign-in tied to the invite ─────────
  // For per-member tokens: if the invitee already joined (joinedAt != null)
  // and isn't signed in, they should sign in rather than create a new account.
  // Community-wide tokens don't have this hint since there's no per-invitee
  // row — we show the full register/signin toggle.
  const alreadyHasAccount =
    invite.kind === "member" && (invite.invitee?.joinedAt ?? null) !== null;
  const isCommunityWide = invite.kind === "community";

  // Only community-wide invites use the slideshow. Per-member legacy invites
  // skip straight to the form so the pre-filled email + name show immediately.
  const slideshowActive = isCommunityWide && showOnboarding && slides.length > 0;
  const currentSlide = slides[Math.min(slideIndex, slides.length - 1)];
  const isLastSlide = slideIndex >= slides.length - 1;

  // Full-screen slideshow render — takes over the page until the visitor
  // taps "Get started" on the last slide (or "Skip").
  if (slideshowActive) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
        <header className="px-6 py-6 flex items-center justify-between">
          <span className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
            Phoebe
          </span>
          <button
            onClick={() => setShowOnboarding(false)}
            className="text-xs"
            style={{ color: "rgba(143,175,150,0.65)" }}
          >
            Skip
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
          <div className="w-full max-w-sm mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                {currentSlide.node}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Footer — progress dots + primary action */}
        <footer className="px-6 pb-8 flex flex-col items-center gap-5">
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === slideIndex ? 20 : 6,
                  background: i === slideIndex ? "#8FAF96" : "rgba(143,175,150,0.25)",
                }}
              />
            ))}
          </div>

          <div className="w-full max-w-sm flex flex-col gap-2">
            <button
              onClick={() => {
                if (isLastSlide) {
                  setShowOnboarding(false);
                } else {
                  setSlideIndex(slideIndex + 1);
                }
              }}
              className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl font-semibold text-sm btn-sage"
            >
              {isLastSlide ? "Get started" : "Next"}
              <ArrowRight size={15} />
            </button>
            {slideIndex > 0 && !isLastSlide && (
              <button
                onClick={() => setSlideIndex(slideIndex - 1)}
                className="w-full py-2 text-xs"
                style={{ color: "rgba(143,175,150,0.65)" }}
              >
                Back
              </button>
            )}
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 pb-12 pt-12">
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <div className="text-5xl mb-4">{invite.group.emoji ?? "🏘️"}</div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
              You've been invited to pray with
            </p>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {invite.group.name}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {alreadyHasAccount
                ? "Sign in to your Phoebe account to join."
                : isCommunityWide
                  ? "Create a Phoebe account to join — or sign in if you already have one."
                  : "Create your Phoebe account to join the community."}
            </p>
          </motion.div>

          {/* Mode toggle (only when both make sense) */}
          {!alreadyHasAccount && (
            <div className="flex rounded-xl p-1 mb-4" style={{ background: "#0F2818" }}>
              {(["register", "signin"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setAuthMode(m); setAuthError(""); setPassword(""); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: authMode === m ? "#1A3D2B" : "transparent",
                    color: authMode === m ? "#F0EDE6" : "#8FAF96",
                  }}
                >
                  {m === "register" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {(alreadyHasAccount || authMode === "signin") && (
              <motion.form
                key="signin"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleSignin}
                className="flex flex-col gap-3"
              >
                {isCommunityWide ? (
                  <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                  />
                )}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="current-password"
                    disabled={authSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#8FAF96" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {authError && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                >
                  {authSubmitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                  ) : "Sign in & join"}
                </button>

                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="text-xs"
                    style={{ color: "#8FAF96" }}
                  >
                    Forgot password?
                  </button>
                </div>
              </motion.form>
            )}

            {!alreadyHasAccount && authMode === "register" && (
              <motion.form
                key="register"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleRegister}
                className="flex flex-col gap-3"
              >
                {/*
                  Honeypot — visually hidden, off-tab, disabled for
                  autocomplete, labeled like a real field so blind bots fill
                  it. Real users never see or reach this input. We use inline
                  style + aria-hidden + tabIndex=-1 rather than display:none
                  because some bots specifically skip display:none fields.
                */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: "auto",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                  }}
                >
                  <label>
                    Website
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex gap-2.5">
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); setAuthError(""); }}
                    className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="given-name"
                    required
                    disabled={authSubmitting}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); setAuthError(""); }}
                    className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="family-name"
                    required
                    disabled={authSubmitting}
                  />
                </div>

                {isCommunityWide ? (
                  <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                  />
                )}

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Choose a password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="new-password"
                    disabled={authSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#8FAF96" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {authError && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                >
                  {authSubmitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                  ) : `Create account & join ${invite.group.name}`}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
