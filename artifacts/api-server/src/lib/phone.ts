// Minimal phone-number helpers for contact discovery.
//
// We don't pull in libphonenumber-js (140KB compressed metadata table)
// for the Phoebe beta — a hand-written normalizer covers the common
// cases and stays tiny. Trade-off: we don't validate the carrier-or-
// area-code prefix, only the shape. If we expand outside North America
// significantly, swap in libphonenumber and call this a day.
//
// Normalization rules:
//   - Strip everything except digits and a leading "+"
//   - 10 digits, no "+" → assume US, prepend "+1"
//   - 11 digits starting with 1, no "+" → prepend "+"
//   - Starts with "+" → international, keep as-is, but require ≥ 8 digits
//
// Returns the E.164 form ("+15555550123") on success, null on anything
// we can't confidently normalize. Callers should treat null as "tell
// the user the number doesn't look right" rather than silently dropping
// it.

import { createHash } from "node:crypto";

export function normalizePhone(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  // Strip everything except digits and a single leading "+"
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }

  // No "+" — apply US heuristics
  if (digits.length === 10) {
    return "+1" + digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }

  return null;
}

// SHA-256 of the E.164 string. Used both server-side (when storing the
// caller's own number) and as the value the mobile client computes from
// each device-contact phone number before uploading. The hash is the
// ONLY thing the server keeps about contacts; raw uploaded numbers are
// never persisted.
export function hashPhone(normalizedE164: string): string {
  return createHash("sha256").update(normalizedE164).digest("hex");
}
