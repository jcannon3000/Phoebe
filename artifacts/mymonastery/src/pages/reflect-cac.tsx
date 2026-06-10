/**
 * CAC Daily Reflection — the in-app companion page.
 *
 * Where the reader lands after opening the CAC reflection and coming back
 * (see ReflectionReturnRedirect). Three parts:
 *   1. Today's reflection title + a "Read the reflection →" button (opens the
 *      CAC page in the in-app browser; records the read).
 *   2. "Read today" — faces of people in the viewer's community who also read
 *      it today (GET /api/cac/readers).
 *   3. A gratitude-style journal — write a reflection (private by default,
 *      optionally shared to the community wall), see your own + the community's
 *      shared reflections.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import ReflectionThoughts from "@/components/ReflectionThoughts";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { openExternal } from "@/lib/openExternal";
import { CAC_TODAY_URL, recordCacOpened } from "@/lib/cacReadState";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const CTA = "#2D5E3F";

type Reader = { id: number; name: string; avatarUrl: string | null; isYou: boolean };
type Entry = { id: number; text: string; shared: boolean; createdAt: string };
type Response = { id: number; text: string; createdAt: string; authorName: string; avatarUrl: string | null; isYou: boolean };

function initials(name: string): string {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ url, name, size = 34 }: { url: string | null; name: string; size?: number }) {
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: 999, background: "#1A4A2E", color: "#A8C5A0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>{initials(name)}</div>;
}

export default function ReflectCacPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString("en-CA");

  const [text, setText] = useState("");
  const [share, setShare] = useState(false);

  const metaQ = useQuery<{ title: string; url: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    staleTime: 30 * 60_000,
  });
  const readersQ = useQuery<{ count: number; readers: Reader[] }>({
    queryKey: ["/api/cac/readers", today],
    queryFn: () => apiRequest("GET", `/api/cac/readers?ymd=${today}`),
    enabled: !!user,
    staleTime: 60_000,
  });
  const mineQ = useQuery<{ entries: Entry[] }>({
    queryKey: ["/api/cac/reflections/mine"],
    queryFn: () => apiRequest("GET", "/api/cac/reflections/mine"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const wallQ = useQuery<{ responses: Response[] }>({
    queryKey: ["/api/cac/reflections/responses"],
    queryFn: () => apiRequest("GET", "/api/cac/reflections/responses"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const post = useMutation({
    mutationFn: (v: { text: string; shared: boolean }) => apiRequest("POST", "/api/cac/reflections", v),
    onSuccess: () => {
      setText(""); setShare(false);
      qc.invalidateQueries({ queryKey: ["/api/cac/reflections/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/cac/reflections/responses"] });
    },
  });

  const readReflection = () => {
    recordCacOpened();
    openExternal(metaQ.data?.url || CAC_TODAY_URL);
  };

  const readers = readersQ.data?.readers ?? [];
  const others = readers.filter((r) => !r.isYou);
  const mine = mineQ.data?.entries ?? [];
  const wall = (wallQ.data?.responses ?? []).filter((r) => !r.isYou); // your own show under "Your reflections"
  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <p style={{ ...eyebrow, margin: "4px 0 2px" }}>{t("reflect_cac.eyebrow", { defaultValue: "CAC Daily Reflection 🌵" })}</p>
        <h1 style={{ color: WARM, fontSize: 23, fontWeight: 700, fontFamily: FONT, margin: "0 0 14px", lineHeight: 1.25 }}>
          {metaQ.data?.title || t("reflect_cac.title_fallback", { defaultValue: "Today's reflection" })}
        </h1>

        {/* Read button */}
        <button
          type="button"
          onClick={readReflection}
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          {t("reflect_cac.read", { defaultValue: "Read the reflection →" })}
        </button>

        {/* Who read today (community) */}
        {others.length > 0 && (
          <div style={{ margin: "22px 0 0" }}>
            <p style={{ ...eyebrow, margin: "0 0 10px" }}>{t("reflect_cac.read_today", { defaultValue: "Read today" })}</p>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {others.slice(0, 12).map((r) => (
                <div key={r.id} title={r.name}><Avatar url={r.avatarUrl} name={r.name} size={34} /></div>
              ))}
              <span style={{ color: SAGE, fontSize: 13, fontFamily: FONT, marginLeft: 2 }}>
                {others.length === 1
                  ? t("reflect_cac.read_one", { defaultValue: "{{name}} read today", name: others[0].name })
                  : t("reflect_cac.read_n", { defaultValue: "{{count}} in your community read today", count: others.length })}
              </span>
            </div>
          </div>
        )}

        {/* Journal composer */}
        <p style={{ ...eyebrow, margin: "28px 0 8px" }}>{t("reflect_cac.journal", { defaultValue: "Reflect on it" })}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("reflect_cac.placeholder", { defaultValue: "What stayed with you?" })}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", color: WARM, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5, resize: "vertical", outline: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setShare((s) => !s)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <span style={{ width: 38, height: 22, borderRadius: 999, position: "relative", flexShrink: 0, transition: "background 0.15s", background: share ? CTA : "rgba(143,175,150,0.25)", border: `1px solid ${share ? "rgba(168,197,160,0.5)" : "rgba(143,175,150,0.3)"}`, display: "inline-block" }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: WARM, position: "absolute", top: 2, left: share ? 19 : 2, transition: "left 0.15s" }} />
            </span>
            <span style={{ color: SAGE, fontSize: 13, fontFamily: FONT }}>{t("reflect_cac.share", { defaultValue: "Share with my community" })}</span>
          </button>
          <button
            type="button"
            disabled={!text.trim() || post.isPending}
            onClick={() => post.mutate({ text: text.trim(), shared: share })}
            style={{ padding: "9px 18px", borderRadius: 12, background: text.trim() ? CTA : "rgba(46,107,64,0.25)", color: WARM, border: "1px solid rgba(168,197,160,0.35)", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", opacity: post.isPending ? 0.6 : 1 }}
          >
            {t("reflect_cac.save", { defaultValue: "Save" })}
          </button>
        </div>

        {/* Your reflections */}
        {mine.length > 0 && (
          <>
            <p style={{ ...eyebrow, margin: "26px 0 10px" }}>{t("reflect_cac.yours", { defaultValue: "Your reflections" })}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mine.map((e) => (
                <div key={e.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px" }}>
                  <p style={{ color: WARM, fontSize: 14.5, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>{e.text}</p>
                  {e.shared && <p style={{ ...eyebrow, fontSize: 10, margin: "6px 0 0" }}>{t("reflect_cac.shared_badge", { defaultValue: "Shared" })}</p>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Community wall */}
        {wall.length > 0 && (
          <>
            <p style={{ ...eyebrow, margin: "26px 0 10px" }}>{t("reflect_cac.community", { defaultValue: "From your community" })}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {wall.map((r) => (
                <div key={r.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12 }}>
                  <Avatar url={r.avatarUrl} name={r.authorName} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ ...eyebrow, fontSize: 10, margin: "1px 0 4px" }}>{r.authorName}</p>
                    <p style={{ color: WARM, fontSize: 14.5, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ display: "block", margin: "28px auto 0", background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
        >
          {t("reflect_cac.done", { defaultValue: "Done" })}
        </button>
      </div>
    </Layout>
  );
}
