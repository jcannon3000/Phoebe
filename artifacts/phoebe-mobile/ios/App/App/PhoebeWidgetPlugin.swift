// PhoebeWidgetPlugin.swift
//
// Bridges the prayer-rhythm stats the web app computes into the shared App
// Group store that PhoebeWidget (the Lock/Home Screen widget extension) reads,
// then asks WidgetKit to refresh.
//
// Why a dedicated plugin: the bundled @capacitor/preferences writes to
// UserDefaults.standard (its `group` option only namespaces the key — see
// Preferences.swift), which a widget extension in a different process can't
// read. This writes straight to UserDefaults(suiteName:) on the App Group.
//
// JS side: PhoebeNative.updateWidget(state) → Capacitor.Plugins.PhoebeWidget.update({ data }).
//
// isActive: lets the app show/hide its own "Add a widget" prompt based on
// whether the user has actually placed one — WidgetKit's own
// getCurrentConfigurations(completion:) is the only API for this (there's
// no way to ask iOS "is a widget on the home/lock screen" any more directly
// than "does this app currently have any configured widget instances").

import Foundation
import Capacitor
import WidgetKit

@objc(PhoebeWidgetPlugin)
public class PhoebeWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebeWidgetPlugin"
    public let jsName = "PhoebeWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isActive", returnType: CAPPluginReturnPromise),
    ]

    static let appGroup = "group.app.withphoebe.mobile"
    static let dataKey = "phoebeWidget"

    @objc func update(_ call: CAPPluginCall) {
        let data = call.getString("data") ?? ""
        if let defaults = UserDefaults(suiteName: PhoebeWidgetPlugin.appGroup) {
            defaults.set(data, forKey: PhoebeWidgetPlugin.dataKey)
        }
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    @objc func isActive(_ call: CAPPluginCall) {
        guard #available(iOS 14.0, *) else {
            call.resolve(["active": false])
            return
        }
        WidgetCenter.shared.getCurrentConfigurations { result in
            switch result {
            case .success(let infos):
                call.resolve(["active": !infos.isEmpty])
            case .failure:
                call.resolve(["active": false])
            }
        }
    }
}
