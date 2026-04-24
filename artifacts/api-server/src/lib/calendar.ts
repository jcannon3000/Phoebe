import { google } from "googleapis";
import { getInvitesRefreshToken } from "./invitesAccount";

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
    console.error(
      "[calendar] No Google refresh token set — calendar features disabled. " +
      "Set INVITES_GOOGLE_REFRESH_TOKEN (or legacy SCHEDULER_GOOGLE_REFRESH_TOKEN) on the server.",
    );
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
    transparency?: string;
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
      sendUpdates: "none",
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
        transparency: opts.transparency,
        reminders: {
          useDefault: false,
          overrides: opts.reminders ?? defaultReminders,
        },
      },
    });
    if (!event.data.id) {
      console.error(
        "[calendar] events.insert returned no id — response body:",
        JSON.stringify(event.data),
      );
      return null;
    }
    console.log(
      `[calendar] Created event ${event.data.id}` +
      (attendeeList.length > 0 ? ` (invited ${attendeeList.map(a => a.email).join(", ")})` : ""),
    );
    return event.data.id;
  } catch (err) {
    // Dump as much as Google hands us — code, status, message, reason —
    // so a production failure is diagnosable from Railway logs without
    // another deploy to add instrumentation.
    const e = err as {
      code?: number;
      status?: number;
      message?: string;
      response?: { status?: number; data?: unknown };
      errors?: Array<{ reason?: string; message?: string }>;
    };
    console.error("[calendar] events.insert FAILED", {
      code: e?.code ?? e?.status ?? e?.response?.status,
      message: e?.message,
      reason: e?.errors?.[0]?.reason,
      data: e?.response?.data,
      attendees: attendeeList.map(a => a.email),
      summary: opts.summary,
    });
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
      sendUpdates: "none",
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
    await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "none" });
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
      sendUpdates: "none",
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

// ─── Bell discovery ─────────────────────────────────────────────────────────
// Source-of-truth scan: walk the scheduler calendar for an *accepted*,
// *recurring*, *active* "Daily Bell" event for a given user. Used to
// auto-relink users whose DB-stored bell_calendar_event_id was lost — the
// calendar event is the durable record, our DB row is just a cache.

export async function findActiveBellEventForUser(
  userEmail: string,
): Promise<{ eventId: string; localTime: string; timeZone: string } | null> {
  const auth = await getSchedulerClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const emailLower = userEmail.toLowerCase();

  try {
    // Search the scheduler's primary calendar for "Daily Bell" events.
    // singleEvents=false so we get the recurring master, not expanded
    // instances. maxResults is generous because all bells share the same
    // summary; we'll filter by attendee on the client side.
    const res = await calendar.events.list({
      calendarId: "primary",
      q: "Daily Bell",
      singleEvents: false,
      maxResults: 250,
      showDeleted: false,
    });
    const events = res.data.items ?? [];

    for (const ev of events) {
      // Must be a confirmed, recurring, daily event with our bell summary.
      if (ev.status === "cancelled") continue;
      if (!ev.summary?.includes("Daily Bell")) continue;
      const isDaily = (ev.recurrence ?? []).some(
        r => /FREQ=DAILY/i.test(r),
      );
      if (!isDaily) continue;

      // Must include our user as an *accepted* attendee.
      const attendee = (ev.attendees ?? []).find(
        a => (a.email ?? "").toLowerCase() === emailLower,
      );
      if (!attendee) continue;
      if (attendee.responseStatus !== "accepted") continue;

      // Pull the local time + timezone from the start record.
      const startDateTime = ev.start?.dateTime ?? null;
      const startTz = ev.start?.timeZone ?? "America/New_York";
      if (!ev.id || !startDateTime) continue;

      // startDateTime is an ISO string like "2026-04-18T07:00:00-04:00".
      // We want the wall-clock HH:MM in the event's own timezone — that's
      // already what the ISO string carries before the offset suffix.
      // Strip the offset/Z and pull HH:MM out of the time portion.
      const timePart = startDateTime.split("T")[1] ?? "";
      const hhmm = timePart.slice(0, 5); // "07:00"
      if (!/^\d{2}:\d{2}$/.test(hhmm)) continue;

      return { eventId: ev.id, localTime: hhmm, timeZone: startTz };
    }
    return null;
  } catch (err) {
    console.warn("[calendar] findActiveBellEventForUser failed:", err);
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
      sendUpdates: "none",
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
      sendUpdates: "none",
      requestBody: { attendees: filtered },
    });
    return true;
  } catch {
    return false;
  }
}

