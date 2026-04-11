/**
 * Period calculation helpers for Phoebe Letters.
 *
 * A "period" is a window anchored to the correspondence's startedAt date.
 * Period 1 begins on the first Monday on or after startedAt.
 *
 * ONE-TO-ONE: 7-day periods, alternating turns.
 *   Odd periods  → creator's turn
 *   Even periods → member's turn
 *
 * GROUP (round letter): 14-day periods, everyone writes each period.
 */

export const ONE_TO_ONE_PERIOD_DAYS = 7;
export const GROUP_PERIOD_DAYS = 14;

export function getPeriodDays(type: "one_to_one" | "group"): number {
  return type === "group" ? GROUP_PERIOD_DAYS : ONE_TO_ONE_PERIOD_DAYS;
}

function getFirstMonday(startedAt: Date): Date {
  const d = new Date(startedAt);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 6=Sat
  if (day === 1) return d; // already Monday
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

export function getPeriodStart(
  correspondenceStartedAt: Date,
  referenceDate: Date,
  periodDays: number = ONE_TO_ONE_PERIOD_DAYS,
): Date {
  const firstMonday = getFirstMonday(correspondenceStartedAt);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const diffMs = ref.getTime() - firstMonday.getTime();
  if (diffMs < 0) return firstMonday; // reference is before period 1

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const periodsElapsed = Math.floor(diffDays / periodDays);
  const start = new Date(firstMonday);
  start.setDate(start.getDate() + periodsElapsed * periodDays);
  return start;
}

export function getPeriodEnd(periodStart: Date, periodDays: number = ONE_TO_ONE_PERIOD_DAYS): Date {
  const end = new Date(periodStart);
  end.setDate(end.getDate() + periodDays - 1);
  return end;
}

export function getPeriodNumber(
  correspondenceStartedAt: Date,
  referenceDate: Date,
  periodDays: number = ONE_TO_ONE_PERIOD_DAYS,
): number {
  const firstMonday = getFirstMonday(correspondenceStartedAt);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const diffMs = ref.getTime() - firstMonday.getTime();
  if (diffMs < 0) return 1;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / periodDays) + 1;
}

export function getNextPeriodStart(
  correspondenceStartedAt: Date,
  referenceDate: Date,
  periodDays: number = ONE_TO_ONE_PERIOD_DAYS,
): Date {
  const currentStart = getPeriodStart(correspondenceStartedAt, referenceDate, periodDays);
  const next = new Date(currentStart);
  next.setDate(next.getDate() + periodDays);
  return next;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function formatPeriodLabel(
  periodStart: Date,
  periodEnd: Date,
): string {
  const sameMonth = periodStart.getMonth() === periodEnd.getMonth();
  if (sameMonth) {
    return `${MONTH_LONG[periodStart.getMonth()]} ${periodStart.getDate()} \u2013 ${periodEnd.getDate()}`;
  }
  return `${MONTH_SHORT[periodStart.getMonth()]} ${periodStart.getDate()} \u2013 ${MONTH_SHORT[periodEnd.getMonth()]} ${periodEnd.getDate()}`;
}

export function isInLastThreeDays(
  periodStart: Date,
  referenceDate: Date,
  periodDays: number = ONE_TO_ONE_PERIOD_DAYS,
): boolean {
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  // Last 2 days of the period window
  const lastTwoDays = new Date(periodStart);
  lastTwoDays.setDate(lastTwoDays.getDate() + periodDays - 2);

  const end = getPeriodEnd(periodStart, periodDays);

  return ref >= lastTwoDays && ref <= end;
}

export function formatNextPeriodStart(
  correspondenceStartedAt: Date,
  periodDays: number = ONE_TO_ONE_PERIOD_DAYS,
): string {
  const next = getNextPeriodStart(correspondenceStartedAt, new Date(), periodDays);
  return `${DAY_NAMES[next.getDay()]}, ${MONTH_LONG[next.getMonth()]} ${next.getDate()}`;
}

export function formatHumanDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_LONG[date.getMonth()]} ${date.getDate()}`;
}

export function formatPeriodStartDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the first Friday on or after the given date.
 * Used to schedule calendar reminders on Fridays (a natural "catch up" day).
 */
export function getNextFridayOnOrAfter(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
  // Friday is 5. Days to add: (5 - day + 7) % 7, but if already Friday → 0.
  const daysToAdd = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

/**
 * Returns whose turn it is in a one-to-one correspondence.
 * Odd period → creator; even period → member.
 */
export function getWhoseTurn(
  correspondenceStartedAt: Date,
  referenceDate: Date,
): "creator" | "member" {
  const n = getPeriodNumber(correspondenceStartedAt, referenceDate, ONE_TO_ONE_PERIOD_DAYS);
  return n % 2 === 1 ? "creator" : "member";
}

/**
 * Letter cadence state machine for one-to-one correspondences.
 *
 *   Letter 1   → OPEN for everyone (anyone can start, anytime).
 *   Letter 2   → immediate response allowed — author of Letter 1 must WAIT;
 *                the other participant has an OPEN window with no time gate.
 *                This is the ONLY exception to strict alternation.
 *   Letter 3+  → strict alternation with a 14-day window anchored to the
 *                most-recent letter's sentAt. Window opens at sentAt + 14 days.
 *                If the next writer doesn't write within 14 days, the window
 *                does NOT close — it transitions to OVERDUE and remains open
 *                until they write. Alternation is preserved: the other
 *                participant stays WAITING and can never "jump the turn".
 */

export type OneToOneTurnState = "WAITING" | "OPEN" | "OVERDUE" | "SENT";

export interface OneToOneTurnInfo {
  state: OneToOneTurnState;
  /** Date at which the OPEN window begins (null for WAITING/SENT with no scheduled window). */
  windowOpenDate: Date | null;
  /** Date at which OVERDUE begins (window open + 14 days). */
  overdueDate: Date | null;
  /** Email of the participant whose turn it is to write, if any. */
  nextWriterEmail: string | null;
}

export interface OneToOneLetterRef {
  authorEmail: string;
  sentAt: Date;
}

/**
 * Resolve the current turn state for a one-to-one correspondence, from
 * the perspective of a specific participant.
 *
 * @param requesterEmail   email of the participant asking
 * @param otherEmail       email of the other participant
 * @param letters          all letters in the correspondence, chronological
 * @param firstExchangeComplete  correspondence flag — true once Letter 2 is in
 * @param now              current time (defaults to new Date())
 */
export function getOneToOneTurnState(
  requesterEmail: string,
  otherEmail: string,
  letters: OneToOneLetterRef[],
  firstExchangeComplete: boolean,
  now: Date = new Date(),
): OneToOneTurnInfo {
  const lower = (s: string) => s.toLowerCase();
  const me = lower(requesterEmail);
  const other = lower(otherEmail);

  // Sort defensively.
  const chrono = [...letters].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // Letter 1 — no letters yet: anyone can write, anytime.
  if (chrono.length === 0) {
    return { state: "OPEN", windowOpenDate: null, overdueDate: null, nextWriterEmail: null };
  }

  // Letter 2 — exactly one letter exists and first exchange not yet complete:
  // the non-author has an OPEN window with no time gate; the author waits.
  if (!firstExchangeComplete) {
    const firstAuthor = lower(chrono[0].authorEmail);
    if (me === firstAuthor) {
      return { state: "WAITING", windowOpenDate: null, overdueDate: null, nextWriterEmail: other };
    }
    return { state: "OPEN", windowOpenDate: null, overdueDate: null, nextWriterEmail: me };
  }

  // Letter 3+ — strict alternation with 14-day windows.
  const last = chrono[chrono.length - 1];
  const lastAuthor = lower(last.authorEmail);
  const nextWriter = lastAuthor === me ? other : me;

  const windowOpen = new Date(last.sentAt);
  windowOpen.setDate(windowOpen.getDate() + 14);
  const overdue = new Date(windowOpen);
  overdue.setDate(overdue.getDate() + 14);

  // If requester is NOT the next writer, they're waiting.
  if (me !== nextWriter) {
    return { state: "WAITING", windowOpenDate: windowOpen, overdueDate: overdue, nextWriterEmail: nextWriter };
  }

  // Requester is the next writer.
  if (now < windowOpen) {
    return { state: "WAITING", windowOpenDate: windowOpen, overdueDate: overdue, nextWriterEmail: nextWriter };
  }
  if (now >= overdue) {
    return { state: "OVERDUE", windowOpenDate: windowOpen, overdueDate: overdue, nextWriterEmail: nextWriter };
  }
  return { state: "OPEN", windowOpenDate: windowOpen, overdueDate: overdue, nextWriterEmail: nextWriter };
}

/**
 * Returns full period info for a correspondence.
 */
export function getCurrentPeriodInfo(
  correspondenceStartedAt: Date,
  referenceDate: Date,
  type: "one_to_one" | "group",
) {
  const periodDays = getPeriodDays(type);
  const periodStart = getPeriodStart(correspondenceStartedAt, referenceDate, periodDays);
  const periodEnd = getPeriodEnd(periodStart, periodDays);
  const periodNumber = getPeriodNumber(correspondenceStartedAt, referenceDate, periodDays);

  return {
    periodNumber,
    periodStart,
    periodEnd,
    periodLabel: formatPeriodLabel(periodStart, periodEnd),
    periodStartStr: formatPeriodStartDateString(periodStart),
    whoseTurn: type === "one_to_one" ? getWhoseTurn(correspondenceStartedAt, referenceDate) : ("everyone" as const),
    isLastThreeDays: isInLastThreeDays(periodStart, referenceDate, periodDays),
  };
}
