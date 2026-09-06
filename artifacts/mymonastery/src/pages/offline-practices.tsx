/**
 * /offline — everything Phoebe can do with no connection (owner, 2026-09-05:
 * "a menu list with cards of everything that they can do offline").
 *
 * The list is lib/offline's registry; the status under each "saved" card is
 * read from the device — today's office, the scripture deck and its passages,
 * Visio's picture — so the page says what is actually on the phone, not
 * what the prefetch intends.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PracticeCard } from "@/components/DailyProgressBody";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { OFFLINE_PRACTICES, useOnline } from "@/lib/offline";
import { getOfficeCacheEntry } from "@/lib/officeOfflineCache";
import { getScriptureParts } from "@/lib/officePrefs";
import { passageRefFromUrl } from "@/lib/passageCache";
import { hasSavedPage } from "@/lib/pageCache";
import { hasCachedImage } from "@/lib/imageCache";
import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { artworkById, readingUrl } from "@/lib/visioSelect";
import { isNativeShell } from "@/lib/isNativeShell";

const WARM = "#F0EDE6";
const SAGE = "#A8C5A0";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today's copy is on your phone" / "Not saved yet" — per saved practice. */
async function savedStatus(key: string): Promise<string | null> {
  const date = todayYmd();
  const has = async (k: Parameters<typeof getOfficeCacheEntry>[0]) => !!(await getOfficeCacheEntry(k));
  if (key === "office") {
    const any = (await has({ mode: "morning", date, confession: "" })) || (await has({ mode: "morning", date, confession: "1" })) || (await has({ mode: "morning", date, confession: "0" }))
      || (await has({ mode: "evening", date, confession: "" })) || (await has({ mode: "compline", date, confession: "" }))
      || (await has({ mode: "morning-devotion", date, confession: "" })) || (await has({ mode: "early-evening-devotion", date, confession: "" }));
    return any ? "Today's office is on your phone" : "Not saved yet — opens the app on Wi-Fi to save the month";
  }
  if (key === "scripture" || key === "lectio") {
    const parts = getScriptureParts();
    const partsValue = parts && parts.length < 4 ? parts.join(",") : "";
    const deck = (await getOfficeCacheEntry({ mode: "scripture", date, confession: "", ...(partsValue ? { parts: partsValue } : {}) })) as { slides?: Array<{ metadata?: { readUrl?: unknown } }> } | null;
    if (!deck) return "Not saved yet — opens the app on Wi-Fi to save the month";
    // The PAGES, now, not extracted text — what the reader actually opens.
    const urls = (deck.slides ?? [])
      .map((s) => (typeof s.metadata?.readUrl === "string" && passageRefFromUrl(s.metadata.readUrl) ? s.metadata.readUrl : null))
      .filter((u): u is string => !!u);
    let n = 0;
    for (const u of urls) if (await hasSavedPage(u)) n++;
    return urls.length === 0 || n === urls.length ? "Today's readings are on your phone" : `${n} of ${urls.length} readings saved`;
  }
  if (key === "visio") {
    const v = VISIO_SCHEDULE[date];
    const art = v ? artworkById(v.id) : null;
    if (!art?.img) return null;
    const img = await hasCachedImage(art.img);
    const readingUrl2 = v?.ref ? readingUrl(v.ref) : null;
    const txt = readingUrl2 ? await hasSavedPage(readingUrl2) : true;
    return img && txt ? "This week's picture and reading are on your phone" : img ? "Picture saved; reading not yet" : "Not saved yet — opens the app on Wi-Fi to save the month";
  }
  return null;
}

export default function OfflinePracticesPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const online = useOnline();
  const [bg] = useState(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null));
  const [status, setStatus] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, string | null> = {};
      for (const p of OFFLINE_PRACTICES) if (p.how === "saved") out[p.key] = await savedStatus(p.key);
      if (!cancelled) setStatus(out);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Layout bgPhoto={bg}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
          <button type="button" onClick={() => setLocation("/menu")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}>
            ← {t("menu.title", { defaultValue: "Menu" })}
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>{t("offline.title", { defaultValue: "Available offline" })}</h1>
          <p style={{ color: "rgba(200,212,192,0.8)", fontSize: 15, lineHeight: 1.5, margin: "0 0 18px" }}>
            {online
              ? t("offline.intro_online", { defaultValue: "Everything here works with no connection. The offices, the readings and the coming weeks' pictures are saved to your phone whenever the app opens on Wi-Fi." })
              : t("offline.intro_offline", { defaultValue: "You're offline. Everything here still works; anything else in your routine waits until you're back." })}
            {!isNativeShell() && (
              <span style={{ display: "block", marginTop: 6, color: "rgba(143,175,150,0.8)", fontSize: 13 }}>
                {t("offline.web_note", { defaultValue: "Saving ahead happens in the iPhone app; on the web, what you have opened recently stays available." })}
              </span>
            )}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OFFLINE_PRACTICES.map((p) => (
              <PracticeCard
                key={p.key}
                href={p.href}
                emoji={p.emoji}
                title={p.title}
                blurb={status[p.key] ?? p.sub}
                cta={p.key === "visio" ? t("rhythm.view", { defaultValue: "View" }) : t("rhythm.begin", { defaultValue: "Begin" })}
                done={false}
                rgb="120,150,125"
                tint={0.35}
                onClick={() => setLocation(p.href)}
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
