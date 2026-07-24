import UIKit
import Capacitor
import UserNotifications

// Forwarding notification-center delegate. Capacitor installs itself as the
// UNUserNotificationCenter delegate (it presents foreground pushes + routes taps
// to JS). We wrap it to change ONE thing: the daily contemplation nudge
// (threadId "contemplation-goal") should only appear when the phone is locked /
// the app is backgrounded — never as an in-app banner while you're actively
// using Phoebe. willPresent fires only when the app is foreground, so returning
// [] there suppresses the in-app banner; when locked/backgrounded the system
// shows it normally (willPresent isn't called). Every other notification and all
// tap handling is forwarded untouched to Capacitor's delegate.
final class PhoebeNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PhoebeNotificationDelegate()
    weak var wrapped: UNUserNotificationCenterDelegate?

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if notification.request.content.threadIdentifier == "contemplation-goal" {
            completionHandler([])
            return
        }
        // The end-of-sit bell must ALWAYS show — even in the foreground, since a
        // keep-awake sit holds the app active when the timer ends. Show the banner
        // (and list it) without the notification's own sound: the in-app / native
        // bell already plays it, so this avoids a double-ring. Backgrounded, this
        // delegate isn't called and the system rings it (time-sensitive → breaks DND).
        if notification.request.content.threadIdentifier == "contemplation-bell" {
            completionHandler([.banner, .list])
            return
        }
        if let w = wrapped,
           w.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            w.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            completionHandler([.banner, .list, .sound, .badge])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let w = wrapped,
           w.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            w.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            completionHandler()
        }
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Whether the forwarding notification delegate has been installed (once
    // Capacitor has set itself as the delegate during bridge boot).
    private var notifDelegateInstalled = false

    // Pending deep-link path captured at cold launch via a home-screen
    // quick action. We can't dispatch into the WebView at
    // `didFinishLaunching` time because Capacitor hasn't finished
    // booting yet; instead we stash the path and replay it on
    // `applicationDidBecomeActive`, by which point the JS bridge is
    // ready to receive it.
    private var pendingShortcutPath: String?

    // Map an iOS UIApplicationShortcutItem.type to the in-app path the
    // web router knows. Keep these literal — Wouter's routes are the
    // canonical source of truth and this list mirrors them.
    //
    // The "prayer-list" identifier is a legacy name kept for back-compat
    // with devices that cached the old shortcut (when the title was
    // "Begin prayer list" and the target was /prayer-mode). It now
    // routes to /begin-prayer, a tiny JS landing page that runs the
    // same time-of-day + defaultPrayerLevel + prayedToday logic the
    // home dashboard's "Begin prayer" CTA runs and replaces history
    // with the resolved destination. Keeping the type name stable
    // means we never need to chase down stale cached shortcuts on
    // upgraded installs.
    private func pathForShortcut(_ type: String) -> String? {
        switch type {
        case "app.withphoebe.mobile.shortcut.prayer-list":
            return "/begin-prayer"
        case "app.withphoebe.mobile.shortcut.contemplation":
            return "/contemplation"
        case "app.withphoebe.mobile.shortcut.prayer-request-new":
            return "/pray-request/new"
        case "app.withphoebe.mobile.shortcut.letter-new":
            return "/letters/new"
        default:
            return nil
        }
    }

    // Push a deep-link URL through the same Capacitor App API path
    // `appUrlOpen` uses for universal links. The native shell already
    // listens for that event and routes via Wouter, so quick actions
    // and universal links share one routing pipeline.
    private func dispatchShortcut(path: String) {
        guard let url = URL(string: "https://withphoebe.app" + path) else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // If the app was cold-launched by tapping a home-screen quick
        // action, capture the target path now and replay it once the
        // WebView is ready (see applicationDidBecomeActive). Returning
        // false prevents the system from also calling
        // `performActionFor:` on launch, which would otherwise double-
        // route the same shortcut.
        if let shortcut = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
           let path = pathForShortcut(shortcut.type) {
            pendingShortcutPath = path
            return false
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Install our forwarding notification delegate once Capacitor has set its
        // own (it does so during bridge boot, which is complete by the time we're
        // active). Wrap whatever's currently there so contemplation pushes don't
        // banner in-foreground, while every other push + tap routes as before.
        if !notifDelegateInstalled {
            let center = UNUserNotificationCenter.current()
            if center.delegate !== PhoebeNotificationDelegate.shared {
                PhoebeNotificationDelegate.shared.wrapped = center.delegate
                center.delegate = PhoebeNotificationDelegate.shared
                notifDelegateInstalled = true
            }
        }

        // Drain any cold-launch shortcut that was captured in
        // didFinishLaunching. By the time the app is "active," the
        // Capacitor WebView is up and ready to receive the deep-link
        // event. Re-set to nil so a subsequent active-state cycle
        // doesn't re-fire the same nav.
        if let path = pendingShortcutPath {
            pendingShortcutPath = nil
            // Defer one runloop turn so the JS bridge has finished
            // wiring its appUrlOpen listener — without this, fast
            // devices race past the listener install.
            DispatchQueue.main.async { [weak self] in
                self?.dispatchShortcut(path: path)
            }
        }

        // Badge management is now driven by the web layer (see
        // PhoebeBadgePlugin + the dashboard's setBadge call against
        // newPrayersCount). On foreground we DON'T blanket-clear to 0
        // anymore — that left the icon stale at 0 between sessions,
        // even when prayer requests were still waiting. The web app
        // calls PhoebeNative.setBadge with the live unprayed count as
        // soon as the dashboard's React Query data lands, so the icon
        // catches up within a tick. Pushes continue to set the badge
        // dynamically while the app is backgrounded.
    }

    // Warm-launch path: app was already running (foregrounded or
    // backgrounded) when the user picked a quick action. iOS calls
    // this method directly; we route immediately since Capacitor is
    // already alive.
    func application(
        _ application: UIApplication,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard let path = pathForShortcut(shortcutItem.type) else {
            completionHandler(false)
            return
        }
        dispatchShortcut(path: path)
        completionHandler(true)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
