// PhoebeWidget.swift
//
// Home Screen + Lock Screen widget for the prayer rhythm.
//
// The medium Home Screen widget mirrors the app's dynamic "what's next" hero:
// Morning Prayer → the day's reflection → Evening Prayer, then a "day is kept"
// community summary once everything's done — the same resolver the home screen
// runs (see mymonastery/src/lib/widgetSync.ts). Tapping it opens the app on
// home, where the identical hero (with its Begin/Read action) is waiting.
//
// Data arrives via the shared App Group store the main app writes through
// PhoebeWidgetPlugin; the app reloads timelines whenever it pushes fresh data,
// and we also refresh hourly so the morning→evening switch stays current.

import WidgetKit
import SwiftUI

private let appGroup = "group.app.withphoebe.mobile"
private let dataKey = "phoebeWidget"

private let phoebeGreen = Color(red: 0.035, green: 0.102, blue: 0.063) // #091A10
private let phoebeWarm = Color(red: 0.941, green: 0.929, blue: 0.902)  // #F0EDE6
private let phoebeSage = Color(red: 0.561, green: 0.686, blue: 0.588)  // #8FAF96

// ── Shared data ───────────────────────────────────────────────────────────
struct PhoebeStats {
    var kind: String          // "office" | "reflect" | "summary"
    var eyebrow: String       // the small label above the title (mirrors home hero)
    var title: String
    var subtitle: String
    var cta: String           // "" → no button
    var deepLink: String
    var streakDays: Int
    var prayedToday: Bool
    var nextOffice: String
    var newPrayers: Int        // prayer requests waiting for the viewer

    static let placeholder = PhoebeStats(
        kind: "office", eyebrow: "Book of Common Prayer", title: "Evening Devotion",
        subtitle: "9 people prayed with you this week", cta: "Begin prayer",
        deepLink: "https://withphoebe.app/", streakDays: 4, prayedToday: false,
        nextOffice: "Evening Prayer", newPrayers: 0
    )

    // Before the app has ever pushed data (or if the App Group store can't be
    // read), show a proper-looking hero for the time of day rather than a bare
    // "Time to pray" — so the widget always reads as a real Phoebe card.
    static func timeBasedFallback() -> PhoebeStats {
        let hour = Calendar.current.component(.hour, from: Date())
        let morning = hour < 14
        return PhoebeStats(
            kind: "office",
            eyebrow: "Book of Common Prayer",
            title: morning ? "Morning Prayer" : "Evening Prayer",
            subtitle: morning ? "Begin the day with the office" : "Mark the day's end with the office",
            cta: "Begin prayer",
            deepLink: "https://withphoebe.app/",
            streakDays: 0, prayedToday: false,
            nextOffice: morning ? "Morning Prayer" : "Evening Prayer",
            newPrayers: 0
        )
    }

    static func load() -> PhoebeStats {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let raw = defaults.string(forKey: dataKey),
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return timeBasedFallback()
        }
        let streak = (obj["streakDays"] as? NSNumber)?.intValue ?? 0
        let prayed = (obj["prayedToday"] as? NSNumber)?.boolValue ?? false
        let nextOffice = (obj["nextOffice"] as? String) ?? ""
        let kind = (obj["heroKind"] as? String) ?? "office"
        // Fallbacks keep an older app build's payload (streak/prayed/nextOffice
        // only) rendering something sensible.
        let title: String = {
            if let t = obj["heroTitle"] as? String, !t.isEmpty { return t }
            if !nextOffice.isEmpty { return nextOffice }
            return prayed ? "Prayed today" : "Time to pray"
        }()
        let subtitle = (obj["heroSubtitle"] as? String) ?? ""
        let cta = (obj["heroCta"] as? String) ?? (nextOffice.isEmpty ? "" : "Begin prayer")
        let deepLink = (obj["heroDeepLink"] as? String) ?? "https://withphoebe.app/"
        let newPrayers = (obj["newPrayersCount"] as? NSNumber)?.intValue ?? 0
        let eyebrow = (obj["heroEyebrow"] as? String) ?? ""
        return PhoebeStats(kind: kind, eyebrow: eyebrow, title: title, subtitle: subtitle, cta: cta,
                           deepLink: deepLink, streakDays: streak, prayedToday: prayed,
                           nextOffice: nextOffice, newPrayers: newPrayers)
    }

    var streakText: String { streakDays > 0 ? "\(streakDays)-day streak" : "Begin a streak" }
    var todayLine: String { !title.isEmpty ? title : (prayedToday ? "Prayed today" : "Time to pray") }
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

    // When there are new prayer requests, the hero leads with them instead of
    // the next office — friends asking for prayer takes precedence.
    private var hasPrayers: Bool { stats.newPrayers > 0 }

    // Left accent + CTA color, tuned per hero kind to echo the home cards.
    private var accentColor: Color {
        if hasPrayers { return Color(red: 0.76, green: 0.55, blue: 0.35) } // warm amber
        switch stats.kind {
        case "reflect": return Color(red: 0.30, green: 0.55, blue: 0.52) // teal
        case "summary": return Color(red: 0.43, green: 0.71, blue: 0.51) // soft green
        default:        return Color(red: 0.22, green: 0.50, blue: 0.30) // office green
        }
    }

    // Hero copy — overridden by the prayer-requests lead when there are new
    // ones, otherwise the next office / reflection / summary.
    private var heroEyebrow: String { hasPrayers ? "WAITING" : eyebrow }
    private var heroTitle: String {
        if hasPrayers { return stats.newPrayers == 1 ? "1 prayer request 🙏" : "\(stats.newPrayers) prayer requests 🙏" }
        return displayTitle
    }
    private var heroSubtitle: String { hasPrayers ? "Friends are waiting for your prayers" : stats.subtitle }
    private var heroCta: String { hasPrayers ? "Pray now" : stats.cta }

    private var displayTitle: String {
        if stats.kind == "office" {
            let t = stats.title.lowercased()
            if t.contains("evening") { return stats.title + " 🌙" }
            if t.contains("morning") { return stats.title + " 🌅" }
        }
        if stats.kind == "summary" { return stats.title + " 🌿" }
        return stats.title
    }

    // Prefer the eyebrow the app sent (e.g. "Book of Common Prayer", uppercased
    // to match the home hero); fall back to the kind-based default.
    private var eyebrow: String {
        if !stats.eyebrow.isEmpty { return stats.eyebrow.uppercased() }
        return stats.kind == "summary" ? "THE DAY IS KEPT" : "NEXT UP"
    }

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
            // Leads with "N prayer requests waiting" when there are new ones,
            // otherwise "NEXT UP / <the next office or reflection>".
            if stats.newPrayers > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "hands.and.sparkles.fill").font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(stats.newPrayers) prayer request\(stats.newPrayers == 1 ? "" : "s")")
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text("waiting").font(.system(size: 13)).opacity(0.8)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 1) {
                    Text("NEXT UP")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .opacity(0.6)
                    Text(stats.todayLine)
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
            }
        case .systemMedium:
            homeMedium
        default:
            homeSmall
        }
    }

    // The hero card: eyebrow, big title, subtitle, and a CTA pill — the
    // medium widget that mirrors the home "what's next" card.
    private var homeMedium: some View {
        HStack(spacing: 0) {
            Rectangle().fill(accentColor).frame(width: 4)
            VStack(alignment: .leading, spacing: 5) {
                Text(heroEyebrow)
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.6)
                    .foregroundColor(phoebeSage.opacity(0.65))
                Text(heroTitle)
                    .font(.system(size: 23, weight: .bold))
                    .foregroundColor(phoebeWarm)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if !heroSubtitle.isEmpty {
                    Text(heroSubtitle)
                        .font(.system(size: 13))
                        .foregroundColor(phoebeSage)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                if !heroCta.isEmpty {
                    HStack(spacing: 4) {
                        Text(heroCta).font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(phoebeWarm)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(accentColor))
                }
            }
            .padding(16)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
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
            Text(stats.todayLine).font(.system(size: 13, weight: .medium)).foregroundColor(phoebeWarm).lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// ── Widget ────────────────────────────────────────────────────────────────
struct PhoebeWidget: Widget {
    let kind = "PhoebeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeProvider()) { entry in
            let view = PhoebeWidgetView(stats: entry.stats)
                .widgetURL(URL(string: entry.stats.deepLink))
            if #available(iOS 17.0, *) {
                view.containerBackground(phoebeGreen, for: .widget)
            } else {
                view.padding().background(phoebeGreen)
            }
        }
        .configurationDisplayName("What's next")
        .description("Your next prayer, reflection, or office — and your streak.")
        .supportedFamilies([
            .accessoryInline, .accessoryCircular, .accessoryRectangular,
            .systemSmall, .systemMedium,
        ])
    }
}

@main
struct PhoebeWidgetBundle: WidgetBundle {
    var body: some Widget {
        PhoebeWidget()
    }
}
