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

/// One of the home's NEXT cards, exactly as DailyProgressBody renders it —
/// the app computes the two (widgetSync.ts nextCards: same titles, blurbs,
/// CTAs, emoji, accent ramp colour, tint position, Later state), the widget
/// only paints. r/g/b are the accent's 0-255 channels.
struct NextCard {
    var emoji: String
    var title: String
    var subtitle: String
    var cta: String
    var r: Double
    var g: Double
    var b: Double
    var tint: Double
    var later: Bool
    /// The practice this card opens — the same route the home card links to.
    /// Empty for a card the home LOGS in place (a widget can't log), which
    /// falls back to the home. Owner: "if we click the cta on a card we want
    /// it to not just open the app but open the practice."
    var href: String = ""

    var accent: Color { Color(red: r / 255.0, green: g / 255.0, blue: b / 255.0) }
    var destination: URL {
        URL(string: href.isEmpty ? "https://withphoebe.app/" : href)
            ?? URL(string: "https://withphoebe.app/")!
    }

    static func parse(_ raw: Any?) -> [NextCard]? {
        guard let arr = raw as? [[String: Any]] else { return nil }
        return arr.compactMap { o in
            guard let title = o["title"] as? String else { return nil }
            // rgb arrives as the web card's own "r,g,b" string.
            let parts = ((o["rgb"] as? String) ?? "46,107,64").split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            return NextCard(
                emoji: (o["emoji"] as? String) ?? "",
                title: title,
                subtitle: (o["subtitle"] as? String) ?? "",
                cta: (o["cta"] as? String) ?? "Begin",
                r: parts.count == 3 ? parts[0] : 46,
                g: parts.count == 3 ? parts[1] : 107,
                b: parts.count == 3 ? parts[2] : 64,
                tint: (o["tint"] as? NSNumber)?.doubleValue ?? 0.4,
                later: (o["later"] as? NSNumber)?.boolValue ?? false,
                href: (o["href"] as? String) ?? ""
            )
        }
    }
}

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
    // (Turn/Learn/Pray, or Morning/·/Evening if the viewer set that in
    // Settings) the home card's WayOfLoveTurnLearnPray shows, via the shared
    // computeWeeklyGrid on the JS side (lib/weeklyGrid.ts). The MIDDLE label
    // is not fixed: it's Contemplative normally, but Reflection for someone
    // who keeps a newsletter and no silent practice. Always render what
    // arrives here — never hardcode the triad.
    // weeklyGrid[row][day], oldest day first / today last.
    var weeklyLabels: [String]
    // Per-row emoji (🌅/🕯️/🌙 or 🔄/📖/🙏🏽) — shown as the row label instead
    // of a letter, matching the home card (owner: "left labels are the
    // associated emojis from the practice cards").
    var weeklyEmoji: [String]
    var weeklyGrid: [[Bool]]
    // "Started but not yet met the day's quota" — half-shaded dot, parallel
    // to weeklyGrid ([row][day], same shape). Only ever true for
    // Contemplation's TODAY column, mirroring the home card. Defaults to
    // an all-false grid (never fabricated) for a payload that predates
    // this field.
    var weeklyPartial: [[Bool]]
    // Day-of-week initials for the grid's header row (S/M/T/W/T/F/S), same
    // column order as weeklyGrid — mirrors the home card's own header row
    // (WayOfLoveTurnLearnPray.tsx's dayInitials), which the widget was
    // missing entirely (owner: "the letters to label the day aren't there").
    var weeklyDayInitials: [String]
    // nil = a payload from an app build that predates nextCards (render the
    // old weekly grid rather than an empty card list); [] = the day is kept.
    var nextCards: [NextCard]?

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
        weeklyPartial: [
            [false, false, false, false, false, false, false],
            [false, false, false, false, false, false, true],
            [false, false, false, false, false, false, false],
        ],
        weeklyDayInitials: ["S", "M", "T", "W", "T", "F", "S"],
        nextCards: [
            NextCard(emoji: "🌅", title: "Morning Prayer", subtitle: "Begin the day with the office", cta: "Begin", r: 120, g: 166, b: 130, tint: 0, later: false),
            NextCard(emoji: "🌗", title: "The Examen", subtitle: "Review the day with God", cta: "Begin", r: 108, g: 152, b: 119, tint: 1, later: false),
        ]
    )

    // Before the app has ever pushed data (or if the App Group store can't be
    // read), show a proper-looking hero for the time of day rather than a bare
    // "Time to pray" — so the widget always reads as a real Phoebe card.
    static func timeBasedFallback() -> PhoebeStats {
        // 4:30pm, the same boundary the home and widgetSync keep — the owner
        // asked twice that the evening office not lead before it. This said
        // 14:00, so a fresh install showed Evening Prayer from 2pm. Only
        // reached before the app has ever pushed, but it is the first thing a
        // new user sees on their lock screen.
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let morning = (now.hour ?? 0) * 60 + (now.minute ?? 0) < 16 * 60 + 30
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
            weeklyPartial: [[Bool](repeating: false, count: 7), [Bool](repeating: false, count: 7), [Bool](repeating: false, count: 7)],
            weeklyDayInitials: ["S", "M", "T", "W", "T", "F", "S"],
            nextCards: [
                NextCard(emoji: morning ? "🌅" : "🌙",
                         title: morning ? "Morning Prayer" : "Evening Prayer",
                         subtitle: morning ? "Begin the day with the office" : "Mark the day's end with the office",
                         cta: "Begin", r: 120, g: 166, b: 130, tint: 0, later: false),
            ]
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
        // Older app builds won't send this field at all — an all-false grid
        // (never fabricated) so those payloads still render, just with no
        // half-shaded dots.
        let weeklyPartial: [[Bool]] = (obj["weeklyPartial"] as? [[Bool]])
            ?? (obj["weeklyPartial"] as? [[NSNumber]])?.map { $0.map { $0.boolValue } }
            ?? weeklyLabels.map { _ in [Bool](repeating: false, count: 7) }
        let weeklyDayInitials = (obj["weeklyDayInitials"] as? [String]) ?? ["S", "M", "T", "W", "T", "F", "S"]
        /**
         * A payload without nextCards (an app build that predates the field,
         * or one whose stored push is stale) must still show SOMETHING real —
         * the owner's Home Screen showed a bare "Phoebe" on a leaf, because
         * the old fallback was the weekly grid and the weekly rows arrive
         * EMPTY whenever the home's weekly card is hidden/removed. So when
         * the field is missing, synthesize one card from the hero fields the
         * old payload does carry; a summary payload becomes the kept-day
         * card via the empty list.
         */
        let nextCards: [NextCard] = NextCard.parse(obj["nextCards"]) ?? {
            if kind == "summary" { return [] }
            let t = title
            guard !t.isEmpty else { return [] }
            return [NextCard(emoji: "", title: t, subtitle: subtitle, cta: cta.isEmpty ? "Begin" : cta,
                             r: 120, g: 166, b: 130, tint: 0.4, later: false)]
        }()
        return PhoebeStats(kind: kind, eyebrow: eyebrow, title: title, subtitle: subtitle, cta: cta,
                           deepLink: deepLink, streakDays: streak, prayedToday: prayed,
                           nextOffice: nextOffice, newPrayers: newPrayers,
                           doneCount: doneCount, totalAnchors: totalAnchors, dots: dots,
                           morningDone: morningDone, reflectDone: reflectDone,
                           eveningDone: eveningDone, reflectAvailable: reflectAvailable,
                           contemplationMin: contemplationMin, contemplationGoalMin: contemplationGoalMin,
                           weeklyLabels: weeklyLabels, weeklyEmoji: weeklyEmoji, weeklyGrid: weeklyGrid,
                           weeklyPartial: weeklyPartial, weeklyDayInitials: weeklyDayInitials,
                           nextCards: nextCards)
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
            // The wide widget shows the NEXT TWO CARDS (owner: "rebuild the
            // wide widget to show the next two cards, and have the UI match
            // EXACTLY"). The weekly grid is RETIRED — the app no longer sends
            // weekly fields at all, so the only payload that still carries
            // them is one written by the previous build and left in the App
            // Group container across an upgrade, read in the window before the
            // new bundle runs once. A retired surface shouldn't reappear even
            // for that window, so fall back to the time-based cards rather
            // than to homeWeeklyGrid (which is now unreachable; it stays
            // defined until someone with Xcode open can compile its removal).
            if let cards = stats.nextCards, !cards.isEmpty {
                homeNextCards(cards, stats)
            } else {
                homeNextCards(PhoebeStats.timeBasedFallback().nextCards ?? [], stats)
            }
        default:
            // .systemSmall is no longer OFFERED (see supportedFamilies), but
            // removing a family from the gallery doesn't remove widgets people
            // already placed — iOS keeps asking us to render those. So homeSmall
            // stays as the fallback rather than being deleted, or an existing
            // small widget would go blank.
            homeSmall
        }
    }

    // ── The wide widget: "Phoebe" top-left + the next two home cards ──────
    //
    // Every value below is transcribed from DailyProgressBody's PracticeCard
    // compact row (CSS px → pt): rounded-3xl card (24) with a 1px
    // rgba(200,212,192,0.35) border on cardTintBg(tint); a 4px left accent at
    // rgba(accent, 0.7); content px-4 py-3.5 (16/14); row gap-3 (12); emoji
    // 15; title 14.5 semibold #F0EDE6; blurb 12 #8FAF96 with mt-0.5 (2); CTA
    // pill rgba(accent,0.85) fill, #F0EDE6 12 semibold, px-3.5 py-1.5 (14/6),
    // min-width 84, label "{cta} →".
    //
    // …ALL OF IT SCALED BY `s` (owner: "i want the proportions to be the same,
    // between height and length" / "just proportionally smaller").
    //
    // Copying the home's ABSOLUTE pixel values onto a card that is narrower
    // than the phone's is what made the widget read as a different card: same
    // type and padding in a shorter row is a taller, tighter box — the aspect
    // ratio drifts even though every individual number matches. So one factor,
    // the widget card's width over the home card's, multiplies every geometry
    // value here: radius, accent bar, paddings, gaps, type sizes, pill.
    private func nextCardRow(_ c: NextCard, _ s: CGFloat) -> some View {
        // Height and type only — see cardVScale. `s` still owns every
        // horizontal measurement, so the card is the same width it was.
        let v = s * Self.cardVScale
        return HStack(spacing: 0) {
            Rectangle()
                .fill(c.accent.opacity(c.later ? 0.4 : 0.7))
                .frame(width: 4 * s)
            HStack(spacing: 12 * s) {
                if !c.emoji.isEmpty {
                    Text(c.emoji).font(.system(size: 15 * v))
                }
                VStack(alignment: .leading, spacing: 2 * v) {
                    Text(c.title)
                        .font(sgBold(14.5 * v))
                        .foregroundColor(phoebeWarm)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    if !c.subtitle.isEmpty {
                        Text(c.subtitle)
                            .font(sgRegular(12 * v))
                            .foregroundColor(phoebeSage)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                }
                Spacer(minLength: 8 * s)
                if c.later {
                    Text("Later")
                        .font(sgRegular(12 * v))
                        .foregroundColor(Color(red: 182/255, green: 210/255, blue: 188/255).opacity(0.5))
                        .padding(.horizontal, 14 * s)
                        .padding(.vertical, 6 * v)
                        .frame(minWidth: 84 * s)
                        .overlay(
                            Capsule().strokeBorder(Color(red: 143/255, green: 175/255, blue: 150/255).opacity(0.22), lineWidth: 1)
                        )
                } else if !c.cta.isEmpty {
                    Text("\(c.cta) →")
                        .font(sgBold(12 * v))
                        .foregroundColor(phoebeWarm)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 14 * s)
                        .padding(.vertical, 6 * v)
                        .frame(minWidth: 84 * s)
                        .background(Capsule().fill(c.accent.opacity(0.85)))
                }
            }
            .padding(.horizontal, 16 * s)
            .padding(.vertical, 14 * v)
        }
        // Sit INSIDE the 1pt border, the way a CSS border-box does: the web
        // card's accent bar and content begin at the border's inner edge, not
        // underneath it.
        .padding(1)
        .background(
            // FROSTED, like the home card (owner: "the cards need to be
            // frosted" / "the background is too transparent").
            //
            // The home card is cardTintBg over a BACKDROP BLUR — CSS
            // backdrop-filter: blur(11.34px). Transcribing only the colour
            // brought the tint across and left the blur behind, so the card
            // was a thin wash over the leaf with the leaf legible through it:
            // an outline rather than a panel. A widget can't blur what's
            // behind it, but it can lay down a Material, which is the same
            // idea rendered by the system — so the ground is the material
            // first, then the green over it.
            //
            // THE TINT HAS TO STAY THIN, or there is no frost to see. The
            // first attempt laid the green on at 0.62 to answer "too
            // transparent" — which buried the material under it, and a
            // material you cannot see through is just flat colour (owner:
            // "the widget card background is just flat instead of being
            // frosted"). Transparent and flat are the two ways to get this
            // wrong, and they are fixed by different halves: the MATERIAL
            // stops it being transparent, the THIN tint keeps it frosted.
            // So the green sits near the web's own weight (0.27) and the
            // material — a step up from ultraThin, since it is carrying the
            // solidity on its own now — does the rest.
            // NO MATERIAL. A Material in a widget follows the SYSTEM
            // environment, not our design — against a light wallpaper it
            // renders pale, which is why the cards came out light grey-green
            // while the app's are dark (owner's two screenshots, side by
            // side). It cannot be talked into being dark.
            //
            // So it's the app's own colour, at the weight the leaf needs
            // without a blur behind it. The web card gets away with 0.27
            // because backdrop-filter softens the leaf underneath; here the
            // leaf stays sharp, so the same alpha reads as see-through (the
            // first complaint) — while a Material under it read as flat (the
            // second). This is the one knob that can be neither: dark enough
            // to be a panel, thin enough that the leaf still moves through it.
            RoundedRectangle(cornerRadius: 24 * s)
                .fill(Color(red: (26 - 16 * c.tint) / 255.0,
                            green: (52 - 24 * c.tint) / 255.0,
                            blue: (36 - 18 * c.tint) / 255.0)
                    .opacity(0.34 + 0.09 * c.tint))
        )
        .overlay(
            // strokeBorder, NOT stroke. SwiftUI centres a stroke ON the path,
            // so half of it fell outside the shape and the .clipShape below
            // then cut that half away — the border rendered at half weight
            // against the web's full 1px, which is what read as "the borders
            // weren't the same". strokeBorder insets the whole line.
            RoundedRectangle(cornerRadius: 24 * s)
                .strokeBorder(Color(red: 200/255, green: 212/255, blue: 192/255).opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24 * s))
        // HUG CONTENT HEIGHT, always. The accent Rectangle is greedy on both
        // axes, so with spare vertical room (one card, or the synthesized
        // fallback) it stretched its whole row to fill the widget — the
        // owner's screenshot: a single double-height card. fixedSize keeps
        // every card at the standard height however many there are.
        .fixedSize(horizontal: false, vertical: true)
        .opacity(c.later ? 0.72 : 1)
    }

    /// The home card's own width on a reference phone: a 390pt screen less the
    /// home's px-4 gutters (16 each side). Every geometry value in
    /// nextCardRow is expressed at THAT width and scaled by the widget's
    /// actual card width over it, so the widget card is the home card
    /// proportionally smaller rather than the same card squeezed narrower.
    private static let homeCardWidth: CGFloat = 390 - 32
    /// One card's height at scale 1, from this file's own numbers: the title
    /// and blurb lines, their 2pt gap, 14pt of padding top and bottom, and the
    /// 1pt border on each edge. Used to keep the stack from filling the widget.
    /**
     * TEN PERCENT OFF THE HEIGHT AND THE TYPE — but NOT the width.
     *
     * Owner: "let's make the cards proportionally ten percent smaller … but
     * having them the same width, actually. but ten percent smaller in height
     * and also the text."
     *
     * So this is deliberately NOT the single `s` factor the rest of the card
     * uses. `s` exists to keep the widget card the home card's exact
     * proportions (see cardScale), and multiplying it would have taken the
     * width down with everything else. This second factor is applied only to
     * the things that make a card TALL — the type sizes, the vertical
     * paddings, the gap between the two lines — while every horizontal value
     * (the gutters, the accent bar, the pill's minimum width) stays on `s`.
     * The card keeps its full width and loses a tenth of its height.
     */
    private static let cardVScale: CGFloat = 0.9
    private static let cardHeightAt1: CGFloat = (14.5 * 1.2 + 2 + 12 * 1.2 + 28) * cardVScale + 2

    /**
     * The day's progress, as the app's own header shows it — a quiet capsule
     * of dots, one per anchor, filled for what has been kept.
     *
     * Owner: "put the daily progress pill on the right side." It reads as a
     * pill rather than a fraction for the same reason the home screen does:
     * four dots with two filled says how the day is going at a glance, and
     * "2/4" invites you to do arithmetic about your own prayer.
     */
    private func progressPill(_ stats: PhoebeStats) -> some View {
        let total = max(0, min(8, stats.totalAnchors))
        return HStack(spacing: 6) {
            // THE WHOLE PILL, label and all (owner: "Have it be the full daily
            // progress pill with daily progress to the left"). The app's header
            // carries exactly this — the words, then the dots — and a widget
            // showing only the dots was a different, quieter thing wearing the
            // same shape. Naming what the dots count is also what makes them
            // legible to someone who has not opened the app today.
            Text("Daily Progress")
                .font(sgRegular(9.5))
                .foregroundColor(phoebeSage)
                .lineLimit(1)
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { i in
                    Circle()
                        .fill(i < stats.doneCount ? phoebeSage : phoebeSage.opacity(0.28))
                        .frame(width: 5, height: 5)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(Color(red: 9/255, green: 26/255, blue: 16/255).opacity(0.45))
        )
        .overlay(Capsule().strokeBorder(phoebeSage.opacity(0.22), lineWidth: 1))
        .opacity(total > 0 ? 1 : 0)
    }

    private func homeNextCards(_ cards: [NextCard], _ stats: PhoebeStats) -> some View {
        /**
         * THE WORDMARK IS BACK, top left. Owner: "put Phoebe at the top left.
         * the the word, the name."
         *
         * This REVERSES an earlier instruction ("take the Phoebe title out so
         * the pills can be more centered"), and the reversal is affordable now
         * for a reason: the cards lost a tenth of their height in the same
         * pass (see cardVScale), so the room the name occupies is room the
         * cards just gave back rather than room taken from them. It is set
         * small and quiet — the app's name on its own widget, not a header.
         */
        GeometryReader { geo in
            let s = Self.cardScale(geo.size, count: max(1, min(2, cards.count)))
            // The gap between the header and the cards, and only that gap.
            // It went negative to bring the cards up a notch; then the header
            // itself moved up into the tile's margin (below) and took the
            // cards with it — so this opens back up to give them a little room
            // under the name (owner: "move the cards down a little") while the
            // name and the pill stay where they were put.
            VStack(alignment: .leading, spacing: 3) {
                /**
                 * ALIGNED WITH THE CARD'S OWN CONTENT, not with the card's
                 * outer edge. Owner: "move the phoebe text over to the right
                 * a little bit."
                 *
                 * It sat at the stack's 12pt gutter, which is where the card's
                 * BORDER begins — so the name hung a little left of everything
                 * inside the card and read as not-quite-lined-up. A card's
                 * content starts further in than that: the 12pt gutter, the
                 * 1pt border, the accent bar (4 * s) and the row's own
                 * horizontal padding (16 * s). Adding those puts the wordmark
                 * exactly above the emoji and title beneath it, and it moves
                 * with the scale rather than being a number that happens to
                 * look right on one widget size.
                 */
                HStack(alignment: .center, spacing: 8) {
                    // FULL WHITE, no veil over it (owner: "make sure Phoebe on
                    // the Phoebe widget is full white and not having an overlay
                    // above"). It was phoebeWarm at 75% — the app's warm cream
                    // held back so it wouldn't compete with the cards, which on
                    // a dark green ground read as the name being dimmed rather
                    // than as restraint.
                    Text("Phoebe")
                        // A little bigger (owner) — it is the app's name on its
                        // own widget, and at 12 it read as a caption over the
                        // cards rather than as the thing they belong to.
                        .font(sgBold(14))
                        .foregroundColor(.white)
                    Spacer(minLength: 8)
                    progressPill(stats)
                }
                    .padding(.leading, 12 + 1 + (4 + 16) * s)
                    .padding(.trailing, 12)
                    /* PULLED UP INTO THE WIDGET'S OWN MARGIN (owner: "move the
                       phoebe text and the daily progress up").
                       iOS insets widget content by its default margins before
                       any of our layout runs, so the header row started well
                       below the widget's actual top edge and the whole thing
                       sat low in the tile. A negative top padding is the only
                       way back into that inset — the margin belongs to the
                       system, not to this view — and 8pt is as far as it goes
                       while keeping the name clear of the rounded corner. */
                    .padding(.top, -8)
                nextCardsStack(cards, s)
            }
        }
    }

    /// The single factor every measurement in a card is multiplied by.
    ///
    /// It was derived from WIDTH alone, which is what kept the cards looking
    /// uncentred however the alignment was written: at that scale two cards
    /// came to roughly 119pt inside the ~126pt a medium widget actually gives
    /// its content, so they FILLED the space — three points of margin top and
    /// bottom is not a centred layout, it is a full one, and no amount of
    /// spacers or alignment can centre something with nothing left over.
    ///
    /// So height constrains it too: the stack is held to ~84% of the available
    /// height, and the remainder is what the spacers split. Because the factor
    /// is shared by every value in the card, honouring height costs nothing in
    /// fidelity — the card stays the home card's exact proportions, just a
    /// little smaller (owner: "just proportionally smaller").
    private static func cardScale(_ size: CGSize, count: Int) -> CGFloat {
        let byWidth = (size.width - 24) / homeCardWidth
        let stackAt1 = CGFloat(count) * cardHeightAt1 + CGFloat(count - 1) * 8
        let byHeight = stackAt1 > 0 ? (size.height * 0.84) / stackAt1 : 1
        return max(0.62, min(1.0, min(byWidth, byHeight)))
    }

    private func nextCardsStack(_ cards: [NextCard], _ s: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 6 * s) {
            if cards.isEmpty {
                // Nothing left to pray — just the words, in Space Grotesk
                // (owner: "if it's done, just show 'The day is kept'").
                Spacer(minLength: 0)
                Text("The day is kept")
                    .font(sgBold(22 * s))
                    .foregroundColor(phoebeWarm)
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer(minLength: 0)
            } else {
                // VERTICALLY CENTRED (owner). The frame below is set to fill
                // the widget, and .leading alignment centres vertically on
                // paper — but the cards still sat high, so this stops relying
                // on that and says it outright: equal spacers above and below
                // split whatever room is left over, whether there are two
                // cards or one.
                Spacer(minLength: 0)
                // gap-2 (8) — the home's Next list spacing, was 6.
                VStack(spacing: 8 * s) {
                    ForEach(Array(cards.prefix(2).enumerated()), id: \.offset) { _, c in
                        // Each card is its OWN tap target, opening its practice
                        // rather than the app's home (owner). Multiple links are
                        // allowed in .systemMedium; the widget-level .widgetURL
                        // still catches taps outside the cards.
                        Link(destination: c.destination) { nextCardRow(c, s) }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 12)
        // Vertical padding of our OWN is nearly all redundant: iOS already
        // insets widget content by its default margins (~16pt each side) on
        // top of this. Two cards plus 10pt top and bottom came to more than
        // the medium widget's usable height, so the layout had no slack left
        // — which is why the cards read as pinned rather than centred, and why
        // spacers alone could not have fixed it. 2pt keeps them off the
        // margin without eating the room the centring needs.
        .padding(.top, 0)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // "Past 7 Days" — the SAME dot grid the home card shows (Turn/Learn/Pray,
    // or Morning/·/Evening if the viewer set that in Settings — the middle
    // row's label varies, see WidgetStats.weeklyLabels),
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
            // App identity top-left — "PAST 7 DAYS" label + the card/border/
            // frost attempt were both reverted (owner) back to this original,
            // simpler layout: just "Phoebe", no card behind the grid.
            Text("Phoebe").font(sgBold(17)).foregroundColor(.white)
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
            // spacing: 12 (not 0) between the label column and the day grid —
            // owner: nudge the day columns right a touch without moving the
            // emoji/label column itself. Same gap on both this header row
            // and the dot rows below so S/M/T/... stays lined up above its
            // column's dots.
            // Uniform .center alignment on every column (no more trailing-
            // aligned last column) — that was only there to line today's
            // dot up under the now-removed "PAST 7 DAYS" label; with the
            // label gone, centering all 7 keeps them evenly spaced (owner:
            // "re-space the middle columns so they are equally spaced").
            HStack(spacing: 12) {
                Text("").frame(width: 18)
                LazyVGrid(columns: dayCols, spacing: 0) {
                    ForEach(0..<7, id: \.self) { day in
                        Text(day < stats.weeklyDayInitials.count ? stats.weeklyDayInitials[day] : "")
                            .font(sgBold(9))
                            .foregroundColor(phoebeWarm.opacity(0.4))
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: 9) {
                ForEach(0..<rowCount, id: \.self) { row in
                    HStack(spacing: 12) {
                        Text(row < stats.weeklyEmoji.count ? stats.weeklyEmoji[row] : "")
                            .font(.system(size: 11))
                            .frame(width: 18, alignment: .center)
                        LazyVGrid(columns: dayCols, spacing: 0) {
                            ForEach(0..<7, id: \.self) { day in
                                let kept = row < stats.weeklyGrid.count && day < stats.weeklyGrid[row].count
                                    && stats.weeklyGrid[row][day]
                                // Half-shaded when started but not yet met the
                                // day's quota (currently only Contemplation,
                                // today's column) — mirrors the home card's
                                // own half-opacity dot (0.425, exactly half
                                // the kept dot's 0.85).
                                let partial = !kept && row < stats.weeklyPartial.count
                                    && day < stats.weeklyPartial[row].count && stats.weeklyPartial[row][day]
                                Circle()
                                    .fill(
                                        kept ? Color(red: 0.431, green: 0.706, blue: 0.510).opacity(0.9)
                                        : partial ? Color(red: 0.431, green: 0.706, blue: 0.510).opacity(0.45)
                                        : Color.clear
                                    )
                                    .overlay(
                                        Circle().stroke(kept ? Color.clear : phoebeWarm.opacity(0.35), lineWidth: 1)
                                    )
                                    .frame(width: 14, height: 14)
                                    .frame(maxWidth: .infinity)
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
        // shrinking just the top inset nudges the header up a
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
        // AS CLOSE AS POSSIBLE TO THE APP (owner). The app's page is nearly
        // black with the leaf a whisper behind it; this wash was light enough
        // that the leaf read as the subject, so a card dark enough to match
        // the app's looked wrong on it and a card light enough to sit on it
        // looked nothing like the app's. Half of why the card never matched
        // was the ground it sat on.
        LinearGradient(
            colors: [phoebeGreen.opacity(0.70), phoebeGreen.opacity(0.88)],
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
        .configurationDisplayName("Daily rhythm")
        .description("Your next practices, exactly as they sit on your home.")
        // Owner: "let's not offer the small square widget, just the wide dots
        // one." .systemSmall is gone from the gallery — the wide
        // (.systemMedium) family renders homeWeeklyGrid, which is the dot grid
        // the home card shows. The lock-screen accessory families stay: they're
        // a different surface, not the small square, and this is the only
        // widget offering them for "what's next".
        .supportedFamilies([
            .accessoryInline, .accessoryCircular, .accessoryRectangular,
            .systemMedium,
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
