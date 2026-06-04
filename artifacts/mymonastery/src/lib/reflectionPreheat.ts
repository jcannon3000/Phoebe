// Fired from a daily-reflection home card when the user taps to open the
// newsletter in the in-app browser. ReflectionPreheater (mounted globally)
// listens and warms the RETURN destination — the in-app reflection page the
// reader lands on when they come back (see ReflectionReturnRedirect) — so it's
// ready instead of loading:
//   • CAC  → /reflect/cac: its route chunk + /api/cac/* data.
//   • FDD  → /menu/reflections/fdd: its route chunk + the embedded newsletter
//            URL (warmed in a hidden background iframe).
//   • SSJE → /menu/reflections/ssje: same as FDD.
// Best-effort: dispatching never throws and a missed warm just means the page
// loads on arrival as it would have anyway.
export const PREHEAT_REFLECTION_EVENT = "phoebe:preheat-reflection";

export type ReflectionSource = "cac" | "fdd" | "ssje";

export function preheatReflection(source: ReflectionSource): void {
  try {
    window.dispatchEvent(new CustomEvent(PREHEAT_REFLECTION_EVENT, { detail: { source } }));
  } catch {
    /* no-op — preheating is best-effort */
  }
}
