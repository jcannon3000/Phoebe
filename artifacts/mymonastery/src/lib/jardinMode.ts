// El Jardín portal mode.
//
// The portal is the same Phoebe app, reachable two ways:
//   • the eljardin.withphoebe.app subdomain (host-gated), and
//   • the withphoebe.app/jardin path.
// A jardinOnly account is always "in" the portal regardless of how they
// arrived. These helpers let routing/nav decide when to show the Jardín
// experience and hide the rest of Phoebe.

export function isJardinHost(): boolean {
  try {
    return window.location.hostname.toLowerCase().startsWith("eljardin.");
  } catch {
    return false;
  }
}

// On a /jardin* path (the main-domain portal entry).
export function isJardinPath(): boolean {
  try {
    return window.location.pathname.toLowerCase().startsWith("/jardin");
  } catch {
    return false;
  }
}

// True when we're in the Jardín portal context at all: the subdomain, a
// /jardin* path, or (most importantly) a Jardín account. Pass the user's
// jardin flags from useAuth so a portal account is always treated as Jardín.
export function isJardinContext(opts?: { jardinOnly?: boolean; jardinEnrolled?: boolean }): boolean {
  return isJardinHost() || isJardinPath() || !!opts?.jardinOnly || !!opts?.jardinEnrolled;
}

// SEALED Jardín shell — the user should see ONLY the Jardín experience, with
// the rest of Phoebe hidden. Stronger than isJardinContext (which also covers
// the /jardin path and dual-enrolled users who still keep the full app).
//
// Sealed when:
//   • on the eljardin.* subdomain, OR
//   • a jardinOnly account (created through the portal — a hard lock), OR
//   • a Jardín-origin account (jardinEnrolled) that is a member of a Jardín
//     group. This last seal is LIVE: it holds only while they belong to a
//     focus='jardin' group (inJardinGroup, derived on /api/auth/me) and lifts
//     when they leave. A regular Phoebe user who joins a Jardín group is NOT
//     sealed — only Jardín-origin accounts are.
export function isJardinSealed(
  opts?: { jardinOnly?: boolean; jardinEnrolled?: boolean; inJardinGroup?: boolean } | null,
): boolean {
  if (isJardinHost()) return true;
  if (opts?.jardinOnly) return true;
  return !!opts?.jardinEnrolled && !!opts?.inJardinGroup;
}
