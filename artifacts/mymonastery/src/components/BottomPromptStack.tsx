import { IOSAppDownloadPrompt } from "@/components/IOSAppDownloadPrompt";
import { NcmpLiveBanner } from "@/components/NcmpLiveBanner";
import { NotificationReminderBanner } from "@/components/NotificationReminderBanner";

// Single bottom-anchored stack for the screen-bottom prompt cards so they
// sit one above the other instead of overlapping when more than one
// qualifies at once. The realistic collision is iOS Safari during the
// 07:00–07:30 ET broadcast window: the live banner and the App Store
// download prompt would otherwise both pin to bottom:0 and stack on top
// of each other.
//
// Each child returns null when it has nothing to show, so flex `gap`
// only materializes between cards that are actually visible. The column
// itself is pointer-events:none so its empty padding strip never
// intercepts taps on the content behind it — each card re-enables
// pointer events for its own box.
//
// Mounted INSIDE <WouterRouter> because NcmpLiveBanner SPA-navigates to
// /ncmp/watch on "Watch →". The download prompt is router-agnostic (it
// uses a plain external <a>), so living here costs it nothing.
//
// Order: live banner first (renders on top — it's the time-sensitive one);
// the download prompt next; the notification reminder last (lowest priority
// — it's a standing nag, not a time-boxed or one-shot ask, so it always
// yields the top slot to anything more urgent).
export function BottomPromptStack() {
  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2"
      style={{ bottom: 0, pointerEvents: "none" }}
    >
      <NcmpLiveBanner />
      <IOSAppDownloadPrompt />
      <NotificationReminderBanner />
    </div>
  );
}
