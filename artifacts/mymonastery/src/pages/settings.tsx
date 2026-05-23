import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { LogOut, Camera, Pencil, Trash2, Download } from "lucide-react";


function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-3 tap-shrink"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      {children}
    </div>
  );
}


// ─── Office reminder settings ───────────────────────────────────────────
//
// Per-user prefs for the daily morning + evening office reminder push.
// Each side picks none / Office (full Daily Prayer) / Devotion (BCP
// short form). Saves on every change — reads as a setting, not a
// form. Backed by /api/me/office-prefs which writes to the
// parish_office_* user columns under the hood.
type OfficePref = "none" | "office" | "devotion";
type OfficePrefs = {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  eveningTime: string | null;
};

// Small inline row used by OfficeReminderSettings. Renders a labeled
// HH:MM picker that fires `onChange` on every commit so the parent
// can persist it through the office-prefs mutation. Hidden when the
// side's pref is "none" (the parent decides; this just renders).
function ReminderTimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}
    >
      <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
        {label}
      </p>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{2}:\d{2}$/.test(v)) onChange(v);
        }}
        className="text-[14px] rounded-md px-2 py-1"
        style={{
          background: "rgba(15,40,24,0.6)",
          border: "1px solid rgba(46,107,64,0.4)",
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      />
    </div>
  );
}

// Feed-first home picker. Shown to ANY user who follows at least one
// prayer feed (not just portal sign-ups). Lists the Daily Office plus
// one row per subscribed feed; picking a feed makes it lead the home
// screen with the tall hero card, picking the Office reverts to the
// default. Server-backed via PUT /api/me/feed-first-home { feedId };
// on save we invalidate /api/auth/me (so the dashboard re-reads
// homeFeedId + feedFirstHome) and the subscribed-feeds list.
function HomeScreenSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: subsData } = useQuery<{ subscriptions: Array<{ feed: { id: number; title: string; coverEmoji: string | null } }> }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed") as Promise<{ subscriptions: Array<{ feed: { id: number; title: string; coverEmoji: string | null } }> }>,
    enabled: !!user,
  });
  const save = useMutation({
    // feedId === null → office-led; a number → that feed leads.
    mutationFn: (feedId: number | null) =>
      apiRequest("PUT", "/api/me/feed-first-home", { feedId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
    },
  });

  const feeds = subsData?.subscriptions.map((s) => s.feed) ?? [];
  // Nothing to feature → no picker (the Daily Office is the only option).
  if (feeds.length === 0) return null;

  // Selected = the featured feed when feed-first is on AND that feed is
  // still followed; otherwise the Daily Office.
  const selectedFeedId = (user?.feedFirstHome && user?.homeFeedId != null
    && feeds.some((f) => f.id === user.homeFeedId))
    ? user.homeFeedId
    : null;

  type Row = { key: string; feedId: number | null; label: string; sub: string };
  const rows: Row[] = [
    { key: "office", feedId: null, label: "Lead with the Daily Office", sub: "Morning & Evening Prayer takes the top spot" },
    ...feeds.map((f): Row => ({
      key: `feed-${f.id}`,
      feedId: f.id,
      label: `Lead with ${`${f.title} ${f.coverEmoji ?? "🌿"}`.trim()}`,
      sub: "This feed gets the big card; the Daily Office moves to the menu",
    })),
  ];

  return (
    <>
      <SectionHeader label="Home screen" />
      <p
        className="text-[13px] mb-3"
        style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
      >
        Choose what greets you when you open Phoebe.
      </p>
      <SettingsCard>
        {rows.map((row, i) => {
          const isSelected = selectedFeedId === row.feedId;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => save.mutate(row.feedId)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {row.label}
                </p>
                {row.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {row.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

function WeeklyDigestSettings() {
  const { isBeta } = useBetaStatus();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/me/weekly-digest-pref"],
    queryFn: () => apiRequest("GET", "/api/me/weekly-digest-pref") as Promise<{ enabled: boolean }>,
    enabled: isBeta,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/me/weekly-digest-pref", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/weekly-digest-pref"] }),
  });

  if (!isBeta) return null;
  const enabled = data?.enabled ?? true;

  const options: Array<{ value: boolean; label: string; sub: string }> = [
    { value: true, label: "Tuesday evenings", sub: "When something new lands on your feeds" },
    { value: false, label: "Off", sub: "" },
  ];

  return (
    <>
      <SectionHeader label="Weekly digest" />
      <p
        className="text-[13px] mb-3"
        style={{
          color: "rgba(143,175,150,0.8)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
        }}
      >
        A Tuesday-evening summary of what's new on the prayer feeds you follow — a push, an email, and a slideshow that walks them.
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = enabled === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => save.mutate(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  className="text-[14px]"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
                >
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

function OfficeReminderSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery<OfficePrefs>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<OfficePrefs>,
  });
  const save = useMutation({
    mutationFn: (patch: Partial<OfficePrefs>) =>
      apiRequest("PUT", "/api/me/office-prefs", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });

  const morning = data?.morning ?? "none";
  const evening = data?.evening ?? "none";
  // Default placeholders so the time picker has a sensible starting
  // value when the user first turns a side on. Stored values (when
  // present) override these.
  const DEFAULT_MORNING = "07:00";
  const DEFAULT_EVENING = "18:00";
  const morningTime = data?.morningTime ?? DEFAULT_MORNING;
  const eveningTime = data?.eveningTime ?? DEFAULT_EVENING;

  const morningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: "No reminder", sub: "" },
    { value: "office", label: "Morning Prayer", sub: "Full Daily Office" },
    { value: "devotion", label: "Morning Devotion", sub: "Short BCP form" },
  ];
  const eveningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: "No reminder", sub: "" },
    { value: "office", label: "Evening Prayer", sub: "Full Daily Office" },
    { value: "devotion", label: "Evening Devotion", sub: "Short BCP form" },
  ];

  return (
    <>
      <SectionHeader label="Daily reminders" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Pick the office Phoebe will nudge you toward each morning and evening — or none, if you'd rather not be pinged.
      </p>
      <SettingsCard>
        <p className="text-[12px] font-semibold mb-2" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
          In the morning
        </p>
        {morningOptions.map((opt, i) => {
          const isSelected = morning === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate({ morning: opt.value })}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {morning !== "none" && (
          <ReminderTimeRow
            label="Reminder time"
            value={morningTime}
            onChange={(t) => save.mutate({ morningTime: t })}
          />
        )}
      </SettingsCard>
      <SettingsCard>
        <p className="text-[12px] font-semibold mb-2" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
          In the evening
        </p>
        {eveningOptions.map((opt, i) => {
          const isSelected = evening === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate({ evening: opt.value })}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {evening !== "none" && (
          <ReminderTimeRow
            label="Reminder time"
            value={eveningTime}
            onChange={(t) => save.mutate({ eveningTime: t })}
          />
        )}
      </SettingsCard>
    </>
  );
}

// ─── Muted People ───────────────────────────────────────────────────────────

type MutedUser = { userId: number; name: string; email: string };

// Each row is ~52px tall; show 3.5 rows = ~182px
const PREVIEW_HEIGHT = 182;

// ─── Offices-only extras ─────────────────────────────────────────────
// Tier-specific settings card that only appears for users whose
// account is `offices-only`. Surfaces:
//   1. "Daily feed reminder" — a once-a-day reminder push toggle.
//      Stored client-side (localStorage) for now; the server-side
//      push delivery job that consumes it is a follow-up. Surfacing
//      the toggle now means the preference is captured the moment a
//      user is interested.
// The old "Hide offices on home" toggle that used to live here is gone
// — the server-backed "Home screen" picker (HomeScreenSettings) is now
// the single control for what leads the home. Keeping both meant a
// creation-feed sign-up saw the office hidden by feed_first_home while
// this localStorage toggle still read "off," which was contradictory.
// The toggle below read/writes localStorage on render so it always
// reflects the current persisted state.
const FEED_REMINDER_LS_KEY = "phoebe:offices-only:feed-reminder-enabled";

function readLsBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLsBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode / quota — non-fatal */
  }
}

function OfficesOnlyExtras() {
  // Fetch the viewer's first subscribed feed so the reminder
  // toggle's label can mention that feed by name ("Daily reminder
  // for 🌿 Phoebe Climate") instead of a generic "your feed".
  // Falls back to "your prayer feed" if the user isn't subscribed
  // to anything yet — the toggle still works, the label is just
  // less specific.
  type SubscribedFeed = { feed: { slug: string; title: string; coverEmoji: string | null } };
  const { data } = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    staleTime: 60_000,
  });
  const firstFeed = data?.subscriptions?.[0]?.feed ?? null;
  const feedLabel = firstFeed
    ? `${firstFeed.coverEmoji ?? "🌿"} ${firstFeed.title}`
    : "your prayer feed";

  const [feedReminder, setFeedReminder] = useState<boolean>(() =>
    readLsBool(FEED_REMINDER_LS_KEY),
  );

  const toggleFeedReminder = () => {
    const next = !feedReminder;
    setFeedReminder(next);
    writeLsBool(FEED_REMINDER_LS_KEY, next);
  };

  return (
    <>
      <SectionHeader label="Phoebe home" />

      <SettingsCard>
        <button
          onClick={toggleFeedReminder}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
              Daily reminder for {feedLabel}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              A gentle once-a-day nudge to pray your feed.
            </p>
          </div>
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${feedReminder ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
          >
            <div
              className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${feedReminder ? "left-[21px]" : "left-[3px]"}`}
              style={{ background: "#F0EDE6" }}
            />
          </div>
        </button>
      </SettingsCard>

      <div className="mb-8" />
    </>
  );
}

function MutedPeople() {
  const { data, isLoading } = useQuery<{ muted: MutedUser[] }>({
    queryKey: ["/api/mutes"],
    queryFn: () => apiRequest("GET", "/api/mutes"),
  });

  const muted = data?.muted ?? [];

  return (
    <>
      <SectionHeader label="Muted People" />
      <SettingsCard>
        {isLoading && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        )}
        {!isLoading && muted.length === 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No one muted.
            </p>
            <Link
              href="/settings/muted"
              className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
            >
              + Add
            </Link>
          </div>
        )}
        {muted.length > 0 && (
          <>
            <div
              className="overflow-y-auto space-y-3"
              style={{ maxHeight: PREVIEW_HEIGHT }}
            >
              {muted.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-0.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{m.name}</p>
                    <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(46,107,64,0.15)" }}>
              <Link
                href="/settings/muted"
                className="text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: "#A8C5A0" }}
              >
                See all ({muted.length}) →
              </Link>
            </div>
          </>
        )}
      </SettingsCard>
    </>
  );
}

// ─── Account Section (photo + name editing) ────────────────────────────────

// ─── Phone number section ──────────────────────────────────────────────────
// One-line form: input + Save (or Remove if already set). On submit,
// POSTs the raw display string to /api/users/me/phone — server
// normalizes + hashes. We surface friendly server errors (invalid
// format, number already taken) inline.
function PhoneSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Native-only gate. Phone-number entry is a contact-discovery feature
  // and the only way to populate it cleanly is "Use my number from iOS
  // Contacts" — that path doesn't exist on the web build, so showing
  // the form there is just an empty input asking for a number we have
  // no way to verify. Hide the entire section unless we're inside the
  // Capacitor shell (matching the MobileDeviceSection pattern below).
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    try {
      const phoebeNative = (window as { PhoebeNative?: { isNative?: () => boolean } }).PhoebeNative;
      if (phoebeNative?.isNative?.()) setIsNative(true);
    } catch {
      /* ignore */
    }
  }, []);
  // iOS-Contacts pre-fill state. We let the user verify by attestation:
  // tap "Use my number from iOS Contacts" → we read all contacts → find
  // the entry whose emails include the user's signed-in email → present
  // its phone numbers as one-tap buttons. The number must already exist
  // in the user's own iOS Contacts under their own email, which is much
  // stronger than self-attestation (anyone could type any number, but
  // they can't trivially write to someone else's iOS Contacts).
  const [iosStage, setIosStage] = useState<"idle" | "reading" | "no-native" | "denied" | "no-match" | "error">("idle");
  const [iosCandidates, setIosCandidates] = useState<string[]>([]);
  const [iosErrorMsg, setIosErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (phone: string) =>
      apiRequest("POST", "/api/users/me/phone", { phone }),
    onSuccess: (data: unknown) => {
      const body = data as { phoneNumber: string };
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, phoneNumber: body.phoneNumber } : prev);
      setEditing(false);
      setError(null);
      // Clear the iOS picker too — we've taken one of its candidates.
      setIosCandidates([]);
      setIosStage("idle");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /phone_taken|409/i.test(msg)
        ? "Another account is using this number. Contact support if that's you."
        : /invalid_phone|400/i.test(msg)
          ? "That doesn't look like a valid phone number. Try +1 555 123 4567."
          : "Couldn't save. Tap Save to try again.";
      setError(friendly);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/users/me/phone"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, phoneNumber: null } : prev);
      setEditing(false);
      setDraft("");
      setError(null);
    },
  });

  // Wire native contact-event listeners. Mounted while the section is
  // visible; cleaned on unmount. We branch on stage === "reading" so
  // events fired by an unrelated dispatcher elsewhere in the app don't
  // accidentally hijack our UI state.
  useEffect(() => {
    const userEmail = (user?.email ?? "").trim().toLowerCase();

    function handleReady(e: Event) {
      if (iosStage !== "reading") return;
      const detail = (e as CustomEvent).detail as
        | { contacts: Array<{ id: string; name: string; emails: string[]; phones: string[] }> }
        | undefined;
      const contacts = detail?.contacts ?? [];

      const userNameLower = (user?.name ?? "").trim().toLowerCase();
      const contactsWithEmail = contacts.filter((c) =>
        (c.emails ?? []).some((em) => em.trim().toLowerCase() === userEmail),
      );
      const contactsWithName = userNameLower
        ? contacts.filter((c) => (c.name ?? "").trim().toLowerCase() === userNameLower)
        : [];

      // Diagnostic — visible in Safari Web Inspector when tethered.
      // Helps debug "I have my email in my contact card but the matcher
      // says no" reports: usually the plugin returns a smaller address
      // book than the user expects (iCloud sync incomplete, suggested
      // contacts excluded by the plugin, etc.) or the contact has the
      // email but no phone numbers attached to that card.
      console.log("[PhoneSection] iOS contacts read:", {
        total: contacts.length,
        userEmail,
        userName: userNameLower,
        matchedByEmail: contactsWithEmail.length,
        matchedByName: contactsWithName.length,
        sampleEmails: contacts.slice(0, 3).map((c) => ({
          name: c.name,
          emails: c.emails,
          phoneCount: c.phones?.length ?? 0,
        })),
      });

      // Fold phones across any matching cards.
      const phones = new Set<string>();
      const tryAdd = (c: { phones: string[] }) => {
        for (const p of c.phones ?? []) {
          const trimmed = p.trim();
          if (trimmed) phones.add(trimmed);
        }
      };
      for (const c of contactsWithEmail) tryAdd(c);

      // Name-based fallback — if email match found nothing, try the
      // contact whose display name matches the signed-in user. Less
      // precise (multiple "John Smith" entries possible) but catches
      // the common case where the contact card has the user's
      // personal email but not the work email they signed up with.
      if (phones.size === 0) {
        for (const c of contactsWithName) tryAdd(c);
      }

      if (phones.size === 0) {
        setIosStage("no-match");
        return;
      }
      // Earlier flow: render candidates as tap-to-pick buttons, save on
      // tap. New flow: pre-fill the input with the first candidate and
      // open the form so the user just hits Save (or edits first).
      // Avoids the extra UI when there's one obvious answer.
      const list = Array.from(phones);
      const first = list[0] ?? "";
      setDraft(first);
      setEditing(true);
      setIosCandidates([]);
      setIosStage("idle");
    }
    function handleDenied() {
      if (iosStage !== "reading") return;
      setIosStage("denied");
    }
    function handleError(e: Event) {
      if (iosStage !== "reading") return;
      const detail = (e as CustomEvent).detail;
      setIosErrorMsg(detail instanceof Error ? detail.message : "Couldn't read contacts.");
      setIosStage("error");
    }

    window.addEventListener("phoebe:contacts-ready", handleReady);
    window.addEventListener("phoebe:contacts-denied", handleDenied);
    window.addEventListener("phoebe:contacts-error", handleError);
    return () => {
      window.removeEventListener("phoebe:contacts-ready", handleReady);
      window.removeEventListener("phoebe:contacts-denied", handleDenied);
      window.removeEventListener("phoebe:contacts-error", handleError);
    };
  }, [iosStage, user?.email]);

  function pickFromIosContacts() {
    if (!isNativeShell()) {
      setIosStage("no-native");
      return;
    }
    setIosErrorMsg(null);
    setIosCandidates([]);
    setIosStage("reading");
    window.dispatchEvent(new Event("phoebe:request-contacts"));
  }

  const current = user?.phoneNumber ?? null;

  if (!isNative) return null;

  return (
    <SettingsCard>
      <p className="text-sm font-medium mb-1" style={{ color: "#F0EDE6" }}>
        Phone number
      </p>
      <p className="text-xs mb-3" style={{ color: "#8FAF96" }}>
        People who have you in their contacts will be able to find you on
        Phoebe.
      </p>

      {!editing && current && (
        <div className="flex items-center gap-2">
          <span className="text-sm flex-1" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
            {current}
          </span>
          <button
            onClick={() => { setDraft(current); setEditing(true); }}
            className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
            style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0" }}
          >
            Change
          </button>
          <button
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ color: "#8FAF96" }}
          >
            Remove
          </button>
        </div>
      )}

      {(editing || !current) && (
        <div className="space-y-3">
          {/* iOS Contacts pre-fill — only meaningful on the native shell.
              The sequencer here is: idle → tap → reading → either we
              get candidates (rendered as pick buttons) or one of the
              error/denied/no-match states. Picking a candidate fires
              saveMutation directly. */}
          <button
            onClick={pickFromIosContacts}
            disabled={iosStage === "reading"}
            className="w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "rgba(46,107,64,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}
          >
            {iosStage === "reading" ? "Reading your contacts…" : "📱 Use my number from iOS Contacts"}
          </button>

          {iosStage === "no-match" && (
            <div className="text-[11px] space-y-1.5" style={{ color: "#8FAF96" }}>
              <p>
                We didn't find a contact with your email ({user?.email}) or
                your name in your iOS Contacts.
              </p>
              <p>
                If you have your own card saved in the Contacts app, make
                sure it includes either {user?.email} or "{user?.name}"
                exactly, plus a phone number — then tap the button again.
                Otherwise just type it below.
              </p>
            </div>
          )}
          {iosStage === "denied" && (
            <p className="text-[11px]" style={{ color: "#C47A65" }}>
              Phoebe doesn't have permission to read your contacts. Open
              Settings → Phoebe → Contacts and turn it on.
            </p>
          )}
          {iosStage === "no-native" && (
            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
              Reading from iOS Contacts only works in the Phoebe app on
              your phone.
            </p>
          )}
          {iosStage === "error" && (
            <p className="text-[11px]" style={{ color: "#C47A65" }}>
              {iosErrorMsg ?? "Couldn't read contacts."}
            </p>
          )}

          {/* Manual entry fallback — separated by a thin divider so the
              two paths read as siblings, not as a primary + footnote. */}
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px" style={{ background: "rgba(46,107,64,0.2)" }} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.4)" }}>or type it</span>
            <div className="flex-1 h-px" style={{ background: "rgba(46,107,64,0.2)" }} />
          </div>

          <input
            type="tel"
            value={editing ? draft : ""}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onFocus={() => { if (!editing) setEditing(true); }}
            placeholder="+1 555 123 4567"
            inputMode="tel"
            autoComplete="tel"
            className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
            style={{
              color: "#F0EDE6",
              background: "rgba(200,212,192,0.05)",
              border: `1px solid ${error ? "rgba(196,122,101,0.6)" : "rgba(46,107,64,0.3)"}`,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 16,  // ≥16px to block iOS auto-zoom
            }}
          />
          {error && (
            <p className="text-xs" style={{ color: "#C47A65" }}>{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!draft.trim()) { setError("Enter a phone number first."); return; }
                saveMutation.mutate(draft);
              }}
              disabled={!draft.trim() || saveMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0" }}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {editing && current && (
              <button
                onClick={() => { setEditing(false); setDraft(""); setError(null); }}
                className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
                style={{ color: "#8FAF96" }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [uploading, setUploading] = useState(false);

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string | null }) =>
      apiRequest("PATCH", "/api/auth/me/profile", data),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (variables.name) updated.name = variables.name;
        if (variables.avatarUrl !== undefined) updated.avatarUrl = variables.avatarUrl;
        return updated;
      });
      setEditingName(false);
    },
  });

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 512;
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setUploading(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        profileMutation.mutate({ avatarUrl: dataUrl }, {
          onSettled: () => setUploading(false),
        });
      };
      img.onerror = () => {
        alert("Could not process this image. Try a different one.");
        setUploading(false);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      alert("Could not read this image. Try a different one.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  if (!user) return null;

  const hasAvatar = !!user.avatarUrl;

  return (
    <SettingsCard>
      <div className="flex items-center gap-4">
        {/* Avatar with upload overlay */}
        <div className="relative flex-shrink-0">
          {hasAvatar ? (
            <img
              src={user.avatarUrl!}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover"
              style={{ border: "2px solid rgba(46,107,64,0.3)" }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid rgba(46,107,64,0.3)" }}
            >
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "#2D5E3F", border: "2px solid #091A10" }}
          >
            {uploading ? (
              <span className="text-[10px]" style={{ color: "#F0EDE6" }}>…</span>
            ) : (
              <Camera size={12} style={{ color: "#F0EDE6" }} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  maxLength={50}
                  autoFocus
                  className="flex-1 text-sm font-semibold px-2 py-1.5 rounded-lg outline-none min-w-0"
                  style={{
                    color: "#F0EDE6",
                    background: "rgba(200,212,192,0.05)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  maxLength={50}
                  className="flex-1 text-sm font-semibold px-2 py-1.5 rounded-lg outline-none min-w-0"
                  style={{
                    color: "#F0EDE6",
                    background: "rgba(200,212,192,0.05)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const full = `${firstName.trim()} ${lastName.trim()}`.trim();
                    if (full) profileMutation.mutate({ name: full });
                  }}
                  disabled={!firstName.trim() || profileMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
                  style={{ color: "#8FAF96" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {user.name}
              </p>
              <button
                onClick={() => {
                  const parts = (user.name ?? "").split(" ");
                  setFirstName(parts[0] ?? "");
                  setLastName(parts.slice(1).join(" ") ?? "");
                  setEditingName(true);
                }}
                className="p-1 rounded-lg transition-opacity hover:opacity-80"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
          <p className="text-sm truncate mt-0.5" style={{ color: "#8FAF96" }}>
            {user.email}
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Settings ⚙️
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Your account, notifications, and preferences.
          </p>
        </div>

        {/* ── Account ── */}
        <SectionHeader label="Account" />
        <AccountSection />

        {/* ── Presence ── */}
        <div className="mb-8">
          <SettingsCard>
            <button
              onClick={() => presenceToggle.mutate(!user.showPresence)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Show when I'm here 🌿</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                  Let your people know you're present.
                </p>
              </div>
              <div className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${user.showPresence ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                <div className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${user.showPresence ? "left-[21px]" : "left-[3px]"}`} style={{ background: "#F0EDE6" }} />
              </div>
            </button>
          </SettingsCard>
        </div>

        {/* ── Office reminders ── */}
        <OfficeReminderSettings />

        {/* ── Offices-only extras ──
            Two tier-specific toggles that only render for the
            offices-only access tier:
              • Daily feed reminder — opt-in once-a-day push
                pointing at the user's subscribed prayer feed.
              • Hide offices on home — collapses the Daily Office
                card on the offices-only home so the screen reads
                as "just my feed" for users who don't pray the
                office. Both preferences are read by the offices-
                only home (parish-dashboard) on next paint. */}
        {user.accessTier === "offices-only" && <OfficesOnlyExtras />}

        {/* ── Home screen ── (feed-first toggle; only for users with a
            featured feed set at signup) */}
        <HomeScreenSettings />

        {/* ── Weekly prayer-feed digest ── (beta-only for now) */}
        <WeeklyDigestSettings />

        {/* ── Phone number — used for contact discovery so people who
              already have you in their address book can find you on
              Phoebe. Verification (SMS) isn't live yet, so the form
              warns the user to enter their own real number only. Lives
              lower in the page (below the prayer-related settings)
              since it's a quieter, optional account detail. */}
        <div className="mb-8">
          <PhoneSection />
        </div>

        {/* ── Muted People ── */}
        <MutedPeople />
        <div className="mb-8" />

        {/* ── Sign out ── */}
        <button
          onClick={() => { logout(); setLocation("/"); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <LogOut size={15} />
          Sign out
        </button>

        {/* ── Export my data ──
            GDPR right-to-portability. Downloads a JSON blob of every row
            the database holds tied to this user. Auth material (password
            hash, OAuth tokens) is redacted server-side. */}
        <div className="mt-8">
          <ExportDataSection />
        </div>

        {/* ── Delete account ──
            Required by Apple Guideline 5.1.1(v) for App Store distribution:
            any app that creates accounts must offer in-app deletion. Also
            a legitimate privacy affordance for web users. Gated behind a
            confirm step (type your email) to prevent accidents. */}
        <div className="mt-4">
          <DeleteAccountSection email={user.email} />
        </div>

        <div className="mt-6 pb-4 text-center flex justify-center gap-5">
          <Link href="/terms">
            <span className="text-xs" style={{ color: "#8FAF96", textDecoration: "underline", cursor: "pointer" }}>
              Terms of Use
            </span>
          </Link>
          <Link href="/privacy">
            <span className="text-xs" style={{ color: "#8FAF96", textDecoration: "underline", cursor: "pointer" }}>
              Privacy Policy
            </span>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

// ─── Export data section ───────────────────────────────────────────────────
// Downloads a JSON file of everything we hold for this user. The server
// streams the payload with a Content-Disposition attachment header; we
// create a blob URL on the client and click an <a download> so the
// browser/iOS Files app saves it. iOS Safari on Capacitor handles
// application/json attachments by showing the native share sheet, which
// lets the user save to Files, mail it, etc.
function ExportDataSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/export", { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `phoebe-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{
          background: "transparent",
          color: "rgba(143,175,150,0.85)",
          border: "1px solid rgba(143,175,150,0.25)",
        }}
      >
        <Download size={13} />
        {pending ? "Preparing your data…" : "Export my data"}
      </button>
      {error && (
        <p className="text-xs mt-2 text-center" style={{ color: "#D97A7A" }}>
          {error}
        </p>
      )}
    </>
  );
}

// ─── Delete account section ────────────────────────────────────────────────
// Two-step UI: a muted destructive button → expanded confirm form with
// email-typing check → calls DELETE /api/users/me. On success, redirect
// to /. The server endpoint enforces the same email check, so this is
// belt-and-suspenders.
function DeleteAccountSection({ email }: { email: string }) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setLocation("/");
      // Hard reload so every client-side cache clears.
      setTimeout(() => window.location.href = "/", 100);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const canDelete = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-medium transition-opacity hover:opacity-90"
        style={{
          background: "transparent",
          color: "rgba(217,122,122,0.75)",
          border: "1px solid rgba(217,122,122,0.25)",
        }}
      >
        <Trash2 size={13} />
        Delete account
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: "rgba(217,122,122,0.06)",
        border: "1px solid rgba(217,122,122,0.25)",
      }}
    >
      <p className="text-sm font-medium mb-2" style={{ color: "#D97A7A", fontFamily: "'Space Grotesk', sans-serif" }}>
        Delete your account
      </p>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(240,237,230,0.75)" }}>
        This permanently removes your account and every prayer, practice, reflection, and invitation you've made in Phoebe. Shared prayer circles you created are not deleted for other members.
      </p>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(240,237,230,0.55)" }}>
        This cannot be undone. Calendar events already sent are left in place — remove them from Google Calendar yourself if you like.
      </p>
      <label className="block text-xs mb-1.5" style={{ color: "rgba(143,175,150,0.75)" }}>
        Type <span style={{ color: "#F0EDE6" }}>{email}</span> to confirm:
      </label>
      <input
        type="email"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={confirmEmail}
        onChange={(e) => { setConfirmEmail(e.target.value); setError(null); }}
        placeholder={email}
        className="w-full px-3 py-2 rounded-lg text-sm mb-3"
        style={{
          background: "rgba(0,0,0,0.35)",
          color: "#F0EDE6",
          border: "1px solid rgba(217,122,122,0.35)",
          outline: "none",
        }}
      />
      {error && (
        <p className="text-xs mb-3" style={{ color: "#D97A7A" }}>{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => deleteMutation.mutate()}
          disabled={!canDelete || deleteMutation.isPending}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            background: "#8A2A2A",
            color: "#F0EDE6",
            cursor: canDelete && !deleteMutation.isPending ? "pointer" : "not-allowed",
          }}
        >
          {deleteMutation.isPending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          onClick={() => { setExpanded(false); setConfirmEmail(""); setError(null); }}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            background: "transparent",
            color: "#8FAF96",
            border: "1px solid rgba(143,175,150,0.3)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
