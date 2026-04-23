// PhoebeWidget.swift — Home Screen widget source.
//
// Copy this file into the ios/ project after `npx cap add ios`:
//
//   1. In Xcode: File → New → Target → Widget Extension
//      - Product Name: PhoebeWidget
//      - Include Configuration App Intent: No (we use StaticConfiguration)
//      - Click Finish, then "Activate" if prompted about scheme.
//
//   2. Replace the auto-generated PhoebeWidget.swift with this file.
//
//   3. Add App Group capability to BOTH targets (App + PhoebeWidget):
//      - Signing & Capabilities → + Capability → App Groups
//      - Add group identifier: group.app.withphoebe.mobile
//      - Xcode signs the entitlement; no other code change needed.
//
//   4. The web app writes its "what to show on the widget" JSON blob to
//      Capacitor Preferences under key `phoebe:persist:widget`, and the
//      native-shell mirrors `phoebe:persist:*` into Preferences —
//      which on iOS is backed by the shared UserDefaults suite named
//      "group.app.withphoebe.mobile". So this widget just reads that
//      suite's "phoebe:persist:widget" key.
//
//      If you prefer to post JSON directly without going through the
//      web-app → Preferences chain, the native-shell exposes
//      PhoebeNative.scheduleBell + setBiometricLock etc., and we can
//      add a PhoebeNative.updateWidget(payload) method the same way.

import WidgetKit
import SwiftUI

private let sharedAppGroup = "group.app.withphoebe.mobile"
private let widgetStateKey = "phoebe:persist:widget"

struct PhoebeWidgetState: Codable {
    let bellTime: String?         // e.g. "07:00"
    let lectioStage: String?      // "lectio" | "meditatio" | "oratio" | nil
    let lectioPrompt: String?     // Prompt for that stage
    let nextPracticeName: String? // e.g. "Morning Prayer"
}

struct PhoebeTimelineEntry: TimelineEntry {
    let date: Date
    let state: PhoebeWidgetState
}

struct PhoebeTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PhoebeTimelineEntry {
        PhoebeTimelineEntry(
            date: Date(),
            state: PhoebeWidgetState(
                bellTime: "7:00 AM",
                lectioStage: "lectio",
                lectioPrompt: "What word is speaking to you?",
                nextPracticeName: "Lectio Divina"
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PhoebeTimelineEntry) -> Void) {
        completion(PhoebeTimelineEntry(date: Date(), state: loadState()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PhoebeTimelineEntry>) -> Void) {
        // Refresh every 30 min; the web app also triggers an immediate
        // reload by calling WidgetCenter.shared.reloadAllTimelines() via
        // a native-shell bridge when it writes new data.
        let entry = PhoebeTimelineEntry(date: Date(), state: loadState())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: entry.date) ?? entry.date
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadState() -> PhoebeWidgetState {
        guard let defaults = UserDefaults(suiteName: sharedAppGroup),
              let json = defaults.string(forKey: widgetStateKey),
              let data = json.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(PhoebeWidgetState.self, from: data) else {
            return PhoebeWidgetState(bellTime: nil, lectioStage: nil, lectioPrompt: nil, nextPracticeName: nil)
        }
        return parsed
    }
}

struct PhoebeWidgetSmallView: View {
    let state: PhoebeWidgetState

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.102, blue: 0.063) // #091A10
            VStack(alignment: .leading, spacing: 6) {
                Text("Phoebe")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(Color(red: 0.44, green: 0.69, blue: 0.52))
                    .tracking(2)
                Spacer(minLength: 2)
                if let prompt = state.lectioPrompt {
                    Text(prompt)
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundColor(Color(red: 0.94, green: 0.93, blue: 0.90))
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                } else if let bell = state.bellTime {
                    Text("Bell at \(bell)")
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundColor(Color(red: 0.94, green: 0.93, blue: 0.90))
                } else {
                    Text("A quiet day.")
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundColor(Color(red: 0.56, green: 0.69, blue: 0.59))
                }
                Spacer(minLength: 0)
                if let practice = state.nextPracticeName {
                    Text(practice)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color(red: 0.56, green: 0.69, blue: 0.59))
                }
            }
            .padding(14)
        }
    }
}

struct PhoebeWidget: Widget {
    let kind: String = "PhoebeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeTimelineProvider()) { entry in
            PhoebeWidgetSmallView(state: entry.state)
        }
        .configurationDisplayName("Phoebe")
        .description("Today's quiet word.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct PhoebeWidgetBundle: WidgetBundle {
    var body: some Widget {
        PhoebeWidget()
    }
}
