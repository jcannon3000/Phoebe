import { google } from "googleapis";
import { getInvitesRefreshToken } from "./invitesAccount";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Scheduler-based calendar client ─────────────────────────────────────────
// All calendar events are created from the invites@withphoebe.app Google
// Workspace mailbox so every outbound message — calendar invitations
// included — comes from the same branded address. Falls back to the
// legacy scheduler refresh token if the new one isn't set yet.

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    process.env["GOOGLE_REDIRECT_URI"]
  );
}

// In-memory cache for the scheduler's access token (refreshed automatically)
let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number | null = null;

async function getSchedulerClient() {
  const refreshToken = getInvitesRefreshToken();
  if (!refreshToken) {
    console.warn("No Google refresh token set — calendar features disabled");
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: cachedAccessToken,
    refresh_token: refreshToken,
    expiry_date: cachedTokenExpiry,
  });

  // Cache new tokens in memory when they're refreshed
  oauth2Client.on("tokens", (tokens) => {
    if (tokens.access_token) cachedAccessToken = tokens.access_token;
    if (tokens.expiry_date) cachedTokenExpiry = tokens.expiry_date;
  });

  return oauth2Client;
}

export async function createCalendarEvent(
  _userId: number, // kept for call-site compatibility; scheduler account is used
  opts: {
    summary: string;
    description?: string;
    location?: string;
    startDate: Date;
    startLocalStr?: string;
    endDate?: Date;
    endLocalStr?: string;
    attendees?: string[];
    recurrence?: string[];
    timeZone?: string;
    colorId?: string;
    status?: string;
    reminders?: Array<{ method: string; minutes: number }>;
  }
): Promise<string | null> {
  const auth = await getSchedulerClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const start = opts.startDate;
  const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);

  const useLocalTime = !!(opts.startLocalStr && opts.timeZone);
  const tz = opts.timeZone ?? "UTC";

  const attendeeList = opts.attendees?.map(email => ({ email })) ?? [];

  const defaultReminders = [
    { method: "popup", minutes: 10 },
  ];

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: attendeeList.length > 0 ? "all" : "none",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        location: opts.location,
        start: useLocalTime
          ? { dateTime: opts.startLocalStr, timeZone: tz }
          : { dateTime: start.toISOString(), timeZone: "UTC" },
        end: useLocalTime
          ? { dateTime: opts.endLocalStr ?? opts.startLocalStr, timeZone: tz }
          : { dateTime: end.toISOString(), timeZone: "UTC" },
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
        recurrence: opts.recurrence,
        colorId: opts.colorId,
        status: opts.status,
        reminders: {
          useDefault: false,
          overrides: opts.reminders ?? defaultReminders,
        },
      },
    });
    return event.data.id ?? null;
  } catch (err) {
    console.error("Calendar event create failed:", err);
    return null;
  }
}

export async function createAllDayCalendarEvent(
  _userId: number,
  opts: {
    summary: string;
    description?: string;
    dateStr: string;
    attendees?: string[];
    recurrence?: string[];
    reminders?: Array<{ method: string; minutes: number }>;
    transparency?: string;
  }
): Promise<string | null> {
  const auth = await getSchedulerClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const attendeeList = opts.attendees?.map(email => ({ email })) ?? [];

  const nextDay = new Date(opts.dateStr + "T00:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endDateStr = nextDay.toISOString().split("T")[0];

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: attendeeList.length > 0 ? "all" : "none",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        start: { date: opts.dateStr },
        end: { date: endDateStr },
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
        recurrence: opts.recurrence,
        transparency: opts.transparency,
        reminders: {
          useDefault: false,
          overrides: opts.reminders ?? [],
        },
      },
    });
    return event.data.id ?? null;
  } catch (err) {
    console.error("All-day calendar event create failed:", err);
    return null;
  }
}

export async function deleteCalendarEvent(_userId: number, eventId: string): Promise<void> {
  const auth = await getSchedulerClient();
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
  } catch (err) {
    console.error("Calendar event delete failed:", err);
  }
}


export async function updateCalendarEvent(
  _userId: number,
  eventId: string,
  opts: {
    summary?: string;
    description?: string;
    startDate?: Date;
    startLocalStr?: string;
    endDate?: Date;
    endLocalStr?: string;
    timeZone?: string;
    attendees?: string[];
  }
): Promise<boolean> {
  const auth = await getSchedulerClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  const attendeeList = opts.attendees?.map((email) => ({ email })) ?? [];
  const useLocalTime = !!(opts.startLocalStr && opts.timeZone);
  const tz = opts.timeZone ?? "UTC";

  // Only include start/end fields if time data was provided
  let startField: { dateTime: string; timeZone: string } | undefined;
  let endField: { dateTime: string; timeZone: string } | undefined;

  if (opts.startDate || opts.startLocalStr) {
    if (useLocalTime) {
      startField = { dateTime: opts.startLocalStr!, timeZone: tz };
      endField = { dateTime: opts.endLocalStr ?? opts.startLocalStr!, timeZone: tz };
    } else {
      const start = opts.startDate ?? new Date();
      const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);
      startField = { dateTime: start.toISOString(), timeZone: "UTC" };
      endField = { dateTime: end.toISOString(), timeZone: "UTC" };
    }
  }

  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        ...(startField ? { start: startField } : {}),
        ...(endField ? { end: endField } : {}),
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
      },
    });
    return true;
  } catch (err) {
    console.error("Calendar event update failed:", err);
    return false;
  }
}

export async function getCalendarEvent(
  _userId: number,
  eventId: string
): Promise<{ startDate: Date; endDate: Date } | null> {
  const auth = await getSchedulerClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const res = await calendar.events.get({ calendarId: "primary", eventId });
    const start = res.data.start?.dateTime;
    const end = res.data.end?.dateTime;
    if (!start) return null;
    return {
      startDate: new Date(start),
      endDate: end ? new Date(end) : new Date(new Date(start).getTime() + 60 * 60 * 1000),
    };
  } catch {
    return null;
  }
}

export async function getCalendarEventAttendees(
  _userId: number,
  eventId: string
): Promise<Array<{ email: string; displayName?: string; responseStatus?: string }> | null> {
  const auth = await getSchedulerClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const res = await calendar.events.get({ calendarId: "primary", eventId });
    const attendees = res.data.attendees ?? [];
    return attendees
      .filter(a => a.email && !a.self)
      .map(a => ({
        email: a.email!,
        displayName: a.displayName ?? undefined,
        responseStatus: a.responseStatus ?? undefined,
      }));
  } catch {
    return null;
  }
}

export async function addAttendeesToCalendarEvent(
  _userId: number,
  eventId: string,
  newEmails: string[]
): Promise<boolean> {
  const auth = await getSchedulerClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const existing = await calendar.events.get({ calendarId: "primary", eventId });
    const currentAttendees = existing.data.attendees ?? [];
    const currentEmails = new Set(currentAttendees.map(a => a.email));
    const toAdd = newEmails.filter(e => !currentEmails.has(e));
    if (toAdd.length === 0) return true;
    const merged = [...currentAttendees, ...toAdd.map(email => ({ email }))];
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: { attendees: merged },
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeAttendeesFromCalendarEvent(
  _userId: number,
  eventId: string,
  emailsToRemove: string[]
): Promise<boolean> {
  const auth = await getSchedulerClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const existing = await calendar.events.get({ calendarId: "primary", eventId });
    const currentAttendees = existing.data.attendees ?? [];
    const removeSet = new Set(emailsToRemove.map(e => e.toLowerCase()));
    const filtered = currentAttendees.filter(a => !removeSet.has((a.email ?? "").toLowerCase()));
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: { attendees: filtered },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Per-user calendar reading ────────────────────────────────────────────────
// Used by the Gatherings page to display the user's own Google Calendar events.
// Requires that the user has connected their calendar (calendarConnected = true)
// and we have their refresh token stored in googleRefreshToken.

export interface UserCalendarEvent {
  id: string;
  title: string;
  start: string;        // ISO datetime or YYYY-MM-DD for all-day
  end: string;
  location: string | null;
  allDay: boolean;
  url: string | null;
  description: string | null;
  calendarName: string | null;
  colorHex: string | null;
}

// Maps Google Calendar colorId → hex (standard Google palette)
const GOOGLE_COLOR_MAP: Record<string, string> = {
  "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
  "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
};

export async function getUserCalendarEvents(
  userId: number,
  daysAhead = 60,
): Promise<UserCalendarEvent[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.calendarConnected || !user?.googleRefreshToken) return [];

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    refresh_token: user.googleRefreshToken,
    access_token: user.googleAccessToken ?? undefined,
    expiry_date: user.googleTokenExpiry?.getTime() ?? undefined,
  });

  // Persist refreshed tokens back to DB automatically
  oauth2.on("tokens", async (tokens) => {
    try {
      await db.update(usersTable).set({
        ...(tokens.access_token ? { googleAccessToken: tokens.access_token } : {}),
        ...(tokens.expiry_date ? { googleTokenExpiry: new Date(tokens.expiry_date) } : {}),
      }).where(eq(usersTable.id, userId));
    } catch { /* non-fatal */ }
  });

  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 86400000);

    // Fetch from all calendars the user is subscribed to (up to 20 calendars)
    const listRes = await cal.calendarList.list({ maxResults: 20 });
    const calendars = listRes.data.items ?? [];

    const allEvents: UserCalendarEvent[] = [];

    await Promise.all(
      calendars
        .filter(c => c.selected !== false && c.accessRole !== "none")
        .map(async (calEntry) => {
          try {
            const evRes = await cal.events.list({
              calendarId: calEntry.id!,
              timeMin: now.toISOString(),
              timeMax: future.toISOString(),
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 50,
            });
            for (const ev of evRes.data.items ?? []) {
              if (!ev.id || ev.status === "cancelled") continue;
              const allDay = !ev.start?.dateTime;
              allEvents.push({
                id: `gcal-${calEntry.id}-${ev.id}`,
                title: ev.summary ?? "Untitled",
                start: ev.start?.dateTime ?? ev.start?.date ?? "",
                end: ev.end?.dateTime ?? ev.end?.date ?? "",
                location: ev.location ?? null,
                allDay,
                url: ev.htmlLink ?? null,
                description: ev.description ?? null,
                calendarName: calEntry.summary ?? null,
                colorHex: GOOGLE_COLOR_MAP[ev.colorId ?? calEntry.colorId ?? ""] ?? calEntry.backgroundColor ?? null,
              });
            }
          } catch { /* skip inaccessible calendar */ }
        })
    );

    // Sort by start time
    allEvents.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return allEvents;
  } catch (err) {
    console.error("getUserCalendarEvents error:", err);
    return [];
  }
}
