// Where notification UI belongs. Reminders arrive as pushes — real on the iOS
// shell (APNs) and on Android mobile web (web push); on DESKTOP web and
// iOS-Safari web there's nothing we can reliably deliver, so settings rows and
// customizer reminder pickers hide entirely there (owner: "nothing about
// notifications unless it is android mobile web").
import { isNativeShell } from "@/lib/isNativeShell";

export function notificationsSupportedHere(): boolean {
  if (isNativeShell()) return true;
  try {
    return /Android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}
