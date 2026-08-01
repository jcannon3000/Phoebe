// ─── CAC Daily Reflection (beta, admin tools only) — read in-app ─────────────
//
// The full text of today's CAC daily meditation, read inside Phoebe instead
// of linking out to cac.org. See lib/cacDailyReflection.ts — paragraphs are
// plain text only (server-side strip of the feed's HTML), rendered as plain
// <p> tags, never dangerouslySetInnerHTML.

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { useCacDailyReflection } from "@/lib/cacDailyReflection";
import { useBetaStatus } from "@/hooks/useDemo";
import { openExternal } from "@/lib/openExternal";
import { CAC, CacFrame, CacButton } from "@/lib/cacTheme";

export default function CacReflectionPage() {
  const { isAdmin } = useBetaStatus();
  const { data, isLoading } = useCacDailyReflection();

  if (!isAdmin) {
    return (
      <Layout>
        <CacFrame>
          <p className="py-16 text-center text-sm" style={{ color: CAC.inkMuted }}>
            This is a beta feature — not open yet.
          </p>
        </CacFrame>
      </Layout>
    );
  }

  return (
    <Layout>
      <CacFrame>
        <div className="mx-auto w-full max-w-xl">
          <Link href="/cac-home" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> CAC Home
          </Link>

          {isLoading ? (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading today's reflection…</p>
          ) : !data?.paragraphs?.length ? (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}` }}>
              <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                We couldn't load today's reflection just now.
              </p>
              {data?.url && (
                <div className="mt-4">
                  <CacButton onClick={() => openExternal(data.url, { reader: true })}>Read on cac.org</CacButton>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: CAC.goldDark, fontFamily: CAC.label }}>
                Daily Meditation
              </p>
              <h1 className="text-2xl font-normal leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                {data.title || "Today's Reflection"}
              </h1>

              <div className="mt-6 space-y-4">
                {data.paragraphs.map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                    {p}
                  </p>
                ))}
              </div>

              <div className="mt-8">
                <CacButton variant="outline" onClick={() => openExternal(data.url, { reader: true })}>
                  Read on cac.org
                </CacButton>
              </div>

              <p className="mt-8 text-[11px] italic leading-relaxed" style={{ color: CAC.inkMuted }}>
                From the Center for Action and Contemplation's daily meditations.
              </p>
            </>
          )}
        </div>
      </CacFrame>
    </Layout>
  );
}
