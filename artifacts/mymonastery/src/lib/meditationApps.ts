// Companion meditation apps — one-tap "start a session" launchers.
//
// Phoebe is a place to keep silence, but some people already have a meditation
// app they love. Rather than rebuild that, we link out: tap an app and it opens
// (so you can start a session there), and — once Apple Health is connected — the
// minutes you log in Calm / Insight Timer / etc. flow back into your
// contemplation goal via HealthKit.
//
// Launch mechanics:
//   • iOS native shell → MindfulHealth.openApp({ scheme, fallbackUrl }) uses
//     UIApplication.open(scheme); if the app isn't installed it opens the
//     website/App Store fallback. (No LSApplicationQueriesSchemes needed.)
//   • Web (withphoebe.app in a browser) → open the website (custom schemes
//     don't work in a browser).

import { isNativeShell } from "@/lib/isNativeShell";
import { openExternal } from "@/lib/openExternal";

export type MeditationApp = {
  key: string;
  name: string;
  emoji: string;
  blurb: string;
  scheme: string; // iOS URL scheme used to launch the app
  website: string; // fallback when the app isn't installed (and the web path)
};

// Christian/prayer apps first (closest to Phoebe's heart), then the mainstream
// mindfulness apps. Easy to extend — add a row with its scheme + website.
export const MEDITATION_APPS: MeditationApp[] = [
  { key: "hallow",    name: "Hallow",         emoji: "🙏", blurb: "Catholic prayer & meditation", scheme: "hallow://",       website: "https://hallow.com" },
  { key: "abide",     name: "Abide",          emoji: "✝️", blurb: "Christian meditation & sleep",  scheme: "abide://",        website: "https://abide.com" },
  { key: "calm",      name: "Calm",           emoji: "🌊", blurb: "Meditation & sleep",            scheme: "calm://",         website: "https://www.calm.com" },
  { key: "headspace", name: "Headspace",      emoji: "🧘", blurb: "Guided meditation",             scheme: "headspace://",    website: "https://www.headspace.com" },
  { key: "insight",   name: "Insight Timer",  emoji: "🔔", blurb: "Free timer & talks",            scheme: "insighttimer://", website: "https://insighttimer.com" },
];

interface MindfulHealthPlugin {
  openApp: (opts: { scheme: string; fallbackUrl?: string }) => Promise<{ opened: boolean; usedFallback: boolean }>;
}

function getPlugin(): MindfulHealthPlugin | null {
  if (!isNativeShell()) return null;
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;
  return (cap?.Plugins?.MindfulHealth as MindfulHealthPlugin | undefined) ?? null;
}

/**
 * Open the app so the user can start a session. On the iOS shell this launches
 * the installed app (or its website/App Store if not installed); on web it
 * opens the website. Safe to call from a click handler on any platform.
 */
export function openMeditationApp(app: MeditationApp): void {
  const plugin = getPlugin();
  if (plugin?.openApp) {
    void plugin.openApp({ scheme: app.scheme, fallbackUrl: app.website });
    return;
  }
  openExternal(app.website);
}
