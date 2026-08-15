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
    // "Past 7 Days" grid — the SAME data + row-label mode
    // (Turn/Learn/Pray, or Morning/Contemplative/Evening if the viewer set
    // that in Settings) the home card's WayOfLoveTurnLearnPray shows, via
    // the shared computeWeeklyGrid on the JS side (lib/weeklyGrid.ts).
    // weeklyGrid[row][day], oldest day first / today last.
    var weeklyLabels: [String]
    // Per-row emoji (🌅/🕯️/🌙 or 🔄/📖/🙏🏽) — shown as the row label instead
    // of a letter, matching the home card (owner: "left labels are the
    // associated emojis from the practice cards").
    var weeklyEmoji: [String]
    var weeklyGrid: [[Bool]]
    // Day-of-week initials for the grid's header row (S/M/T/W/T/F/S), same
    // column order as weeklyGrid — mirrors the home card's own header row
    // (WayOfLoveTurnLearnPray.tsx's dayInitials), which the widget was
    // missing entirely (owner: "the letters to label the day aren't there").
    var weeklyDayInitials: [String]

    static let placeholder = PhoebeStats(
        kind: "office", eyebrow: "Book of Common Prayer", title: "Evening Devotion",
        subtitle: "9 people prayed with you this week", cta: "Begin prayer",
        deepLink: "https://withphoebe.app/", streakDays: 4, prayedToday: false,
        nextOffice: "Evening Prayer", newPrayers: 0,
        doneCount: 2, totalAnchors: 4, dots: [1, 1, 0, 1],
        morningDone: true, reflectDone: true, eveningDone: false, reflectAvailable: true,
        contemplationMin: 7, contemplationGoalMin: 20,
        weeklyLabels: ["Turn", "Learn", "Pray"],
        weeklyEmoji: ["🔄", "📖", "🙏🏽"],
        weeklyGrid: [
            [true, true, false, true, true, true, true],
            [true, false, true, true, true, false, true],
            [true, true, true, true, true, true, false],
        ],
        weeklyDayInitials: ["S", "M", "T", "W", "T", "F", "S"]
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
            contemplationMin: 0, contemplationGoalMin: 0,
            // Honestly empty rather than fabricated — the app hasn't pushed
            // real history yet, so there's nothing kept to show.
            weeklyLabels: ["Turn", "Learn", "Pray"],
            weeklyEmoji: ["🔄", "📖", "🙏🏽"],
            weeklyGrid: [[Bool](repeating: false, count: 7), [Bool](repeating: false, count: 7), [Bool](repeating: false, count: 7)],
            weeklyDayInitials: ["S", "M", "T", "W", "T", "F", "S"]
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
        // Defaults to the Turn/Learn/Pray labels + an all-empty grid (not
        // fabricated data) so an older app build's payload — which won't
        // carry these fields at all — still renders a real, honest grid
        // rather than a crash or blank space.
        let weeklyLabels = (obj["weeklyLabels"] as? [String]) ?? ["Turn", "Learn", "Pray"]
        let weeklyEmoji = (obj["weeklyEmoji"] as? [String]) ?? ["🔄", "📖", "🙏🏽"]
        let weeklyGrid: [[Bool]] = (obj["weeklyGrid"] as? [[Bool]])
            ?? (obj["weeklyGrid"] as? [[NSNumber]])?.map { $0.map { $0.boolValue } }
            ?? weeklyLabels.map { _ in [Bool](repeating: false, count: 7) }
        let weeklyDayInitials = (obj["weeklyDayInitials"] as? [String]) ?? ["S", "M", "T", "W", "T", "F", "S"]
        return PhoebeStats(kind: kind, eyebrow: eyebrow, title: title, subtitle: subtitle, cta: cta,
                           deepLink: deepLink, streakDays: streak, prayedToday: prayed,
                           nextOffice: nextOffice, newPrayers: newPrayers,
                           doneCount: doneCount, totalAnchors: totalAnchors, dots: dots,
                           morningDone: morningDone, reflectDone: reflectDone,
                           eveningDone: eveningDone, reflectAvailable: reflectAvailable,
                           contemplationMin: contemplationMin, contemplationGoalMin: contemplationGoalMin,
                           weeklyLabels: weeklyLabels, weeklyEmoji: weeklyEmoji, weeklyGrid: weeklyGrid,
                           weeklyDayInitials: weeklyDayInitials)
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
            homeWeeklyGrid
        default:
            homeSmall
        }
    }

    // "Past 7 Days" — the SAME dot grid the home card shows (Turn/Learn/Pray,
    // or Morning/Contemplative/Evening if the viewer set that in Settings),
    // fed by widgetSync.ts's shared computeWeeklyGrid so this is never a
    // separately-drifting approximation. Owner: the wide (.systemMedium)
    // widget should be this grid, not the "what's next" hero — replaces
    // homeMedium below for this family (homeMedium is kept for reference/
    // potential reuse but no longer wired to any family).
    private var homeWeeklyGrid: some View {
        // 18pt row-label column + 7 equal day columns, mirroring the home
        // card's own `20px repeat(7, 1fr)` CSS grid.
        let dayCols = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
        let rowCount = stats.weeklyLabels.count
        return VStack(alignment: .leading, spacing: 6) {
            // App identity top-left, "PAST 7 DAYS" top-right, on one row —
            // owner: bigger wordmark, label moved to the right, and less
            // gap above the grid so it sits higher in the card.
            HStack {
                Text("Phoebe").font(sgBold(17)).foregroundColor(.white)
                Spacer()
                Text("PAST 7 DAYS")
                    .font(sgBold(9))
                    .tracking(1.4)
                    .foregroundColor(phoebeWarm.opacity(0.55))
            }
            .frame(maxWidth: .infinity)
            // frame(maxWidth: .infinity) at EVERY level here — a VStack/HStack
            // in SwiftUI does NOT propagate "fill available width" to its
            // children automatically; each nesting level has to ask for it
            // itself. Without this the LazyVGrid (and everything inside it)
            // only ever took the minimum width its content needed — 7 small
            // circles worth — leaving the dots clustered in the left third
            // of the card instead of spanning it like the home card's own
            // `20px repeat(7, 1fr)` CSS grid does. This is THE disconnect
            // from the home card that made the widget not "exactly emulate"
            // it, not a cosmetic tweak.
            //
            // Day-initial header row (S/M/T/W/T/F/S) above the dot rows —
            // mirrors the home card's own header row, which this widget was
            // missing entirely.
            // spacing: 6 (not 0) between the label column and the day grid —
            // owner: nudge the day columns right a touch without moving the
            // emoji/label column itself. Same gap on both this header row
            // and the dot rows below so S/M/T/... stays lined up above its
            // column's dots.
            HStack(spacing: 6) {
                Text("").frame(width: 18)
                LazyVGrid(columns: dayCols, spacing: 0) {
                    ForEach(0..<7, id: \.self) { day in
                        // The last column (today) trailing-aligns instead of
                        // centering, so it lands flush with the right edge
                        // of "PAST 7 DAYS" above it rather than sitting one
                        // half-column short of it (owner).
                        Text(day < stats.weeklyDayInitials.count ? stats.weeklyDayInitials[day] : "")
                            .font(sgBold(9))
                            .foregroundColor(phoebeWarm.opacity(0.4))
                            .frame(maxWidth: .infinity, alignment: day == 6 ? .trailing : .center)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: 9) {
                ForEach(0..<rowCount, id: \.self) { row in
                    HStack(spacing: 6) {
                        Text(row < stats.weeklyEmoji.count ? stats.weeklyEmoji[row] : "")
                            .font(.system(size: 11))
                            .frame(width: 18, alignment: .center)
                        LazyVGrid(columns: dayCols, spacing: 0) {
                            ForEach(0..<7, id: \.self) { day in
                                let kept = row < stats.weeklyGrid.count && day < stats.weeklyGrid[row].count
                                    && stats.weeklyGrid[row][day]
                                Circle()
                                    .fill(kept ? Color(red: 0.431, green: 0.706, blue: 0.510).opacity(0.9) : Color.clear)
                                    .overlay(
                                        Circle().stroke(kept ? Color.clear : phoebeWarm.opacity(0.35), lineWidth: 1)
                                    )
                                    .frame(width: 14, height: 14)
                                    .frame(maxWidth: .infinity, alignment: day == 6 ? .trailing : .center)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
        }
        // Tighter than the old hero's 16pt — this content should feel like
        // it fills the whole card (owner: "full bleed"), not float inside a
        // wide margin.
        .padding(.horizontal, 14)
        // Less top padding than bottom — pinned to .topLeading below, so
        // shrinking just the top inset nudges Phoebe/PAST 7 DAYS up a
        // little (owner) without disturbing the card's bottom breathing room.
        .padding(.top, 7)
        .padding(.bottom, 12)
        // .leading alone vertically CENTERS in the extra height (Alignment.leading
        // = .leading + .center) — that's what was holding the grid down in the
        // middle of the card instead of near the top. .topLeading pins it up.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // Same "what's next" story as the medium widget used to show, just
    // condensed to fit —
    // no dots/count here either, matching homeMedium's move away from a
    // progress readout toward always naming the next thing to pray.
    private var homeSmall: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 5) {
                Image(systemName: "leaf.fill").font(.system(size: 12)).foregroundColor(accentColor)
                Text("Phoebe").font(sgBold(12)).foregroundColor(phoebeWarm.opacity(0.75))
            }
            Spacer(minLength: 4)
            Text(heroEyebrow)
                .font(sgBold(10))
                .tracking(1.2)
                .foregroundColor(phoebeSage.opacity(0.65))
                .lineLimit(1)
            Text(heroTitle)
                .font(sgBold(17))
                .foregroundColor(phoebeWarm)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            if !heroCta.isEmpty {
                HStack(spacing: 4) {
                    Text(heroCta).font(sgBold(12))
                    Image(systemName: "arrow.right").font(.system(size: 10, weight: .semibold))
                }
                .foregroundColor(phoebeWarm)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Capsule().fill(accentColor))
            }
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
// The app's frosted-glass-over-photo look. A prior attempt at this (see git
// history) had structurally correct SwiftUI — .resizable().scaledToFill()
// .frame(...).clipped() — but the photo still never reliably rendered, so
// it was dropped for a plain fill. Re-attempting now with a REAL, different
// fix: WidgetLeafBG.imageset's Contents.json mapped the SAME 900x900 file to
// the 1x, 2x, AND 3x slots simultaneously — not how a normal Xcode
// single-scale asset is structured — rewritten to a proper single "1x"
// universal entry. That malformed asset catalog entry is a genuinely new
// candidate cause, not a repeat of what was already ruled out.
private var widgetPhotoBackground: some View {
    ZStack {
        Image("WidgetLeafBG")
            .resizable()
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        LinearGradient(
            colors: [phoebeGreen.opacity(0.35), phoebeGreen.opacity(0.72)],
            startPoint: .top, endPoint: .bottom
        )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
