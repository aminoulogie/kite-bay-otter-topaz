import SwiftUI
import WidgetKit

/**
 * SOMA's rings on the iPhone home screen.
 *
 * The app writes today's four rings — calories, protein, water and calories
 * burnt — into the shared container every time they change (see
 * WidgetBridgePlugin and RingsStore); this reads them back and draws them the
 * way the app does. Small is the rings alone, medium adds the numbers, large
 * adds the week above, where only a ring that closed is drawn vivid.
 */

// MARK: - Timeline

struct RingsEntry: TimelineEntry {
    let date: Date
    let snapshot: RingsSnapshot?
}

struct RingsProvider: TimelineProvider {
    func placeholder(in context: Context) -> RingsEntry {
        RingsEntry(date: Date(), snapshot: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (RingsEntry) -> Void) {
        // The gallery preview: your own rings if the app has written any.
        completion(RingsEntry(date: Date(), snapshot: RingsStore.read() ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RingsEntry>) -> Void) {
        let now = Date()
        let entry = RingsEntry(date: now, snapshot: RingsStore.read())
        // The app reloads the widget whenever the rings move. The one change
        // it cannot announce is midnight, when yesterday's rings must empty.
        let cal = Calendar.current
        let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: now) ?? now)
        let atMidnight = RingsEntry(date: midnight, snapshot: entry.snapshot)
        completion(Timeline(entries: [entry, atMidnight], policy: .after(midnight.addingTimeInterval(60))))
    }
}

// MARK: - Model helpers

private func dayKey(_ d: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: d)
}

extension RingsSnapshot {
    static let sample = RingsSnapshot(
        date: dayKey(Date()),
        rings: [
            Ring(id: "cals", label: "Calories", unit: "CAL", value: 1840, goal: 2300, from: "#fa114f", to: "#ff4fa0"),
            Ring(id: "protein", label: "Protein", unit: "G", value: 150, goal: 165, from: "#7dff00", to: "#d8ff2e"),
            Ring(id: "water", label: "Water", unit: "ML", value: 2100, goal: 3500, from: "#00d8ff", to: "#3dffe8"),
            Ring(id: "burnt", label: "Burned", unit: "CAL", value: 320, goal: 500, from: "#ff6a00", to: "#ffc000"),
        ],
        week: []
    )

    /// The rings as they stand on `day`: a snapshot written yesterday says
    /// nothing about today, so after midnight the rings are empty again.
    func rings(on day: Date) -> [Ring] {
        if date == dayKey(day) { return rings }
        return rings.map { Ring(id: $0.id, label: $0.label, unit: $0.unit, value: 0, goal: $0.goal, from: $0.from, to: $0.to) }
    }
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(
            red: Double((v >> 16) & 0xff) / 255,
            green: Double((v >> 8) & 0xff) / 255,
            blue: Double(v & 0xff) / 255
        )
    }
}

// MARK: - Rings

struct RingSpec {
    let f: Double
    let from: Color
    let to: Color
}

/// Concentric rings, outer first, drawn as the app draws them: a faint track
/// in the ring's own colour, a gradient arc with a round end, laps past 100%,
/// and the small arrow at the top of each.
struct RingStack: View {
    let rings: [RingSpec]
    let size: CGFloat
    var arrows: Bool = true
    /// Dull a ring that has not closed — for the week, not for today.
    var muteUnfilled: Bool = false

    var body: some View {
        let n = CGFloat(rings.count)
        let w = size / (n * 2 + 1.2 + (n - 1) * 0.28)
        let gap = w * 0.14
        ZStack {
            ForEach(Array(rings.enumerated()), id: \.offset) { i, r in
                let d = size - w - CGFloat(i) * (w + gap) * 2
                if d > w {
                    RingArc(f: r.f, from: r.from, to: r.to, width: w)
                        .frame(width: d, height: d)
                        .opacity(muteUnfilled && r.f < 1 ? 0.3 : 1)
                }
            }
            if arrows {
                ForEach(Array(rings.enumerated()), id: \.offset) { i, _ in
                    let radius = (size - w) / 2 - CGFloat(i) * (w + gap)
                    if radius > w / 2 {
                        Image(systemName: ["arrow.right", "chevron.forward.2", "arrow.up", "plus"][min(i, 3)])
                            .font(.system(size: w * 0.62, weight: .heavy))
                            .foregroundColor(Color.black.opacity(0.78))
                            .offset(y: -radius)
                    }
                }
            }
        }
        .frame(width: size, height: size)
    }
}

struct RingArc: View {
    let f: Double
    let from: Color
    let to: Color
    let width: CGFloat

    var body: some View {
        let clamped = max(0, f)
        let lap = floor(clamped)
        let rest = clamped - lap
        let grad = AngularGradient(gradient: Gradient(colors: [from, to]), center: .center, startAngle: .degrees(0), endAngle: .degrees(360))
        ZStack {
            Circle()
                .stroke(from.opacity(0.24), lineWidth: width)
            if lap >= 1 {
                Circle()
                    .stroke(grad, lineWidth: width)
                    .rotationEffect(.degrees(-90))
            }
            if clamped > 0 && (rest > 0.0005 || lap == 0) {
                Circle()
                    .trim(from: 0, to: CGFloat(lap >= 1 ? rest : clamped))
                    .stroke(lap >= 1 ? AngularGradient(gradient: Gradient(colors: [to, to]), center: .center) : grad,
                            style: StrokeStyle(lineWidth: width, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: lap >= 1 ? Color.black.opacity(0.5) : .clear, radius: width * 0.2)
            }
        }
    }
}

// MARK: - Views

struct RingsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RingsEntry

    private var rings: [RingsSnapshot.Ring] {
        (entry.snapshot ?? .sample).rings(on: entry.date)
    }

    private func specs(_ rs: [RingsSnapshot.Ring]) -> [RingSpec] {
        rs.map { RingSpec(f: $0.goal > 0 ? $0.value / $0.goal : 0, from: Color(hex: $0.from), to: Color(hex: $0.to)) }
    }

    var body: some View {
        // A tap opens SOMA, which is all a widget tap can do without a URL
        // scheme to route by.
        content
            .modifier(BlackBackground())
    }

    @ViewBuilder private var content: some View {
        if entry.snapshot == nil {
            VStack(spacing: 6) {
                RingStack(rings: specs(rings.map { RingsSnapshot.Ring(id: $0.id, label: $0.label, unit: $0.unit, value: 0, goal: $0.goal, from: $0.from, to: $0.to) }), size: 80, arrows: false)
                Text("Open SOMA to fill your rings")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
            }
        } else {
            switch family {
            case .systemMedium:
                HStack(spacing: 18) {
                    RingStack(rings: specs(rings), size: 128)
                    numbers(compact: true)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 4)
            case .systemLarge:
                VStack(alignment: .leading, spacing: 14) {
                    week
                    HStack(spacing: 20) {
                        RingStack(rings: specs(rings), size: 150)
                        numbers(compact: false)
                        Spacer(minLength: 0)
                    }
                }
            default:
                RingStack(rings: specs(rings), size: 132)
            }
        }
    }

    private func numbers(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 5 : 9) {
            ForEach(rings, id: \.id) { r in
                VStack(alignment: .leading, spacing: 1) {
                    Text(r.label.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.gray)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text("\(Int(r.value.rounded()))")
                            .font(.system(size: compact ? 16 : 19, weight: .heavy, design: .rounded))
                        Text("/\(Int(r.goal.rounded()))")
                            .font(.system(size: compact ? 11 : 13, weight: .bold, design: .rounded))
                        Text(r.unit)
                            .font(.system(size: 9, weight: .bold))
                            .padding(.leading, 2)
                    }
                    .foregroundColor(Color(hex: r.from))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                }
            }
        }
    }

    /// Monday to Sunday, a small set of rings a day. Only a closed ring is
    /// vivid; today is still going and keeps its colour.
    private var week: some View {
        let today = dayKey(entry.date)
        let days = (entry.snapshot?.week ?? [])
        return HStack(spacing: 0) {
            ForEach(days, id: \.date) { d in
                VStack(spacing: 4) {
                    Text(weekday(d.date))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(d.date == today ? .white : .gray)
                    RingStack(
                        rings: zip(d.f, rings).map { f, r in RingSpec(f: f, from: Color(hex: r.from), to: Color(hex: r.to)) },
                        size: 34,
                        arrows: false,
                        muteUnfilled: d.date != today
                    )
                    .opacity(d.date > today ? 0.35 : 1)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func weekday(_ key: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: key) else { return "" }
        let out = DateFormatter()
        out.dateFormat = "EEEEE"
        return out.string(from: d)
    }
}

/// Black behind the rings, as the watch has it. iOS 17 wants the background
/// declared as the widget's container so it can tint and inset it itself.
struct BlackBackground: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { Color.black }
        } else {
            content.padding().background(Color.black)
        }
    }
}

// MARK: - Widget

struct RingsWidget: Widget {
    let kind = "SomaRings"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RingsProvider()) { entry in
            RingsWidgetView(entry: entry)
        }
        .configurationDisplayName("Rings")
        .description("Today's calories, protein, water and calories burnt.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct SomaWidgetsBundle: WidgetBundle {
    var body: some Widget {
        RingsWidget()
        RoutineLiveActivity()
    }
}
