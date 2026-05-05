import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Public landing + signup for the Phoebe Climate experience. Rendered
// when an unauthenticated visitor lands on /climate. Mirrors the auth
// register form's mechanics but always sets climate_enrolled = true on
// the new user. Honeypot field is included to match the server-side
// anti-bot check.
export function ClimateSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const signupMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/climate/signup", { name, email, password, website }),
    onSuccess: () => {
      // Force /api/auth/me to refetch — that drives the page's
      // authenticated render path, which will switch this surface
      // to the climate tab content.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Sign-up failed. Please try again.";
      setError(message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.includes("@") || password.length < 6) {
      setError("Please enter your name, a valid email, and a password of 6+ characters.");
      return;
    }
    signupMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-8 pt-2 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 text-center">
        <div className="text-5xl">🌿</div>
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#F0EDE6",
            letterSpacing: "-0.03em",
          }}
        >
          Phoebe Climate
        </h1>
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          A daily prayer for creation, sent every morning.
        </p>
      </div>

      {/* Pitch — placeholder copy, refine before the public link goes out */}
      <div
        className="rounded-2xl px-5 py-5"
        style={{
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.18)",
        }}
      >
        <p
          className="text-sm leading-relaxed italic"
          style={{ color: "#C8D4C0", fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          An invite-only beta from Water &amp; Wilderness DC and the Episcopal
          Diocese of Washington. One short prayer each morning at 7am. Pray
          alongside others across your parish and the wider church.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.5)" }}>
            At least 6 characters.
          </span>
        </label>

        {/* Honeypot — visually hidden, tab-skipped, and ignored by autofill */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
          }}
        />

        {error && (
          <p className="text-sm text-center" style={{ color: "#E89B9B" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={signupMutation.isPending}
          className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-80 active:scale-[0.99] disabled:opacity-50"
          style={{
            background: "#2D5E3F",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {signupMutation.isPending ? "Creating account…" : "Begin"}
        </button>

        <p className="text-[11px] text-center mt-2" style={{ color: "rgba(143,175,150,0.5)" }}>
          By signing up you agree to receive a daily prayer notification at 7am.
        </p>
      </form>
    </div>
  );
}
