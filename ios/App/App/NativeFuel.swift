import UIKit
import SwiftUI

// ==========================================================================
// The Fuel page, native.
//
// The everyday parts are native — today's totals, the macros, water, adding
// food from the library, and the diary with swipe actions — drawn from the
// snapshot NutritionView publishes, with every tap run by NutritionView's own
// functions (fuel-native.ts). Every other card on the sub-page is a glass
// glance (the same cards as Home) that opens its full card on tap. The
// portion sheet, scanner, quick add and food editor stay web sheets; the page
// steps aside while one is open.
// ==========================================================================

struct FuelPayload: Codable {
    var visible: Bool
    var page: String?
    var accent: String?
    var core: FuelCore?
    var items: [FuelItem]?

    static let hidden = FuelPayload(visible: false)
    init(visible: Bool) { self.visible = visible }
}

struct FuelItem: Codable, Identifiable {
    var id: String
    var size: String
    var core: Bool
    var spec: HomeSpec?
}

struct FSub: Codable, Hashable {
    var id: String
    var label: String
}

struct FPlanDate: Codable, Hashable {
    var date: String
    var label: String
    var count: Int
}

struct FMacro: Codable, Hashable {
    var label: String
    var used: Double
    var goal: Double
    var color: String
}

struct FTarget: Codable {
    var eaten: Double
    var goal: Double
    var planned: Double
    var maintenance: String
    var burn: String?
    var macros: [FMacro]
    var fiber: Double
}

struct FWater: Codable {
    var ml: Double
    var goal: Double
    var fromFood: Double
}

struct FRecent: Codable, Hashable {
    var name: String
    var amount: String
    var cals: Double
}

struct FLib: Codable, Hashable {
    var name: String
    var cals: Double
    var p: Double
}

struct FItem: Codable, Hashable {
    var idx: Int
    var name: String
    var amount: String
    var cals: Double
    var p: Double
    var c: Double
    var f: Double
}

struct FMeal: Codable {
    var meal: String
    var cals: Double
    var p: Double
    var planned: Double
    var items: [FItem]
    var plannedItems: [FItem]
}

struct FuelCore: Codable {
    var sub: String
    var subs: [FSub]
    var meals: [String]
    var meal: String
    var planMode: Bool
    var planDate: String
    var planDates: [FPlanDate]
    var target: FTarget
    var water: FWater
    var recents: [FRecent]
    var library: [FLib]
    var diary: [FMeal]
    var goalsLine: String
}

@available(iOS 16.0, *)
final class FuelModel: ObservableObject {
    @Published var data = FuelPayload.hidden
    @Published var top: CGFloat = 100
    @Published var bottom: CGFloat = 90
    let cards = HomeModel()
    var send: ([String: Any]) -> Void = { _ in } {
        didSet { cards.send = send }
    }

    init() {
        cards.cardEvent = "fuelCard"
    }

    func act(_ op: String, _ args: [String: Any] = [:]) {
        var d = args
        d["type"] = "fuel"
        d["op"] = op
        send(d)
    }
}

private let calColor = Color(red: 0.98, green: 0.07, blue: 0.31)
private let waterColor = Color(red: 0, green: 0.85, blue: 1)

// MARK: - Core cards

@available(iOS 16.0, *)
struct TargetCard: View {
    @EnvironmentObject var model: FuelModel
    let core: FuelCore

    var body: some View {
        let t = core.target
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Nutrition").font(.system(size: 22, weight: .heavy))
                    Spacer()
                    if let b = t.burn {
                        Button(b) { model.act("burn") }
                            .font(.caption.weight(.bold))
                            .buttonStyle(.plain)
                            .foregroundStyle(Color(red: 0.83, green: 0.99, blue: 0.31))
                    }
                }
                Text(t.maintenance).font(.caption).foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(Int(t.eaten))").font(.system(size: 38, weight: .heavy, design: .rounded)).monospacedDigit()
                        .foregroundStyle(calColor)
                    Text("/ \(Int(t.goal)) kcal").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    if t.planned > 0 {
                        Text("+\(Int(t.planned)) planned").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    Spacer()
                    Text("\(max(0, Int(t.goal - t.eaten))) left").font(.subheadline.weight(.bold)).foregroundStyle(.secondary)
                }
                ProgressCapsule(value: t.goal > 0 ? t.eaten / t.goal : 0, color: calColor)
                HStack(spacing: 6) {
                    ForEach([(false, "Eating now"), (true, "Planning")], id: \.1) { mode, label in
                        let on = core.planMode == mode
                        Button {
                            haptic()
                            model.act("planMode", ["on": mode])
                        } label: {
                            Text(label).font(.caption.weight(.bold))
                                .frame(maxWidth: .infinity).frame(height: 34)
                                .foregroundStyle(on ? Color.black : Color.secondary)
                                .background(on ? Color(red: 0.83, green: 0.99, blue: 0.31) : Color.primary.opacity(0.08),
                                            in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if core.planMode {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(core.planDates, id: \.self) { d in
                                let on = d.date == core.planDate
                                Button {
                                    haptic()
                                    model.act("planDate", ["date": d.date])
                                } label: {
                                    VStack(spacing: 1) {
                                        Text(d.label.uppercased()).font(.system(size: 9, weight: .bold))
                                        Text(d.count > 0 ? "\(d.count) item\(d.count == 1 ? "" : "s")" : "—")
                                            .font(.caption2.weight(.heavy))
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .foregroundStyle(on ? Color.black : Color.primary)
                                    .background(on ? Color(red: 0.83, green: 0.99, blue: 0.31) : Color.primary.opacity(0.08),
                                                in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct MacroRow: View {
    let core: FuelCore

    var body: some View {
        HStack(spacing: 8) {
            ForEach(core.target.macros, id: \.self) { m in
                let c = Color(somaHex: m.color)
                VStack(alignment: .leading, spacing: 5) {
                    Text(m.label.uppercased()).font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text("\(Int(m.used))").font(.system(size: 20, weight: .heavy, design: .rounded)).monospacedDigit()
                        Text("/\(Int(m.goal))g").font(.caption2).foregroundStyle(.secondary)
                    }
                    ProgressCapsule(value: m.goal > 0 ? m.used / m.goal : 0, color: c)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .somaGlass(18)
            }
        }
    }
}

@available(iOS 16.0, *)
struct WaterCard: View {
    @EnvironmentObject var model: FuelModel
    let w: FWater

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Water", systemImage: "drop.fill").font(.headline).foregroundStyle(waterColor)
                    Spacer()
                    Text("\(Int(w.ml)) / \(Int(w.goal)) ml").font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(waterColor)
                }
                ProgressCapsule(value: w.goal > 0 ? w.ml / w.goal : 0, color: waterColor)
                if w.fromFood > 0 {
                    Text("\(Int(w.fromFood)) ml of that came from what you drank.").font(.caption2).foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    GlassButton(title: "+250") { model.act("water", ["ml": 250]) }
                    GlassButton(title: "+500", tint: waterColor) { model.act("water", ["ml": 500]) }
                    GlassButton(title: "−250") { model.act("water", ["ml": -250]) }
                    GlassButton(title: "Reset", tint: .red) { model.act("waterReset") }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct AddFoodCard: View {
    @EnvironmentObject var model: FuelModel
    let core: FuelCore
    @State private var query = ""
    @State private var creating = false
    @FocusState private var searching: Bool

    var body: some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let hits: [FLib] = q.isEmpty ? [] : Array(core.library
            .filter { $0.name.lowercased().contains(q) }
            .sorted { a, b in
                let ap = a.name.lowercased().hasPrefix(q), bp = b.name.lowercased().hasPrefix(q)
                return ap != bp ? ap : a.name.count < b.name.count
            }
            .prefix(25))
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Add food").font(.headline)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(core.meals, id: \.self) { m in
                            let on = m == core.meal
                            Button {
                                haptic()
                                model.act("meal", ["meal": m])
                            } label: {
                                Text(m).font(.caption.weight(.bold))
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .foregroundStyle(on ? Color.black : Color.secondary)
                                    .background(on ? Color(red: 0.83, green: 0.99, blue: 0.31) : Color.primary.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                HStack(spacing: 8) {
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        TextField("Search chicken, rice, whey…", text: $query)
                            .focused($searching)
                            .submitLabel(.search)
                        if !query.isEmpty {
                            Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 12).frame(height: 42)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    Button { haptic(); model.act("scan") } label: {
                        Image(systemName: "barcode.viewfinder").font(.system(size: 18, weight: .semibold)).frame(width: 42, height: 42)
                    }
                    .buttonStyle(PressStyle())
                    .somaGlass(14, tint: Color(red: 0.83, green: 0.99, blue: 0.31).opacity(0.5), interactive: true)
                }

                if q.isEmpty && !core.recents.isEmpty {
                    Text("YOU EAT THESE").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    FlowChips(items: core.recents) { r in
                        haptic()
                        model.act("recent", ["name": r.name])
                    }
                }

                if !q.isEmpty {
                    VStack(spacing: 0) {
                        if hits.isEmpty {
                            Text("No match — scan a barcode or create it below.")
                                .font(.caption).foregroundStyle(.secondary).padding(.vertical, 14)
                        }
                        ForEach(hits, id: \.self) { f in
                            HStack {
                                Button {
                                    haptic()
                                    searching = false
                                    model.act("pick", ["name": f.name])
                                    query = ""
                                } label: {
                                    HStack {
                                        Text(f.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                        Spacer()
                                        Text("\(Int(f.cals)) kcal · \(Int(f.p))p").font(.caption).foregroundStyle(.secondary)
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                Button { model.act("editLibrary", ["name": f.name]) } label: {
                                    Image(systemName: "pencil").font(.caption).foregroundStyle(.secondary).frame(width: 30, height: 30)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            Divider().opacity(0.4)
                        }
                    }
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                }

                HStack {
                    Button("Quick add calories") { model.act("quickAdd") }
                    Spacer()
                    Button("Create a new food") { creating = true }
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(Color(red: 0.83, green: 0.99, blue: 0.31))
            }
        }
        .sheet(isPresented: $creating) { NewFoodSheet().environmentObject(model) }
    }
}

/// Chips that wrap onto as many lines as they need.
@available(iOS 16.0, *)
struct FlowChips: View {
    let items: [FRecent]
    let tap: (FRecent) -> Void

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(items, id: \.self) { r in
                Button { tap(r) } label: {
                    HStack(spacing: 4) {
                        Text(r.name).lineLimit(1)
                        Text(r.amount).foregroundStyle(.tertiary)
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(Color.primary.opacity(0.08), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

@available(iOS 16.0, *)
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxW {
                y += rowH + spacing
                x = 0
                rowH = 0
            }
            x += s.width + spacing
            rowH = max(rowH, s.height)
            widest = max(widest, x)
        }
        return CGSize(width: min(widest, maxW), height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX {
                y += rowH + spacing
                x = bounds.minX
                rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

@available(iOS 16.0, *)
struct NewFoodSheet: View {
    @EnvironmentObject var model: FuelModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var cals = ""
    @State private var p = ""
    @State private var c = ""
    @State private var f = ""
    @State private var water = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                } footer: {
                    Text("Values per 100 g, as printed on the label. Saved to your library so you can log it again at any portion.")
                }
                Section("Per 100 g") {
                    field("kcal", $cals)
                    field("Protein (g)", $p)
                    field("Carbs (g)", $c)
                    field("Fat (g)", $f)
                    field("Water % — 88 for juice or milk", $water)
                }
            }
            .navigationTitle("New food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let n = { (s: String) in Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
                        model.act("createFood", ["name": name, "cals": n(cals), "p": n(p), "c": n(c), "f": n(f), "waterPct": n(water)])
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func field(_ label: String, _ text: Binding<String>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", text: text).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90)
        }
    }
}

/// A diary row: tap to edit, swipe right to gray it out or count it, swipe
/// left to delete it or take it off the plan.
@available(iOS 16.0, *)
struct SwipeFoodRow: View {
    let item: FItem
    let planned: Bool
    let meals: [String]
    let onRight: () -> Void
    let onLeft: () -> Void
    let onTap: () -> Void
    let onMove: (String) -> Void
    @State private var dx: CGFloat = 0

    var body: some View {
        ZStack {
            HStack {
                if dx > 0 {
                    Label(planned ? "Eaten" : "Not yet", systemImage: planned ? "checkmark.circle.fill" : "clock.fill")
                        .padding(.leading, 16)
                    Spacer()
                } else if dx < 0 {
                    Spacer()
                    Label(planned ? "Off plan" : "Delete", systemImage: "trash.fill")
                        .padding(.trailing, 16)
                }
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(dx > 0 ? (planned ? Color.green : Color.gray) : Color.red,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(dx == 0 ? 0 : min(1, abs(dx) / 60))

            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text("\(item.amount) · P \(Int(item.p)) · C \(Int(item.c)) · F \(Int(item.f))")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text("\(Int(item.cals))").font(.subheadline.weight(.heavy)).monospacedDigit()
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Color(uiColor: .secondarySystemBackground).opacity(0.85), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(planned ? 0.5 : 1)
            .offset(x: dx)
            .contentShape(Rectangle())
            .onTapGesture(perform: onTap)
            .contextMenu {
                Button { onTap() } label: { Label("Edit", systemImage: "pencil") }
                if !planned {
                    Menu {
                        ForEach(meals, id: \.self) { m in Button(m) { onMove(m) } }
                    } label: { Label("Move to", systemImage: "arrow.right.circle") }
                }
                Button { onRight() } label: {
                    Label(planned ? "Mark eaten" : "Not eaten yet", systemImage: planned ? "checkmark" : "clock")
                }
                Button(role: .destructive) { onLeft() } label: {
                    Label(planned ? "Take off the plan" : "Delete", systemImage: "trash")
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { v in
                        guard abs(v.translation.width) > abs(v.translation.height) * 1.4 else { return }
                        dx = v.translation.width
                    }
                    .onEnded { _ in
                        if dx > 90 {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            onRight()
                        } else if dx < -90 {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            onLeft()
                        }
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { dx = 0 }
                    }
            )
        }
    }
}

@available(iOS 16.0, *)
struct DiaryView: View {
    @EnvironmentObject var model: FuelModel
    let core: FuelCore
    @State private var closed: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tap a food to edit it. Swipe right to gray it out (not eaten yet) — a gray one swipes right to count it. Swipe left to delete. Hold for more.")
                .font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 4)
            ForEach(core.diary, id: \.meal) { m in
                let open = !closed.contains(m.meal)
                GlassCard(padding: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Button {
                            withAnimation(.spring(response: 0.35)) {
                                if open { closed.insert(m.meal) } else { closed.remove(m.meal) }
                            }
                        } label: {
                            HStack {
                                Text(m.meal).font(.subheadline.weight(.bold))
                                Spacer()
                                Text("\(Int(m.cals)) kcal · \(Int(m.p))g P").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                                if m.planned > 0 {
                                    Text("+\(Int(m.planned))").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                                }
                                Image(systemName: "chevron.down").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                                    .rotationEffect(.degrees(open ? 0 : -90))
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if open {
                            ForEach(m.plannedItems, id: \.self) { it in
                                SwipeFoodRow(item: it, planned: true, meals: core.meals,
                                             onRight: { model.act("confirm", ["idx": it.idx]) },
                                             onLeft: { model.act("unplan", ["idx": it.idx]) },
                                             onTap: { model.act("edit", ["idx": it.idx, "planned": true]) },
                                             onMove: { _ in })
                            }
                            ForEach(m.items, id: \.self) { it in
                                SwipeFoodRow(item: it, planned: false, meals: core.meals,
                                             onRight: { model.act("gray", ["idx": it.idx]) },
                                             onLeft: { model.act("delete", ["idx": it.idx]) },
                                             onTap: { model.act("edit", ["idx": it.idx]) },
                                             onMove: { meal in model.act("move", ["idx": it.idx, "meal": meal]) })
                            }
                            if m.items.isEmpty && m.plannedItems.isEmpty {
                                Text("Nothing logged").font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
            Text(core.goalsLine).font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 4)
        }
    }
}

// MARK: - Root

enum FuelBlock: Identifiable {
    case core(FuelItem)
    case cards([[HomeItem]])

    var id: String {
        switch self {
        case .core(let it): return "core-" + it.id
        case .cards(let rows): return "cards-" + rows.flatMap { $0 }.map { $0.id }.joined(separator: ",")
        }
    }
}

@available(iOS 16.0, *)
struct FuelRoot: View {
    @ObservedObject var model: FuelModel

    private func blocks(_ items: [FuelItem]) -> [FuelBlock] {
        var out: [FuelBlock] = []
        var run: [HomeItem] = []
        func flush() {
            if !run.isEmpty {
                out.append(.cards(packRows(run)))
                run = []
            }
        }
        for it in items {
            if it.core {
                flush()
                out.append(.core(it))
            } else if let spec = it.spec {
                run.append(HomeItem(id: it.id, size: it.size, spec: spec))
            }
        }
        flush()
        return out
    }

    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 10
            let pad: CGFloat = 16
            let col = (geo.size.width - pad * 2 - gap * 3) / 4
            let unit = max(70, col * 0.95)
            NavigationStack {
                ScrollView {
                    VStack(spacing: 12) {
                        if let core = model.data.core {
                            Picker("Page", selection: Binding(
                                get: { core.sub },
                                set: { v in
                                    haptic()
                                    model.act("sub", ["sub": v])
                                }
                            )) {
                                ForEach(core.subs, id: \.self) { s in Text(s.label).tag(s.id) }
                            }
                            .pickerStyle(.segmented)

                            ForEach(blocks(model.data.items ?? [])) { b in
                                switch b {
                                case .core(let it):
                                    coreView(it.id, core)
                                case .cards(let rows):
                                    VStack(spacing: gap) {
                                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                                            HStack(alignment: .top, spacing: gap) {
                                                ForEach(row) { it in
                                                    HomeCard(item: it, unit: unit)
                                                        .frame(width: col * CGFloat(footprint(it.size).w) + gap * CGFloat(footprint(it.size).w - 1))
                                                }
                                                Spacer(minLength: 0)
                                            }
                                        }
                                    }
                                    .environmentObject(model.cards)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, pad)
                    .padding(.top, model.top + 8)
                    .padding(.bottom, model.bottom + 20)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .background(HomeBackdrop(accent: calColor))
                .ignoresSafeArea()
                .toolbar(.hidden, for: .navigationBar)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") {
                            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                        }
                        .font(.body.weight(.semibold))
                    }
                }
            }
        }
        .environmentObject(model)
    }

    @ViewBuilder
    private func coreView(_ id: String, _ core: FuelCore) -> some View {
        switch id {
        case "target": TargetCard(core: core)
        case "actions": MacroRow(core: core)
        case "water": WaterCard(w: core.water)
        case "add": AddFoodCard(core: core)
        case "diary": DiaryView(core: core)
        default: EmptyView()
        }
    }
}

/// Hosts FuelRoot above the web view and below the bars.
@available(iOS 16.0, *)
final class FuelController {
    let model = FuelModel()
    let hosting: UIHostingController<FuelRoot>
    private var hiddenByOverlay = false

    init() {
        hosting = UIHostingController(rootView: FuelRoot(model: model))
        hosting.view.backgroundColor = .clear
        hosting.view.isHidden = true
        hosting.view.alpha = 0
    }

    func install(in host: UIViewController, above view: UIView) {
        host.addChild(hosting)
        hosting.view.frame = host.view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.insertSubview(hosting.view, aboveSubview: view)
        hosting.didMove(toParent: host)
    }

    func update(json: String) {
        guard let data = json.data(using: .utf8) else { return }
        do {
            let p = try JSONDecoder().decode(FuelPayload.self, from: data)
            model.data = p
            if let a = p.accent {
                model.cards.data = HomePayload(visible: true, accent: a, extras: [], items: [])
            }
            refresh()
        } catch {
            NSLog("SOMA fuel payload: \(error)")
        }
    }

    func setInsets(top: CGFloat, bottom: CGFloat) {
        if abs(model.top - top) > 0.5 { model.top = top }
        if abs(model.bottom - bottom) > 0.5 { model.bottom = bottom }
    }

    func setOverlay(_ on: Bool) {
        hiddenByOverlay = on
        refresh()
    }

    private func refresh() {
        let show = model.data.visible && !hiddenByOverlay
        if show { hosting.view.isHidden = false }
        hosting.view.isUserInteractionEnabled = show
        UIView.animate(withDuration: 0.22, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.hosting.view.alpha = show ? 1 : 0
        } completion: { _ in
            if !(self.model.data.visible && !self.hiddenByOverlay) { self.hosting.view.isHidden = true }
        }
    }
}
