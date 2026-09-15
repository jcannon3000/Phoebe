import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, hasEverAuthenticated } from "@/hooks/useAuth";
import { ensureAnonymousUser } from "@/lib/guestProvision";
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
 *    purpose, and this keeps that promise;
 *  - an account whose cookie lapsed but whose persistent token can recover it
 *    (useAuth's own 401 path);
 *  - a page load that has seen a signed-in user (a logout in progress);
 *  - no connection, where the attempt would only burn the hour's retry;
 *  - the sign-in and password pages, so nobody on the way into an account has
 *    a device row minted under them first; "/" stays welcome-public's.
 */
const SKIP = new Set(["/", "/signin", "/onboarding", "/forgot-password", "/reset-password", "/beta", "/beta/claim", "/invite", "/invite/share", "/pray"]);

export function AnonymousDeviceProvisioner() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (!PHOEBE_GUEST_ENABLED || isLoading || user) return;
    if (SKIP.has(location)) return;
    if (hasEverAuthenticated() || getPersistentToken() || !isOnline()) return;
    void ensureAnonymousUser().then((created) => {
      // Every query that raced the POST came back 401 and the client does not
      // retry a 4xx — refetch them all, as welcome-public does.
      if (created) void qc.invalidateQueries();
    });
  }, [user, isLoading, location, qc]);

  return null;
}
