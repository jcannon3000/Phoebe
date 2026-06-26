/**
 * El Jardín portal signup (eljardin.withphoebe.app).
 *
 * Creates a jardin-only account (POST /api/jardin/signup) and drops the new
 * member straight into the Jardín hub. Self-contained — no Phoebe chrome —
 * since this is the portal's front door.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const BORDER = "rgba(46,107,64,0.30)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#0C1F12";

export default function JardinSignupPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);

  const signup = useMutation({
    mutationFn: () =>
      apiRequest<{ ok: boolean }>("POST", "/api/jardin/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
        website,
      }),
    onSuccess: () => { window.location.href = "/menu/jardin"; },
    onError: async (e: unknown) => {
      let msg = "Something went wrong. Please try again.";
      try { const j = JSON.parse((e as Error).message); if (j?.error) msg = j.error; } catch { /* keep default */ }
      setError(msg);
    },
  });

  const canSubmit = name.trim().length >= 1 && email.includes("@") && password.length >= 6 && !signup.isPending;

  return (
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🌿</div>
          <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>El Jardín</h1>
          <p className="text-sm mt-1" style={{ color: SAGE, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            Estudio bíblico, grupos y conversación — un jardín para crecer juntos.
          </p>
        </div>

        <form
          onSubmit={(ev) => { ev.preventDefault(); setError(null); if (canSubmit) signup.mutate(); }}
          className="flex flex-col gap-3"
        >
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Nombre" autoComplete="name"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: FONT }}
          />
          <input
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico" type="email" autoComplete="email"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: FONT }}
          />
          <input
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña (mín. 6)" type="password" autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: FONT }}
          />
          {/* Honeypot — hidden from real users; bots fill it and get rejected. */}
          <input
            value={website} onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />

          {error && <p className="text-xs" style={{ color: "#E59A9A" }}>{error}</p>}

          <button
            type="submit" disabled={!canSubmit}
            className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50 mt-1"
            style={{ background: CTA, color: WARM, fontFamily: FONT }}
          >
            {signup.isPending ? "Creando tu cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setLocation("/signin")}
          className="w-full text-center text-xs mt-4 hover:opacity-80"
          style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, cursor: "pointer" }}
        >
          ¿Ya tienes cuenta? Inicia sesión
        </button>
      </div>
    </div>
  );
}
