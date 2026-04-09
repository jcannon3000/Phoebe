import { createAllDayCalendarEvent } from "./calendar";
import { formatHumanDate } from "./letterPeriods";

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
