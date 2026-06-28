// Twilio Verify — SMS one-time-code verification for phone numbers.
//
// We talk to the Verify REST API directly over `fetch` (no `twilio` SDK
// dependency — the SDK is large and we use exactly two endpoints). Verify
// handles code generation, delivery, retries, rate-limiting and fraud
// signals server-side; we never see or store the code.
//
// Configuration (all three required to enable verification):
//   TWILIO_ACCOUNT_SID        — "ACxxxx", the account
//   TWILIO_AUTH_TOKEN         — the account auth token (Basic-auth password)
//   TWILIO_VERIFY_SERVICE_SID — "VAxxxx", a Verify Service you create in the
//                               Twilio console (carries the brand name, code
//                               length, channels, etc.)
//
// When any are missing, isVerifyConfigured() returns false and callers should
// degrade gracefully (the routes return 503 so the client can fall back / show
// "verification unavailable"). This keeps dev + self-host environments without
// a Twilio account fully functional.
//
// NOTE on US delivery: production A2P traffic in the US generally requires
// A2P 10DLC brand/campaign registration (or a Toll-Free verification) on the
// Twilio side. That's a console/account step, not code — Verify itself
// abstracts the sender. Until registered, codes may be filtered by carriers.

const API_BASE = "https://verify.twilio.com/v2";

function cfg(): { accountSid: string; authToken: string; serviceSid: string } | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const serviceSid = process.env["TWILIO_VERIFY_SERVICE_SID"];
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

export function isVerifyConfigured(): boolean {
  return cfg() !== null;
}

function authHeader(accountSid: string, authToken: string): string {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

// POST a Verification — Twilio texts the user a code. `e164` must already be
// normalized (+15555550123). Returns { ok } on a 2xx; on failure, a typed
// reason the route can map to a friendly message (and decide HTTP status).
export async function startVerification(
  e164: string,
): Promise<{ ok: true } | { ok: false; reason: "not_configured" | "invalid_number" | "rate_limited" | "error"; status?: number }> {
  const c = cfg();
  if (!c) return { ok: false, reason: "not_configured" };

  try {
    const resp = await fetch(`${API_BASE}/Services/${c.serviceSid}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: authHeader(c.accountSid, c.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, Channel: "sms" }).toString(),
    });
    if (resp.ok) return { ok: true };
    // Map a few common Twilio error codes to typed reasons.
    let code: number | undefined;
    try { code = ((await resp.json()) as { code?: number }).code; } catch { /* non-JSON */ }
    if (resp.status === 429 || code === 60203 /* max send attempts */) return { ok: false, reason: "rate_limited", status: resp.status };
    if (code === 60200 /* invalid parameter */ || code === 60033 /* invalid To */) return { ok: false, reason: "invalid_number", status: resp.status };
    return { ok: false, reason: "error", status: resp.status };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// POST a VerificationCheck — confirm the code the user typed. Returns
// approved=true only when Twilio reports status "approved".
export async function checkVerification(
  e164: string,
  code: string,
): Promise<{ ok: true; approved: boolean } | { ok: false; reason: "not_configured" | "expired" | "error"; status?: number }> {
  const c = cfg();
  if (!c) return { ok: false, reason: "not_configured" };

  try {
    const resp = await fetch(`${API_BASE}/Services/${c.serviceSid}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: authHeader(c.accountSid, c.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, Code: code }).toString(),
    });
    if (resp.ok) {
      const body = (await resp.json()) as { status?: string };
      return { ok: true, approved: body.status === "approved" };
    }
    // 404 here means the verification expired or was already consumed — the
    // user waited too long or the code/number pair is no longer pending.
    if (resp.status === 404) return { ok: false, reason: "expired", status: resp.status };
    return { ok: false, reason: "error", status: resp.status };
  } catch {
    return { ok: false, reason: "error" };
  }
}
