import Foundation

/**
 * The rings, as the app last wrote them, in the one place the app and its
 * home-screen widget can both reach: the shared App Group container.
 *
 * Compiled into BOTH targets, so the app writes and the widget reads through
 * exactly the same code.
 *
 * The group's name is not assumed. This app is installed by a sideloader
 * that signs it with your own Apple ID, and a sideloader may rename an App
 * Group to one under your team (AltStore does, and records the new name in
 * Info.plist as ALTAppGroups). So the name is found at run time: that key
 * first, then whatever groups the installed provisioning profile grants,
 * then the name this project asks for. Both the app and its widget carry the
 * same profile groups, so they arrive at the same container.
 */
enum RingsStore {
    static let requestedGroup = "group.io.github.aminoulogie.soma"
    private static let fileName = "rings.json"

    static var groupID: String? {
        for candidate in candidates() {
            if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: candidate) != nil {
                return candidate
            }
        }
        return nil
    }

    private static func candidates() -> [String] {
        var out: [String] = []
        if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] {
            out.append(contentsOf: alt)
        }
        out.append(contentsOf: profileGroups())
        out.append(requestedGroup)
        return out
    }

    /// The App Groups the installed provisioning profile grants. The profile
    /// is a signed blob with a plain XML plist inside; the plist is all we need.
    private static func profileGroups() -> [String] {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
        else { return [] }
        let xml = data.subdata(in: start.lowerBound..<end.upperBound)
        guard let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
              let ents = plist["Entitlements"] as? [String: Any],
              let groups = ents["com.apple.security.application-groups"] as? [String]
        else { return [] }
        return groups.filter { !$0.contains("*") }
    }

    private static var fileURL: URL? {
        guard let id = groupID,
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
        else { return nil }
        return dir.appendingPathComponent(fileName)
    }

    /// True when there is a shared container to write into at all.
    static var available: Bool { fileURL != nil }

    static func write(_ json: Data) -> Bool {
        guard let url = fileURL else { return false }
        do {
            try json.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    static func read() -> RingsSnapshot? {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(RingsSnapshot.self, from: data)
    }
}

/// What the app sends: today's four rings and the week before it.
struct RingsSnapshot: Codable {
    struct Ring: Codable {
        let id: String
        let label: String
        let unit: String
        let value: Double
        let goal: Double
        let from: String
        let to: String
    }
    struct Day: Codable {
        let date: String
        /// Share of each ring's goal, outer to inner.
        let f: [Double]
    }
    /// The local day these rings are for, yyyy-MM-dd.
    let date: String
    let rings: [Ring]
    let week: [Day]
}

/**
 * The sleep clock: "going to sleep" and "I'm up", tapped on the widget or in
 * the app, kept in the shared container so both sides see the same state.
 *
 * The widget cannot reach SOMA's data (it lives in the web view), so a tap
 * there only records the moment. The app takes the recorded taps the next
 * time it opens and turns them into a logged night.
 */
enum SleepStore {
    private static let fileName = "sleep.json"

    struct Event: Codable {
        /// "sleep" or "wake".
        let kind: String
        /// Milliseconds since 1970, the same clock JavaScript uses.
        let at: Double
    }

    struct State: Codable {
        /// When the current night started, or nil while awake.
        var asleepSince: Double?
        /// Taps the app has not taken yet.
        var events: [Event]
    }

    private static var fileURL: URL? {
        guard let id = RingsStore.groupID,
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
        else { return nil }
        return dir.appendingPathComponent(fileName)
    }

    static func read() -> State {
        guard let url = fileURL, let data = try? Data(contentsOf: url),
              let state = try? JSONDecoder().decode(State.self, from: data)
        else { return State(asleepSince: nil, events: []) }
        return state
    }

    @discardableResult
    static func write(_ state: State) -> Bool {
        guard let url = fileURL, let data = try? JSONEncoder().encode(state) else { return false }
        return (try? data.write(to: url, options: .atomic)) != nil
    }

    static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    /// The widget's one button: asleep if awake, awake if asleep.
    @discardableResult
    static func toggle() -> State {
        var s = read()
        let now = nowMs()
        if s.asleepSince == nil {
            s.asleepSince = now
            s.events.append(Event(kind: "sleep", at: now))
        } else {
            s.asleepSince = nil
            s.events.append(Event(kind: "wake", at: now))
        }
        write(s)
        return s
    }
}
