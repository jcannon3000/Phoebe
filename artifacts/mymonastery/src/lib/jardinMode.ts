// El Jardín portal mode.
//
// The portal is the same Phoebe app served at eljardin.withphoebe.app. We
// detect it by hostname so the routing/landing can send portal visitors into
// the Jardín experience. Everything here is host-gated, so on the main
// withphoebe.app host these checks are false and the main app is untouched.

export function isJardinHost(): boolean {
  try {
    return window.location.hostname.toLowerCase().startsWith("eljardin.");
  } catch {
    return false;
  }
}
