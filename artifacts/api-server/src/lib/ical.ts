/**
 * Minimal iCal (.ics) parser — no dependencies.
 * Handles VEVENT blocks from public calendar feeds (Google Calendar, Apple
 * iCloud, Outlook public calendars, etc.)
 */

export interface ICalEvent {
  uid: string;
  title: string;
  start: string;   // ISO datetime or YYYY-MM-DD (all-day)
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
}

// Convert iCal datetime (e.g. 20240415T143000Z or 20240415) → ISO string
function parseICalDate(raw: string, tzid?: string): { iso: string; allDay: boolean } {
  const cleaned = raw.trim();

  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(cleaned)) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }

  // UTC: YYYYMMDDTHHmmssZ
  if (cleaned.endsWith("Z")) {
    const dt = cleaned.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    return { iso: dt, allDay: false };
  }

  // Local / TZID: YYYYMMDDTHHmmss
  const dt = cleaned.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
    "$1-$2-$3T$4:$5:$6"
  );
  // Append timezone offset if we have TZID — just treat as local for display
  return { iso: dt, allDay: false };
}

// Unfold iCal long lines (CRLF + space/tab = continuation)
function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

// Decode iCal text escapes
function unescape(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function parseIcal(text: string): ICalEvent[] {
  const unfolded = unfold(text);
  const events: ICalEvent[] = [];
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let cur: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (cur["UID"] && (cur["DTSTART"] || cur["DTSTART;VALUE=DATE"])) {
        const startRaw =
          cur["DTSTART"] ??
          cur["DTSTART;VALUE=DATE"] ??
          Object.entries(cur).find(([k]) => k.startsWith("DTSTART"))?.[1] ?? "";
        const endRaw =
          cur["DTEND"] ??
          cur["DTEND;VALUE=DATE"] ??
          Object.entries(cur).find(([k]) => k.startsWith("DTEND"))?.[1] ?? startRaw;

        const { iso: startIso, allDay } = parseICalDate(startRaw);
        const { iso: endIso } = parseICalDate(endRaw);

        events.push({
          uid: cur["UID"],
          title: unescape(cur["SUMMARY"] ?? "Untitled"),
          start: startIso,
          end: endIso,
          allDay,
          location: cur["LOCATION"] ? unescape(cur["LOCATION"]) : null,
          description: cur["DESCRIPTION"] ? unescape(cur["DESCRIPTION"]) : null,
          url: cur["URL"] ?? null,
        });
      }
      continue;
    }

    if (!inEvent) continue;

    // Split on first colon (but not colons inside quoted values)
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).toUpperCase();
    const val = line.slice(colonIdx + 1);

    // For DTSTART/DTEND with TZID parameter, store under the base key
    const baseKey = key.split(";")[0];
    // Keep the first value seen (handles recurrence-generated duplicates)
    if (!cur[baseKey]) {
      cur[baseKey] = val;
    }
    // Always store the full parameterized key too (for allDay detection)
    if (!cur[key]) {
      cur[key] = val;
    }
  }

  return events;
}

// ─── Google Calendar public URL → iCal feed URL ───────────────────────────────
// Accepts any of:
//   https://calendar.google.com/calendar/embed?src=CALENDAR_ID...
//   https://calendar.google.com/calendar/u/0?cid=CALENDAR_ID
//   webcal://... or https://... ending in .ics
//   Direct calendar IDs like someone@group.calendar.google.com
export function normalizeCalendarUrl(raw: string): string {
  const trimmed = raw.trim();

  // Already an iCal URL
  if (trimmed.startsWith("webcal://")) {
    return trimmed.replace("webcal://", "https://");
  }
  if (trimmed.endsWith(".ics")) {
    return trimmed;
  }

  // Google Calendar embed URL  → extract src param
  const embedMatch = trimmed.match(/calendar\.google\.com\/calendar(?:\/u\/\d+)?\/embed\?.*[?&]src=([^&]+)/);
  if (embedMatch) {
    const calId = decodeURIComponent(embedMatch[1]);
    const encoded = encodeURIComponent(calId);
    return `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
  }

  // Google Calendar share URL with cid param
  const cidMatch = trimmed.match(/[?&]cid=([^&]+)/);
  if (cidMatch) {
    // cid is base64-encoded calendar ID
    try {
      const calId = atob(cidMatch[1].replace(/-/g, "+").replace(/_/g, "/"));
      const encoded = encodeURIComponent(calId);
      return `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
    } catch { /* fall through */ }
  }

  // Looks like a raw calendar ID (email-style)
  if (/^[^/\s]+@[^/\s]+\.[^/\s]+$/.test(trimmed)) {
    const encoded = encodeURIComponent(trimmed);
    return `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
  }

  // Return as-is and let the fetch fail gracefully
  return trimmed;
}
