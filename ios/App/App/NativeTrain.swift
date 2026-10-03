import UIKit
import SwiftUI

// ==========================================================================
// The Train page, native.
//
// WorkoutView keeps every calculation — smart targets, autoregulation,
// ratings, burn — and publishes a snapshot of the live session with the
// functions that act on it (train-native.ts). This draws that snapshot in
// SwiftUI on Liquid Glass and sends each tap back as a "train" action, so
// logging a set runs exactly the code it always has. The set-quality survey
// and custom-movement form are still web sheets; the page steps aside while
// they are open.
// ==========================================================================

struct TrainPayload: Codable {
    var visible: Bool
    var unit: String?
    var split: String?
    var badge: String?
    var phase: String?
    var phaseBadge: String?
    var deload: Bool?
    var logAs: String?
    var today: String?
    var clash: String?
    var firstSetAt: Double?
    var stats: [TStat]?
    var rest: TRest?
    var readiness: TReady?
    var routines: [TRoutine]?
    var library: [TLib]?
    var exercises: [TEx]?

    static let hidden = TrainPayload(visible: false)

    init(visible: Bool) { self.visible = visible }
}

struct TStat: Codable, Hashable {
    var label: String
    var value: String
    var hint: String?
    var color: String?
}

struct TRest: Codable {
    var endsAt: Double?
    var total: Double
}

struct TReady: Codable {
    var note: String
    var soreness: Int
    var stress: Int
}

struct TRoutine: Codable, Hashable {
    var name: String
    var count: Int
}

struct TLib: Codable, Hashable {
    var name: String
    var sub: String
}

struct TBadge: Codable, Hashable {
    var text: String
    var tone: String
}

struct TRating: Codable {
    var score: Int
    var sub: String
    var color: String?
}

struct TTarget: Codable {
    var text: String
    var note: String
    var auto: String?
    var tier: String
    var tone: String
}

struct TAlt: Codable, Hashable {
    var name: String
    var note: String
}

struct TSet: Codable {
    var label: String
    var type: String
    var weight: String
    var reps: String
    var feederQuick: Bool
    var rate: String?
    var failure: Bool
    var limiter: Bool
    var grip: String?
    var score: Int?
    var scoreColor: String?
    var done: Bool
}

struct TEx: Codable, Identifiable {
    var idx: Int
    var name: String
    var supersetColor: String?
    var badges: [TBadge]
    var rating: TRating?
    var target: TTarget
    var last: String?
    var alts: [TAlt]
    var pump: Int?
    var canFeeder: Bool
    var sets: [TSet]
    var id: String { "\(idx)-\(name)" }
}

@available(iOS 16.0, *)
final class TrainModel: ObservableObject {
    @Published var data = TrainPayload.hidden
    @Published var top: CGFloat = 100
    @Published var bottom: CGFloat = 90
    var send: ([String: Any]) -> Void = { _ in }

    func act(_ op: String, _ args: [String: Any] = [:]) {
        var d = args
        d["type"] = "train"
        d["op"] = op
        send(d)
    }
}

func toneColor(_ tone: String) -> Color {
    switch tone {
    case "danger": return .red
    case "warn": return .orange
    case "good": return .green
    case "accent": return Color(red: 0.83, green: 0.99, blue: 0.31)
    default: return .secondary
    }
}

// MARK: - Pieces

@available(iOS 16.0, *)
struct GlassCard<Content: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .somaGlass(24)
    }
}

@available(iOS 16.0, *)
struct Pill: View {
    let text: String
    var color: Color = .secondary

    var body: some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 4)
            .foregroundStyle(color)
            .background(color.opacity(0.15), in: Capsule())
    }
}

@available(iOS 16.0, *)
struct GlassButton: View {
    let title: String
    var systemImage: String? = nil
    var tint: Color? = nil
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button {
            haptic()
            action()
        } label: {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage) }
                if !title.isEmpty { Text(title) }
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(prominent ? Color.black : Color.primary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .padding(.horizontal, 12)
        }
        .buttonStyle(PressStyle())
        .somaGlass(16, tint: prominent ? (tint ?? Color(red: 0.83, green: 0.99, blue: 0.31)) : tint?.opacity(0.25), interactive: true)
    }
}

/// A weight or reps field: owns its text while focused, follows the session
/// otherwise, and commits each value it can read (a comma counts as a point).
@available(iOS 16.0, *)
struct SetField: View {
    @EnvironmentObject var model: TrainModel
    let value: String
    let op: String
    let ex: Int
    let set: Int
    let label: String
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("–", text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .monospacedDigit()
            .focused($focused)
            .frame(height: 36)
            .background(Color.primary.opacity(focused ? 0.14 : 0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(focused ? Color.accentColor : .clear, lineWidth: 1.5))
            .onAppear { text = value }
            .onChange(of: value) { v in if !focused { text = v } }
            .onChange(of: text) { t in
                guard focused else { return }
                let clean = t.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
                if clean.isEmpty {
                    model.act(op, ["ex": ex, "set": set, "value": ""])
                } else if let n = Double(clean) {
                    model.act(op, ["ex": ex, "set": set, "value": n])
                }
            }
            .onChange(of: focused) { f in if !f { text = value } }
            .accessibilityLabel(label)
    }
}

@available(iOS 16.0, *)
struct SetRow: View {
    @EnvironmentObject var model: TrainModel
    let ex: TEx
    let s: TSet
    let i: Int

    var body: some View {
        let accent = Color(red: 0.83, green: 0.99, blue: 0.31)
        HStack(spacing: 4) {
            Button {
                haptic()
                model.act("cycleType", ["ex": ex.idx, "set": i])
            } label: {
                Text(s.label).font(.caption.weight(.heavy))
                    .frame(width: 30, height: 36)
                    .foregroundStyle(s.type == "warmup" ? Color.cyan : s.type == "dropset" ? Color.black : Color.primary)
                    .background(s.type == "dropset" ? Color.orange : Color.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            .buttonStyle(.plain)
            SetField(value: s.weight, op: "weight", ex: ex.idx, set: i, label: "Set \(i + 1) weight")
            SetField(value: s.reps, op: "reps", ex: ex.idx, set: i, label: "Set \(i + 1) reps")
            if s.feederQuick {
                HStack(spacing: 2) {
                    ForEach([("E", 5), ("G", 7), ("H", 9)], id: \.0) { w, rpe in
                        Button {
                            haptic()
                            model.act("feeder", ["ex": ex.idx, "set": i, "rpe": rpe])
                        } label: {
                            Text(w).font(.caption2.weight(.bold)).frame(maxWidth: .infinity).frame(height: 36)
                                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(width: 58)
            } else {
                Button {
                    model.act("rate", ["ex": ex.idx, "set": i])
                } label: {
                    Text(s.rate ?? "rate").font(.system(size: 11, weight: .bold)).lineLimit(2).minimumScaleFactor(0.7)
                        .frame(width: 58, height: 36)
                        .foregroundStyle(s.failure ? Color.green : s.limiter ? accent : Color.secondary)
                        .background((s.failure ? Color.green : s.limiter ? accent : Color.primary).opacity(s.failure || s.limiter ? 0.15 : 0.08),
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            Button {
                haptic()
                model.act("grip", ["ex": ex.idx, "set": i])
            } label: {
                Text(s.grip ?? "—").font(.system(size: 9, weight: .bold)).lineLimit(1).minimumScaleFactor(0.6)
                    .frame(width: 32, height: 36)
                    .foregroundStyle(s.grip == nil ? Color.secondary : accent)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            .buttonStyle(.plain)
            Text(s.score.map { String($0) } ?? "–")
                .font(.caption.weight(.heavy)).monospacedDigit()
                .foregroundStyle(s.scoreColor.map { Color(somaHex: $0) } ?? .secondary)
                .frame(width: 24)
            Button {
                UIImpactFeedbackGenerator(style: s.done ? .light : .medium).impactOccurred()
                model.act("check", ["ex": ex.idx, "set": i, "done": !s.done])
            } label: {
                Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(s.done ? Color.black : Color.secondary)
                    .background(s.done ? accent : Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            Button {
                model.act("removeSet", ["ex": ex.idx, "set": i])
            } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.red.opacity(0.85))
                    .frame(width: 18, height: 36)
            }
            .buttonStyle(.plain)
        }
        .padding(3)
        .background(s.done ? accent.opacity(0.1) : s.type == "dropset" ? Color.orange.opacity(0.08) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .opacity(s.type == "warmup" ? 0.75 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: s.done)
    }
}

@available(iOS 16.0, *)
struct ExerciseCard: View {
    @EnvironmentObject var model: TrainModel
    let ex: TEx

    var body: some View {
        let unit = model.data.unit ?? "kg"
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(ex.name).font(.headline)
                        if !ex.badges.isEmpty {
                            HStack(spacing: 4) {
                                ForEach(ex.badges, id: \.self) { b in Pill(text: b.text, color: toneColor(b.tone)) }
                            }
                        }
                    }
                    Spacer()
                    if let r = ex.rating {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text("\(r.score)").font(.subheadline.weight(.heavy)).monospacedDigit()
                                .foregroundStyle(r.color.map { Color(somaHex: $0) } ?? .primary)
                            Text(r.sub).font(.system(size: 8)).foregroundStyle(.secondary)
                        }
                    }
                    Button { model.act("superset", ["ex": ex.idx]) } label: { Image(systemName: "link") }
                        .buttonStyle(.plain).frame(width: 32, height: 32)
                    Button { model.act("removeExercise", ["ex": ex.idx]) } label: { Image(systemName: "trash").foregroundStyle(.red) }
                        .buttonStyle(.plain).frame(width: 32, height: 32)
                }

                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ex.target.text).font(.caption.weight(.bold))
                        if !ex.target.note.isEmpty { Text(ex.target.note).font(.caption2).foregroundStyle(.secondary) }
                        if let a = ex.target.auto { Text(a).font(.caption2).foregroundStyle(.cyan) }
                    }
                    Spacer(minLength: 6)
                    Pill(text: ex.target.tier, color: toneColor(ex.target.tone))
                }
                .padding(10)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                if let last = ex.last {
                    Text(last).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }

                if !ex.alts.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Fresher options").font(.caption.weight(.bold)).foregroundStyle(.orange)
                        ForEach(ex.alts, id: \.self) { a in
                            Button { model.act("swap", ["ex": ex.idx, "name": a.name]) } label: {
                                HStack {
                                    Text(a.name).font(.caption.weight(.bold))
                                    Spacer()
                                    Text(a.note).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                                }
                                .padding(8)
                                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Text("SET").frame(width: 30)
                    Text(unit.uppercased()).frame(maxWidth: .infinity)
                    Text("REPS").frame(maxWidth: .infinity)
                    Text("RPE").frame(width: 58)
                    Text("GRIP").frame(width: 32)
                    Text("PTS").frame(width: 24)
                    Spacer().frame(width: 58)
                }
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 3)

                ForEach(Array(ex.sets.enumerated()), id: \.offset) { i, s in
                    SetRow(ex: ex, s: s, i: i)
                }

                HStack(spacing: 8) {
                    GlassButton(title: "Add set", systemImage: "plus") { model.act("addSet", ["ex": ex.idx]) }
                    GlassButton(title: "Drop set", systemImage: "arrow.down.right") { model.act("addSet", ["ex": ex.idx, "kind": "dropset"]) }
                }
                if ex.canFeeder {
                    GlassButton(title: "Auto-fill feeder ramp (50/70/87.5%)") { model.act("feederRamp", ["ex": ex.idx]) }
                }
                HStack(spacing: 6) {
                    Text("PUMP").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    ForEach(1...3, id: \.self) { n in
                        let on = ex.pump == n
                        Button {
                            haptic()
                            model.act("pump", ["ex": ex.idx, "n": n])
                        } label: {
                            Text(["light", "solid", "full"][n - 1]).font(.caption.weight(.bold))
                                .frame(maxWidth: .infinity).frame(height: 32)
                                .foregroundStyle(on ? Color.black : Color.secondary)
                                .background(on ? Color(red: 0.83, green: 0.99, blue: 0.31) : Color.primary.opacity(0.08),
                                            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .overlay(alignment: .leading) {
            if let c = ex.supersetColor {
                RoundedRectangle(cornerRadius: 2).fill(Color(somaHex: c)).frame(width: 4).padding(.vertical, 18)
            }
        }
    }
}

@available(iOS 16.0, *)
struct RestCard: View {
    @EnvironmentObject var model: TrainModel

    var body: some View {
        GlassCard {
            HStack(spacing: 14) {
                TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
                    let ends = model.data.rest?.endsAt.map { Date(timeIntervalSince1970: $0 / 1000) }
                    let total = max(1, model.data.rest?.total ?? 90)
                    let left = max(0, ends.map { $0.timeIntervalSince(ctx.date) } ?? 0)
                    ZStack {
                        Circle().stroke(Color.primary.opacity(0.12), lineWidth: 5)
                        Circle().trim(from: 0, to: left > 0 ? left / total : 0)
                            .stroke(Color(red: 0.83, green: 0.99, blue: 0.31), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 0.5), value: left)
                        Text(left >= 60 ? String(format: "%d:%02d", Int(left) / 60, Int(left) % 60) : "\(Int(left.rounded(.up)))s")
                            .font(.caption.weight(.heavy)).monospacedDigit()
                    }
                    .frame(width: 56, height: 56)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rest").font(.subheadline.weight(.bold))
                    Text("Starts when you tick a set").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                HStack(spacing: 6) {
                    smallButton("60s") { model.act("rest", ["sec": 60]) }
                    smallButton("90s") { model.act("rest", ["sec": 90]) }
                    smallButton("Stop", tint: .red) { model.act("stopRest") }
                }
            }
        }
    }

    private func smallButton(_ t: String, tint: Color? = nil, action: @escaping () -> Void) -> some View {
        Button {
            haptic()
            action()
        } label: {
            Text(t).font(.caption.weight(.bold)).foregroundStyle(tint ?? .primary)
                .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .buttonStyle(PressStyle())
        .somaGlass(14, interactive: true)
    }
}

@available(iOS 16.0, *)
struct ReadinessCard: View {
    @EnvironmentObject var model: TrainModel
    let r: TReady
    @State private var soreness: Double = 3
    @State private var stress: Double = 3

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Before you start").font(.headline)
                    Spacer()
                    Text("OPTIONAL").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                }
                Text(r.note).font(.caption).foregroundStyle(.secondary)
                Text("Soreness \(Int(soreness))").font(.caption.weight(.bold))
                Slider(value: $soreness, in: 1...5, step: 1)
                Text("Stress \(Int(stress))").font(.caption.weight(.bold))
                Slider(value: $stress, in: 1...5, step: 1)
                HStack(spacing: 8) {
                    GlassButton(title: "Skip") { model.act("skipReadiness") }
                    GlassButton(title: "Save", prominent: true) {
                        model.act("readiness", ["soreness": Int(soreness), "stress": Int(stress)])
                    }
                }
            }
        }
        .onAppear {
            soreness = Double(r.soreness)
            stress = Double(r.stress)
        }
    }
}

@available(iOS 16.0, *)
struct AddExerciseSheet: View {
    @EnvironmentObject var model: TrainModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        let lib = model.data.library ?? []
        let q = query.lowercased()
        let shown = q.isEmpty ? lib : lib.filter { $0.name.lowercased().contains(q) || $0.sub.lowercased().contains(q) }
        NavigationStack {
            List(shown.prefix(80), id: \.self) { ex in
                Button {
                    haptic()
                    model.act("add", ["name": ex.name])
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ex.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                        Text(ex.sub).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search name or muscle")
            .navigationTitle("Add movement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { model.act("custom") }
                    } label: { Label("Custom", systemImage: "plus") }
                }
            }
        }
        .presentationDetents([.large])
    }
}

@available(iOS 16.0, *)
struct TrainRoot: View {
    @ObservedObject var model: TrainModel
    @State private var adding = false
    @State private var confirmSave = false

    var body: some View {
        let d = model.data
        NavigationStack {
        ScrollView {
            VStack(spacing: 12) {
                header(d)
                toolbarRow(d)
                statsGrid(d)
                RestCard()
                actions(d)
                if let r = d.readiness { ReadinessCard(r: r) }
                if (d.exercises ?? []).isEmpty {
                    GlassCard {
                        VStack(spacing: 6) {
                            Image(systemName: "timer").font(.title).foregroundStyle(.secondary)
                            Text("Empty session").font(.headline)
                            Text("Load today's split or add a movement to start logging.")
                                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                    }
                }
                ForEach(d.exercises ?? []) { ex in ExerciseCard(ex: ex) }
            }
            .padding(.horizontal, 16)
            .padding(.top, model.top + 8)
            .padding(.bottom, model.bottom + 20)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(HomeBackdrop(accent: Color(red: 0.75, green: 0.35, blue: 0.95)))
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
        .environmentObject(model)
        .sheet(isPresented: $adding) { AddExerciseSheet().environmentObject(model) }
        .confirmationDialog(d.clash ?? "", isPresented: $confirmSave, titleVisibility: .visible) {
            Button("Save and replace", role: .destructive) { model.act("save", ["confirmed": true]) }
        }
    }

    private func header(_ d: TrainPayload) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    Pill(text: d.badge ?? "", color: Color(red: 0.83, green: 0.99, blue: 0.31))
                    Spacer()
                    Pill(text: d.phaseBadge ?? "", color: (d.deload ?? false) ? .orange : .secondary)
                }
                Text(d.split ?? "").font(.system(size: 24, weight: .heavy)).lineLimit(2)
                Text(d.phase ?? "").font(.caption).foregroundStyle(.secondary)
                LogAsPicker(logAs: d.logAs ?? "", today: d.today ?? "")
                if let c = d.clash {
                    Text(c).font(.caption2.weight(.bold)).foregroundStyle(.orange)
                }
            }
        }
    }

    private func toolbarRow(_ d: TrainPayload) -> some View {
        HStack(spacing: 8) {
            Button { haptic(); model.act("undo") } label: { Image(systemName: "arrow.uturn.backward").frame(width: 40, height: 40) }
                .buttonStyle(PressStyle()).somaGlass(20, interactive: true)
            Button { haptic(); model.act("redo") } label: { Image(systemName: "arrow.uturn.forward").frame(width: 40, height: 40) }
                .buttonStyle(PressStyle()).somaGlass(20, interactive: true)
            Spacer()
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let start = d.firstSetAt.map { Date(timeIntervalSince1970: $0 / 1000) }
                let s = max(0, Int(start.map { ctx.date.timeIntervalSince($0) } ?? 0))
                Text(String(format: "%02d:%02d", s / 60, s % 60))
                    .font(.system(size: 16, weight: .heavy, design: .rounded)).monospacedDigit()
                    .foregroundStyle(Color(red: 0.83, green: 0.99, blue: 0.31))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .somaGlass(16)
            }
        }
    }

    private func statsGrid(_ d: TrainPayload) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(d.stats ?? [], id: \.self) { s in
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.label.uppercased()).font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary).lineLimit(1)
                    Text(s.value).font(.system(size: 21, weight: .heavy, design: .rounded)).monospacedDigit()
                        .foregroundStyle(s.color.map { Color(somaHex: $0) } ?? .primary)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    if let h = s.hint { Text(h).font(.system(size: 10)).foregroundStyle(.secondary) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .somaGlass(18)
            }
        }
    }

    private func actions(_ d: TrainPayload) -> some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(d.routines ?? [], id: \.self) { r in
                    Button("\(r.name)  ·  \(r.count)") { haptic(); model.act("loadSplit", ["name": r.name]) }
                }
            } label: {
                Text("Load split").font(.subheadline.weight(.bold)).frame(maxWidth: .infinity).padding(.vertical, 11)
            }
            .somaGlass(16, interactive: true)
            GlassButton(title: "Add", systemImage: "magnifyingglass") { adding = true }
            GlassButton(title: "Save log", prominent: true) {
                if d.clash != nil { confirmSave = true } else { model.act("save", ["confirmed": true]) }
            }
        }
    }
}

@available(iOS 16.0, *)
struct LogAsPicker: View {
    @EnvironmentObject var model: TrainModel
    let logAs: String
    let today: String
    @State private var date = Date()

    var body: some View {
        HStack {
            Text("LOG AS").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
            DatePicker("", selection: $date, in: ...DK.date(today.isEmpty ? DK.key(Date()) : today), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
        }
        .onAppear { date = DK.date(logAs) }
        .onChange(of: logAs) { k in date = DK.date(k) }
        .onChange(of: date) { d in
            let k = DK.key(d)
            if k != logAs { model.act("logAs", ["date": k]) }
        }
    }
}

/// Hosts TrainRoot above the web view and below the bars.
@available(iOS 16.0, *)
final class TrainController {
    let model = TrainModel()
    let hosting: UIHostingController<TrainRoot>
    private var hiddenByOverlay = false

    init() {
        hosting = UIHostingController(rootView: TrainRoot(model: model))
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
            model.data = try JSONDecoder().decode(TrainPayload.self, from: data)
            refresh()
        } catch {
            NSLog("SOMA train payload: \(error)")
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
