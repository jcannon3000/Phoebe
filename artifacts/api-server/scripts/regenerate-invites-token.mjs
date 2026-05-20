#!/usr/bin/env node
// Regenerate the INVITES_GOOGLE_REFRESH_TOKEN locally without leaving
// the terminal. Useful when the OAuth Playground is blocked, slow, or
// otherwise unloadable.
//
// What it does:
//   1. Starts a tiny localhost HTTP server (default :4173) that catches
//      the OAuth redirect.
//   2. Builds a Google consent URL with the Gmail + Calendar scopes
//      Phoebe needs (gmail.send + calendar.events) and offline access.
//   3. Opens the URL in your default browser. You sign in as
//      invites@withphoebe.app and click Allow.
//   4. Google redirects to http://localhost:4173/oauth/callback?code=…
//      The server exchanges that auth code for tokens and prints the
//      refresh token to your terminal.
//
// Prereqs:
//   • The OAuth client in Google Cloud Console (the GOOGLE_CLIENT_ID
//     env var below) must have http://localhost:4173/oauth/callback in
//     its "Authorized redirect URIs" list. Add it via
//     console.cloud.google.com → APIs & Services → Credentials →
//     your OAuth 2.0 Client ID → Authorized redirect URIs.
//     (You can remove it again once you're done if you'd rather.)
//
// Usage:
//   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
//     node artifacts/api-server/scripts/regenerate-invites-token.mjs
//
// Optional:
//   PORT=4173      override the local callback port
//   OPEN=0         skip auto-opening the browser (you'll get a URL to copy)

import http from "node:http";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = Number(process.env.PORT ?? 4173);
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const AUTO_OPEN = process.env.OPEN !== "0";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing env vars. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (same values as Railway).");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES.join(" "));
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent"); // force a fresh refresh token
authUrl.searchParams.set("include_granted_scopes", "true");

console.log("");
console.log("─".repeat(60));
console.log(" Phoebe OAuth refresh-token regenerator");
console.log("─".repeat(60));
console.log(` Redirect URI:  ${REDIRECT_URI}`);
console.log("  (must be in your OAuth client's Authorized redirect URIs)");
console.log("");
console.log(" Scopes:");
for (const s of SCOPES) console.log(`   • ${s}`);
console.log("");
console.log(" Sign in as invites@withphoebe.app when prompted.");
console.log("");

const server = http.createServer(async (req, res) => {
  if (!req.url) { res.writeHead(400).end("bad request"); return; }
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404).end("not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    console.error(`\n❌ OAuth error from Google: ${error}\n`);
    res.writeHead(400).end(`OAuth error: ${error}`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400).end("missing code");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      console.error("\n❌ Token exchange failed:", tokens);
      res.writeHead(500).end(`Token exchange failed: ${JSON.stringify(tokens)}`);
      server.close();
      process.exit(1);
    }

    console.log("");
    console.log("✅ Success! Your new refresh token:");
    console.log("");
    console.log(tokens.refresh_token);
    console.log("");
    console.log("─".repeat(60));
    console.log(" Next step:");
    console.log("   1. Copy the token above");
    console.log("   2. Railway → api-server → Variables");
    console.log("   3. Set INVITES_GOOGLE_REFRESH_TOKEN to that value");
    console.log("   4. Redeploy the service");
    console.log("─".repeat(60));
    console.log("");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      "<html><body style='font-family:system-ui;padding:40px;background:#f9f7f4;'>" +
        "<h1>✅ Refresh token captured</h1>" +
        "<p>Check your terminal. You can close this tab.</p>" +
        "</body></html>",
    );
    server.close();
  } catch (err) {
    console.error("\n❌ Unexpected error:", err);
    res.writeHead(500).end("unexpected error");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(` Listening on http://localhost:${PORT}`);
  console.log("");
  console.log(" Opening Google consent URL in your browser…");
  console.log(` (If it doesn't open, copy this URL manually:)\n   ${authUrl.toString()}`);
  console.log("");

  if (!AUTO_OPEN) return;
  const cmd = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "start"
      : "xdg-open";
  spawn(cmd, [authUrl.toString()], { stdio: "ignore", detached: true });
});
