// Single-source-of-truth for "are we running inside the Phoebe iOS
// native shell?" — bundled mymonastery served from capacitor://localhost,
// our shell injects `window.PhoebeNative` with an `isNative()` probe.
// On regular web (Safari, Chrome, Android browsers, in-app browsers
// like Instagram/FBAN) the global is absent and we read as false.
//
// Use this to:
//   • Hide App Store install banners (the user is already in the app).
//   • Skip web-push permission prompts in favour of APNs registration.
//   • Surface native-only affordances (haptics, Apple Sign-In injection).
//
// The triple-cast `(window as { PhoebeNative?: { isNative?: ... } })`
// used to live inline in 8+ call sites; touching any one of them was an
// invitation to typo the shape and silently regress to "always web".
// Centralising the cast also means a future shell-API rename (e.g. the
// shell starts setting `window.PhoebeNative.platform === "ios"` instead)
// changes one file, not nine.

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as { PhoebeNative?: { isNative?: () => boolean } })
    .PhoebeNative?.isNative?.();
}

/**
 * Is this the iOS Simulator or the Android emulator — a test run, not a
 * person? The shell knows (native-shell's isSimulator: a flag the Simulator
 * build injects; the emulator's own user agent). apiRequest tells the API
 * with X-Phoebe-Simulator so App Metrics can leave the run out (owner,
 * 2026-09-16: "make sure simulator sessions are not being counted"). Always
 * false on the web and on a phone.
 */
export function isSimulatorShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (window as { PhoebeNative?: { isSimulator?: () => boolean } })
      .PhoebeNative?.isSimulator?.() === true;
  } catch {
    return false;
  }
}
