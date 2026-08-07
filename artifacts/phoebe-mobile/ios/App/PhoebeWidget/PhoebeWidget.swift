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
    var doneCount: Int         // daily anchors completed today
    var totalAnchors: Int      // daily anchors that count today
    var dots: [Int]            // 1/0 per ACTIVE anchor today, home-pill order
    var morningDone: Bool
    var reflectDone: Bool
    var eveningDone: Bool
    var reflectAvailable: Bool // false → user has no reflection source; skip that dot
    var contemplationMin: Int      // today's contemplation minutes (sits + Health)
    var contemplationGoalMin: Int  // daily contemplation goal (0 = no goal set)

    static let placeholder = PhoebeStats(
        kind: "office", eyebrow: "Book of Common Prayer", title: "Evening Devotion",
        subtitle: "9 people prayed with you this week", cta: "Begin prayer",
        deepLink: "https://withphoebe.app/", streakDays: 4, prayedToday: false,
        nextOffice: "Evening Prayer", newPrayers: 0,
        doneCount: 2, totalAnchors: 4, dots: [1, 1, 0, 1],
        morningDone: true, reflectDone: true, eveningDone: false, reflectAvailable: true,
        contemplationMin: 7, contemplationGoalMin: 20
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
            newPrayers: 0,
            doneCount: 0, totalAnchors: 3, dots: [],
            morningDone: false, reflectDone: false, eveningDone: false, reflectAvailable: true,
            contemplationMin: 0, contemplationGoalMin: 0
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
        // Daily-progress anchors. totalAnchors defaults to 3 (not 0) so an older
        // payload renders "0 of 3 today" rather than "0 of 0".
        let doneCount = (obj["doneCount"] as? NSNumber)?.intValue ?? 0
        let totalAnchors = (obj["totalAnchors"] as? NSNumber)?.intValue ?? 3
        let dots: [Int] = (obj["dots"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? []
        let morningDone = (obj["morningDone"] as? NSNumber)?.boolValue ?? false
        let reflectDone = (obj["reflectDone"] as? NSNumber)?.boolValue ?? false
        let eveningDone = (obj["eveningDone"] as? NSNumber)?.boolValue ?? false
        let reflectAvailable = (obj["reflectAvailable"] as? NSNumber)?.boolValue ?? true
        let contemplationMin = (obj["contemplationMin"] as? NSNumber)?.intValue ?? 0
        let contemplationGoalMin = (obj["contemplationGoalMin"] as? NSNumber)?.intValue ?? 0
        return PhoebeStats(kind: kind, eyebrow: eyebrow, title: title, subtitle: subtitle, cta: cta,
                           deepLink: deepLink, streakDays: streak, prayedToday: prayed,
                           nextOffice: nextOffice, newPrayers: newPrayers,
                           doneCount: doneCount, totalAnchors: totalAnchors, dots: dots,
                           morningDone: morningDone, reflectDone: reflectDone,
                           eveningDone: eveningDone, reflectAvailable: reflectAvailable,
                           contemplationMin: contemplationMin, contemplationGoalMin: contemplationGoalMin)
    }

    var streakText: String { streakDays > 0 ? "\(streakDays)-day streak" : "Begin a streak" }
    var todayLine: String { !title.isEmpty ? title : (prayedToday ? "Prayed today" : "Time to pray") }
    // The dots to render — the app-sent set when present, else a sensible
    // fallback from the older morning/reflect/evening booleans.
    var dotList: [Bool] {
        if !dots.isEmpty { return dots.map { $0 == 1 } }
        var d = [morningDone]
        if reflectAvailable { d.append(reflectDone) }
        d.append(eveningDone)
        return d
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

// ── Fonts ─────────────────────────────────────────────────────────────────
// Space Grotesk — the app's actual typeface (SpaceGrotesk-Regular.ttf /
// -Bold.ttf, bundled in this target and registered via Info.plist's
// UIAppFonts), instead of the system font, so the home-screen widget reads
// like the rest of the app. Only two static weights are available (no
// synthetic bolding), so "semibold" text uses the Bold face — visually the
// closer match of the two.
private func sgRegular(_ size: CGFloat) -> Font { .custom("SpaceGrotesk-Regular", size: size) }
private func sgBold(_ size: CGFloat) -> Font { .custom("SpaceGrotesk-Bold", size: size) }

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

    // The medium widget always shows the actual next practice in the day's
    // rhythm — the app already resolves this the same way the home screen's
    // Next card does (morning ranks first when it's due; see widgetSync.ts),
    // so the widget never needs its own separate "waiting" lead to override it.
    private var heroEyebrow: String { "WHAT'S NEXT" }
    private var heroTitle: String { displayTitle }
    private var heroSubtitle: String { stats.subtitle }
    private var heroCta: String { stats.cta }

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

    // Daily-progress dots — one per applicable anchor (Morning · Reflection ·
    // Evening), filled when done, plus an "N/M" count. Reflects how far through
    // today's rhythm the user is.
    private var progressDots: some View {
        HStack(spacing: 5) {
            ForEach(Array(stats.dotList.enumerated()), id: \.offset) { _, done in
                anchorDot(done: done)
            }
            Text("\(stats.doneCount)/\(stats.totalAnchors)")
                .font(sgBold(12))
                .foregroundColor(phoebeSage)
                .padding(.leading, 2)
        }
    }
    private func anchorDot(done: Bool) -> some View {
        Image(systemName: done ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 13))
            .foregroundColor(done ? accentColor : phoebeSage.opacity(0.4))
    }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(stats.doneCount)/\(stats.totalAnchors) kept · \(stats.todayLine)", systemImage: "leaf.fill")
        case .accessoryCircular:
            VStack(spacing: -1) {
                Image(systemName: "leaf.fill").font(.system(size: 12))
                Text("\(stats.doneCount)/\(stats.totalAnchors)").font(.system(size: 15, weight: .bold))
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
                    // For the reflection, the lock screen shows the publication
                    // ("CAC Daily Meditation"), NOT the day's specific title —
                    // the small widget reads cleaner as the standing name.
                    Text(stats.kind == "reflect" && !stats.eyebrow.isEmpty ? stats.eyebrow : stats.todayLine)
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
                    .font(sgBold(11))
                    .tracking(1.6)
                    .foregroundColor(phoebeSage.opacity(0.65))
                Text(heroTitle)
                    .font(sgBold(23))
                    .foregroundColor(phoebeWarm)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if !heroSubtitle.isEmpty {
                    Text(heroSubtitle)
                        .font(sgRegular(13))
                        .foregroundColor(phoebeSage)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                // The CTA pill sits on its own row, pushed to the right — then
                // today's rhythm progress (dots + N/M) is its own row at the
                // very bottom, matching the home card's own layout (title/CTA
                // up top, the progress bar as a full row underneath).
                if !heroCta.isEmpty {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
                        HStack(spacing: 4) {
                            Text(heroCta).font(sgBold(13))
                            Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(phoebeWarm)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(accentColor))
                    }
                }
                progressDots
            }
            .padding(16)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var homeSmall: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "leaf.fill").font(.system(size: 13)).foregroundColor(accentColor)
                Text("Phoebe").font(sgBold(13)).foregroundColor(phoebeWarm.opacity(0.75))
            }
            Spacer()
            Text("\(stats.doneCount) of \(stats.totalAnchors)").font(sgBold(34)).foregroundColor(phoebeWarm)
            Text("done today").font(sgRegular(12)).foregroundColor(phoebeWarm.opacity(0.75))
            HStack(spacing: 5) {
                ForEach(Array(stats.dotList.enumerated()), id: \.offset) { _, done in
                    anchorDot(done: done)
                }
            }.padding(.top, 6)
            Spacer()
            Text(stats.todayLine).font(sgBold(12)).foregroundColor(phoebeWarm.opacity(0.85)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// ── "Today" view — contemplation progress + what's next ─────────────────────
// The lock-screen companion to the hero: it LEADS with today's contemplation
// minutes (and the goal, when one is set, as "N/M min" + a ring/bar) and TAILS
// with the next thing in the rhythm. Accessory families render in the system's
// vibrant monochrome, so this leans on SF Symbols, a trim ring, and a thin
// ProgressView rather than colour.
struct PhoebeTodayView: View {
    @Environment(\.widgetFamily) var family
    let stats: PhoebeStats

    private var hasGoal: Bool { stats.contemplationGoalMin > 0 }
    private var progress: Double {
        guard hasGoal else { return stats.contemplationMin > 0 ? 1 : 0 }
        return min(1.0, Double(stats.contemplationMin) / Double(stats.contemplationGoalMin))
    }
    // Always show the ACTUAL minutes done over the goal — "74/60 min" if you sat
    // 74 against a 60-min goal — with a ✓ once you've met it. No goal → just mins.
    private var minutesLine: String {
        guard hasGoal else { return "\(stats.contemplationMin) min" }
        let met = stats.contemplationMin >= stats.contemplationGoalMin
        return "\(met ? "✓ " : "")\(stats.contemplationMin)/\(stats.contemplationGoalMin) min"
    }
    private var nextLine: String { stats.todayLine }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(minutesLine) · \(nextLine)", systemImage: "leaf.fill")
        case .accessoryCircular:
            // A simple trim ring (avoids Gauge's availability constraints) with
            // the minutes in the centre under a leaf.
            ZStack {
                Circle().stroke(lineWidth: 4).opacity(0.25)
                Circle()
                    .trim(from: 0, to: max(0.001, progress))
                    .stroke(style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: -2) {
                    Image(systemName: "leaf.fill").font(.system(size: 10))
                    Text("\(stats.contemplationMin)").font(.system(size: 15, weight: .bold))
                }
            }
        default:
            rectangular
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "leaf.fill").font(.system(size: 11))
                Text("CONTEMPLATION")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            if hasGoal {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
            }
            // Minutes sit UNDER the bar now; the "Next · the day is kept" footer
            // is gone (it read as contradictory once the day was complete).
            Text(minutesLine)
                .font(.system(size: 12, weight: .semibold))
                .opacity(0.9)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// ── Widget ────────────────────────────────────────────────────────────────
// The app's frosted-glass-over-photo look, baked into a single pre-blurred,
// pre-darkened static image (WidgetLeafBG, in this target's own asset catalog
// — WidgetKit can't reach the main app's web-bundled photos or reliably layer
// live blur/material over a custom image on home-screen families). A top-to-
// bottom gradient wash on top mirrors the same recipe used across the deck/
// about/splash screens, so text stays legible over the photo underneath.
private var widgetPhotoBackground: some View {
    ZStack {
        Image("WidgetLeafBG")
            .resizable()
            .scaledToFill()
        // Lighter than before — the previous wash (0.55–0.88) all but hid the
        // photo entirely, which read as "no background" rather than the
        // frosted-over-photo look the rest of the app uses.
        LinearGradient(
            colors: [phoebeGreen.opacity(0.35), phoebeGreen.opacity(0.72)],
            startPoint: .top, endPoint: .bottom
        )
    }
}

struct PhoebeWidget: Widget {
    let kind = "PhoebeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeProvider()) { entry in
            let view = PhoebeWidgetView(stats: entry.stats)
                .widgetURL(URL(string: entry.stats.deepLink))
            if #available(iOS 17.0, *) {
                // Lock-screen accessory families are always rendered by the
                // system in forced monochrome/vibrant regardless of what's
                // supplied here, so the photo only actually shows on the
                // home-screen (.systemSmall/.systemMedium) families below.
                view.containerBackground(for: .widget) { widgetPhotoBackground }
            } else {
                view.padding().background(phoebeGreen)
            }
        }
        .configurationDisplayName("What's next")
        .description("Your next prayer, reflection, or office — and today's rhythm.")
        .supportedFamilies([
            .accessoryInline, .accessoryCircular, .accessoryRectangular,
            .systemSmall, .systemMedium,
        ])
    }
}

// ── "Today" widget — contemplation + next, lock-screen first ─────────────────
// A second widget so the gallery offers TWO options: this rich "Contemplation
// & next" (minutes/goal + what's next) and the leaner "What's next" above.
// Lock-screen families only — the home hero already lives in PhoebeWidget.
struct PhoebeTodayWidget: Widget {
    let kind = "PhoebeTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeProvider()) { entry in
            let view = PhoebeTodayView(stats: entry.stats)
                .widgetURL(URL(string: entry.stats.deepLink))
            if #available(iOS 17.0, *) {
                view.containerBackground(phoebeGreen, for: .widget)
            } else {
                view.padding().background(phoebeGreen)
            }
        }
        .configurationDisplayName("Contemplation & next")
        .description("Today's contemplation minutes and what's next.")
        .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
    }
}

// ── "Daily progress" view — just your rhythm dots for today ──────────────────
struct PhoebeDotsView: View {
    @Environment(\.widgetFamily) var family
    let stats: PhoebeStats
    private var frac: Double { stats.totalAnchors > 0 ? Double(stats.doneCount) / Double(stats.totalAnchors) : 0 }
    private func dot(_ done: Bool) -> some View {
        Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.system(size: 13))
    }
    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(stats.doneCount)/\(stats.totalAnchors) kept today", systemImage: "leaf.fill")
        case .accessoryCircular:
            ZStack {
                Circle().stroke(lineWidth: 4).opacity(0.25)
                Circle().trim(from: 0, to: max(0.001, frac))
                    .stroke(style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(stats.doneCount)/\(stats.totalAnchors)").font(.system(size: 13, weight: .bold))
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "leaf.fill").font(.system(size: 11))
                    Text("TODAY").font(.system(size: 10, weight: .semibold)).tracking(0.8)
                    Spacer(minLength: 0)
                    Text("\(stats.doneCount)/\(stats.totalAnchors)").font(.system(size: 12, weight: .semibold))
                }
                HStack(spacing: 7) {
                    ForEach(Array(stats.dotList.enumerated()), id: \.offset) { _, done in dot(done) }
                    Spacer(minLength: 0)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

// ── "Daily progress" widget — your rhythm dots (lock-screen). ────────────────
struct PhoebeDotsWidget: Widget {
    let kind = "PhoebeDotsWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PhoebeProvider()) { entry in
            let view = PhoebeDotsView(stats: entry.stats)
                .widgetURL(URL(string: entry.stats.deepLink))
            if #available(iOS 17.0, *) {
                view.containerBackground(phoebeGreen, for: .widget)
            } else {
                view.padding().background(phoebeGreen)
            }
        }
        .configurationDisplayName("Daily progress")
        .description("Your rhythm dots for today.")
        .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
    }
}

@main
struct PhoebeWidgetBundle: WidgetBundle {
    var body: some Widget {
        PhoebeWidget()        // "What's next" — home + lock screen
        PhoebeTodayWidget()   // "Contemplation & next" — lock screen
        PhoebeDotsWidget()    // "Daily progress" — your dots, lock screen
    }
}
