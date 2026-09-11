import UIKit
import Capacitor
import UserNotifications

/**
 * UIScene life cycle (Capacitor 8.5, required by the iOS 27 SDK — an app built
 * with Xcode 27 that has no scene delegate fails to launch).
 *
 * Differences from Capacitor's template SceneDelegate:
 * - The window's root is our MainViewController, which registers the native
 *   plugins in capacitorDidLoad. The template builds a plain
 *   CAPBridgeViewController and points the scene at Main.storyboard as well,
 *   which would boot TWO bridges; the storyboard keys are gone from Info.plist.
 * - Home-screen quick actions arrive here now (windowScene(_:performActionFor:)
 *   and, on a cold launch, connectionOptions.shortcutItem) instead of the
 *   AppDelegate; the path is dispatched once the scene is active so the web
 *   view has booted.
 * - The UNUserNotificationCenter delegate wrap moves here from
 *   applicationDidBecomeActive, which UIKit no longer calls on the scene path.
 *
 * URL opens and universal links go through Capacitor's SceneDelegateProxy,
 * which posts the same .capacitorOpenURL / .capacitorOpenUniversalLink
 * notifications the plugins already listen for.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var notifDelegateInstalled = false
    private var pendingShortcutPath: String?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = MainViewController()
        window.makeKeyAndVisible()
        self.window = window

        if let shortcut = connectionOptions.shortcutItem,
           let path = AppDelegate.pathForShortcut(shortcut.type) {
            pendingShortcutPath = path
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Capacitor's push plugin installs itself as the notification-center
        // delegate while the bridge boots; wrap it once so contemplation
        // notifications are presented (or silenced) the way Phoebe wants.
        if !notifDelegateInstalled {
            let center = UNUserNotificationCenter.current()
            if center.delegate !== PhoebeNotificationDelegate.shared {
                PhoebeNotificationDelegate.shared.wrapped = center.delegate
                center.delegate = PhoebeNotificationDelegate.shared
                notifDelegateInstalled = true
            }
        }

        if let path = pendingShortcutPath {
            pendingShortcutPath = nil
            DispatchQueue.main.async {
                AppDelegate.dispatchShortcut(path: path)
            }
        }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        guard let path = AppDelegate.pathForShortcut(shortcutItem.type) else {
            completionHandler(false)
            return
        }
        AppDelegate.dispatchShortcut(path: path)
        completionHandler(true)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
