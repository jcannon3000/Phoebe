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
