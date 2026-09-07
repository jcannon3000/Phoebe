import { useLocation } from "wouter";
import { IOSAppDownloadPrompt } from "@/components/IOSAppDownloadPrompt";
import { NotificationReminderBanner } from "@/components/NotificationReminderBanner";
import { isImmersivePracticeRoute } from "@/lib/immersiveRoutes";

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
  // Compare the PATH alone. wouter hands back a pathname today, but this set
  // is exact-match and a route that ever arrives carrying a query ("?adopt=…"
  // while a preset is being edited) would miss every entry and put a standing
  // prompt back over a practice — a silent failure, since the prompt looks
  // like it belongs.
  // One shared list, prefix-matched — see lib/immersiveRoutes for why this
  // stopped being a local Set.
  if (isImmersivePracticeRoute(location)) return null;
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
