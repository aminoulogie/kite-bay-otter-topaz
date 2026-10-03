import UIKit
import WebKit
import Capacitor

// ==========================================================================
// Native chrome: real Liquid Glass around the web app.
//
// Liquid Glass — the refraction, the iOS 27 edge and highlights — exists only
// in UIKit; CSS can blur but cannot bend light. So the top bar is a real
// UINavigationBar with glass buttons, and the dock is a native view made of
// Apple's own glass material (UIGlassEffect on iOS 26+), holding every tab in
// a scrolling row with SOMA's own icons. The web app sits BEHIND both as one
// full-screen layer, so the glass samples it.
//
// ChromeWindow passes touches that land on transparent containers through
// to the web view. The bars' heights, and the window's safe area, reach the
// page as an "insets" event.
//
// The web app talks to this through NativeChromePlugin: the tabs and their
// icons, the state (tab, date, theme…), and whether a web overlay is open
// (the chrome fades out under panels and sheets). Taps come back as
// "action" events.
// ==========================================================================

struct ChromeState {
    var tab = "dashboard"
    var title = "Today"
    var date = ""
    var isToday = true
    var canEdit = false
    var editing = false
    var accent = "#d3fd50"
    var theme = "dark"
    /// 0 = solid, 0.5 = standard glass, 1 = clearest glass.
    var dockTransparency = 0.5
    /// 0.8 to 1.25.
    var dockScale = 1.0
}

struct ChromeTab {
    let id: String
    let title: String
    let icon: UIImage?
}

@objc(NativeChromePlugin)
public class NativeChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeChromePlugin"
    public let jsName = "NativeChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTabs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHidden", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHabits", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openHabits", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTrain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toast", returnType: CAPPluginReturnPromise),
    ]

    static weak var shared: NativeChromePlugin?

    public override func load() {
        NativeChromePlugin.shared = self
    }

    /// Whether the native chrome is actually up. The page keeps its own web
    /// header and dock unless this says yes.
    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let chrome = ChromeController.current else {
                call.resolve(["active": false])
                return
            }
            chrome.publishInsets(force: true)
            call.resolve(["active": true, "habits": chrome.hasNativeHabits, "home": chrome.hasNativeHome, "train": chrome.hasNativeTrain])
        }
    }

    /// [{ id, title, icon: "data:image/png;base64,…" }] in dock order.
    @objc func setTabs(_ call: CAPPluginCall) {
        let raw = call.getArray("tabs", JSObject.self) ?? []
        let tabs: [ChromeTab] = raw.compactMap { o in
            guard let id = o["id"] as? String else { return nil }
            let title = o["title"] as? String ?? id
            var image: UIImage?
            if let uri = o["icon"] as? String, let comma = uri.firstIndex(of: ",") {
                let b64 = String(uri[uri.index(after: comma)...])
                if let data = Data(base64Encoded: b64), let img = UIImage(data: data, scale: 3) {
                    image = img.withRenderingMode(.alwaysTemplate)
                }
            }
            return ChromeTab(id: id, title: title, icon: image)
        }
        DispatchQueue.main.async {
            ChromeController.current?.dock.setTabs(tabs)
            call.resolve()
        }
    }

    @objc func setState(_ call: CAPPluginCall) {
        var s = ChromeState()
        s.tab = call.getString("tab") ?? s.tab
        s.title = call.getString("title") ?? s.title
        s.date = call.getString("date") ?? s.date
        s.isToday = call.getBool("isToday") ?? s.isToday
        s.canEdit = call.getBool("canEdit") ?? s.canEdit
        s.editing = call.getBool("editing") ?? s.editing
        s.accent = call.getString("accent") ?? s.accent
        s.theme = call.getString("theme") ?? s.theme
        s.dockTransparency = call.getDouble("dockTransparency") ?? s.dockTransparency
        s.dockScale = call.getDouble("dockScale") ?? s.dockScale
        DispatchQueue.main.async {
            ChromeController.current?.apply(s)
            call.resolve()
        }
    }

    @objc func setHidden(_ call: CAPPluginCall) {
        let hidden = call.getBool("hidden") ?? false
        DispatchQueue.main.async {
            ChromeController.current?.setChromeHidden(hidden)
            call.resolve()
        }
    }

    /// The native Habits panel's data, as JSON (see habits-native.ts).
    @objc func setHabits(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? ""
        DispatchQueue.main.async {
            ChromeController.current?.updateHabits(json: json)
            call.resolve()
        }
    }

    /// The native Home's cards, as JSON (see NativeHomeBridge.tsx).
    @objc func setHome(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? ""
        DispatchQueue.main.async {
            ChromeController.current?.updateHome(json: json)
            call.resolve()
        }
    }

    @objc func setTrain(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? ""
        DispatchQueue.main.async {
            ChromeController.current?.updateTrain(json: json)
            call.resolve()
        }
    }

    @objc func toast(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let text = call.getString("text") ?? ""
        let kind = call.getString("kind") ?? "message"
        let action = call.getString("action")
        DispatchQueue.main.async {
            ChromeController.current?.showToast(id: id, text: text, kind: kind, action: action)
            call.resolve()
        }
    }

    @objc func openHabits(_ call: CAPPluginCall) {
        let open = call.getBool("open") ?? false
        DispatchQueue.main.async {
            ChromeController.current?.setHabitsOpen(open)
            call.resolve()
        }
    }

    func send(_ data: [String: Any]) {
        notifyListeners("action", data: data)
    }
}

/// Lets touches that land on transparent containers reach the web view
/// behind them. Anything on a bar, the dock, a control or a sheet is kept.
final class ChromeWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        guard let chrome = ChromeController.current, let web = chrome.bridgeVC.view else { return hit }
        var v: UIView? = hit
        while let cur = v, cur !== chrome.view {
            if cur === web { return hit }
            if chrome.nativeRoots.contains(where: { $0 === cur }) { return hit }
            if cur is ChromeDock || cur is ToastView || cur is UIControl || cur is UINavigationBar || cur is UIToolbar { return hit }
            let name = NSStringFromClass(type(of: cur))
            if name.contains("Bar") || name.contains("Button") { return hit }
            v = cur.superview
        }
        if v == nil { return hit } // outside the chrome: a presented sheet
        return web.hitTest(web.convert(point, from: self), with: event) ?? web
    }
}

/// The glass material: Liquid Glass when built with the iOS 26 SDK and
/// running on iOS 26+, the system chrome blur otherwise.
func makeGlass(interactive: Bool = false, tint: UIColor? = nil, clear: Bool = false) -> UIVisualEffectView {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
        let g = UIGlassEffect(style: clear ? .clear : .regular)
        g.isInteractive = interactive
        g.tintColor = tint
        return UIVisualEffectView(effect: g)
    }
    #endif
    let v = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
    if let tint {
        v.contentView.backgroundColor = tint
    }
    return v
}

/// Every tab in one scrolling glass capsule, with a glass pill under the
/// selected one that springs between them.
final class ChromeDock: UIView {
    var onSelect: ((String) -> Void)?

    private var glass = makeGlass()
    /// A wash over the glass that makes it more solid as transparency drops.
    private let shade = UIView()
    private let scroll = UIScrollView()
    private let stack = UIStackView()
    private var pill = makeGlass(interactive: true)
    private var buttons: [String: DockButton] = [:]
    private var order: [String] = []
    private(set) var selected = ""
    private var accent = UIColor(somaHex: "#d3fd50")
    private var tabs: [ChromeTab] = []
    private(set) var scale: CGFloat = 1
    private var transparency: CGFloat = 0.5
    private var clearStyle = false

    static let baseHeight: CGFloat = 64
    var height: CGFloat { ChromeDock.baseHeight * scale }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.25
        layer.shadowRadius = 18
        layer.shadowOffset = CGSize(width: 0, height: 8)

        installGlass()

        scroll.showsHorizontalScrollIndicator = false
        scroll.showsVerticalScrollIndicator = false
        scroll.alwaysBounceHorizontal = true
        scroll.alwaysBounceVertical = false
        scroll.isDirectionalLockEnabled = true
        // The dock sits over the home-indicator zone, and an automatic inset
        // would add that zone INSIDE the row — shifting the icons up and
        // letting them scroll vertically. The row is exactly the capsule.
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.clipsToBounds = true
        scroll.frame = bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        glass.contentView.addSubview(scroll)

        pill.layer.cornerCurve = .continuous
        pill.clipsToBounds = true
        pill.isUserInteractionEnabled = false
        scroll.addSubview(pill)

        stack.axis = .horizontal
        stack.alignment = .fill
        stack.distribution = .fill
        stack.spacing = 2
        scroll.addSubview(stack)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    /// The glass layer, rebuilt when the style switches between regular and
    /// clear (the effect's style cannot change in place).
    private func installGlass() {
        let old = glass
        let fresh = makeGlass(clear: clearStyle)
        fresh.frame = bounds
        fresh.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        fresh.layer.cornerCurve = .continuous
        fresh.clipsToBounds = true
        shade.frame = fresh.contentView.bounds
        shade.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shade.isUserInteractionEnabled = false
        fresh.contentView.addSubview(shade)
        if scroll.superview != nil {
            fresh.contentView.addSubview(scroll)
        }
        insertSubview(fresh, at: 0)
        if old !== fresh && old.superview != nil { old.removeFromSuperview() }
        glass = fresh
        applyShade()
    }

    private func applyShade() {
        // Below the middle the glass fills in towards solid; above it, the
        // clear style takes over.
        let solid = max(0, 0.5 - transparency) / 0.5
        shade.backgroundColor = UIColor.systemBackground.withAlphaComponent(solid * 0.9)
    }

    /// Transparency 0…1 and size 0.8…1.25, from Setup.
    func setStyle(transparency t: CGFloat, scale sc: CGFloat) {
        transparency = min(1, max(0, t))
        let wantClear = transparency > 0.75
        if wantClear != clearStyle {
            clearStyle = wantClear
            installGlass()
        } else {
            applyShade()
        }
        let newScale = min(1.25, max(0.8, sc))
        if abs(newScale - scale) > 0.001 {
            scale = newScale
            setTabs(tabs)
        }
    }

    func setTabs(_ tabs: [ChromeTab]) {
        self.tabs = tabs
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        buttons = [:]
        order = tabs.map { $0.id }
        for t in tabs {
            let b = DockButton(tab: t, scale: scale)
            b.addTarget(self, action: #selector(tapped(_:)), for: .touchUpInside)
            stack.addArrangedSubview(b)
            buttons[t.id] = b
        }
        setNeedsLayout()
        layoutIfNeeded()
        select(selected, animated: false)
    }

    func setAccent(_ c: UIColor) {
        accent = c
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let g = UIGlassEffect()
            g.isInteractive = true
            g.tintColor = c.withAlphaComponent(0.22)
            pill.effect = g
        }
        #endif
        refreshColors()
    }

    @objc private func tapped(_ b: DockButton) {
        guard b.tabId != selected else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        select(b.tabId, animated: true)
        onSelect?(b.tabId)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let inset: CGFloat = 6 * scale
        let h = bounds.height
        glass.layer.cornerRadius = h / 2
        pill.layer.cornerRadius = (h - inset * 2) / 2
        stack.layoutIfNeeded()
        let w = stack.systemLayoutSizeFitting(CGSize(width: UIView.layoutFittingCompressedSize.width, height: h - inset * 2)).width
        // Few tabs centre in the capsule; many scroll.
        let contentW = max(w + inset * 2, bounds.width)
        stack.frame = CGRect(x: (contentW - w) / 2, y: inset, width: w, height: h - inset * 2)
        scroll.contentSize = CGSize(width: contentW, height: h)
        scroll.contentInset = .zero
        if abs(scroll.contentOffset.y) > 0.5 {
            scroll.contentOffset = CGPoint(x: scroll.contentOffset.x, y: 0)
        }
        placePill(animated: false)
    }

    func select(_ id: String, animated: Bool) {
        selected = id
        refreshColors()
        placePill(animated: animated)
        if let b = buttons[id] {
            let f = b.convert(b.bounds, to: scroll).insetBy(dx: -60, dy: 0)
            scroll.scrollRectToVisible(f, animated: animated)
        }
    }

    private func refreshColors() {
        for (id, b) in buttons {
            b.tintColor = id == selected ? accent : .label
        }
    }

    private func placePill(animated: Bool) {
        guard let b = buttons[selected] else {
            pill.alpha = 0
            return
        }
        let target = b.convert(b.bounds, to: scroll)
        let apply = {
            self.pill.alpha = 1
            self.pill.frame = target
        }
        if animated {
            UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.72, initialSpringVelocity: 0.4,
                           options: [.beginFromCurrentState, .allowUserInteraction], animations: apply)
        } else {
            apply()
        }
    }
}

final class DockButton: UIControl {
    let tabId: String
    private let icon = UIImageView()
    private let label = UILabel()

    init(tab: ChromeTab, scale: CGFloat) {
        tabId = tab.id
        super.init(frame: .zero)
        accessibilityLabel = tab.title
        accessibilityTraits = .button
        isAccessibilityElement = true
        icon.image = tab.icon
        icon.contentMode = .scaleAspectFit
        icon.isUserInteractionEnabled = false
        label.text = tab.title
        label.font = UIFont.systemFont(ofSize: 10.5 * scale, weight: .semibold)
        label.textAlignment = .center
        label.isUserInteractionEnabled = false
        let v = UIStackView(arrangedSubviews: [icon, label])
        v.axis = .vertical
        v.alignment = .center
        v.spacing = 3
        v.isUserInteractionEnabled = false
        v.translatesAutoresizingMaskIntoConstraints = false
        addSubview(v)
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 22 * scale),
            icon.heightAnchor.constraint(equalToConstant: 22 * scale),
            v.centerXAnchor.constraint(equalTo: centerXAnchor),
            v.centerYAnchor.constraint(equalTo: centerYAnchor),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 64 * scale),
            widthAnchor.constraint(greaterThanOrEqualTo: v.widthAnchor, constant: 16),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        icon.tintColor = tintColor
        label.textColor = tintColor
    }

    override var isHighlighted: Bool {
        didSet {
            UIView.animate(withDuration: 0.18) {
                self.transform = self.isHighlighted ? CGAffineTransform(scaleX: 0.9, y: 0.9) : .identity
            }
        }
    }
}

final class ChromeController: UIViewController {
    static weak var current: ChromeController?

    let bridgeVC: CAPBridgeViewController
    let dock = ChromeDock()
    private var nav: UINavigationController!
    private var host: HostViewController!
    private(set) var state = ChromeState()
    private var chromeHidden = false
    private var lastSent: [Double] = []
    /// Native views that take their own touches (the Habits panel).
    var nativeRoots: [UIView] = []
    private var habitsPanel: AnyObject?
    var hasNativeHabits: Bool { habitsPanel != nil }
    private var home: AnyObject?
    var hasNativeHome: Bool { home != nil }
    private var train: AnyObject?
    var hasNativeTrain: Bool { train != nil }
    private var currentToast: ToastView?

    var plugin: NativeChromePlugin? { NativeChromePlugin.shared }

    init(bridge: CAPBridgeViewController) {
        bridgeVC = bridge
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        ChromeController.current = self
        view.backgroundColor = UIColor(red: 0.043, green: 0.047, blue: 0.063, alpha: 1)
        overrideUserInterfaceStyle = .dark

        // The web app, at the back.
        addChild(bridgeVC)
        bridgeVC.view.frame = view.bounds
        bridgeVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(bridgeVC.view)
        bridgeVC.didMove(toParent: self)

        // The native Home, over the web view and under the bars.
        if #available(iOS 16.0, *), let web = bridgeVC.view {
            let h = HomeController()
            h.model.send = { [weak self] data in self?.plugin?.send(data) }
            h.install(in: self, above: web)
            home = h
            let t = TrainController()
            t.model.send = { [weak self] data in self?.plugin?.send(data) }
            t.install(in: self, above: h.hosting.view)
            train = t
        }

        // The top bar.
        host = HostViewController(chrome: self)
        nav = UINavigationController(rootViewController: host)
        nav.view.backgroundColor = .clear
        addChild(nav)
        nav.view.frame = view.bounds
        nav.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(nav.view)
        nav.didMove(toParent: self)
        if #available(iOS 15.0, *), let scroll = bridgeVC.webView?.scrollView {
            host.setContentScrollView(scroll, for: .top)
        }

        // The dock.
        dock.onSelect = { [weak self] id in
            self?.send("tab", ["tab": id])
        }
        view.addSubview(dock)
        host.configure(state)

        if #available(iOS 16.0, *) {
            let panel = HabitsPanelController(host: self)
            panel.model.send = { [weak self] data in self?.plugin?.send(data) }
            panel.onOpenChange = { [weak self] open in self?.send("habitsOpen", ["open": open]) }
            panel.install()
            nativeRoots = panel.touchRoots
            habitsPanel = panel
        }
        if #available(iOS 16.0, *), let h = home as? HomeController {
            nativeRoots.append(h.hosting.view)
        }
        if #available(iOS 16.0, *), let t = train as? TrainController {
            nativeRoots.append(t.hosting.view)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaInsets
        let side: CGFloat = 14
        let bottom = max(safe.bottom - 8, 10)
        dock.frame = CGRect(x: side, y: view.bounds.height - bottom - dock.height,
                            width: view.bounds.width - side * 2, height: dock.height)
        publishInsets(force: false)
        if #available(iOS 16.0, *) {
            (habitsPanel as? HabitsPanelController)?.layout()
        }
    }

    func updateTrain(json: String) {
        if #available(iOS 16.0, *) {
            (train as? TrainController)?.update(json: json)
        }
    }

    /// A glass banner at the top for each toast, with its action if it has one.
    func showToast(id: String, text: String, kind: String, action: String?) {
        currentToast?.dismiss()
        let t = ToastView(text: text, kind: kind, action: action) { [weak self] in
            self?.send("toastAction", ["id": id])
        }
        currentToast = t
        view.addSubview(t)
        let w = min(view.bounds.width - 32, 420)
        let top = max(view.safeAreaInsets.top, 20) + 6
        t.frame = CGRect(x: (view.bounds.width - w) / 2, y: top, width: w, height: 52)
        t.present()
        if kind == "error" {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } else if kind == "success" {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    func updateHome(json: String) {
        if #available(iOS 16.0, *) {
            (home as? HomeController)?.update(json: json)
        }
    }

    func updateHabits(json: String) {
        if #available(iOS 16.0, *) {
            (habitsPanel as? HabitsPanelController)?.update(json: json)
        }
    }

    func setHabitsOpen(_ open: Bool) {
        if #available(iOS 16.0, *), let panel = habitsPanel as? HabitsPanelController, panel.isOpen != open {
            panel.setOpen(open, animated: true)
        }
    }

    // MARK: Insets to the page

    func publishInsets(force: Bool) {
        let top = nav.navigationBar.convert(nav.navigationBar.bounds, to: view).maxY
        let bottom = view.bounds.height - dock.frame.minY
        let safe = view.safeAreaInsets
        let values = [Double(top), Double(bottom), Double(safe.top), Double(safe.bottom)]
        if #available(iOS 16.0, *) {
            (home as? HomeController)?.setInsets(top: top, bottom: bottom)
            (train as? TrainController)?.setInsets(top: top, bottom: bottom)
        }
        if !force && values == lastSent { return }
        lastSent = values
        plugin?.send([
            "type": "insets",
            "top": values[0], "bottom": values[1],
            "safeTop": values[2], "safeBottom": values[3],
        ])
    }

    // MARK: State from the page

    func apply(_ s: ChromeState) {
        let old = state
        state = s
        if dock.selected != s.tab { dock.select(s.tab, animated: true) }
        if old.accent != s.accent { dock.setAccent(UIColor(somaHex: s.accent)) }
        if old.dockTransparency != s.dockTransparency || old.dockScale != s.dockScale {
            dock.setStyle(transparency: CGFloat(s.dockTransparency), scale: CGFloat(s.dockScale))
            view.setNeedsLayout()
        }
        if old.theme != s.theme {
            overrideUserInterfaceStyle = s.theme == "light" ? .light : .dark
        }
        host.configure(s)
    }

    /// Chrome fades while a web panel or sheet covers the page — alpha only,
    /// so the layout the page sits in never changes.
    func setChromeHidden(_ hidden: Bool) {
        guard hidden != chromeHidden else { return }
        chromeHidden = hidden
        if #available(iOS 16.0, *) {
            (home as? HomeController)?.setOverlay(hidden)
            (train as? TrainController)?.setOverlay(hidden)
        }
        let views: [UIView] = [dock, nav.navigationBar]
        views.forEach { $0.isUserInteractionEnabled = !hidden }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            views.forEach { $0.alpha = hidden ? 0 : 1 }
        }
    }

    // MARK: Actions

    func send(_ type: String, _ extra: [String: Any] = [:]) {
        var data = extra
        data["type"] = type
        plugin?.send(data)
    }

    func presentDatePicker() {
        let picker = DatePickerController(dateKey: state.date) { [weak self] key in
            self?.send("date", ["date": key])
        }
        let sheetNav = UINavigationController(rootViewController: picker)
        if #available(iOS 15.0, *), let sheet = sheetNav.sheetPresentationController {
            if #available(iOS 16.0, *) {
                sheet.detents = [.custom { _ in 300 }]
            } else {
                sheet.detents = [.medium()]
            }
            sheet.prefersGrabberVisible = true
        }
        present(sheetNav, animated: true)
    }
}

/// The top bar. Transparent: the page shows through it.
final class HostViewController: UIViewController {
    weak var chrome: ChromeController?
    private let titleButton = UIButton(type: .system)
    private var itemsKey = ""

    init(chrome: ChromeController) {
        self.chrome = chrome
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func loadView() {
        let v = UIView()
        v.backgroundColor = .clear
        view = v
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.largeTitleDisplayMode = .never

        let prev = UIButton(type: .system)
        prev.setImage(UIImage(systemName: "chevron.left", withConfiguration: UIImage.SymbolConfiguration(weight: .semibold)), for: .normal)
        prev.tintColor = .secondaryLabel
        prev.accessibilityLabel = "Previous day"
        prev.addTarget(self, action: #selector(prevDay), for: .touchUpInside)

        let next = UIButton(type: .system)
        next.setImage(UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(weight: .semibold)), for: .normal)
        next.tintColor = .secondaryLabel
        next.accessibilityLabel = "Next day"
        next.addTarget(self, action: #selector(nextDay), for: .touchUpInside)

        titleButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        titleButton.addTarget(self, action: #selector(pickDate), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [prev, titleButton, next])
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 4
        navigationItem.titleView = stack
    }

    func configure(_ s: ChromeState) {
        loadViewIfNeeded()
        titleButton.setTitle(s.title, for: .normal)
        titleButton.setTitleColor(s.isToday ? .label : .systemOrange, for: .normal)
        titleButton.accessibilityLabel = "\(s.title). Pick a day"
        titleButton.sizeToFit()
        navigationItem.titleView?.setNeedsLayout()

        // Rebuilding bar items makes the glass re-draw, so only when they change.
        let key = "\(s.canEdit)-\(s.editing)"
        if key == itemsKey { return }
        itemsKey = key

        let habits = UIBarButtonItem(image: UIImage(systemName: "target"), style: .plain, target: self, action: #selector(habits))
        habits.accessibilityLabel = "Habits"
        navigationItem.leftBarButtonItem = habits

        let calendar = UIBarButtonItem(image: UIImage(systemName: "calendar"), style: .plain, target: self, action: #selector(calendar))
        calendar.accessibilityLabel = "Calendar"
        let charts = UIBarButtonItem(image: UIImage(systemName: "chart.xyaxis.line"), style: .plain, target: self, action: #selector(charts))
        charts.accessibilityLabel = "Charts"

        var right: [UIBarButtonItem] = []
        if s.editing {
            right.append(UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(edit)))
        }
        if #available(iOS 14.0, *) {
            var actions: [UIMenuElement] = []
            if s.canEdit && !s.editing {
                actions.append(UIAction(title: "Edit layout", image: UIImage(systemName: "square.grid.2x2")) { [weak self] _ in
                    self?.chrome?.send("edit")
                })
            }
            actions.append(UIAction(title: "Save backup", image: UIImage(systemName: "square.and.arrow.down")) { [weak self] _ in
                self?.chrome?.send("backup")
            })
            let more = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: UIMenu(children: actions))
            more.accessibilityLabel = "More"
            right.append(more)
        }
        right.append(charts)
        right.append(calendar)
        navigationItem.rightBarButtonItems = right
    }

    @objc private func habits() { chrome?.send("habits") }
    @objc private func calendar() { chrome?.send("calendar") }
    @objc private func charts() { chrome?.send("charts") }
    @objc private func edit() { chrome?.send("edit") }
    @objc private func prevDay() {
        UISelectionFeedbackGenerator().selectionChanged()
        chrome?.send("step", ["by": -1])
    }
    @objc private func nextDay() {
        UISelectionFeedbackGenerator().selectionChanged()
        chrome?.send("step", ["by": 1])
    }
    @objc private func pickDate() { chrome?.presentDatePicker() }
}

/// Apple's own date wheel, in a sheet.
final class DatePickerController: UIViewController {
    private let picker = UIDatePicker()
    private let onPick: (String) -> Void
    private let start: Date

    private static let keyFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    init(dateKey: String, onPick: @escaping (String) -> Void) {
        self.onPick = onPick
        self.start = DatePickerController.keyFormat.date(from: dateKey) ?? Date()
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if #available(iOS 26.0, *) {
            view.backgroundColor = .clear
        } else {
            view.backgroundColor = .systemBackground
        }
        picker.datePickerMode = .date
        if #available(iOS 13.4, *) {
            picker.preferredDatePickerStyle = .wheels
        }
        picker.date = start
        picker.maximumDate = Calendar.current.date(byAdding: .day, value: 60, to: Date())
        picker.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(picker)
        NSLayoutConstraint.activate([
            picker.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            picker.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            picker.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
        ])

        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(cancel))
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        let today = UIBarButtonItem(title: "Today", style: .plain, target: self, action: #selector(goToday))
        navigationItem.titleView = nil
        navigationItem.title = nil
        if #available(iOS 16.0, *) {
            navigationItem.centerItemGroups = [today.creatingFixedGroup()]
            navigationItem.style = .editor
        } else {
            navigationItem.title = "Pick a day"
            navigationItem.leftBarButtonItems = [UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(cancel)), today]
        }
    }

    @objc private func cancel() { dismiss(animated: true) }

    @objc private func goToday() {
        picker.setDate(Date(), animated: true)
    }

    @objc private func done() {
        let key = DatePickerController.keyFormat.string(from: picker.date)
        dismiss(animated: true) { [onPick] in onPick(key) }
    }
}

extension UIColor {
    convenience init(somaHex hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self.init(red: 0.83, green: 0.99, blue: 0.31, alpha: 1)
            return
        }
        self.init(
            red: CGFloat((v >> 16) & 0xff) / 255,
            green: CGFloat((v >> 8) & 0xff) / 255,
            blue: CGFloat(v & 0xff) / 255,
            alpha: 1
        )
    }
}

/// A toast: a glass capsule that drops in from the top and leaves on its own.
final class ToastView: UIView {
    private let onAction: () -> Void
    private let hasAction: Bool

    init(text: String, kind: String, action: String?, onAction: @escaping () -> Void) {
        self.onAction = onAction
        self.hasAction = action != nil
        super.init(frame: .zero)
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowRadius = 16
        layer.shadowOffset = CGSize(width: 0, height: 6)

        let glass = makeGlass()
        glass.layer.cornerRadius = 26
        glass.layer.cornerCurve = .continuous
        glass.clipsToBounds = true
        glass.frame = bounds
        glass.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(glass)

        let icon = UIImageView(image: UIImage(systemName: kind == "error" ? "exclamationmark.circle.fill"
                                                : kind == "warning" ? "exclamationmark.triangle.fill"
                                                : kind == "success" ? "checkmark.circle.fill" : "info.circle.fill"))
        icon.tintColor = kind == "error" ? .systemRed : kind == "warning" ? .systemOrange : kind == "success" ? .systemGreen : .secondaryLabel
        icon.setContentHuggingPriority(.required, for: .horizontal)

        let label = UILabel()
        label.text = text
        label.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        label.numberOfLines = 2
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.8

        let stack = UIStackView(arrangedSubviews: [icon, label])
        stack.axis = .horizontal
        stack.spacing = 10
        stack.alignment = .center
        if let action {
            let b = UIButton(type: .system)
            b.setTitle(action, for: .normal)
            b.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .bold)
            b.setContentHuggingPriority(.required, for: .horizontal)
            b.addTarget(self, action: #selector(tapped), for: .touchUpInside)
            stack.addArrangedSubview(b)
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        glass.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -16),
            stack.centerYAnchor.constraint(equalTo: glass.contentView.centerYAnchor),
        ])
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dismissNow)))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    func present() {
        alpha = 0
        transform = CGAffineTransform(translationX: 0, y: -30).scaledBy(x: 0.92, y: 0.92)
        UIView.animate(withDuration: 0.5, delay: 0, usingSpringWithDamping: 0.75, initialSpringVelocity: 0.6, options: []) {
            self.alpha = 1
            self.transform = .identity
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + (hasAction ? 5 : 2.6)) { [weak self] in
            self?.dismiss()
        }
    }

    @objc private func tapped() {
        onAction()
        dismiss()
    }

    @objc private func dismissNow() { dismiss() }

    func dismiss() {
        guard superview != nil else { return }
        UIView.animate(withDuration: 0.25, animations: {
            self.alpha = 0
            self.transform = CGAffineTransform(translationX: 0, y: -20)
        }, completion: { _ in self.removeFromSuperview() })
    }
}
