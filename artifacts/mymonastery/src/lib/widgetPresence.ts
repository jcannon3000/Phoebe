// Whether to offer "Widget" in the menu: an iPhone/iPad app that has no Phoebe
// widget placed on a Home or Lock Screen. WidgetKit is the only thing that knows
// (PhoebeNative.hasActiveWidget, see phoebe-mobile native-shell). It answers false
// when it cannot tell, so "no widget" can also mean "unreadable" - the row is an
// offer, not a claim, and costs nothing to see. Web and Android have no widget.
export async function shouldOfferWidget(): Promise<boolean> {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform?.() !== "ios") return false;
    const native = (window as unknown as { PhoebeNative?: { hasActiveWidget?: () => Promise<boolean> } }).PhoebeNative;
    if (!native?.hasActiveWidget) return true; // an older shell that cannot say: offer it
    return !(await native.hasActiveWidget());
  } catch {
    return false;
  }
}
