import { useLocation } from "wouter";
import { IOSAppDownloadPrompt } from "@/components/IOSAppDownloadPrompt";
import { NotificationReminderBanner } from "@/components/NotificationReminderBanner";

/**
 * Immersive practice decks — full-screen, their own chrome, and a bottom CTA
 * of their own ("Continue", "Done", "Begin").
 *
 * This stack is `fixed bottom-0 z-50` over every route, so on a PHONE it sits
 * exactly on top of that CTA: on /visio the notification card covered the
 * Continue button and the step counter completely, and the practice could not
 * be advanced without dismissing a nag first. It is the same overlap on every
 * page listed here — only the amount of bottom padding decided whether the
 * button peeked out.
 *
 * The layout collision is the immediate reason, but the product rule is the
 * better one: someone who has opened a prayer practice is the last person to
 * interrupt with a standing ask about notification permissions. The banner is
 * not urgent — it is waiting on the home screen when they come back.
 */
const IMMERSIVE_PRACTICE_ROUTES = new Set<string>([
  "/visio", "/psalms", "/contemplation", "/cobreathe", "/pray-breath",
  "/guided-prayer", "/examen", "/prayer-mode",
  // Audio Divina is a full-screen deck now too, with its own footer CTA — the
  // prompt card was landing squarely on its Begin button.
  "/listening",
  // The customizer belongs here too. Its Continue now hovers at the bottom of
  // the screen, so a standing prompt card lands squarely on top of it — and on
  // the Back link beneath it, which is how it was found. Designing your rule is
  // also a sitting you shouldn't be interrupted during.
  "/rule-of-life", "/customize",
  // A brand-new visitor sees the overview deck before ever reaching home —
  // don't compete for their attention with a notifications ask until they've
  // actually landed on the app. (Moved up from NotificationReminderBanner so
  // both prompts in this stack respect it, not just the one.)
  "/overview-deck",
]);

// Single bottom-anchored stack for the screen-bottom prompt cards so they
// sit one above the other instead of overlapping when more than one
// qualifies at once.
//
// Each child returns null when it has nothing to show, so flex `gap`
// only materializes between cards that are actually visible. The column
// itself is pointer-events:none so its empty padding strip never
// intercepts taps on the content behind it — each card re-enables
// pointer events for its own box.
//
// Order: the download prompt first; the notification reminder last (lowest
// priority — it's a standing nag, not a time-boxed or one-shot ask, so it
// always yields the top slot to anything more urgent).
export function BottomPromptStack() {
  const [location] = useLocation();
  if (IMMERSIVE_PRACTICE_ROUTES.has(location)) return null;
  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2"
      style={{ bottom: 0, pointerEvents: "none" }}
    >
      <IOSAppDownloadPrompt />
      <NotificationReminderBanner />
    </div>
  );
}
