import { createAllDayCalendarEvent, deleteCalendarEvent } from "./calendar";
import { formatHumanDate, formatPeriodStartDateString, getNextFridayOnOrAfter } from "./letterPeriods";

/**
 * Invitation calendar event — dropped onto the invitee's calendar on the
 * next Friday so they see it before the first writing window opens. Acts
 * as the primary "you've been invited" surface; the invitation email is a
 * supplement.
 */
export async function sendLetterInvitationCalendarEvent(params: {
  recipientEmail: string;
  creatorName: string;
  correspondenceName: string;
  inviteUrl: string;
  type: "one_to_one" | "group";
}): Promise<string | null> {
  const { recipientEmail, creatorName, correspondenceName, inviteUrl, type } = params;
  const dateStr = formatPeriodStartDateString(getNextFridayOnOrAfter(new Date()));
  const creatorFirst = creatorName.split(" ")[0];

  const summary = type === "group"
    ? `📮 ${creatorName} invited you to ${correspondenceName}`
    : `📮 ${creatorName} invited you to exchange letters`;

  const description = type === "group"
    ? [
        `${creatorName} has invited you to share in ${correspondenceName} on Phoebe.`,
        "",
        `Once every two weeks, everyone shares what's been happening — 50 words or more. A simple practice of staying in each other's lives.`,
        "",
        `Accept the invitation →`,
        inviteUrl,
        "",
        `──────────────────`,
        `Be together with Phoebe.`,
      ].join("\n")
    : [
        `${creatorName} has invited you to exchange letters on Phoebe.`,
        "",
        `Once every two weeks, you each write one letter — sharing what's been happening, what's on your mind, what matters. You write one week. They respond the next. A conversation with room to breathe.`,
        "",
        `Accept ${creatorFirst}'s invitation →`,
        inviteUrl,
        "",
        `──────────────────`,
        `Be together with Phoebe.`,
      ].join("\n");

  try {
    const eventId = await createAllDayCalendarEvent(0, {
      summary,
      description,
      dateStr,
      attendees: [recipientEmail],
      reminders: [{ method: "popup", minutes: 0 }],
      transparency: "transparent",
    });
    return eventId;
  } catch (err) {
    console.error("Letter invitation calendar event failed:", err);
    return null;
  }
}

export async function sendLetterCalendarEvent(params: {
  recipientEmail: string;
  recipientName: string;
  authorName: string;
  correspondenceName: string;
  postmarkCity: string;
  letterDate: Date;
  letterUrl: string;
  correspondenceId: number;
}): Promise<string | null> {
  const {
    recipientEmail,
    authorName,
    correspondenceName,
    postmarkCity,
    letterDate,
    letterUrl,
  } = params;

  const humanDate = formatHumanDate(letterDate);
  const postmarkLine = postmarkCity ? `Postmarked: ${postmarkCity} · ${humanDate}` : `Sent: ${humanDate}`;

  // All-day event on the date the letter was sent
  const dateStr = letterDate.toISOString().split("T")[0];

  const description = [
    `${authorName} has written their letter in ${correspondenceName}.`,
    "",
    postmarkLine,
    "",
    `Read it here →`,
    letterUrl,
    "",
    `Then write back when it's your turn. 🌿`,
    "",
    `──────────────────`,
    `Be together with Phoebe.`,
  ].join("\n");

  try {
    const eventId = await createAllDayCalendarEvent(0, {
      summary: `📮 ${authorName} wrote you a letter`,
      description,
      dateStr,
      attendees: [recipientEmail],
      reminders: [{ method: "popup", minutes: 0 }],
      transparency: "transparent",
    });
    return eventId;
  } catch (err) {
    console.error("Letter calendar event failed:", err);
    return null;
  }
}

/**
 * Schedule an all-day calendar event for the day the writing window opens.
 * This lands on a Friday (the "catch up" day) and reminds the recipient
 * that it is now their turn to write back.
 */
export async function sendLetterWindowOpenCalendarEvent(params: {
  recipientEmail: string;
  waitingAuthorName: string;
  correspondenceName: string;
  scheduledDate: Date;
  letterUrl: string;
}): Promise<string | null> {
  const { recipientEmail, waitingAuthorName, correspondenceName, scheduledDate, letterUrl } = params;
  const dateStr = formatPeriodStartDateString(scheduledDate);

  const description = [
    `${waitingAuthorName} is waiting for your next letter in ${correspondenceName}.`,
    "",
    `Sit down with a cup of something warm and write back.`,
    "",
    `Write here →`,
    letterUrl,
    "",
    `──────────────────`,
    `Be together with Phoebe.`,
  ].join("\n");

  try {
    const eventId = await createAllDayCalendarEvent(0, {
      summary: `📮 ${waitingAuthorName} is waiting for your letter`,
      description,
      dateStr,
      attendees: [recipientEmail],
      // Popup at the start of the event day. Google Calendar all-day
      // reminder minutes must be non-negative, so this fires at midnight
      // of the event day; users also see the event on their calendar.
      reminders: [{ method: "popup", minutes: 0 }],
      transparency: "transparent",
    });
    return eventId;
  } catch (err) {
    console.error("Letter window-open calendar event failed:", err);
    return null;
  }
}

/**
 * Schedule a follow-up all-day event for the day the window transitions
 * to OVERDUE. Softer copy ("still waiting — write when you're ready").
 */
export async function sendLetterOverdueCalendarEvent(params: {
  recipientEmail: string;
  waitingAuthorName: string;
  correspondenceName: string;
  scheduledDate: Date;
  letterUrl: string;
}): Promise<string | null> {
  const { recipientEmail, waitingAuthorName, correspondenceName, scheduledDate, letterUrl } = params;
  const dateStr = formatPeriodStartDateString(scheduledDate);

  const description = [
    `${waitingAuthorName} is still waiting for your letter in ${correspondenceName}.`,
    "",
    `No rush. Write when you're ready. 🌿`,
    "",
    `Write here →`,
    letterUrl,
    "",
    `──────────────────`,
    `Be together with Phoebe.`,
  ].join("\n");

  try {
    const eventId = await createAllDayCalendarEvent(0, {
      summary: `📮 ${waitingAuthorName} is still waiting — write when you're ready`,
      description,
      dateStr,
      attendees: [recipientEmail],
      reminders: [{ method: "popup", minutes: 0 }],
      transparency: "transparent",
    });
    return eventId;
  } catch (err) {
    console.error("Letter overdue calendar event failed:", err);
    return null;
  }
}

/**
 * Best-effort cleanup of a prior calendar event (window-open or overdue).
 * Used when the letter is sent or when replacing an event with a newer one.
 */
export async function cancelLetterCalendarEvent(eventId: string | null | undefined): Promise<void> {
  if (!eventId) return;
  try {
    await deleteCalendarEvent(0, eventId);
  } catch (err) {
    console.error("Letter calendar event cancel failed:", err);
  }
}
