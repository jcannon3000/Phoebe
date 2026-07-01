import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { CobreatheBreath, DEFAULT_TOTAL_BREATHS, CYCLE_MS } from "@/components/CobreatheBreath";
import { useAuth } from "@/hooks/useAuth";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── BETA "Pray the breath" ──────────────────────────────────────────────────
// A Co-Breathe variant where, instead of photos of the earth, the top half of
// the screen holds ONE of the user's own prayer requests at a time — just the
// text, set as a quiet title — rotating one per breath and breathing in and out
// with the lungs. The breath itself is the same paced, embodied prayer; the
// words give it something to rest on. The set rotates through the things the
// user is holding in prayer: their private prayer list (intentions) and the
// community requests they themselves raised.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

const SETTING_SELECT_WRAP: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center" };
const SETTING_SELECT: React.CSSProperties = {
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  background: "transparent", border: "none", outline: "none",
  color: "#A8C5A0", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 500,
  textAlign: "right", textAlignLast: "right", cursor: "pointer", paddingRight: 18,
};
const SETTING_SELECT_CARET: React.CSSProperties = { position: "absolute", right: 0, pointerEvents: "none", color: "#A8C5A0", opacity: 0.7, fontSize: 12 };

function wantsStart(): boolean {
  try { return new URLSearchParams(window.location.search).get("start") === "1"; } catch { return false; }
}

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// The viewer's PRIVATE prayer list (things they keep in prayer). `personName`
// for a person, `body` for a free-text intention; answered ones are dropped.
type PrayerIntention = { id: number; kind: "text" | "person"; personName: string; body: string; answered: boolean };
// The community feed. We rotate only the requests the viewer THEMSELVES raised.
type PrayerRequest = { id: number; body: string; isOwnRequest: boolean; isAnswered: boolean };

// Tidy one request into a single readable line: collapse whitespace, drop a
// trailing period (it's a title, not a sentence), and bound the length so a long
// paragraph doesn't dominate (the breath view also clamps to a few lines).
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");
}

export default function PrayBreathPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const day = localDay();

  const [mode, setMode] = useState<"intro" | "breathing">(() => (wantsStart() ? "breathing" : "intro"));
  const [lengthBreaths, setLengthBreaths] = useState<number>(DEFAULT_TOTAL_BREATHS);
  useKeepAwake(mode === "breathing");

  // One calm landscape behind the intro slide (the breath itself shows no photo
  // in this mode — just the prayer text over the dark-green field).
  const introBgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  // The two sources of "my prayer requests": my private prayer list, and the
  // community requests I raised. Both are best-effort — if either is empty or
  // fails, we fall back to whatever we have.
  const { data: intentionsData } = useQuery<{ intentions: PrayerIntention[] }>({
    queryKey: ["/api/prayer-intentions"],
    queryFn: () => apiRequest("GET", "/api/prayer-intentions"),
    enabled: !!user,
  });
  const { data: requests = [] } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });

  // Build the rotation: my unanswered intentions first (the things I carry),
  // then my own open community requests. Dedupe by text, drop blanks.
  const prayerTexts = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string | null | undefined) => {
      const text = tidy(raw ?? "");
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    };
    for (const i of intentionsData?.intentions ?? []) {
      if (i.answered) continue;
      push(i.kind === "person" ? i.personName : i.body);
    }
    for (const r of requests) {
      if (!r.isOwnRequest || r.isAnswered) continue;
      push(r.body);
    }
    return out;
  }, [intentionsData, requests]);

  // Record the day's breath (counts the Co-Breathe done-state) on reaching the
  // set, and log the time as a contemplation sit on finish — same as Co-Breathe,
  // so a prayed breath counts toward the daily rhythm like any other silence.
  const record = useMutation({
    mutationFn: (seconds: number) =>
      apiRequest("POST", "/api/breath/today", { day, seconds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/breath/today", day] }),
  });
  const handleReachTarget = useCallback((secondsKept: number) => {
    record.mutate(secondsKept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sitLoggedRef = useRef(false);
  const logSit = useCallback((secondsKept: number) => {
    if (sitLoggedRef.current || secondsKept < 2) return;
    sitLoggedRef.current = true;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
    void apiRequest("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      source: "cobreathe",
      durationSeconds: secondsKept,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      isPrivate: false,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      })
      .catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    const breaths = Math.max(0, Math.floor(secondsKept / (CYCLE_MS / 1000)));
    if (reached && breaths >= 1) {
      logSit(secondsKept);
      record.mutate(secondsKept);
    }
    setLocation("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A gentle fallback line when the user has nothing on their list yet — so the
  // breath always has something to hold, and the screen never reads as broken.
  const texts = prayerTexts.length > 0
    ? prayerTexts
    : [t("pray_breath.empty_line", { defaultValue: "Hold whoever is on your heart" })];

  if (mode === "breathing") {
    return (
      <motion.div
        style={{ position: "fixed", inset: 0, zIndex: 80 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <CobreatheBreath
          totalBreaths={lengthBreaths}
          prayerTexts={texts}
          onReachTarget={handleReachTarget}
          onEnd={handleEnd}
        />
      </motion.div>
    );
  }

  return (
    <Layout bgPhoto={introBgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <div className="max-w-xl mx-auto w-full flex flex-col flex-1 justify-start">
          <div className="flex flex-col items-center text-center pt-8">
            <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
              {t("pray_breath.eyebrow", { defaultValue: "Beta · Before you begin" })}
            </p>
            <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(38px, 10vw, 56px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 18 }}>
              {t("pray_breath.title", { defaultValue: "Pray the Breath" })}
            </h1>
            <p style={{ color: "rgba(240,237,230,0.9)", fontFamily: SPACE_GROTESK, fontSize: 17, lineHeight: 1.55, maxWidth: 440, marginBottom: 22 }}>
              {t("pray_breath.blurb", { defaultValue: "The same slow, shared breath — but instead of pictures, one of your prayer requests rests in front of you at a time, breathing in and out with you. Hold each one for a breath, then let the next rise." })}
            </p>

            {prayerTexts.length > 0 ? (
              <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 1.5, maxWidth: 420, marginBottom: 24 }}>
                {t("pray_breath.count_line", { defaultValue: "Rotating through {{count}} from your prayer list.", count: prayerTexts.length })}
              </p>
            ) : (
              <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 1.5, maxWidth: 420, marginBottom: 24 }}>
                {t("pray_breath.empty_hint", { defaultValue: "Your prayer list is empty — add a few intentions on your Prayer List and they'll appear here." })}
              </p>
            )}

            <div className="w-full" style={{ maxWidth: 440 }}>
              <div style={{ height: 1, background: "rgba(200,212,192,0.14)", marginBottom: 14 }} />
              <div className="w-full flex items-center justify-between rounded-xl px-4 py-3 mb-2"
                style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.32)" }}>
                <span style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600 }}>{t("cobreathe.set_length", { defaultValue: "Length" })}</span>
                <div style={SETTING_SELECT_WRAP}>
                  <select value={lengthBreaths} onChange={(e) => setLengthBreaths(Number(e.target.value))} style={SETTING_SELECT} aria-label={t("cobreathe.set_length", { defaultValue: "Length" })}>
                    {[6, 12, 18, 24, 30, 36].map((n) => (
                      <option key={n} value={n}>{n} {t("cobreathe.breaths", { defaultValue: "breaths" })}</option>
                    ))}
                  </select>
                  <span aria-hidden style={SETTING_SELECT_CARET}>▾</span>
                </div>
              </div>
              <p style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK, fontSize: 13.5, lineHeight: 1.5, marginTop: 12, textAlign: "center" }}>
                {t("cobreathe.invite_note", { defaultValue: "An invitation, not a goal — breathe as many as you have in you, and stop whenever you like." })}
              </p>
              <div style={{ height: 1, background: "rgba(200,212,192,0.14)", marginTop: 14, marginBottom: 20 }} />
              <button
                type="button"
                onClick={() => setMode("breathing")}
                className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(168,197,160,0.45)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
              >
                {t("pray_breath.begin", { defaultValue: "Begin" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
