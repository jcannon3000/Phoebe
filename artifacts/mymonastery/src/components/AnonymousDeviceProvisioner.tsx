import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, hasEverAuthenticated } from "@/hooks/useAuth";
import { ensureAnonymousUser, noteSignedOutDay, clearSignedOutDays, SIGNED_OUT_DAYS_BEFORE_ID } from "@/lib/guestProvision";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { getPersistentToken } from "@/lib/persistentAuth";
import { isOnline } from "@/lib/offline";

/**
 * A PHONE WITHOUT AN ACCOUNT GETS ITS DEVICE USER FROM ANY DOOR, not only "/".
 *
 * The anonymous device user (lib/guestProvision) was minted by the welcome
 * route alone. Anyone who came in another way — the installed web app, which
 * starts at /dashboard; a shared link; a bookmark — stayed with no session at
 * all, so every office and sit they prayed was POSTed, refused 401, and
 * dropped by the outbox: nothing on the admin metrics, nothing synced (audit,
 * 2026-09-15 — owner: "make sure it counts anyone who is using it on their
 * phone but doesn't have an account").
 *
 * Same once-per-install stamp and hourly retry as "/", and it stands aside for:
 *  - a phone already provisioned — the stamp survives a deliberate logout on
 *    purpose — UNTIL it has been used signed out on more than two days (owner,
 *    2026-09-15: "If they use it for more then 2 days asign them an id"; see
 *    noteSignedOutDay);
 *  - an account whose cookie lapsed but whose persistent token can recover it
 *    (useAuth's own 401 path);
 *  - a page load that has seen a signed-in user (a logout in progress);
 *  - no connection, where the attempt would only burn the hour's retry;
 *  - the sign-in and password pages, so nobody on the way into an account has
 *    a device row minted under them first; "/" stays welcome-public's.
 */
const SKIP = new Set(["/", "/signin", "/onboarding", "/forgot-password", "/reset-password", "/beta", "/beta/claim", "/invite", "/invite/share", "/pray"]);

export function AnonymousDeviceProvisioner() {
  const { user, isLoading, settled } = useAuth();
  const [location] = useLocation();
  const qc = useQueryClient();
  // Re-check when the app comes back to the front: a phone left open reaches
  // its third day without ever changing route.
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const bump = () => setWake((n) => n + 1);
    const onVisible = () => { if (document.visibilityState === "visible") bump(); };
    window.addEventListener("phoebe:appactive", bump);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("phoebe:appactive", bump);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!PHOEBE_GUEST_ENABLED || isLoading) return;
    // Decide on a FRESH answer whenever there is a connection to get one. The
    // user rehydrated from the offline cache can be a session that has since
    // lapsed — acting on it cleared the signed-out day count on every boot, so
    // the third day never came. Offline, the cached answer is all there is.
    if (!settled && isOnline()) return;
    if (user) { clearSignedOutDays(); return; }
    const signedOutDays = noteSignedOutDay();
    if (SKIP.has(location)) return;
    if (hasEverAuthenticated() || getPersistentToken() || !isOnline()) return;
    void ensureAnonymousUser({ force: signedOutDays > SIGNED_OUT_DAYS_BEFORE_ID }).then((created) => {
      // Every query that raced the POST came back 401 and the client does not
      // retry a 4xx — refetch them all, as welcome-public does.
      if (created) void qc.invalidateQueries();
    });
  }, [user, isLoading, settled, location, qc, wake]);

  return null;
}
