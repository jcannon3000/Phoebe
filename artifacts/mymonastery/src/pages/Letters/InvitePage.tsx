import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

interface InviteInfo {
  correspondenceName: string;
  creatorName: string;
  type: string;
  memberCount: number;
  letterCount: number;
  alreadyJoined: boolean;
  memberEmail: string;
}

export default function LetterInvitePage() {
  const [, params] = useRoute("/letters/invite/:token");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const inviteToken = params?.token ?? "";

  const [data, setData] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [correspondenceId, setCorrespondenceId] = useState<number | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    async function load() {
      try {
        // Try new phoebe endpoint first, fall back to legacy
        let res = await fetch(`/api/phoebe/invite/${inviteToken}`);
        if (res.status === 404) res = await fetch(`/api/letters/invite/${inviteToken}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed");
        const d: InviteInfo = await res.json();
        setData(d);
        if (d.memberEmail) setEmail(d.memberEmail);
        if (d.alreadyJoined) setAccepted(true);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [inviteToken]);

  // Auto-accept when the user is already logged in
  useEffect(() => {
    if (!user || !data || accepted || isSubmitting) return;
    setIsSubmitting(true);
    fetch(`/api/phoebe/invite/${inviteToken}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: user.name, email: user.email }),
    }).then(async res => {
      if (!res.ok) res = await fetch(`/api/letters/invite/${inviteToken}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: user.name, email: user.email }),
      });
      const result = await res.json();
      setCorrespondenceId(result.correspondenceId);
      setAccepted(true);
    }).catch(() => setIsSubmitting(false));
  }, [user, data]);

  async function handleAccept() {
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    try {
      let res = await fetch(`/api/phoebe/invite/${inviteToken}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        res = await fetch(`/api/letters/invite/${inviteToken}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        });
      }
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      setCorrespondenceId(result.correspondenceId);
      setAccepted(true);
    } catch {
      // silent — user can retry
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#5C7A5F] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: "#091A10" }}>
        <div>
          <p className="text-4xl mb-4">✉️</p>
          <p className="text-base" style={{ color: "#8FAF96" }}>This invitation is no longer valid.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isOneToOne = data.type === "one_to_one";

  if (accepted) {
    const goUrl = correspondenceId
      ? `/letters/${correspondenceId}?token=${inviteToken}`
      : "/";
    // Redirect to read the letter first
    if (correspondenceId) setLocation(goUrl);
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#5C7A5F] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: "#091A10" }}>
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-6">✉️</div>

        <h1
          className="text-[22px] font-bold mb-4"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {data.creatorName} wants to stay in touch.
        </h1>

        <p className="text-base mb-8 leading-relaxed" style={{ color: "#C8D4C0" }}>
          {isOneToOne
            ? `You've been invited to exchange letters — one every two weeks, alternating. You write, they respond, you write back. A conversation with room to breathe.`
            : `You've been invited to join ${data.correspondenceName}. Once every two weeks, everyone shares what's been happening. 50 words or more.`
          }
        </p>

        {data.letterCount > 0 && (
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            {data.letterCount} letter{data.letterCount !== 1 ? "s" : ""} already written.
          </p>
        )}

        <div className="space-y-3 text-left mb-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={{ background: "#0F2818", border: "1px solid rgba(92,122,95,0.35)", color: "#F0EDE6" }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={{ background: "#0F2818", border: "1px solid rgba(92,122,95,0.35)", color: "#F0EDE6" }}
          />
        </div>

        <button
          onClick={handleAccept}
          disabled={!name.trim() || !email.includes("@") || isSubmitting}
          className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-opacity"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {isSubmitting ? "Accepting..." : "Read the letter →"}
        </button>

        <p className="text-xs mt-6" style={{ color: "#8FAF96" }}>
          Already have an account?{" "}
          <a
            href={`/?redirect=${encodeURIComponent(`/letters/invite/${inviteToken}`)}`}
            style={{ color: "#C8D4C0", textDecoration: "underline" }}
          >
            Log in →
          </a>
        </p>
        <p className="text-xs mt-3" style={{ color: "#8FAF96" }}>
          You'll need a Phoebe account to write back.<br />
          Be together with Phoebe.
        </p>
      </div>
    </div>
  );
}
