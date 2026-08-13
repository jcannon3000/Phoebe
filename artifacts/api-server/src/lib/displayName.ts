// Shared display-name cleaning + impersonation guard for the two places a
// user sets their own `name`: POST /auth/register and PATCH /auth/me/profile.
//
// There's no separate username/handle in this app — `name` is the only
// user-chosen identity string, shown in group rosters, prayer feeds, and
// amens. It carries no authorization weight anywhere (grep confirms no
// route branches on `name`), but a name like "Phoebe Support" or "Admin" in
// a shared group roster reads as an official/staff account to anyone
// glancing at it — the same social-engineering risk as a lookalike Slack
// display name. Cheap to block outright since nobody has a legitimate need
// for it.

// Zero-width space, zero-width joiner/non-joiner, and the BOM/zero-width
// no-break space — a name built entirely (or partly) from these renders as
// blank or as an invisible prefix/suffix, letting "Admin" and "​Admin" (with
// a leading ZWSP) look identical while comparing as different strings.
const ZERO_WIDTH_RE = /[​-‍﻿]/g;

// Exact-word reserved terms that imply admin/staff/official status. Matched
// on whole normalized words, not substrings, so real names aren't caught —
// "Administration" or "Rootham" pass; "Admin" or "Root" as a standalone word
// (in any position: "Admin", "Site Admin", "Admin Support") do not.
const RESERVED_WORDS = new Set([
  "admin", "administrator", "root", "sysadmin", "webmaster",
  "moderator", "mod", "staff", "support", "official", "system",
  "helpdesk", "security", "phoebe", "team",
]);

export function sanitizeAndValidateDisplayName(
  raw: string | undefined,
  maxLen: number,
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = (raw ?? "")
    .replace(ZERO_WIDTH_RE, "")
    // NFKC folds full-width/compatibility Unicode variants (e.g. the
    // fullwidth "Ａｄｍｉｎ") down to their plain ASCII equivalents before
    // the reserved-word check runs, so that trick doesn't bypass it.
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 1) return { ok: false, error: "Name is required." };
  if (cleaned.length > maxLen) return { ok: false, error: `Please use a name under ${maxLen} characters.` };

  const words = cleaned.toLowerCase().split(" ");
  if (words.some((w) => RESERVED_WORDS.has(w))) {
    return { ok: false, error: "That name isn't available — please choose something else." };
  }

  return { ok: true, value: cleaned };
}
