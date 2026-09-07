
// Top-of-app banner that surfaces network trouble in language the user
// can act on. Two modes:
//
// 1. `offline`: navigator.onLine says we're off — the OS knows for sure.
//    Render an amber strip that reads "📡 You're offline."
//
// 2. `flaky`: navigator.onLine is true, but we've accumulated several
//    query failures in a short window. Common on captive-portal / hotel /
//    library Wi-Fi that TCP-resets some TLS handshakes while letting
//    others through. Point the user at the real fix — portal terms or
//    switching to cellular — instead of showing Safari's generic
//    "Can't establish secure connection" page (which can't be
//    overridden from app code because it fires before our JS loads).
//
// The banner self-dismisses once a query succeeds.
/**
 * SILENT (owner, 2026-09-06: "that top banner is honestly not needed").
 *
 * It announced the connection over practices that were working perfectly from
 * the phone — the office mid-deck, a saved reading, Visio with its picture up.
 * Now that the app genuinely works offline, being offline is not news: the
 * screens that DO need a connection say so themselves, in their own words
 * ("Audio Divina · Offline", "this reading isn't saved yet", the home's Not
 * available section). A banner over everything else is a second voice
 * interrupting prayer to describe the network.
 *
 * Kept as a component, rendering nothing, so App.tsx's tree is unchanged and
 * bringing a banner back is one file. The old body — OS-offline detection and
 * a flaky-connection heuristic — is in the history at cea8b3dc if it is ever
 * wanted again; keeping a dead copy here only invited someone to re-enable it.
 */
export function NetworkBanner() {
  return null;
}

