// PhoebeWidget.swift
//
// Lock Screen + Home Screen widget for the prayer rhythm: your forgiving
// consistency streak and today's office (the prayer analogue of a meditation
// app's "Streak / Today"). Reads the shared App Group store that the main app
// writes via PhoebeWidgetPlugin; the app reloads timelines whenever it pushes
// fresh data, and we also refresh hourly so "next office" stays current.

import WidgetKit
import SwiftUI

private let appGroup = "group.app.withphoebe.mobile"
private let dataKey = "phoebeWidget"

private let phoebeGreen = Color(red: 0.035, green: 0.102, blue: 0.063) // #091A10
private let phoebeWarm = Color(red: 0.941, green: 0.929, blue: 0.902)  // #F0EDE6

// ── Shared data ───────────────────────────────────────────────────────────
struct PhoebeStats {
    var streakDays: Int
    var prayedToday: Bool
    var nextOffice: String

    static let placeholder = PhoebeStats(streakDays: 4, prayedToday: false, nextOffice: "Morning Prayer")

    static func load() -> PhoebeStats {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let raw = defaults.string(forKey: dataKey),
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return PhoebeStats(streakDays: 0, prayedToday: false, nextOffice: "Morning Prayer") }
        let streak = (obj["streakDays"] as? NSNumber)?.intValue ?? 0
        let prayed = (obj["prayedToday"] as? NSNumber)?.boolValue ?? false
        let next = (obj["nextOffice"] as? String) ?? ""
        return PhoebeStats(streakDays: streak, prayedToday: prayed, nextOffice: next)
    }

    var streakText: String { streakDays > 0 ? "\(streakDays)-day streak" : "Begin a streak" }

    // The single "today" line: the next office to pray, or a done/idle state.
    var todayLine: String {
        if !nextOffice.isEmpty { return nextOffice }
        return prayedToday ? "Prayed today" : "Time to pray"
    }
}

// ── Timeline ──────────────────────────────────────────────────────────────
struct PhoebeEntry: TimelineEntry {
    let date: Date
    let stats: PhoebeStats
}

struct PhoebeProvider: TimelineProvider {
    func placeholder(in context: Context) -> PhoebeEntry {
        PhoebeEntry(date: Date(), stats: .placeholder)
    }
    func getSnapshot(in context: Context, completion: @escaping (PhoebeEntry) -> Void) {
        completion(PhoebeEntry(date: Date(), stats: context.isPreview ? .placeholder : PhoebeStats.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PhoebeEntry>) -> Void) {
        let entry = PhoebeEntry(date: Date(), stats: PhoebeStats.load())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// ── Views ─────────────────────────────────────────────────────────────────
struct PhoebeWidgetView: View {
    @Environment(\.widgetFamily) var family
    let stats: PhoebeStats

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(stats.streakText, systemImage: "flame.fill")
        case .accessoryCircular:
            VStack(spacing: -1) {
                Image(systemName: "flame.fill").font(.system(size: 13))
                Text("\(stats.streakDays)").font(.system(size: 17, weight: .bold))
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "flame.fill").font(.system(size: 22))
                VStack(alignment: .leading, spacing: 1) {
                    Text(stats.streakText).font(.system(size: 15, weight: .semibold))
                    Text(stats.todayLine).font(.system(size: 13)).opacity(0.8)
                }
            }
        default:
            homeSmall
        }
    }

    private var homeSmall: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "flame.fill").font(.system(size: 13)).foregroundColor(.orange)
                Text("Phoebe").font(.system(size: 13, weight: .semibold)).foregroundColor(phoebeWarm.opacity(0.75))
            }
            Spacer()
            Text("\(stats.streakDays)").font(.system(size: 40, weight: .bold)).foregroundColor(phoebeWarm)
            Text("day streak").font(.system(size: 12)).foregroundColor(phoebeWarm.opacity(0.75))
            Spacer()
            Text(stats.todayLine).font(.system(size: 13, weight: .medium)).foregroundColor(phoebeWarm)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// ── Widget ────────────────────────────────────────────────────────────────
struct PhoebeWidget: Widget {
    let kind = "PhoebeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeProvider()) { entry in
            if #available(iOS 17.0, *) {
                PhoebeWidgetView(stats: entry.stats)
                    .containerBackground(phoebeGreen, for: .widget)
            } else {
                PhoebeWidgetView(stats: entry.stats)
                    .padding()
                    .background(phoebeGreen)
            }
        }
        .configurationDisplayName("Prayer streak")
        .description("Your prayer streak and today's office.")
        .supportedFamilies([
            .accessoryInline, .accessoryCircular, .accessoryRectangular, .systemSmall,
        ])
    }
}

@main
struct PhoebeWidgetBundle: WidgetBundle {
    var body: some Widget {
        PhoebeWidget()
    }
}
