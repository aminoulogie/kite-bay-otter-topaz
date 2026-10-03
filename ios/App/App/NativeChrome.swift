import UIKit
import WebKit
import Capacitor

// ==========================================================================
// Native chrome: Apple's own tab bar and navigation bars around the web app.
//
// Liquid Glass — the refraction, the morphing selection, the iOS 27 edge and
// highlights — exists only in UIKit's own controls; CSS can blur but cannot
// bend light. So the bars are real UIKit bars, and the web app sits BEHIND
// them as one full-screen layer.
//
// Layout: ChromeTabController (a UITabBarController) owns a navigation
// controller per tab, each holding a transparent HostViewController that only
// exists to carry the bar items. The Capacitor web view is a child of the tab
// controller, inserted at the very back, so every bar samples it for glass.
// ChromeWindow passes touches that land on the transparent hosts through to
// the web view. The web view's own safe area stays the window's (status bar
// and home indicator only), so the page's env() values do not change; the
// bars' real heights reach the page as an "insets" event instead.
//
// The web app talks to this through NativeChromePlugin: it sends the state
// (tab, date, theme…) and whether a web overlay is open (the bars fade out
// under panels and sheets); taps on the bars come back as "action" events.
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
}

struct ChromeTab {
    let id: String
    let title: String
    let symbol: String
}

@objc(NativeChromePlugin)
public class NativeChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeChromePlugin"
    public let jsName = "NativeChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHidden", returnType: CAPPluginReturnPromise),
    ]

    static weak var shared: NativeChromePlugin?

    public override func load() {
        NativeChromePlugin.shared = self
    }

    /// Whether the native bars are actually up. The page keeps its own web
    /// header and dock unless this says yes.
    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let chrome = ChromeTabController.current else {
                call.resolve(["active": false])
                return
            }
            chrome.publishInsets(force: true)
            call.resolve(["active": true])
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
        DispatchQueue.main.async {
            ChromeTabController.current?.apply(s)
            call.resolve()
        }
    }

    @objc func setHidden(_ call: CAPPluginCall) {
        let hidden = call.getBool("hidden") ?? false
        DispatchQueue.main.async {
            ChromeTabController.current?.setChromeHidden(hidden)
            call.resolve()
        }
    }

    func send(_ data: [String: Any]) {
        notifyListeners("action", data: data)
    }
}

/// Lets touches that land on the transparent tab hosts reach the web view
/// behind them. Anything on a bar, or on a presented sheet, is left alone.
final class ChromeWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        guard let chrome = ChromeTabController.current, let web = chrome.bridgeVC.view else { return hit }
        // Walk up from what was hit. The page, any bar or any control keeps
        // the touch; reaching the tab controller's own view through nothing
        // but transparent containers means it belongs to the page behind.
        var v: UIView? = hit
        while let cur = v, cur !== chrome.view {
            if cur === web { return hit }
            if cur is UIControl || cur is UINavigationBar || cur is UITabBar || cur is UIToolbar { return hit }
            let name = NSStringFromClass(type(of: cur))
            if name.contains("Bar") || name.contains("Glass") || name.contains("Button") { return hit }
            v = cur.superview
        }
        if v == nil { return hit } // outside the tab controller: a presented sheet
        return web.hitTest(web.convert(point, from: self), with: event) ?? web
    }
}

final class ChromeTabController: UITabBarController, UITabBarControllerDelegate {
    static weak var current: ChromeTabController?

    static let mainTabs: [ChromeTab] = [
        ChromeTab(id: "dashboard", title: "Home", symbol: "house.fill"),
        ChromeTab(id: "workout", title: "Train", symbol: "dumbbell.fill"),
        ChromeTab(id: "nutrition", title: "Fuel", symbol: "fork.knife"),
        ChromeTab(id: "time", title: "Time", symbol: "clock.fill"),
    ]
    static let moreTabs: [ChromeTab] = [
        ChromeTab(id: "insights", title: "Stats", symbol: "chart.line.uptrend.xyaxis"),
        ChromeTab(id: "money", title: "Money", symbol: "creditcard.fill"),
        ChromeTab(id: "mind", title: "Mind", symbol: "brain.head.profile"),
        ChromeTab(id: "projects", title: "Projects", symbol: "folder.fill"),
        ChromeTab(id: "looks", title: "Looks", symbol: "face.smiling"),
        ChromeTab(id: "settings", title: "Setup", symbol: "gearshape.fill"),
    ]

    let bridgeVC: CAPBridgeViewController
    private(set) var navs: [UINavigationController] = []
    private var hosts: [HostViewController] = []
    private(set) var state = ChromeState()
    private var chromeHidden = false
    private var lastInsets: (CGFloat, CGFloat) = (-1, -1)
    /// The tab bar shrinks while scrolling; the page keeps room for it at
    /// full size rather than reflowing as it does.
    private var fullBottom: CGFloat = 0
    private let selection = UISelectionFeedbackGenerator()

    var plugin: NativeChromePlugin? { NativeChromePlugin.shared }
    private var moreIndex: Int { navs.count - 1 }

    init(bridge: CAPBridgeViewController) {
        bridgeVC = bridge
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        ChromeTabController.current = self
        delegate = self
        view.backgroundColor = UIColor(red: 0.043, green: 0.047, blue: 0.063, alpha: 1)

        let items = ChromeTabController.mainTabs + [ChromeTab(id: "more", title: "More", symbol: "ellipsis")]
        for (i, t) in items.enumerated() {
            let host = HostViewController(chrome: self, tabId: t.id)
            let nav = UINavigationController(rootViewController: host)
            nav.view.backgroundColor = .clear
            nav.tabBarItem = UITabBarItem(title: t.title, image: UIImage(systemName: t.symbol), tag: i)
            hosts.append(host)
            navs.append(nav)
        }
        viewControllers = navs

        // The web app, behind everything.
        addChild(bridgeVC)
        bridgeVC.view.frame = view.bounds
        bridgeVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.insertSubview(bridgeVC.view, at: 0)
        bridgeVC.didMove(toParent: self)

        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior = .onScrollDown
        }
        #endif
        linkScrollView()
        overrideUserInterfaceStyle = .dark
        hosts.forEach { $0.configure(state) }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Keep the web view at the back: UIKit may re-add its own containers.
        if let web = bridgeVC.view, view.subviews.first !== web {
            view.sendSubviewToBack(web)
        }
        publishInsets(force: false)
    }

    /// The web view's scroll view drives the bars' scroll-edge effect and
    /// the tab bar minimising, as if it were the tab's own content.
    private func linkScrollView() {
        guard let scroll = bridgeVC.webView?.scrollView else { return }
        if #available(iOS 15.0, *) {
            for host in hosts {
                host.setContentScrollView(scroll, for: [.top, .bottom])
            }
        }
    }

    // MARK: Insets to the page

    func publishInsets(force: Bool) {
        guard let nav = selectedViewController as? UINavigationController else { return }
        // Measured even while faded out: hiding is alpha only, so the page's
        // room for the bars must not change with it.
        let top = nav.navigationBar.convert(nav.navigationBar.bounds, to: view).maxY
        fullBottom = max(fullBottom, view.bounds.height - tabBar.convert(tabBar.bounds, to: view).minY)
        let bottom = fullBottom
        if !force && abs(top - lastInsets.0) < 0.5 && abs(bottom - lastInsets.1) < 0.5 { return }
        lastInsets = (top, bottom)
        plugin?.send(["type": "insets", "top": Double(top), "bottom": Double(bottom)])
    }

    // MARK: State from the page

    func apply(_ s: ChromeState) {
        let old = state
        state = s
        if let i = ChromeTabController.mainTabs.firstIndex(where: { $0.id == s.tab }) {
            if selectedIndex != i { selectedIndex = i }
        } else if let t = ChromeTabController.moreTabs.first(where: { $0.id == s.tab }) {
            showUnderMore(t)
            if selectedIndex != moreIndex { selectedIndex = moreIndex }
        }
        tabBar.tintColor = UIColor(somaHex: s.accent)
        if old.theme != s.theme {
            overrideUserInterfaceStyle = s.theme == "light" ? .light : .dark
        }
        hosts.forEach { $0.configure(s) }
        publishInsets(force: false)
    }

    private func showUnderMore(_ t: ChromeTab) {
        let item = navs[moreIndex].tabBarItem
        item?.title = t.title
        item?.image = UIImage(systemName: t.symbol)
    }

    /// Bars fade while a web panel or sheet covers the page. A fade rather
    /// than hiding them: hiding changes the layout the page sits in.
    func setChromeHidden(_ hidden: Bool) {
        guard hidden != chromeHidden else { return }
        chromeHidden = hidden
        let bars: [UIView] = [tabBar] + navs.map { $0.navigationBar }
        bars.forEach { $0.isUserInteractionEnabled = !hidden }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            bars.forEach { $0.alpha = hidden ? 0 : 1 }
        }
    }

    // MARK: Tab selection

    func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        guard let i = navs.firstIndex(where: { $0 === viewController }) else { return true }
        if i == moreIndex {
            presentMore()
            return false
        }
        if i != selectedIndex {
            selection.selectionChanged()
            plugin?.send(["type": "tab", "tab": ChromeTabController.mainTabs[i].id])
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        publishInsets(force: true)
    }

    private func presentMore() {
        let list = MoreListController(tabs: ChromeTabController.moreTabs, current: state.tab) { [weak self] t in
            guard let self else { return }
            self.selection.selectionChanged()
            self.showUnderMore(t)
            self.selectedIndex = self.moreIndex
            self.plugin?.send(["type": "tab", "tab": t.id])
            self.publishInsets(force: true)
        }
        let nav = UINavigationController(rootViewController: list)
        if #available(iOS 15.0, *), let sheet = nav.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        present(nav, animated: true)
    }

    // MARK: Header actions

    func send(_ type: String, _ extra: [String: Any] = [:]) {
        var data = extra
        data["type"] = type
        plugin?.send(data)
    }

    func presentDatePicker() {
        let picker = DatePickerController(dateKey: state.date) { [weak self] key in
            self?.send("date", ["date": key])
        }
        let nav = UINavigationController(rootViewController: picker)
        if #available(iOS 15.0, *), let sheet = nav.sheetPresentationController {
            if #available(iOS 16.0, *) {
                sheet.detents = [.custom { _ in 300 }]
            } else {
                sheet.detents = [.medium()]
            }
            sheet.prefersGrabberVisible = true
        }
        present(nav, animated: true)
    }
}

/// One tab's navigation bar. Transparent: the page shows through it.
final class HostViewController: UIViewController {
    weak var chrome: ChromeTabController?
    let tabId: String
    private let titleButton = UIButton(type: .system)
    private var itemsKey = ""

    init(chrome: ChromeTabController, tabId: String) {
        self.chrome = chrome
        self.tabId = tabId
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

/// The tabs that do not fit in the bar.
final class MoreListController: UITableViewController {
    private let tabs: [ChromeTab]
    private let current: String
    private let onPick: (ChromeTab) -> Void

    init(tabs: [ChromeTab], current: String, onPick: @escaping (ChromeTab) -> Void) {
        self.tabs = tabs
        self.current = current
        self.onPick = onPick
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "More"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "tab")
        if #available(iOS 26.0, *) {
            tableView.backgroundColor = .clear
        }
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .close, target: self, action: #selector(close))
    }

    @objc private func close() { dismiss(animated: true) }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        tabs.count
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "tab", for: indexPath)
        let t = tabs[indexPath.row]
        if #available(iOS 14.0, *) {
            var content = cell.defaultContentConfiguration()
            content.text = t.title
            content.image = UIImage(systemName: t.symbol)
            cell.contentConfiguration = content
        } else {
            cell.textLabel?.text = t.title
            cell.imageView?.image = UIImage(systemName: t.symbol)
        }
        cell.accessoryType = t.id == current ? .checkmark : .disclosureIndicator
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let t = tabs[indexPath.row]
        dismiss(animated: true) { [onPick] in onPick(t) }
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
