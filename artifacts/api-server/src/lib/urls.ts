/**
 * Returns the frontend base URL, respecting environment overrides.
 * - APP_BASE_URL takes top priority (the canonical Phoebe domain)
 * - FRONTEND_URL is a legacy alias
 * - REPLIT_DEV_DOMAIN is used when running on Replit
 * - Falls back to localhost:23896 for local development
 *
 * Use this for things like OAuth post-login redirects where the user's
 * browser origin matters. For links embedded in emails / calendar events
 * (invitations, join links, reset-password, etc.) use `getInviteBaseUrl()`
 * instead — those must always point to the canonical production domain.
 */
export function getFrontendUrl(): string {
  if (process.env["APP_BASE_URL"]) return process.env["APP_BASE_URL"];
  if (process.env["FRONTEND_URL"]) return process.env["FRONTEND_URL"];
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "http://localhost:23896";
}

/**
 * Canonical production URL for every link embedded in an outbound invitation
 * (email body, calendar event description, share sheet, etc.).
 *
 * This is intentionally hardcoded: recipients of invitations must never see a
 * dev/preview/Replit URL, regardless of which environment the API server is
 * running in. If the canonical domain ever changes, update it here.
 */
export function getInviteBaseUrl(): string {
  return "https://withphoebe.app";
}
