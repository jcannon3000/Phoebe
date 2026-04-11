// Single source of truth for the Google Workspace mailbox used to send
// Phoebe's outbound mail (invites, magic links, calendar invitations,
// letter emails). The address is a real Workspace mailbox hosted on
// withphoebe.app, authorized via OAuth — its refresh token lives in
// INVITES_GOOGLE_REFRESH_TOKEN. For backward compatibility we still fall
// back to the legacy SCHEDULER_GOOGLE_REFRESH_TOKEN so deployments don't
// go dark while the new env var is being rolled out.

export const INVITES_EMAIL_ADDRESS = "invites@withphoebe.app";
export const INVITES_DISPLAY_NAME = "Phoebe";
export const INVITES_FROM_HEADER = `${INVITES_DISPLAY_NAME} <${INVITES_EMAIL_ADDRESS}>`;

export function getInvitesRefreshToken(): string | undefined {
  return (
    process.env["INVITES_GOOGLE_REFRESH_TOKEN"] ||
    process.env["SCHEDULER_GOOGLE_REFRESH_TOKEN"]
  );
}
