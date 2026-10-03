import UIKit
import SwiftUI
import Charts

// ==========================================================================
// The Habits panel, native.
//
// SwiftUI over real Liquid Glass. The habit LOGIC stays in the web app —
// steps, ramps, auto rules, scores, the only-today lock — so the two can
// never disagree; this draws what the page sends (HabitsPayload, as JSON)
// and hands every tap back as a "habit" action. The calendar grids are the
// one thing computed here, from each habit's done dates.
//
// The panel slides in from the left edge over the whole app, following the
// finger, and covers 85% of the width.
// ==========================================================================

// MARK: - Data from the page

struct HPPayload: Codable {
    var today: String
    var activeDate: String
    var isToday: Bool
    var accent: String
    var summary: HPSummary
    var suggestions: [HPSuggest]
    var presets: [HPPreset]
    var habits: [HPHabit]

    static let empty = HPPayload(
        today: "", activeDate: "", isToday: true, accent: "#d3fd50",
        summary: HPSummary(label: "Today", score: nil, kept: false, streak: 0, consistency: nil, need: nil, doneCount: 0),
        suggestions: [], presets: [], habits: []
    )
}

struct HPSummary: Codable {
    var label: String
    var score: Int?
    var kept: Bool
    var streak: Int
    var consistency: Int?
    var need: String?
    var doneCount: Int
}

struct HPSuggest: Codable, Identifiable {
    var id: String
    var name: String
    var rule: String
}

struct HPPreset: Codable, Identifiable {
    var name: String
    var kind: String
    var color: String
    var detail: String
    var id: String { name }
}

struct HPStep: Codable, Identifiable {
    var id: String
    var name: String
    var n: Int
    var target: Int
}

struct HPBump: Codable, Hashable {
    var label: String
    var value: Double
}

struct HPRamp: Codable {
    var kicker: String
    var progress: String
    var label: String
    var logged: String
    var hasLog: Bool
    var done: Bool
    var hitLabel: String
    var hitValue: Double
    var bumps: [HPBump]
}

struct HPNote: Codable, Identifiable {
    var id: String
    var date: String
    var text: String
}

struct HPHabit: Codable, Identifiable {
    var id: String
    var name: String
    var desc: String
    var color: String
    var icon: String
    var streak: Int
    var longest: Int
    var completion: Int?
    var total: Int
    var done: Bool
    var canChange: Bool
    var stepsDone: Int
    var stepsTotal: Int
    var doneDates: [String]
    var coef: Int
    var coefLabel: String
    var auto: String?
    var category: String
    var goal: Int
    var steps: [HPStep]
    var ramp: HPRamp?
    var notes: [HPNote]
}

// MARK: - Model

@available(iOS 16.0, *)
final class HabitsModel: ObservableObject {
    @Published var data = HPPayload.empty
    @Published var detailId: String?
    var send: ([String: Any]) -> Void = { _ in }
    var close: () -> Void = {}

    /// Icons arrive as PNG data URLs; decoded once per string.
    private var iconCache: [String: UIImage] = [:]

    func icon(_ uri: String) -> UIImage? {
        if uri.isEmpty { return nil }
        if let hit = iconCache[uri] { return hit }
        guard let comma = uri.firstIndex(of: ","),
              let data = Data(base64Encoded: String(uri[uri.index(after: comma)...])),
              let img = UIImage(data: data, scale: 3) else { return nil }
        let t = img.withRenderingMode(.alwaysTemplate)
        iconCache[uri] = t
        return t
    }

    func act(_ op: String, _ id: String? = nil, _ extra: [String: Any] = [:]) {
        var d = extra
        d["type"] = "habit"
        d["op"] = op
        if let id { d["id"] = id }
        send(d)
    }

    /// Ask for one of the sheets that is still web: the panel gets out of
    /// the way first, and comes back when the sheet closes.
    func webSheet(_ op: String, _ id: String) {
        close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.act(op, id)
        }
    }
}

// MARK: - Dates and grids

enum DK {
    static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone.current
        return c
    }()

    static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = cal
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ k: String) -> Date { fmt.date(from: k) ?? cal.startOfDay(for: Date()) }
    static func key(_ d: Date) -> String { fmt.string(from: d) }
    static func add(_ d: Date, _ n: Int) -> Date { cal.date(byAdding: .day, value: n, to: d) ?? d }

    static func monday(_ d: Date) -> Date {
        let wd = cal.component(.weekday, from: d) // 1 = Sunday
        return add(cal.startOfDay(for: d), -((wd + 5) % 7))
    }

    /// Weeks as columns of seven keys, Monday on top, ending this week.
    static func recentWeeks(today: String, weeks: Int) -> [[String?]] {
        let end = date(today)
        let first = add(monday(end), -7 * (weeks - 1))
        return (0..<weeks).map { w in
            (0..<7).map { r in
                let d = add(first, w * 7 + r)
                return d > end ? nil : key(d)
            }
        }
    }

    /// A calendar year as Monday-first week columns, with the column each
    /// month starts in.
    static func yearWeeks(_ year: Int) -> (cols: [[String?]], months: [(Int, String)]) {
        let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1)) ?? Date()
        let start = monday(jan1)
        var cols: [[String?]] = []
        var months: [(Int, String)] = []
        let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        var w = 0
        while w < 60 {
            var col: [String?] = []
            for r in 0..<7 {
                let d = add(start, w * 7 + r)
                if cal.component(.year, from: d) != year {
                    col.append(nil)
                    continue
                }
                col.append(key(d))
                if cal.component(.day, from: d) == 1 {
                    months.append((w, names[cal.component(.month, from: d) - 1]))
                }
            }
            if col.allSatisfy({ $0 == nil }) && w > 0 { break }
            cols.append(col)
            w += 1
        }
        return (cols, months)
    }

    /// The streak that reached each done day, walking forward through cols.
    static func runs(_ cols: [[String?]], _ done: Set<String>) -> [String: Int] {
        var out: [String: Int] = [:]
        var streak = 0
        for col in cols {
            for k in col {
                guard let k else { continue }
                streak = done.contains(k) ? streak + 1 : 0
                out[k] = streak
            }
        }
        return out
    }
}

@available(iOS 16.0, *)
extension Color {
    init(somaHex hex: String) {
        self.init(uiColor: UIColor(somaHex: hex))
    }
}

extension UIColor {
    var somaHex: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        let c = { (v: CGFloat) in Int((max(0, min(1, v)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", c(r), c(g), c(b))
    }
}

// MARK: - Glass

@available(iOS 16.0, *)
extension View {
    /// Liquid Glass on iOS 26+ (built with the 26 SDK), material otherwise.
    @ViewBuilder
    func somaGlass(_ radius: CGFloat, tint: Color? = nil, interactive: Bool = false) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.glassEffect(Glass.regular.tint(tint).interactive(interactive),
                             in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
        #else
        self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        #endif
    }
}

func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
    UIImpactFeedbackGenerator(style: style).impactOccurred()
}

// MARK: - Pieces

@available(iOS 16.0, *)
struct HabitIconTile: View {
    let habit: HPHabit
    let image: UIImage?
    var size: CGFloat = 48

    var body: some View {
        let c = Color(somaHex: habit.color)
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .fill(LinearGradient(colors: [c.opacity(0.45), c.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: size * 0.5, height: size * 0.5)
                    .foregroundStyle(c)
            } else {
                Text(String(habit.name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(.system(size: size * 0.42, weight: .heavy, design: .rounded))
                    .foregroundStyle(c)
            }
        }
        .frame(width: size, height: size)
    }
}

@available(iOS 16.0, *)
struct CheckButton: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    var size: CGFloat = 40

    var body: some View {
        let c = Color(somaHex: habit.color)
        Button {
            haptic(habit.done ? .light : .medium)
            model.act("toggle", habit.id)
        } label: {
            ZStack {
                if habit.done {
                    Circle().fill(c)
                        .shadow(color: c.opacity(0.5), radius: 8)
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.42, weight: .bold))
                        .foregroundStyle(.black.opacity(0.85))
                } else {
                    Circle().strokeBorder(Color.primary.opacity(0.4), lineWidth: 2)
                    if habit.stepsTotal > 0 {
                        Text("\(habit.stepsDone)/\(habit.stepsTotal)")
                            .font(.system(size: size * 0.3, weight: .heavy, design: .rounded))
                            .foregroundStyle(habit.stepsDone > 0 ? c : .secondary)
                    }
                }
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!habit.canChange)
        .opacity(habit.canChange ? 1 : 0.4)
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: habit.done)
        .accessibilityLabel(habit.done ? "Uncheck \(habit.name)" : "Complete \(habit.name)")
    }
}

/// Weeks of round dots, Monday on top, lit by streak. Drawn in one Canvas.
@available(iOS 16.0, *)
struct DotGrid: View {
    let cols: [[String?]]
    let done: Set<String>
    let color: Color
    let today: String
    var gapRatio: CGFloat = 0.22

    var body: some View {
        let runs = DK.runs(cols, done)
        Canvas { ctx, size in
            let n = max(1, cols.count)
            let pitch = size.width / CGFloat(n)
            let d = pitch * (1 - gapRatio)
            for (ci, col) in cols.enumerated() {
                for (ri, k) in col.enumerated() {
                    guard let k else { continue }
                    let rect = CGRect(x: CGFloat(ci) * pitch + (pitch - d) / 2,
                                      y: CGFloat(ri) * pitch + (pitch - d) / 2, width: d, height: d)
                    let run = runs[k] ?? 0
                    let future = k > today
                    let fill: Color = run > 0
                        ? color.opacity(min(1, 0.5 + Double(run) * 0.07))
                        : Color.primary.opacity(future ? 0.035 : 0.09)
                    ctx.fill(Path(ellipseIn: rect), with: .color(fill))
                    if k == today {
                        ctx.stroke(Path(ellipseIn: rect.insetBy(dx: -1, dy: -1)), with: .color(color), lineWidth: 1.2)
                    }
                }
            }
        }
        .aspectRatio(CGFloat(max(1, cols.count)) / 7, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

@available(iOS 16.0, *)
struct StepsList: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit

    var body: some View {
        let c = Color(somaHex: habit.color)
        VStack(spacing: 6) {
            ForEach(habit.steps) { st in
                let isDone = st.n >= st.target
                Button {
                    haptic()
                    model.act("step", habit.id, ["stepId": st.id])
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(isDone ? c : Color.clear)
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(isDone ? c : Color.primary.opacity(0.3), lineWidth: 1.5)
                            if isDone {
                                Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(.black.opacity(0.8))
                            }
                        }
                        .frame(width: 20, height: 20)
                        Text(st.name)
                            .font(.subheadline.weight(.semibold))
                            .strikethrough(isDone)
                            .foregroundStyle(isDone ? .secondary : .primary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        if st.target > 1 {
                            Text("\(st.n)/\(st.target)").font(.caption.weight(.heavy)).monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Color.primary.opacity(isDone ? 0.04 : 0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!model.data.isToday)
            }
        }
    }
}

@available(iOS 16.0, *)
struct RampCard: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    let ramp: HPRamp

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(ramp.kicker.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                Spacer()
                Text(ramp.progress).font(.caption2.weight(.bold)).monospacedDigit().foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline) {
                Text(ramp.label).font(.title3.weight(.heavy))
                Spacer()
                Text(ramp.logged).font(.subheadline.weight(.heavy)).monospacedDigit()
                    .foregroundStyle(!ramp.hasLog ? Color.secondary : ramp.done ? Color(somaHex: habit.color) : Color.orange)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(ramp.bumps, id: \.self) { b in
                        Button(b.label) {
                            haptic()
                            model.act("amount", habit.id, ["value": b.value])
                        }
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .somaGlass(14, interactive: true)
                        .buttonStyle(.plain)
                    }
                    Button(ramp.hitLabel) {
                        haptic(.medium)
                        model.act("amount", habit.id, ["value": ramp.hitValue])
                    }
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .somaGlass(14, tint: Color(somaHex: habit.color).opacity(0.35), interactive: true)
                    .buttonStyle(.plain)
                    if ramp.hasLog {
                        Button("Clear") { model.act("amount", habit.id, ["value": NSNull()]) }
                            .font(.caption.weight(.bold)).foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(12)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - List

@available(iOS 16.0, *)
struct HabitCardView: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    let cols: [[String?]]

    var body: some View {
        let c = Color(somaHex: habit.color)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { model.detailId = habit.id }
                } label: {
                    HStack(spacing: 12) {
                        HabitIconTile(habit: habit, image: model.icon(habit.icon))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(habit.name).font(.system(size: 17, weight: .bold)).lineLimit(1)
                            Text("\(habit.streak) day streak" + (habit.auto != nil ? " · ⚡ auto" : ""))
                                .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                CheckButton(habit: habit)
            }
            if let ramp = habit.ramp { RampCard(habit: habit, ramp: ramp) }
            if !habit.steps.isEmpty { StepsList(habit: habit) }
            Button {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { model.detailId = habit.id }
            } label: {
                DotGrid(cols: cols, done: Set(habit.doneDates), color: c, today: model.data.today)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(LinearGradient(colors: [c.opacity(0.09), Color(uiColor: .secondarySystemBackground).opacity(0.6)],
                                     startPoint: .top, endPoint: .bottom))
        )
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Color.primary.opacity(0.06)))
    }
}

@available(iOS 16.0, *)
struct HabitsListView: View {
    @EnvironmentObject var model: HabitsModel
    @State private var filter = "All"
    @State private var adding = false

    private var cats: [String] {
        let present = Set(model.data.habits.map { $0.category })
        return ["Health", "Mind", "Productivity", "Other"].filter { present.contains($0) }
    }

    var body: some View {
        let d = model.data
        let cols = DK.recentWeeks(today: d.today.isEmpty ? DK.key(Date()) : d.today, weeks: 26)
        let shown = filter == "All" ? d.habits : d.habits.filter { $0.category == filter }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    Text("My Habits").font(.system(size: 32, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer()
                    Button {
                        haptic()
                        adding = true
                    } label: {
                        Image(systemName: "plus").font(.system(size: 20, weight: .bold))
                            .frame(width: 46, height: 46)
                    }
                    .buttonStyle(.plain)
                    .somaGlass(23, tint: Color(somaHex: d.accent).opacity(0.55), interactive: true)
                    .accessibilityLabel("New habit")
                    Button { model.close() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .bold))
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(.plain)
                    .somaGlass(19, interactive: true)
                    .accessibilityLabel("Close habits")
                }
                VStack(alignment: .leading, spacing: 3) {
                    (Text("\(d.summary.label) \(d.summary.score.map { "\($0)%" } ?? "–")")
                        .foregroundColor(d.summary.score == nil ? .secondary : d.summary.kept ? Color(somaHex: d.accent) : .orange)
                     + Text(" · \(d.summary.streak)d streak · 30d \(d.summary.consistency.map { "\($0)%" } ?? "–")")
                        .foregroundColor(.secondary))
                        .font(.footnote.weight(.semibold))
                    if let need = d.summary.need {
                        Text("To keep the streak: \(need)").font(.caption).foregroundStyle(.tertiary)
                    }
                }
                if cats.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(["All"] + cats, id: \.self) { c in
                                Button {
                                    haptic()
                                    withAnimation(.spring(response: 0.3)) { filter = c }
                                } label: {
                                    Text(c).font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 16).padding(.vertical, 9)
                                        .foregroundStyle(filter == c ? Color.black : Color.primary)
                                }
                                .buttonStyle(.plain)
                                .somaGlass(18, tint: filter == c ? Color(somaHex: d.accent) : nil, interactive: true)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
                if filter == "All" && !d.suggestions.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("⚡ \(d.suggestions.count) \(d.suggestions.count == 1 ? "habit" : "habits") can tick themselves")
                            .font(.subheadline.weight(.heavy))
                        ForEach(d.suggestions) { s in
                            (Text(s.name).bold() + Text(" — when \(s.rule.lowercased())").foregroundColor(.secondary))
                                .font(.caption)
                        }
                        Button {
                            haptic(.medium)
                            model.act("autoOn")
                        } label: {
                            Text("Turn on").font(.subheadline.weight(.heavy)).frame(maxWidth: .infinity).padding(.vertical, 11)
                        }
                        .buttonStyle(.plain)
                        .somaGlass(16, tint: Color(somaHex: d.accent).opacity(0.5), interactive: true)
                    }
                    .padding(14)
                    .background(Color(somaHex: d.accent).opacity(0.08), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                ForEach(shown) { h in
                    HabitCardView(habit: h, cols: cols)
                }
                if d.habits.isEmpty {
                    Button { adding = true } label: {
                        Text("No habits yet — add your first").font(.subheadline.weight(.bold)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).padding(.vertical, 40)
                    }
                    .buttonStyle(.plain)
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundStyle(.tertiary))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .sheet(isPresented: $adding) { NewHabitSheet().environmentObject(model) }
    }
}

@available(iOS 16.0, *)
struct NewHabitSheet: View {
    @EnvironmentObject var model: HabitsModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("e.g. Walk 8k steps", text: $name)
                        .focused($focused)
                        .submitLabel(.done)
                        .onSubmit(add)
                }
                if !model.data.presets.isEmpty {
                    Section("Ready-made") {
                        ForEach(model.data.presets) { p in
                            Button {
                                haptic()
                                model.act("preset", nil, ["name": p.name])
                                dismiss()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: p.kind == "steps" ? "checklist" : "chart.line.uptrend.xyaxis")
                                        .foregroundStyle(Color(somaHex: p.color))
                                        .frame(width: 24)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.name).foregroundStyle(.primary)
                                        Text(p.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("New habit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: add).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
    }

    private func add() {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        haptic(.medium)
        model.act("add", nil, ["name": n])
        dismiss()
    }
}

// MARK: - Detail

enum FreqMode: String, CaseIterable, Identifiable {
    case weekly = "Weekly", monthly = "Monthly", yearly = "Yearly"
    var id: String { rawValue }
}

struct FreqBar: Identifiable {
    let id: Int
    let label: String
    let value: Int
    let max: Int
}

func frequency(_ done: Set<String>, _ mode: FreqMode, year: Int, today: String, firstYear: Int) -> [FreqBar] {
    switch mode {
    case .weekly:
        let weeks = DK.recentWeeks(today: today, weeks: 12)
        let names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return (0..<7).map { r in
            let days = weeks.compactMap { $0[r] }
            return FreqBar(id: r, label: names[r], value: days.filter { done.contains($0) }.count, max: days.count)
        }
    case .monthly:
        let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return (0..<12).map { m in
            let prefix = String(format: "%04d-%02d-", year, m + 1)
            let first = DK.cal.date(from: DateComponents(year: year, month: m + 1, day: 1)) ?? Date()
            let len = DK.cal.range(of: .day, in: .month, for: first)?.count ?? 30
            return FreqBar(id: m, label: names[m], value: done.filter { $0.hasPrefix(prefix) }.count, max: len)
        }
    case .yearly:
        let thisYear = Int(today.prefix(4)) ?? year
        return (min(firstYear, thisYear)...thisYear).enumerated().map { i, y in
            FreqBar(id: i, label: String(y), value: done.filter { $0.hasPrefix("\(y)-") }.count, max: 365)
        }
    }
}

@available(iOS 16.0, *)
struct StatTileView: View {
    let symbol: String
    let color: Color
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 18, weight: .semibold)).foregroundStyle(color)
            Text(value).font(.system(size: 20, weight: .heavy, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.caption2.weight(.medium)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .somaGlass(18)
    }
}

@available(iOS 16.0, *)
struct HabitDetailView: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    @State private var confirmDelete = false
    @State private var coloring = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                topBar
                header
                if let ramp = habit.ramp { RampCard(habit: habit, ramp: ramp) }
                if !habit.steps.isEmpty { StepsList(habit: habit) }
                stats
                LastFourWeeks(habit: habit)
                YearSection(habit: habit)
                FrequencySection(habit: habit)
                NotesSection(habit: habit)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .confirmationDialog("Delete \(habit.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                withAnimation { model.detailId = nil }
                model.act("remove", habit.id)
            }
        } message: {
            Text("Its history goes with it. You can undo right after.")
        }
        .sheet(isPresented: $coloring) {
            ColorSheet(habit: habit).environmentObject(model)
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { model.detailId = nil }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 16, weight: .bold))
                    Text("Habits").font(.body.weight(.semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .somaGlass(18, interactive: true)
            Spacer()
            Menu {
                Button { model.webSheet("photo", habit.id) } label: { Label("Take a photo", systemImage: "camera") }
                Button { model.webSheet("photos", habit.id) } label: { Label("Photo calendar", systemImage: "calendar") }
                Button { model.webSheet("setup", habit.id) } label: { Label("Set up", systemImage: "slider.horizontal.3") }
                Button { coloring = true } label: { Label("Colour", systemImage: "paintpalette") }
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete habit", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 18, weight: .bold)).frame(width: 40, height: 40)
            }
            .somaGlass(20, interactive: true)
        }
    }

    private var subtitle: String {
        if !habit.desc.isEmpty { return habit.desc }
        if let a = habit.auto { return "⚡ Ticks itself when " + a.lowercased() }
        return habit.coefLabel
    }

    private var header: some View {
        HStack(spacing: 14) {
            HabitIconTile(habit: habit, image: model.icon(habit.icon), size: 68)
            VStack(alignment: .leading, spacing: 3) {
                Text(habit.name).font(.system(size: 26, weight: .heavy)).lineLimit(2).minimumScaleFactor(0.7)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                Text("×\(habit.coef) IMPORTANCE · \(habit.goal)/WEEK GOAL")
                    .font(.caption2.weight(.bold)).foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
            CheckButton(habit: habit, size: 52)
        }
    }

    private var stats: some View {
        HStack(spacing: 8) {
            StatTileView(symbol: "flame.fill", color: .orange, value: "\(habit.streak)", label: "Day streak")
            StatTileView(symbol: "trophy.fill", color: .yellow, value: "\(habit.longest)", label: "Longest")
            StatTileView(symbol: "chart.bar.fill", color: .green, value: habit.completion.map { "\($0)%" } ?? "–", label: "Completion")
            StatTileView(symbol: "calendar", color: .cyan, value: "\(habit.total)", label: "Total days")
        }
    }
}

@available(iOS 16.0, *)
struct SectionCard<Content: View>: View {
    let title: String
    var hint: String? = nil
    var trailing: AnyView? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title).font(.headline)
                if let hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                if let trailing { trailing }
            }
            content
        }
        .padding(14)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

@available(iOS 16.0, *)
struct LastFourWeeks: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit

    var body: some View {
        let today = model.data.today.isEmpty ? DK.key(Date()) : model.data.today
        let done = Set(habit.doneDates)
        let days: [String] = Array(DK.recentWeeks(today: today, weeks: 5).flatMap { $0 }.compactMap { $0 }.suffix(28))
        let c = Color(somaHex: habit.color)
        SectionCard(title: "Last 4 weeks", hint: "Tap today to tick") {
            HStack(spacing: 3) {
                ForEach(days, id: \.self) { k in
                    DayCell(on: done.contains(k), isToday: k == today, color: c) {
                        haptic()
                        model.act("tickDay", habit.id, ["date": k])
                    }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct DayCell: View {
    let on: Bool
    let isToday: Bool
    let color: Color
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(on ? color : Color.primary.opacity(0.1))
                .frame(height: 22)
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(isToday ? color : Color.clear, lineWidth: 1.5)
                        .padding(-2)
                )
        }
        .buttonStyle(.plain)
        .disabled(!isToday)
    }
}

/// The year heatmap: day labels down the left, months along the top, one
/// Canvas for all of it.
@available(iOS 16.0, *)
struct YearGrid: View {
    let cols: [[String?]]
    let months: [(Int, String)]
    let done: Set<String>
    let color: Color
    let today: String

    private static let gutter: CGFloat = 24
    private static let top: CGFloat = 12
    private static let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        // The panel's width is known (85% of the screen, less its padding),
        // so the height follows from it without measuring.
        let avail = UIScreen.main.bounds.width * 0.85 - 60
        let pitch = (avail - YearGrid.gutter) / CGFloat(max(1, cols.count))
        let runs = DK.runs(cols, done)
        Canvas { ctx, _ in
            let d = pitch * 0.8
            for (i, l) in YearGrid.days.enumerated() {
                ctx.draw(Text(l).font(.system(size: 8, weight: .medium)).foregroundColor(.secondary),
                         at: CGPoint(x: 0, y: YearGrid.top + CGFloat(i) * pitch + pitch / 2), anchor: .leading)
            }
            for m in months {
                ctx.draw(Text(m.1).font(.system(size: 8, weight: .medium)).foregroundColor(.secondary),
                         at: CGPoint(x: YearGrid.gutter + CGFloat(m.0) * pitch, y: 4), anchor: .leading)
            }
            for (ci, col) in cols.enumerated() {
                for (ri, k) in col.enumerated() {
                    guard let k else { continue }
                    let rect = CGRect(x: YearGrid.gutter + CGFloat(ci) * pitch + (pitch - d) / 2,
                                      y: YearGrid.top + CGFloat(ri) * pitch + (pitch - d) / 2, width: d, height: d)
                    let run = runs[k] ?? 0
                    let fill: Color = run > 0
                        ? color.opacity(min(1, 0.5 + Double(run) * 0.07))
                        : Color.primary.opacity(k > today ? 0.035 : 0.09)
                    ctx.fill(Path(ellipseIn: rect), with: .color(fill))
                    if k == today {
                        ctx.stroke(Path(ellipseIn: rect.insetBy(dx: -0.8, dy: -0.8)), with: .color(color), lineWidth: 1)
                    }
                }
            }
        }
        .frame(width: avail, height: YearGrid.top + 7 * pitch)
        .accessibilityHidden(true)
    }
}

@available(iOS 16.0, *)
struct YearSection: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    @State private var year = 0

    var body: some View {
        let today = model.data.today.isEmpty ? DK.key(Date()) : model.data.today
        let thisYear = Int(today.prefix(4)) ?? 2026
        let firstYear = min(thisYear, habit.doneDates.min().flatMap { Int($0.prefix(4)) } ?? thisYear)
        let shown = year == 0 ? thisYear : year
        let grid = DK.yearWeeks(shown)
        let done = Set(habit.doneDates)
        let count = done.filter { $0.hasPrefix("\(shown)-") }.count
        VStack(spacing: 10) {
            HStack(spacing: 18) {
                Button { year = max(firstYear, shown - 1) } label: { Image(systemName: "chevron.left") }
                    .disabled(shown <= firstYear)
                Text(String(shown)).font(.headline).monospacedDigit()
                Button { year = min(thisYear, shown + 1) } label: { Image(systemName: "chevron.right") }
                    .disabled(shown >= thisYear)
            }
            .buttonStyle(.plain)
            YearGrid(cols: grid.cols, months: grid.months, done: done, color: Color(somaHex: habit.color), today: today)
            Text("\(count) days in \(String(shown))").font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

@available(iOS 16.0, *)
struct FrequencySection: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    @State private var mode: FreqMode = .weekly

    var body: some View {
        let today = model.data.today.isEmpty ? DK.key(Date()) : model.data.today
        let thisYear = Int(today.prefix(4)) ?? 2026
        let firstYear = min(thisYear, habit.doneDates.min().flatMap { Int($0.prefix(4)) } ?? thisYear)
        let bars = frequency(Set(habit.doneDates), mode, year: thisYear, today: today, firstYear: firstYear)
        let ceiling = max(1, bars.map { $0.max }.max() ?? 1)
        let c = Color(somaHex: habit.color)
        SectionCard(title: "Frequency") {
            VStack(spacing: 12) {
                Picker("Frequency", selection: $mode) {
                    ForEach(FreqMode.allCases) { m in Text(m.rawValue).tag(m) }
                }
                .pickerStyle(.segmented)
                Chart(bars) { b in
                    BarMark(x: .value("When", b.label), y: .value("Days", b.value))
                        .foregroundStyle(LinearGradient(colors: [c.opacity(0.75), c], startPoint: .top, endPoint: .bottom))
                        .cornerRadius(5)
                }
                .chartYScale(domain: 0...ceiling)
                .frame(height: 160)
                Text(caption(thisYear)).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func caption(_ y: Int) -> String {
        switch mode {
        case .weekly: return "Days done per weekday, last 12 weeks"
        case .monthly: return "Days done per month, " + String(y)
        case .yearly: return "Days done per year"
        }
    }
}

@available(iOS 16.0, *)
struct NotesSection: View {
    @EnvironmentObject var model: HabitsModel
    let habit: HPHabit
    @State private var draft = ""
    @State private var writing = false
    @State private var all = false

    var body: some View {
        let shown = all ? habit.notes : Array(habit.notes.prefix(3))
        SectionCard(title: "Notes", trailing: AnyView(trailing)) {
            VStack(alignment: .leading, spacing: 8) {
                if writing { editor }
                if habit.notes.isEmpty && !writing {
                    Text("No notes yet. Tap + to write one.").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(shown) { n in NoteRow(habitId: habit.id, note: n) }
            }
        }
    }

    private var trailing: some View {
        HStack(spacing: 12) {
            if habit.notes.count > 3 {
                Button(all ? "Less" : "See all") { all.toggle() }.font(.subheadline.weight(.semibold))
            }
            Button {
                withAnimation { writing.toggle() }
            } label: {
                Image(systemName: "plus").font(.body.weight(.bold))
            }
        }
    }

    private var editor: some View {
        VStack(alignment: .trailing, spacing: 8) {
            TextField("How did it go?", text: $draft, axis: .vertical)
                .lineLimit(2...5)
                .padding(10)
                .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack(spacing: 16) {
                Button("Cancel") { writing = false }.foregroundStyle(.secondary)
                Button("Save") { save() }.font(.subheadline.weight(.bold))
            }
        }
    }

    private func save() {
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        haptic()
        model.act("note", habit.id, ["text": t])
        draft = ""
        writing = false
    }
}

@available(iOS 16.0, *)
struct NoteRow: View {
    @EnvironmentObject var model: HabitsModel
    let habitId: String
    let note: HPNote

    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE d MMM"
        return f
    }()

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(NoteRow.fmt.string(from: DK.date(note.date)).uppercased())
                    .font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                Text(note.text).font(.subheadline)
            }
            Spacer()
            Button { model.act("unnote", habitId, ["noteId": note.id]) } label: {
                Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

@available(iOS 16.0, *)
struct ColorSheet: View {
    @EnvironmentObject var model: HabitsModel
    @Environment(\.dismiss) private var dismiss
    let habit: HPHabit
    @State private var custom: Color = .green

    private let palette = ["#34e0a1", "#4c8dff", "#ffcf4a", "#a77bff", "#ff5c8a", "#3dd6f5",
                           "#ff9e3d", "#6e6bff", "#e879f9", "#ff6b57", "#d3fd50", "#e9e4da"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
                    ForEach(palette, id: \.self) { hex in
                        Button {
                            haptic()
                            model.act("color", habit.id, ["color": hex])
                        } label: {
                            Circle().fill(Color(somaHex: hex))
                                .overlay(Circle().strokeBorder(Color.primary, lineWidth: habit.color.lowercased() == hex ? 2.5 : 0).padding(-4))
                                .aspectRatio(1, contentMode: .fit)
                        }
                        .buttonStyle(.plain)
                    }
                }
                ColorPicker("Pick any colour", selection: $custom, supportsOpacity: false)
                    .onChange(of: custom) { c in
                        model.act("color", habit.id, ["color": UIColor(c).somaHex])
                    }
                Spacer()
            }
            .padding(20)
            .navigationTitle("Colour")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onAppear { custom = Color(somaHex: habit.color) }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Root

@available(iOS 16.0, *)
struct HabitsRoot: View {
    @ObservedObject var model: HabitsModel

    var body: some View {
        ZStack {
            HabitsListView()
                .opacity(model.detailId == nil ? 1 : 0)
                .offset(x: model.detailId == nil ? 0 : -40)
            if let id = model.detailId, let h = model.data.habits.first(where: { $0.id == id }) {
                HabitDetailView(habit: h)
                    .transition(.move(edge: .trailing))
                    .background(Color(uiColor: .systemBackground))
            }
        }
        .environmentObject(model)
        .tint(Color(somaHex: model.data.accent))
    }
}

// MARK: - The sliding panel

/// Hosts HabitsRoot in a panel over the whole app: in from the left edge,
/// following the finger, 85% of the width, with a dimmed backdrop.
@available(iOS 16.0, *)
final class HabitsPanelController: NSObject, UIGestureRecognizerDelegate {
    let model = HabitsModel()
    private weak var host: ChromeController?
    private let dim = UIView()
    private let hosting: UIHostingController<HabitsRoot>
    private var progress: CGFloat = 0
    private(set) var isOpen = false
    private var startProgress: CGFloat = 0
    private var panelPan: UIPanGestureRecognizer!

    var onOpenChange: ((Bool) -> Void)?

    /// The views that take their own touches, for ChromeWindow.
    var touchRoots: [UIView] { [dim, hosting.view] }

    init(host: ChromeController) {
        self.host = host
        hosting = UIHostingController(rootView: HabitsRoot(model: model))
        super.init()
        model.close = { [weak self] in self?.setOpen(false, animated: true) }
    }

    private var width: CGFloat { (host?.view.bounds.width ?? 390) * 0.85 }

    func install() {
        guard let host else { return }
        dim.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        dim.alpha = 0
        dim.isUserInteractionEnabled = false
        dim.frame = host.view.bounds
        dim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        dim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dimTapped)))
        host.view.addSubview(dim)

        host.addChild(hosting)
        hosting.view.backgroundColor = UIColor(red: 0.043, green: 0.047, blue: 0.063, alpha: 1)
        hosting.view.layer.shadowColor = UIColor.black.cgColor
        hosting.view.layer.shadowOpacity = 0.45
        hosting.view.layer.shadowRadius = 24
        hosting.view.layer.shadowOffset = CGSize(width: 12, height: 0)
        hosting.view.isHidden = true
        host.view.addSubview(hosting.view)
        hosting.didMove(toParent: host)

        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgePan(_:)))
        edge.edges = .left
        host.view.addGestureRecognizer(edge)

        panelPan = UIPanGestureRecognizer(target: self, action: #selector(panelPanned(_:)))
        panelPan.delegate = self
        hosting.view.addGestureRecognizer(panelPan)
        layout()
    }

    func layout() {
        guard let host else { return }
        let w = width
        hosting.view.frame = CGRect(x: -w + w * progress, y: 0, width: w, height: host.view.bounds.height)
        dim.alpha = progress
        dim.isUserInteractionEnabled = progress > 0.01
        hosting.view.isHidden = progress <= 0.001
    }

    func bringToFront() {
        guard let host else { return }
        host.view.bringSubviewToFront(dim)
        host.view.bringSubviewToFront(hosting.view)
    }

    func setOpen(_ open: Bool, animated: Bool, velocity: CGFloat = 0) {
        let changed = open != isOpen
        isOpen = open
        if open { bringToFront() }
        let target: CGFloat = open ? 1 : 0
        if open { hosting.view.isHidden = false }
        let apply = {
            self.progress = target
            self.layout()
        }
        if animated {
            let v = abs(velocity) / max(1, width)
            UIView.animate(withDuration: 0.42, delay: 0, usingSpringWithDamping: 0.88, initialSpringVelocity: min(v, 6),
                           options: [.beginFromCurrentState, .allowUserInteraction], animations: apply) { _ in
                if !open { self.model.detailId = nil }
            }
        } else {
            apply()
        }
        if open { haptic() }
        if changed { onOpenChange?(open) }
    }

    @objc private func dimTapped() { setOpen(false, animated: true) }

    @objc private func edgePan(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let host else { return }
        let x = g.translation(in: host.view).x
        switch g.state {
        case .began:
            bringToFront()
            hosting.view.isHidden = false
            startProgress = progress
        case .changed:
            progress = min(1, max(0, startProgress + x / width))
            layout()
        case .ended, .cancelled:
            let v = g.velocity(in: host.view).x
            setOpen(v > 300 || (progress > 0.4 && v > -300), animated: true, velocity: v)
        default:
            break
        }
    }

    @objc private func panelPanned(_ g: UIPanGestureRecognizer) {
        guard let host else { return }
        let x = g.translation(in: host.view).x
        switch g.state {
        case .began:
            startProgress = progress
        case .changed:
            progress = min(1, max(0, startProgress + x / width))
            layout()
        case .ended, .cancelled:
            let v = g.velocity(in: host.view).x
            setOpen(!(v < -300 || (progress < 0.6 && v < 300)), animated: true, velocity: v)
        default:
            break
        }
    }

    /// The panel's own pan only takes leftward, mostly-horizontal drags, so
    /// vertical scrolling inside it is untouched.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g === panelPan, let pan = g as? UIPanGestureRecognizer else { return true }
        let v = pan.velocity(in: pan.view)
        return v.x < 0 && abs(v.x) > abs(v.y) * 1.3
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        false
    }

    func update(json: String) {
        guard let data = json.data(using: .utf8) else { return }
        do {
            let p = try JSONDecoder().decode(HPPayload.self, from: data)
            model.data = p
            if let id = model.detailId, !p.habits.contains(where: { $0.id == id }) {
                model.detailId = nil
            }
        } catch {
            NSLog("SOMA habits payload: \(error)")
        }
    }
}
