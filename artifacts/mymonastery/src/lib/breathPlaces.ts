/**
 * Designated places to breathe — the client half.
 *
 * Owner: "they could choose locations we're designating as specific spots. At
 * these spots we could [show] all the breaths of people who breathed there
 * today." Then, on how someone gets associated with a spot: "pick, but GPS to
 * verify."
 *
 * ── The privacy shape, which is the point ──
 *
 * The person PICKS a place from the admin-curated list; that is the intent and
 * the source of truth. The device then compares its own position against that
 * place's fixed coordinates HERE, on the phone, and sends the server a single
 * boolean. Coordinates never leave the device — not to our server, not to
 * anyone's — and nothing derived from them is stored.
 *
 * That distinction is what lets this exist. Phoebe removed location twice, once
 * as an explicit App Store blocker (f900693b), and Co-Breathe's old "same air"
 * — a count of people who breathed NEAR you — went with it. That feature had to
 * know where everybody was. This one only ever asks "is this device within
 * 150m of a chapel an admin typed in", and forgets the answer's inputs
 * immediately.
 */

/** Metres between two points on the earth (haversine, mean earth radius). */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8; // IUGG mean earth radius
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type BreathPlace = {
  id: number;
  name: string;
  subtitle: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** This place's own backdrop photos (https URLs). Empty = use the bundled set. */
  photoUrls: string[];
  /** Glyph for the centre of the breathing rings. Null = the default globe. */
  centerEmoji: string | null;
  /** Only present on the admin listing (includeInactive=1); undefined elsewhere. */
  active?: boolean;
  breathsToday: number;
  verifiedToday: number;
};

/**
 * "Is this device actually at that place?"
 *
 * Resolves FALSE for every unhappy path — permission denied, no fix, timeout,
 * a browser with no geolocation at all — and never throws. False is a normal
 * outcome, not an error: the breath still counts and still attributes to the
 * place the person chose. Only the "standing here" tally distinguishes it.
 * Refusing to record someone's prayer because their GPS was slow indoors
 * would be a far worse failure than an unverified row.
 */
export function verifyAtPlace(
  place: Pick<BreathPlace, "lat" | "lng" | "radiusMeters">,
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  const timeout = opts?.timeoutMs ?? 8000;
  return new Promise((resolve) => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo) { resolve(false); return; }
    let settled = false;
    const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
    // Our own timer as well as the API's: a WKWebView that never surfaces the
    // permission prompt leaves the callback pending forever, and a breath
    // must not hang waiting on it.
    const timer = setTimeout(() => done(false), timeout + 1000);
    try {
      geo.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const d = metersBetween(pos.coords.latitude, pos.coords.longitude, place.lat, place.lng);
          // The fix's OWN accuracy widens the radius. A 150m chapel radius
          // with a ±60m indoor fix should accept someone genuinely inside it;
          // comparing against the bare radius would reject the very people the
          // place exists for. Capped so a wildly imprecise fix (a cell-tower
          // triangulation off by kilometres) can't verify anything anywhere.
          const slack = Math.min(pos.coords.accuracy ?? 0, 250);
          done(d <= place.radiusMeters + slack);
        },
        () => { clearTimeout(timer); done(false); },
        { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
      );
    } catch { clearTimeout(timer); done(false); }
  });
}
