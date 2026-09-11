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

    // Home-screen quick actions (UIApplicationShortcutItems in Info.plist) map
    // to app paths. Under the UIScene life cycle the taps arrive at
    // SceneDelegate, which calls these; the AppDelegate no longer sees them.
    static func pathForShortcut(_ type: String) -> String? {
        switch type {
        case "app.withphoebe.mobile.shortcut.prayer-list":
            return "/begin-prayer"
        case "app.withphoebe.mobile.shortcut.contemplation":
            return "/contemplation"
        case "app.withphoebe.mobile.shortcut.offices":
            return "/offices"
        case "app.withphoebe.mobile.shortcut.prayer-request-new":
            return "/offices"
        default:
            return nil
        }
    }

    // Hands the path to the web app the same way a universal link would.
    static func dispatchShortcut(path: String) {
        guard let url = URL(string: "https://withphoebe.app" + path) else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    // UIScene life cycle (Capacitor 8.5 / iOS 27 SDK): one window scene, whose
    // delegate builds the window around MainViewController. Foreground and
    // background transitions, URL opens, universal links and quick actions
    // all reach SceneDelegate now; only process-level callbacks stay here.
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
