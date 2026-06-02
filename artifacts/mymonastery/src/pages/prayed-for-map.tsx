/**
 * "Places you've been prayed for" — a personal map of where prayers came from.
 *
 * A stylized constellation: a faint equirectangular world (graticule +
 * continent labels) with a soft glowing light at the coarse (~1 mile)
 * location of every Amen left on a request the viewer is the subject of
 * (owned or tagged in), by other people who opted in to sharing location.
 *
 * Read-only and dependency-free — no map tiles, no API key, works offline.
 * The lights populate from OTHER people's opt-in (when someone who has
 * location sharing on prays for you), so this page never asks the viewer
 * to enable anything; it just shows what's arrived.
 */

import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Point = { lat: number; lng: number; count: number };

// Rough continent label anchors (lng, lat) for gentle geographic grounding.
const CONTINENTS: Array<{ label: string; lng: number; lat: number }> = [
  { label: "N. AMERICA", lng: -100, lat: 46 },
  { label: "S. AMERICA", lng: -60, lat: -18 },
  { label: "EUROPE", lng: 12, lat: 56 },
  { label: "AFRICA", lng: 20, lat: 3 },
  { label: "ASIA", lng: 95, lat: 50 },
  { label: "OCEANIA", lng: 140, lat: -25 },
];

// Equirectangular projection. 1 SVG unit = 1°: lng −180..180 → x 0..360,
// lat 90..−90 → y 0..180. Dots and labels share this same mapping.
const projX = (lng: number) => lng + 180;
const projY = (lat: number) => 90 - lat;

export default function PrayedForMapPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [authLoading, user, setLocation]);

  const q = useQuery<{ points: Point[] }>({
    queryKey: ["/api/prayer-requests/prayed-for-locations"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/prayed-for-locations"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const points = useMemo(() => q.data?.points ?? [], [q.data]);
  const totalPrayers = points.reduce((s, p) => s + p.count, 0);

  if (authLoading || !user) return null;

  const graticuleLng = [30, 60, 90, 120, 150, 210, 240, 270, 300, 330]; // x = lng+180
  const graticuleLat = [30, 60, 120, 150]; // y; 90 (equator) drawn separately

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "4px 2px 28px" }}>
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, margin: "4px 0 2px" }}>
          {t("prayed_for_map.eyebrow", { defaultValue: "A constellation of care" })}
        </p>
        <h1 style={{ color: WARM, fontSize: 25, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px" }}>
          {t("prayed_for_map.title", { defaultValue: "Where you've been prayed for" })}
        </h1>
        <p style={{ color: SAGE, fontSize: 14, lineHeight: 1.5, margin: "0 0 18px" }}>
          {t("prayed_for_map.subtitle", { defaultValue: "Each light is a place someone was when they prayed for you." })}
        </p>

        {/* The map */}
        <div style={{ width: "100%", aspectRatio: "2 / 1", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(46,107,64,0.26)", background: "rgba(7,18,11,0.55)" }}>
          <svg viewBox="0 0 360 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("prayed_for_map.title", { defaultValue: "Where you've been prayed for" })}>
            <defs>
              <radialGradient id="prayGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#DCEBD2" stopOpacity="0.95" />
                <stop offset="35%" stopColor="#A8C5A0" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#8FAF96" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Graticule */}
            <g stroke="rgba(143,175,150,0.10)" strokeWidth="0.3">
              {graticuleLng.map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={180} />)}
              {graticuleLat.map((y) => <line key={`h${y}`} x1={0} y1={y} x2={360} y2={y} />)}
            </g>
            {/* Equator + prime meridian, a touch stronger */}
            <g stroke="rgba(143,175,150,0.16)" strokeWidth="0.4">
              <line x1={0} y1={90} x2={360} y2={90} />
              <line x1={180} y1={0} x2={180} y2={180} />
            </g>

            {/* Continent labels — faint grounding */}
            <g fill="rgba(143,175,150,0.30)" fontFamily={FONT} fontSize="5.2" fontWeight="700" letterSpacing="0.6" textAnchor="middle">
              {CONTINENTS.map((c) => (
                <text key={c.label} x={projX(c.lng)} y={projY(c.lat)}>{c.label}</text>
              ))}
            </g>

            {/* Prayer lights */}
            <g className="pray-constellation">
              {points.map((p, i) => {
                const cx = projX(p.lng);
                const cy = projY(p.lat);
                const core = 0.9 + Math.min(2.4, Math.log2(p.count + 1) * 0.9);
                const halo = core * 4.2;
                return (
                  <g key={`${p.lat},${p.lng},${i}`}>
                    <circle cx={cx} cy={cy} r={halo} fill="url(#prayGlow)" />
                    <circle cx={cx} cy={cy} r={core} fill="#F2F6EA" />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Summary / empty state */}
        {points.length > 0 ? (
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, textAlign: "center", margin: "16px 0 0", lineHeight: 1.5 }}>
            {t("prayed_for_map.summary", {
              defaultValue: "{{prayers}} prayers from {{places}} places.",
              prayers: totalPrayers,
              places: points.length,
            })}
          </p>
        ) : (
          <p style={{ color: SAGE_DIM, fontSize: 13.5, fontFamily: FONT, fontStyle: "italic", textAlign: "center", margin: "16px 0 0", lineHeight: 1.55 }}>
            {q.isLoading
              ? t("common.loading", { defaultValue: "Loading…" })
              : t("prayed_for_map.empty", { defaultValue: "No places yet. Lights appear here when someone who's turned on location sharing prays for you." })}
          </p>
        )}
      </div>
    </Layout>
  );
}
