/**
 * Find Friends on Phoebe — contact-discovery page.
 *
 * Flow:
 *   1. Native shell ONLY: dispatch `phoebe:request-contacts` so the
 *      Capacitor handler asks for the iOS permission and reads the
 *      address book. Web fallback: shows a "this only works in the
 *      app" message.
 *   2. The native shell replies with `phoebe:contacts-ready` containing
 *      sanitized contacts (name + phones[] + emails[]). We extract the
 *      phone numbers, normalize each to E.164 client-side, and SHA-256
 *      each.
 *   3. POST batch of hashes to /api/contacts/match. Server matches
 *      against users.phone_hash, returns matched user IDs.
 *   4. Render a list of matches with each user's display name + avatar.
 *
 * Privacy note: raw phone numbers never leave the device. We hash them
 * client-side (Web Crypto API in the Capacitor webview) before
 * uploading. The server doesn't keep the uploaded hash list — it only
 * uses them for the lookup, then discards.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

type DeviceContact = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
};

type Match = {
  userId: number;
  name: string | null;
  avatarUrl: string | null;
  hashIndex: number;
};

// Match the server-side normalizer: digits + leading "+", US heuristic
// for 10/11-digit numbers without a country code.
function normalizePhoneClient(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isNative(): boolean {
  return !!(window as { PhoebeNative?: { isNative?: () => boolean } })
    .PhoebeNative?.isNative?.();
}

export default function FindFriendsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<"idle" | "requesting" | "hashing" | "matching" | "done" | "denied" | "no-native" | "error">("idle");
  const [matches, setMatches] = useState<Match[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contactCount, setContactCount] = useState(0);

  const matchMutation = useMutation({
    mutationFn: (hashes: string[]) =>
      apiRequest("POST", "/api/contacts/match", { hashes }),
    onSuccess: (data: unknown) => {
      const body = data as { matches: Match[] };
      // Dedupe by userId (a single user might match multiple of the
      // viewer's contacts — e.g. work + personal numbers).
      const seen = new Set<number>();
      const unique: Match[] = [];
      for (const m of body.matches) {
        if (seen.has(m.userId)) continue;
        seen.add(m.userId);
        unique.push(m);
      }
      setMatches(unique);
      setStage("done");
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't search.");
      setStage("error");
    },
  });

  // Wire native event listeners once. Cleaned up on unmount.
  useEffect(() => {
    function handleReady(e: Event) {
      const detail = (e as CustomEvent).detail as { contacts: DeviceContact[] } | undefined;
      const contacts = detail?.contacts ?? [];
      setContactCount(contacts.length);
      setStage("hashing");

      void (async () => {
        const phones = new Set<string>();
        for (const c of contacts) {
          for (const p of c.phones) {
            const n = normalizePhoneClient(p);
            if (n) phones.add(n);
          }
        }
        if (phones.size === 0) {
          setMatches([]);
          setStage("done");
          return;
        }
        const hashes = await Promise.all(
          Array.from(phones).map((p) => sha256Hex(p)),
        );
        setStage("matching");
        matchMutation.mutate(hashes);
      })();
    }

    function handleDenied() {
      setStage("denied");
    }

    function handleError(e: Event) {
      const detail = (e as CustomEvent).detail;
      setErrorMsg(detail instanceof Error ? detail.message : "Couldn't read contacts.");
      setStage("error");
    }

    window.addEventListener("phoebe:contacts-ready", handleReady);
    window.addEventListener("phoebe:contacts-denied", handleDenied);
    window.addEventListener("phoebe:contacts-error", handleError);

    return () => {
      window.removeEventListener("phoebe:contacts-ready", handleReady);
      window.removeEventListener("phoebe:contacts-denied", handleDenied);
      window.removeEventListener("phoebe:contacts-error", handleError);
    };
  }, [matchMutation]);

  function start() {
    if (!isNative()) {
      setStage("no-native");
      return;
    }
    setStage("requesting");
    setErrorMsg(null);
    setMatches([]);
    window.dispatchEvent(new Event("phoebe:request-contacts"));
  }

  if (!user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => setLocation("/people")}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 pb-24 max-w-lg mx-auto w-full">
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Find friends on Phoebe 🌿
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          We'll check your contacts against people who've added their phone
          number to Phoebe. Numbers never leave your device unhashed.
        </p>

        {stage === "idle" && (
          <button
            onClick={start}
            className="w-full py-4 rounded-2xl text-base font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Scan my contacts
          </button>
        )}

        {(stage === "requesting" || stage === "hashing" || stage === "matching") && (
          <div
            className="w-full py-4 px-4 rounded-2xl text-sm"
            style={{ background: "rgba(46,107,64,0.12)", color: "#A8C5A0" }}
          >
            {stage === "requesting" && "Reading your contacts…"}
            {stage === "hashing" && `Hashing ${contactCount} contacts…`}
            {stage === "matching" && "Looking for friends on Phoebe…"}
          </div>
        )}

        {stage === "denied" && (
          <div
            className="w-full py-4 px-4 rounded-2xl text-sm"
            style={{ background: "rgba(196,122,101,0.10)", color: "#C47A65", border: "1px solid rgba(196,122,101,0.3)" }}
          >
            Phoebe doesn't have permission to read your contacts. Open
            Settings → Phoebe → Contacts and turn it on, then come back.
          </div>
        )}

        {stage === "no-native" && (
          <div
            className="w-full py-4 px-4 rounded-2xl text-sm"
            style={{ background: "rgba(46,107,64,0.10)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            Contact discovery only works in the Phoebe app on your phone.
            Open Phoebe on iOS to find your friends.
          </div>
        )}

        {stage === "error" && (
          <div
            className="w-full py-4 px-4 rounded-2xl text-sm"
            style={{ background: "rgba(196,122,101,0.10)", color: "#C47A65", border: "1px solid rgba(196,122,101,0.3)" }}
          >
            {errorMsg ?? "Something went wrong."}
            <button
              onClick={start}
              className="block mt-3 text-sm underline"
              style={{ color: "#C8D4C0" }}
            >
              Try again
            </button>
          </div>
        )}

        {stage === "done" && (
          <div>
            {matches.length === 0 ? (
              <div
                className="w-full py-6 px-4 rounded-2xl text-sm text-center"
                style={{ background: "rgba(46,107,64,0.10)", color: "#A8C5A0" }}
              >
                <p className="mb-2 text-base" style={{ color: "#F0EDE6" }}>
                  Nobody yet 🌱
                </p>
                None of your contacts have added their phone number to Phoebe.
                Invite them — when they sign up and add theirs, they'll show
                up here.
              </div>
            ) : (
              <>
                <p
                  className="text-[10px] uppercase tracking-[0.18em] mb-3"
                  style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {matches.length === 1 ? "1 friend on Phoebe" : `${matches.length} friends on Phoebe`}
                </p>
                <div className="space-y-2">
                  {matches.map((m) => (
                    <Link key={m.userId} href={`/people/${m.userId}`}>
                      <a
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-opacity hover:opacity-90"
                        style={{
                          background: "rgba(46,107,64,0.12)",
                          border: "1px solid rgba(46,107,64,0.25)",
                        }}
                      >
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.name ?? ""}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                            style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                          >
                            {(m.name ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: "#F0EDE6" }}>
                            {m.name ?? "Someone"}
                          </p>
                          <p className="text-xs" style={{ color: "#8FAF96" }}>
                            On Phoebe
                          </p>
                        </div>
                        <span className="text-sm" style={{ color: "rgba(168,197,160,0.6)" }}>→</span>
                      </a>
                    </Link>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={start}
              className="block mt-6 mx-auto text-xs underline"
              style={{ color: "#8FAF96" }}
            >
              Scan again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
