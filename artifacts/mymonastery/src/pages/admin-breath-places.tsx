/**
 * Admin: designated places to breathe.
 *
 * Owner: "we also need a flow to create the locations" — "only admins."
 *
 * Everything an admin types here is a claim about the physical world: that a
 * real public place exists at real coordinates. A swapped lat/lng is the
 * failure mode to design against, because it has no visible symptom — the
 * place looks fine, and verification silently never succeeds for anyone
 * standing in it. So the form states the ranges, shows the pair back, and
 * offers "use my current location" as the way to avoid typing them at all.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import type { BreathPlace } from "@/lib/breathPlaces";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.09)";
const CARD_B = "rgba(110,180,130,0.25)";

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

const input: React.CSSProperties = {
  width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
  background: "rgba(9,26,16,0.5)", border: `1px solid ${CARD_B}`, borderRadius: 10,
  padding: "10px 12px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none",
  colorScheme: "dark",
};
const label: React.CSSProperties = {
  color: FAINT, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em",
  fontFamily: FONT, fontWeight: 600, display: "block", marginBottom: 6,
};

export default function AdminBreathPlacesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsAdmin: isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("150");
  const [emoji, setEmoji] = useState("");
  const [photos, setPhotos] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isAdmin) setLocation("/dashboard");
  }, [user, isAdmin, authLoading, betaLoading, setLocation]);

  const day = localDay();
  /**
   * Admins see RETIRED places too, on their own query key.
   *
   * The key must differ from the reader's ["/api/breath/places", day] — same
   * key, different response would let this screen's admin-only payload
   * (retired places included) be served to the Co-Breathe picker from cache.
   */
  const listQ = useQuery<{ places: BreathPlace[] }>({
    queryKey: ["/api/breath/places", day, "admin"],
    queryFn: () => apiRequest("GET", `/api/breath/places?day=${day}&includeInactive=1`),
    enabled: !!user && isAdmin,
  });
  const places = listQ.data?.places ?? [];

  const reset = () => {
    setEditingId(null); setName(""); setSubtitle(""); setLat(""); setLng("");
    setRadius("150"); setEmoji(""); setPhotos(""); setError(null);
  };

  const body = () => ({
    name: name.trim(),
    subtitle: subtitle.trim(),
    lat: Number(lat),
    lng: Number(lng),
    radiusMeters: Number(radius),
    centerEmoji: emoji.trim(),
    // One per line is the only format that doesn't fight URLs — they can
    // contain commas, so a comma-separated list would split real links.
    photoUrls: photos.split("\n").map((s) => s.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: () =>
      editingId === null
        ? apiRequest("POST", "/api/breath/places", body())
        : apiRequest("PATCH", `/api/breath/places/${editingId}`, body()),
    onSuccess: () => { reset(); void qc.invalidateQueries({ queryKey: ["/api/breath/places"] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save."),
  });

  const setActive = useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/breath/places/${v.id}`, { active: v.active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["/api/breath/places", day] }),
  });

  const edit = (p: BreathPlace) => {
    setEditingId(p.id); setName(p.name); setSubtitle(p.subtitle ?? "");
    setLat(String(p.lat)); setLng(String(p.lng)); setRadius(String(p.radiusMeters));
    setEmoji(p.centerEmoji ?? ""); setPhotos((p.photoUrls ?? []).join("\n"));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Fill the coordinates from where the admin is standing — the reliable way
   *  to get a place right is to create it while you're in it. */
  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device can't provide a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => { setLocating(false); setError("Couldn't read this device's location."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 },
    );
  };

  if (authLoading || betaLoading || !user || !isAdmin) return null;

  const canSave = name.trim().length >= 2 && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== "" && lng !== "";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24" style={{ minWidth: 0 }}>
        <p style={{ ...label, marginBottom: 4 }}>Admin</p>
        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>
          Places to breathe
        </h1>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" }}>
          Spots people can choose when they breathe. Each one shows how many have
          breathed there today, and can carry its own backdrop photos and centre glyph.
        </p>

        {/* ── The form ── */}
        <div style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 16, padding: 16, marginBottom: 24 }}>
          <p style={{ color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>
            {editingId === null ? "New place" : "Editing place"}
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>Name</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="St. Mark's Chapel" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Subtitle (optional)</label>
            <input style={input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Alexandria, Virginia" />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={label}>Latitude (−90 … 90)</label>
              <input style={input} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="38.8048" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={label}>Longitude (−180 … 180)</label>
              <input style={input} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="-77.0669" />
            </div>
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: locating ? "wait" : "pointer", padding: "6px 0", marginBottom: 12 }}
          >
            {locating ? "Reading location…" : "📍 Use my current location"}
          </button>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={label}>Radius (metres)</label>
              <input style={input} value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="numeric" />
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, margin: "5px 2px 0" }}>
                How close counts as "here". Be generous — an indoor GPS fix is
                routinely off by tens of metres, and wrongly telling someone
                standing in the chapel that they aren't there is the worse error.
              </p>
            </div>
            <div style={{ width: 110, flexShrink: 0 }}>
              <label style={label}>Centre glyph</label>
              <input style={{ ...input, textAlign: "center", fontSize: 20 }} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🌍" />
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, margin: "5px 2px 0" }}>
                Blank keeps the globe.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={label}>Backdrop photos — one https URL per line</label>
            <textarea
              style={{ ...input, minHeight: 90, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
              value={photos}
              onChange={(e) => setPhotos(e.target.value)}
              placeholder={"https://example.org/chapel-1.jpg\nhttps://example.org/chapel-2.jpg"}
            />
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, margin: "5px 2px 0" }}>
              Must be https — these load inside the app, and an http URL is
              mixed content the WebView will silently refuse. Leave blank to use
              the standard landscapes.
            </p>
          </div>

          {error && (
            <p style={{ color: "#E5A0A0", fontFamily: FONT, fontSize: 13, margin: "0 0 10px" }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              disabled={!canSave || save.isPending}
              onClick={() => { setError(null); save.mutate(); }}
              style={{
                flex: 1, borderRadius: 12, padding: "12px 16px", fontFamily: FONT, fontSize: 15, fontWeight: 700,
                background: canSave ? "rgba(46,107,64,0.55)" : "rgba(46,107,64,0.2)",
                border: `1px solid ${CARD_B}`, color: WARM, cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              {save.isPending ? "Saving…" : editingId === null ? "Create place" : "Save changes"}
            </button>
            {editingId !== null && (
              <button type="button" onClick={reset}
                style={{ borderRadius: 12, padding: "12px 16px", fontFamily: FONT, fontSize: 15, background: "transparent", border: `1px solid ${CARD_B}`, color: SAGE, cursor: "pointer" }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* ── The list ── */}
        <p style={{ ...label, marginBottom: 10 }}>Existing places</p>
        {listQ.isLoading && <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14 }}>Loading…</p>}
        {!listQ.isLoading && places.length === 0 && (
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.5 }}>
            No places yet. The first one you create will appear for everyone on the
            Co-Breathe "Enter location" screen.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {places.map((p) => (
            <div key={p.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", opacity: p.active === false ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>{p.centerEmoji || "🌍"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "2px 0 0" }}>
                    {p.active === false ? "Retired · " : ""}{p.breathsToday} today · {p.radiusMeters}m · {(p.photoUrls ?? []).length} photo{(p.photoUrls ?? []).length === 1 ? "" : "s"}
                    {p.subtitle ? ` · ${p.subtitle}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => edit(p)}
                  style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "4px 8px", flexShrink: 0 }}>
                  Edit
                </button>
                {/* Retire, never delete — the breaths kept here are real
                    history. Reversible, which it wasn't until this screen
                    started asking for inactive places: a retired row dropped
                    out of the only list that could bring it back. */}
                <button type="button" onClick={() => setActive.mutate({ id: p.id, active: p.active === false })}
                  style={{ background: "none", border: "none", color: p.active === false ? SAGE : "rgba(143,175,150,0.55)", fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "4px 8px", flexShrink: 0 }}>
                  {p.active === false ? "Restore" : "Retire"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
