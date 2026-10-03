import UIKit
import SwiftUI
import Charts

// ==========================================================================
// The Home page, native.
//
// Every web widget already describes itself as a "glance" — label, value,
// progress, lines, figures, a trend, rings — for its small sizes. The page
// collects those (NativeHomeBridge.tsx) in the user's own order and sizes and
// sends them here, where they are drawn as SwiftUI cards on Liquid Glass over
// a dark ambient backdrop. A tap is handed back: the widget's own action, or
// its whole card in the page's sheet (the native page steps aside for it).
// ==========================================================================

struct HomePayload: Codable {
    var visible: Bool
    var accent: String
    var extras: [HomeSpec]
    var items: [HomeItem]

    static let empty = HomePayload(visible: false, accent: "#d3fd50", extras: [], items: [])
}

struct HomeItem: Codable, Identifiable {
    var id: String
    var size: String
    var spec: HomeSpec
}

struct HomeLine: Codable, Hashable {
    var text: String
    var done: Bool
    var value: String?
    var color: String?
}

struct HomeStat: Codable, Hashable {
    var label: String
    var value: String
    var of: String?
    var color: String?
}

struct HomeChart: Codable {
    var values: [Double?]
    var target: Double?
}

struct HomeRing: Codable, Hashable {
    var frac: Double
    var color: String
}

struct HomeSpec: Codable, Identifiable {
    var id: String
    var label: String
    var short: String?
    var color: String?
    var icon: String
    var value: String?
    var unit: String?
    var sub: String?
    var progress: Double?
    var done: Bool
    var lines: [HomeLine]
    var stats: [HomeStat]
    var chart: HomeChart?
    var empty: String?
    var rings: [HomeRing]?
}

@available(iOS 16.0, *)
final class HomeModel: ObservableObject {
    @Published var data = HomePayload.empty
    @Published var top: CGFloat = 100
    @Published var bottom: CGFloat = 90
    var send: ([String: Any]) -> Void = { _ in }
    /// The action a card tap sends: "home" on Home, "fuelCard" on Fuel.
    var cardEvent = "home"
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

    func open(_ id: String) {
        haptic()
        send(["type": cardEvent, "op": "open", "id": id])
    }
}

/// Grid footprint of a size id: columns of four, rows of one unit.
func footprint(_ size: String) -> (w: Int, h: Int) {
    switch size {
    case "1x1": return (1, 1)
    case "1x2": return (2, 1)
    case "2x2": return (2, 2)
    case "1x4": return (4, 1)
    case "3x4": return (4, 3)
    case "4x4": return (4, 4)
    default: return (4, 2)
    }
}

/// Items packed into rows of four columns, in order, like the web grid.
func packRows(_ items: [HomeItem]) -> [[HomeItem]] {
    var rows: [[HomeItem]] = []
    var row: [HomeItem] = []
    var used = 0
    for it in items {
        let w = footprint(it.size).w
        if used + w > 4 && !row.isEmpty {
            rows.append(row)
            row = []
            used = 0
        }
        row.append(it)
        used += w
        if used >= 4 {
            rows.append(row)
            row = []
            used = 0
        }
    }
    if !row.isEmpty { rows.append(row) }
    return rows
}

// MARK: - Pieces

@available(iOS 16.0, *)
struct RingStack: View {
    let rings: [HomeRing]
    var lineWidth: CGFloat = 10

    var body: some View {
        ZStack {
            ForEach(Array(rings.enumerated()), id: \.offset) { i, r in
                let inset = CGFloat(i) * (lineWidth + 3)
                let c = Color(somaHex: r.color)
                Circle()
                    .stroke(c.opacity(0.18), lineWidth: lineWidth)
                    .padding(inset + lineWidth / 2)
                Circle()
                    .trim(from: 0, to: min(1, max(0.001, r.frac)))
                    .stroke(c, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(inset + lineWidth / 2)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

@available(iOS 16.0, *)
struct ProgressCapsule: View {
    let value: Double
    let color: Color

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.18))
                Capsule().fill(color).frame(width: max(6, g.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: 6)
    }
}

@available(iOS 16.0, *)
struct TrendChart: View {
    let chart: HomeChart
    let color: Color

    var body: some View {
        let points = chart.values.enumerated().compactMap { i, v in v.map { (i, $0) } }
        Chart {
            ForEach(points, id: \.0) { p in
                AreaMark(x: .value("Day", p.0), y: .value("Value", p.1))
                    .foregroundStyle(LinearGradient(colors: [color.opacity(0.35), color.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.catmullRom)
                LineMark(x: .value("Day", p.0), y: .value("Value", p.1))
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
                    .interpolationMethod(.catmullRom)
            }
            if let t = chart.target {
                RuleMark(y: .value("Target", t))
                    .foregroundStyle(Color.primary.opacity(0.35))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
    }
}

@available(iOS 16.0, *)
struct CardHeader: View {
    @EnvironmentObject var model: HomeModel
    let spec: HomeSpec
    let color: Color
    var compact = false

    var body: some View {
        HStack(spacing: 6) {
            if let img = model.icon(spec.icon) {
                Image(uiImage: img).resizable().scaledToFit().frame(width: 14, height: 14).foregroundStyle(color)
            } else {
                Circle().fill(color).frame(width: 7, height: 7)
            }
            Text((compact ? (spec.short ?? spec.label) : spec.label).uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
            if spec.done {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 14)).foregroundStyle(color)
            }
        }
    }
}

@available(iOS 16.0, *)
struct ValueText: View {
    let spec: HomeSpec
    var size: CGFloat = 30

    var body: some View {
        if let v = spec.value {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(v).font(.system(size: size, weight: .heavy, design: .rounded)).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.5)
                if let u = spec.unit, !u.isEmpty {
                    Text(u).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.secondary)
                }
            }
        } else if let e = spec.empty {
            Text(e).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).lineLimit(2)
        }
    }
}

@available(iOS 16.0, *)
struct LinesList: View {
    let lines: [HomeLine]
    let max: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(lines.prefix(max).enumerated()), id: \.offset) { _, l in
                HStack(spacing: 8) {
                    if l.done {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(color)
                    } else {
                        Circle().fill(l.color.map { Color(somaHex: $0) } ?? Color.primary.opacity(0.25)).frame(width: 7, height: 7)
                            .frame(width: 13)
                    }
                    Text(l.text).font(.subheadline).lineLimit(1)
                        .foregroundStyle(l.done ? .secondary : .primary)
                    Spacer(minLength: 4)
                    if let v = l.value {
                        Text(v).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct StatsRow: View {
    let stats: [HomeStat]

    var body: some View {
        HStack(spacing: 10) {
            ForEach(stats, id: \.self) { s in
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.label).font(.caption2.weight(.semibold)).foregroundStyle(s.color.map { Color(somaHex: $0) } ?? .secondary)
                        .lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text(s.value).font(.system(size: 17, weight: .heavy, design: .rounded)).monospacedDigit()
                        if let of = s.of {
                            Text(of).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .lineLimit(1).minimumScaleFactor(0.6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: - The card, at every size

@available(iOS 16.0, *)
struct HomeCard: View {
    @EnvironmentObject var model: HomeModel
    let item: HomeItem
    let unit: CGFloat

    var body: some View {
        let fp = footprint(item.size)
        let spec = item.spec
        let color = spec.color.map { Color(somaHex: $0) } ?? Color(somaHex: model.data.accent)
        Button {
            model.open(item.id)
        } label: {
            content(fp: fp, spec: spec, color: color)
                .padding(fp.w == 1 ? 10 : 14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .frame(height: unit * CGFloat(fp.h) + 10 * CGFloat(fp.h - 1))
                .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .somaGlass(24)
    }

    @ViewBuilder
    private func content(fp: (w: Int, h: Int), spec: HomeSpec, color: Color) -> some View {
        if fp.w == 1 {
            // Quarter: label, the number, a bar.
            VStack(alignment: .leading, spacing: 4) {
                CardHeader(spec: spec, color: color, compact: true)
                Spacer(minLength: 0)
                ValueText(spec: spec, size: 20)
                if let p = spec.progress { ProgressCapsule(value: p, color: color) }
            }
        } else if fp.w == 2 {
            // Half.
            VStack(alignment: .leading, spacing: 6) {
                CardHeader(spec: spec, color: color, compact: fp.h == 1)
                if let rings = spec.rings, fp.h >= 2 {
                    HStack {
                        RingStack(rings: rings, lineWidth: 8)
                        Spacer(minLength: 0)
                    }
                } else {
                    Spacer(minLength: 0)
                    ValueText(spec: spec, size: fp.h == 1 ? 22 : 30)
                    if fp.h >= 2, let s = spec.sub {
                        Text(s).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    if let p = spec.progress { ProgressCapsule(value: p, color: color) }
                }
            }
        } else if fp.h == 1 {
            // A strip: everything in one line.
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    CardHeader(spec: spec, color: color)
                    if let s = spec.sub ?? spec.lines.first?.text {
                        Text(s).font(.subheadline).lineLimit(1)
                    } else if spec.value == nil, let e = spec.empty {
                        Text(e).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if spec.value != nil { ValueText(spec: spec, size: 24) }
            }
        } else {
            // Full width, two rows or more: the whole glance.
            VStack(alignment: .leading, spacing: 10) {
                CardHeader(spec: spec, color: color)
                HStack(alignment: .top, spacing: 14) {
                    if let rings = spec.rings {
                        RingStack(rings: rings, lineWidth: fp.h >= 3 ? 14 : 11)
                            .frame(width: unit * CGFloat(fp.h) * 0.62)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        if spec.rings == nil || spec.value != nil { ValueText(spec: spec, size: 32) }
                        if let s = spec.sub {
                            Text(s).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        }
                        if !spec.stats.isEmpty { StatsRow(stats: spec.stats) }
                    }
                    Spacer(minLength: 0)
                }
                if let p = spec.progress, spec.rings == nil { ProgressCapsule(value: p, color: color) }
                if let ch = spec.chart, fp.h >= 2, ch.values.compactMap({ $0 }).count >= 2 {
                    TrendChart(chart: ch, color: color).frame(maxHeight: .infinity)
                } else if !spec.lines.isEmpty {
                    LinesList(lines: spec.lines, max: fp.h >= 3 ? 8 : 4, color: color)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

@available(iOS 16.0, *)
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

@available(iOS 16.0, *)
struct ExtraBanner: View {
    @EnvironmentObject var model: HomeModel
    let spec: HomeSpec

    var body: some View {
        let c = spec.color.map { Color(somaHex: $0) } ?? .indigo
        Button {
            model.open(spec.id)
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.08))
                    if let img = model.icon(spec.icon) {
                        Image(uiImage: img).resizable().scaledToFit().frame(width: 20, height: 20).foregroundStyle(c)
                    }
                }
                .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text(spec.label).font(.subheadline.weight(.heavy))
                    if let s = spec.sub { Text(s).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
                if let v = spec.value {
                    Text(v).font(.title3.weight(.heavy)).monospacedDigit()
                }
            }
            .padding(12)
        }
        .buttonStyle(PressStyle())
        .somaGlass(22, interactive: true)
    }
}

@available(iOS 16.0, *)
struct HomeRoot: View {
    @ObservedObject var model: HomeModel

    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 10
            let pad: CGFloat = 16
            let col = (geo.size.width - pad * 2 - gap * 3) / 4
            let unit = max(70, col * 0.95)
            ScrollView {
                VStack(spacing: gap) {
                    ForEach(model.data.extras) { e in ExtraBanner(spec: e) }
                    ForEach(Array(packRows(model.data.items).enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: gap) {
                            ForEach(row) { it in
                                HomeCard(item: it, unit: unit)
                                    .frame(width: col * CGFloat(footprint(it.size).w) + gap * CGFloat(footprint(it.size).w - 1))
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.horizontal, pad)
                .padding(.top, model.top + 8)
                .padding(.bottom, model.bottom + 20)
                .animation(.spring(response: 0.45, dampingFraction: 0.85), value: model.data.items.map { $0.id + $0.size })
            }
            .scrollIndicators(.hidden)
        }
        .background(HomeBackdrop(accent: Color(somaHex: model.data.accent)))
        .environmentObject(model)
        .ignoresSafeArea()
    }
}

/// What the glass sits on: the app's plain dark background, nothing more.
/// Liquid Glass reads the content behind it; it is not a colour scheme.
@available(iOS 16.0, *)
struct HomeBackdrop: View {
    let accent: Color

    var body: some View {
        Color(red: 0.043, green: 0.047, blue: 0.063).ignoresSafeArea()
    }
}

/// Hosts HomeRoot above the web view and below the bars.
@available(iOS 16.0, *)
final class HomeController {
    let model = HomeModel()
    let hosting: UIHostingController<HomeRoot>
    private var hiddenByOverlay = false

    init() {
        hosting = UIHostingController(rootView: HomeRoot(model: model))
        hosting.view.backgroundColor = .clear
        hosting.view.isHidden = true
    }

    func install(in host: UIViewController, above web: UIView) {
        host.addChild(hosting)
        hosting.view.frame = host.view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.insertSubview(hosting.view, aboveSubview: web)
        hosting.didMove(toParent: host)
    }

    func update(json: String) {
        guard let data = json.data(using: .utf8) else { return }
        do {
            let p = try JSONDecoder().decode(HomePayload.self, from: data)
            model.data = p
            refresh()
        } catch {
            NSLog("SOMA home payload: \(error)")
        }
    }

    func setInsets(top: CGFloat, bottom: CGFloat) {
        if abs(model.top - top) > 0.5 { model.top = top }
        if abs(model.bottom - bottom) > 0.5 { model.bottom = bottom }
    }

    /// Web sheets and panels open over the page: the native page steps aside.
    func setOverlay(_ on: Bool) {
        hiddenByOverlay = on
        refresh()
    }

    private func refresh() {
        let show = model.data.visible && !hiddenByOverlay
        if show { hosting.view.isHidden = false }
        UIView.animate(withDuration: 0.22, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.hosting.view.alpha = show ? 1 : 0
        } completion: { _ in
            if !(self.model.data.visible && !self.hiddenByOverlay) { self.hosting.view.isHidden = true }
        }
        hosting.view.isUserInteractionEnabled = show
    }
}
