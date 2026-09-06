import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus, useCommunityAdminToggle } from "@/hooks/useDemo";
import { ToggleRow as Toggle } from "@/components/ToggleRow";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight } from "lucide-react";
import { DEBUG_STEPS_KEY } from "@/components/WayOfLoveRuleFlow";
import { useEffect, useState } from "react";
import { useAppSettings, useSetAppSetting } from "@/lib/appSettings";
import { debugOfflineForced, setDebugOffline } from "@/lib/offline";
import { runOfficePrefetch } from "@/lib/officePrefetch";
import { countOfficeCacheEntries } from "@/lib/officeOfflineCache";
import { PASSAGES, IMAGES, JSON_DAYS, storeKeys } from "@/lib/offlineStore";


function LinkRow({
  emoji,
  label,
  description,
  onClick,
}: {
  emoji: string;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors text-left"
      style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}
      onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.08)"; }}
      onMouseLeave={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.05)"; }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl leading-none">{emoji}</span>
        <div>
          <p className="text-sm font-medium" style={{ color: "#E8E4D8" }}>{label}</p>
          {description && (
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>{description}</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: "rgba(200,212,192,0.3)" }} />
    </button>
  );
}

export default function AdminToolsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { rawIsBeta, rawIsAdmin: isAdmin, betaViewEnabled, toggleBetaView } = useBetaStatus();
  const [stepDebugOn, setStepDebugOn] = useState<boolean>(() => {
    try { return localStorage.getItem(DEBUG_STEPS_KEY) === "1"; } catch { return false; }
  });
  const [communityAdminView, toggleCommunityAdminView] = useCommunityAdminToggle();
  const appSettings = useAppSettings();
  const setAppSetting = useSetAppSetting();
  const [forcedOffline, setForcedOffline] = useState<boolean>(() => debugOfflineForced());
  /**
   * WHAT IS ACTUALLY ON THIS DEVICE.
   *
   * "Offline isn't working" cost several rounds of guessing between two
   * sessions and the owner's own phone, because nothing could SAY whether the
   * daily save had run. These four numbers answer it in a glance, and the
   * button runs the save now rather than waiting for tomorrow's first open.
   */
  const [saved, setSaved] = useState<{ offices: number; passages: number; pictures: number; days: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const readSaved = async () => {
    const [offices, passages, pictures, days] = await Promise.all([
      countOfficeCacheEntries(),
      storeKeys(PASSAGES).then((k) => k.length).catch(() => 0),
      storeKeys(IMAGES).then((k) => k.length).catch(() => 0),
      storeKeys(JSON_DAYS).then((k) => k.length).catch(() => 0),
    ]);
    setSaved({ offices, passages, pictures, days });
  };
  useEffect(() => { void readSaved(); }, []);

  const { data: groupsData } = useQuery<{
    groups: Array<{ id: number; name: string; slug: string; myRole: string }>;
  }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });

  const { data: myFeedsData } = useQuery<{ feeds: Array<{ slug: string }> }>({
    queryKey: ["/api/prayer-feeds/mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/mine"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const myFeeds = myFeedsData?.feeds ?? [];

  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    g => g.myRole === "admin" || g.myRole === "hidden_admin",
  );

  const showToggles = rawIsBeta || isCommunityAdmin;
  const showFeeds = myFeeds.length > 0;

  return (
    <Layout>
      <div
        className="min-h-screen px-4 pt-8 pb-24"
        style={{ maxWidth: 560, margin: "0 auto" }}
      >
        {/* Header */}
        <div className="mb-8">
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
            style={{ color: "rgba(143,175,150,0.5)" }}
          >
            Admin
          </p>
          <h1
            className="text-2xl font-semibold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Admin Tools
          </h1>
        </div>

        {/* View toggles */}
        {showToggles && (
          <section className="mb-6">
            <p
              className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3 px-1"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              View
            </p>
            <div className="space-y-2">
              {rawIsBeta && (
                <Toggle
                  label={`Pilot view ${betaViewEnabled ? "on" : "off"}`}
                  description={betaViewEnabled ? "Seeing pilot features." : "Previewing regular user view."}
                  enabled={betaViewEnabled}
                  onToggle={toggleBetaView}
                />
              )}
              {isCommunityAdmin && (
                <Toggle
                  label={`Community admin ${communityAdminView ? "on" : "off"}`}
                  description={communityAdminView ? "Seeing admin tools." : "Viewing as a member."}
                  enabled={communityAdminView}
                  onToggle={toggleCommunityAdminView}
                />
              )}
            </div>
          </section>
        )}

        {/* Tools */}
        <section className="mb-6">
          <p
            className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3 px-1"
            style={{ color: "rgba(143,175,150,0.45)" }}
          >
            Tools
          </p>
          <div className="space-y-2">
            {showFeeds && (
              <LinkRow
                emoji="🕊️"
                label="Manage Prayer Feeds"
                description={myFeeds.length === 1 ? "Edit your prayer feed" : `${myFeeds.length} feeds`}
                onClick={() => setLocation(
                  myFeeds.length === 1
                    ? `/prayer-feeds/${myFeeds[0].slug}/manage`
                    // Multi-feed owners land on the My Prayer Feeds list
                    // (creator-owned, includes drafts) instead of the
                    // public browse page — which is live-only and hides
                    // a stray draft, making it impossible to find/delete.
                    : "/my-prayer-feeds",
                )}
              />
            )}
            <LinkRow
              emoji="🗺️"
              label="Overview deck"
              description="Phoebe's why, in 8 slides — the short version of About"
              onClick={() => setLocation("/overview-deck")}
            />
            {isAdmin && (
              <>
                <LinkRow
                  emoji="🧭"
                  label="Preset rhythm link"
                  description="Design a rule of life anyone can join via link"
                  onClick={() => setLocation("/prescribe")}
                />
                {/* The routine interview — describe a practice in your own
                    words and Phoebe programs it. Its entry row inside the
                    customizer is switched off for everyone
                    (ROUTINE_INTERVIEW_ENTRY_HIDDEN in WayOfLoveRuleFlow), so
                    without a door here the page was only reachable by typing
                    the URL. Owner: put it in the admin tools. */}
                {/* STEP DEBUG — draws the customizer's own step machine
                    (current step, its index, what comes next, the whole
                    order) under each slide. For a stuck Continue on a device
                    with no console and no address bar: the state that would
                    have been a console.log, in a screenshot. */}
                {/* WHAT IS SAVED, and a way to save it now. The daily walk
                    runs once a day on its own; this is for a device that has
                    just been built, or when the question is simply "did it
                    save anything?" */}
                <LinkRow
                  emoji="📥"
                  label={saving ? "Saving…" : "Save offline content now"}
                  description={saved
                    ? `${saved.offices} office days · ${saved.passages} passages · ${saved.pictures} pictures · ${saved.days} day lists`
                    : "Reading what's on this device…"}
                  onClick={() => {
                    if (saving) return;
                    setSaving(true);
                    void runOfficePrefetch({ force: true })
                      .then(readSaved)
                      .finally(() => setSaving(false));
                  }}
                />
                {/* SIMULATE OFFLINE. The Simulator has no Airplane Mode of
                    its own — it uses the Mac's network — so this is the only
                    way to walk the offline app on a device: the saved
                    readings, the passage sheet, and the home's "Not Available
                    Offline" section. Everything that asks about the
                    connection goes through lib/offline's isOnline(). */}
                <Toggle
                  label={`Simulate offline ${forcedOffline ? "on" : "off"}`}
                  description={forcedOffline
                    ? "The app behaves as though there were no connection. Requests still go out — this is for walking the offline screens."
                    : "Force the offline experience: saved readings, the passage sheet, and the home's Not Available Offline section."}
                  enabled={forcedOffline}
                  onToggle={() => { const next = !forcedOffline; setForcedOffline(next); setDebugOffline(next); }}
                />
                <Toggle
                  label="Step debug in the customizer"
                  description="Show which step the flow is on, and what it thinks comes next"
                  enabled={stepDebugOn}
                  onToggle={() => {
                    const next = !stepDebugOn;
                    setStepDebugOn(next);
                    try {
                      if (next) localStorage.setItem(DEBUG_STEPS_KEY, "1");
                      else localStorage.removeItem(DEBUG_STEPS_KEY);
                    } catch { /* private mode */ }
                  }}
                />
                {/* ANDREW'S VERSION, PUBLIC OR ADMINS-ONLY (owner, 2026-09-05:
                    "build in admin tools where I could make Andrew's Version
                    un-admin-gated … instead of having to do it here"). A
                    server switch every gate reads — the home card, the
                    Reflections page, This Sunday's commentary, the
                    customizer's row, the add-list and the push. */}
                {isAdmin && (
                  <Toggle
                    label={`Andrew's Version ${appSettings.andrewsPublic ? "public" : "admins only"}`}
                    description={appSettings.andrewsPublic
                      ? "Everyone can add it and gets the Fresh Off The Presses push."
                      : "Only super admins see it anywhere in the app."}
                    enabled={appSettings.andrewsPublic}
                    onToggle={() => setAppSetting.mutate({ key: "andrewsPublic", value: !appSettings.andrewsPublic })}
                  />
                )}
                {/* The starter rhythms, and the default a new device seeds
                    (owner: "an admin tool where I could edit the preset
                    routines including the default one"). */}
                <LinkRow
                  emoji="🌵"
                  label="CAC audio library"
                  description="Which communities can open the CAC shows"
                  onClick={() => setLocation("/admin/cac-library")}
                />
                <LinkRow
                  emoji="📰"
                  label="Publications"
                  description="Paste a Substack link and it becomes a publication"
                  onClick={() => setLocation("/admin/weeklies")}
                />
                <LinkRow
                  emoji="🌱"
                  label="Preset routines"
                  description="Edit the starter rhythms and the default one"
                  onClick={() => setLocation("/admin/presets")}
                />
                <LinkRow
                  emoji="💬"
                  label="Routine interview"
                  description="Describe a practice in words; Phoebe builds the routine to match"
                  onClick={() => setLocation("/routine-interview")}
                />
                {/* "Phoebe Parish" row removed — the parish system was deleted
                    (094181c0) and /admin/parishes 404s. Its capabilities live on
                    the community now (directory listing, standing intercessions,
                    Get Involved), reachable from the community's own admin tools. */}
                <LinkRow
                  emoji="📊"
                  label="App Metrics"
                  description="Today / This week / All time, across every user"
                  onClick={() => setLocation("/admin/users")}
                />
                <LinkRow
                  emoji="🎞️"
                  label="Formation Deck"
                  description="Content consumption → formation — the daily-practice talk"
                  onClick={() => setLocation("/formation-deck")}
                />
                <LinkRow
                  emoji="🖼️"
                  label="Art Library"
                  description="Curate the Visio + icon artwork — delete works, toggle icons"
                  onClick={() => setLocation("/admin/art-library")}
                />
                <LinkRow
                  emoji="🎧"
                  label="Audio Library"
                  description="Curate Audio Divina's album library — search Apple Music, catalogue Apple + Spotify links"
                  onClick={() => setLocation("/admin/audio-library")}
                />
                <LinkRow
                  emoji="🗓️"
                  label="Visio Calendar"
                  description="The year by week — which work each week gets, and whether it's on the reading"
                  onClick={() => setLocation("/admin/visio-calendar")}
                />
                <LinkRow
                  emoji="🎶"
                  label="Spirituals"
                  description="Slave Songs of the United States (1867) — all 136, with their metadata"
                  onClick={() => setLocation("/admin/spirituals")}
                />
                <LinkRow
                  emoji="📨"
                  label="Newsletter"
                  description="Email Phoebe users"
                  onClick={() => setLocation("/admin/newsletter")}
                />
                <LinkRow
                  emoji="🔐"
                  label="Pilot Users"
                  description="Manage beta access"
                  onClick={() => setLocation("/beta")}
                />
                <LinkRow
                  emoji="🚩"
                  label="Reports"
                  description="Engagement metrics"
                  onClick={() => setLocation("/admin/reports")}
                />
                <LinkRow
                  emoji="🌾"
                  label="Scraped Ministries"
                  description="Add ministry websites, scrape their events into drafts to review"
                  onClick={() => setLocation("/admin/ministries")}
                />
                <LinkRow
                  emoji="📍"
                  label="Places to Breathe"
                  description="Designated spots people can choose when they breathe"
                  onClick={() => setLocation("/admin/breath-places")}
                />
                <LinkRow
                  emoji="🌵"
                  label="CAC Demo (beta)"
                  description="Daily meditation + podcast courses — demo home screen"
                  onClick={() => setLocation("/cac-home")}
                />
                {/* The PODCASTS, reachable directly (owner: "make CAC podcasts
                    available for admins").
                    /cac-courses is the shows grid → /cac-show/:slug lists that
                    show's seasons → /cac-course/:id plays the episodes. The
                    page already admits admins (it gates on `!isBeta &&
                    !isAdmin`), so nothing about access changes here — it simply
                    had no way IN. Its only inbound links were the back-links on
                    its own child pages, so an admin could reach the seasons
                    only by first going through the demo home screen and finding
                    a show. */}
                <LinkRow
                  emoji="🎧"
                  label="CAC Podcasts (beta)"
                  description="Shows, seasons and episodes — played from CAC's own feeds"
                  onClick={() => setLocation("/cac-courses")}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
