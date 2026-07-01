// PhoebePrintPlugin.swift
//
// WKWebView does not implement window.print(), so the web app's "Save as PDF"
// button on the routine printout does nothing inside the native iOS app. This
// plugin exposes `printPage()` to JS: it presents the standard iOS print sheet
// for the current web view (UIPrintInteractionController driven by the
// WKWebView's viewPrintFormatter), which renders the page's @media print layout
// and lets the user AirPrint, Save to Files as a PDF, or share it.
//
// JS side: the web app dispatches a `phoebe:print` event; native-shell.ts routes
// it to this plugin (see wireNativePrint). Registered explicitly in
// MainViewController.capacitorDidLoad() because — like the other app-embedded
// plugins referenced only in their own file — Cap 8 dead-strips it otherwise.

import Foundation
import Capacitor
import UIKit
import WebKit

@objc(PhoebePrintPlugin)
public class PhoebePrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebePrintPlugin"
    public let jsName = "PhoebePrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise),
    ]

    @objc func printPage(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                call.reject("No web view available")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = call.getString("jobName") ?? "Phoebe"

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject("Print failed: \(error.localizedDescription)")
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
