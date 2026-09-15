import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, BrainCircuit, CalendarDays, Check, Clock, Download, Dumbbell, FolderKanban, LayoutGrid, LineChart, Loader2, PanelLeft, Pencil, Settings as SettingsIcon, Target, TrendingUp, ScanFace, Utensils, Wallet } from "lucide-react";
import { Toaster, toast } from "sonner";
import { DateDrawer } from "@/components/DateDrawer";
import { getLocalDateKey } from "@/lib/soma";
import { NUTRITION_KEEP_FROM } from "@/lib/seed";
import { requestPersistence } from "@/lib/storage-health";
import { TrainCalendar } from "@/components/TrainCalendar";
import { useEdgeSwipe, useRightEdgeSwipe } from "@/lib/use-edge-swipe";
import { useKeyboardInset } from "@/lib/use-keyboard";
import { useLiquidGlass } from "@/lib/use-liquid-glass";
import { useBackupDownload } from "@/lib/use-backup";
import { BodyView } from "@/components/views/BodyView";
import { HabitsView } from "@/components/views/HabitsView";
import { InsightsView } from "@/components/views/InsightsView";
import { NutritionView } from "@/components/views/NutritionView";
import { EstimatesView } from "@/components/views/EstimatesView";
import { SettingsView } from "@/components/views/SettingsView";
import { WorkoutView } from "@/components/views/WorkoutView";
import { accentInk, accentText, normalizeAccent, resolveTheme } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { isArrangeable } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";
import type { TabId } from "@/lib/types";
import { TAB_ORDER, resolveTab } from "@/lib/tab-order";
import { DashboardView } from "@/components/views/DashboardView";
import { MoneyView } from "@/components/views/MoneyView";
import { MindView } from "@/components/views/MindView";
import { ProjectsView } from "@/components/views/ProjectsView";
import { LooksView } from "@/components/views/LooksView";
import { TimeView } from "@/components/views/TimeView";

/**
 * The dock, drawn in TAB_ORDER so it can never disagree with the direction a
 * swipe moves. Anything added here has to be added there too, and the order
 * test fails if the two drift apart.
 */
const TAB_META: Record<TabId, { label: string; icon: typeof Dumbbell }> = {
  mind: { label: "Mind", icon: BrainCircuit },
  projects: { label: "Projects", icon: FolderKanban },
  looks: { label: "Looks", icon: ScanFace },
  money: { label: "Money", icon: Wallet },
  dashboard: { label: "Home", icon: LayoutGrid },
  workout: { label: "Train", icon: Dumbbell },
  nutrition: { label: "Fuel", icon: Utensils },
  habits: { label: "Habits", icon: Target },
  time: { label: "Time", icon: Clock },
  body: { label: "Body", icon: Activity },
  insights: { label: "Stats", icon: TrendingUp },
  estimates: { label: "Ahead", icon: LineChart },
  settings: { label: "Setup", icon: SettingsIcon },
};

const TABS = TAB_ORDER.map((id) => ({ id, ...TAB_META[id] }));

export function AppShell() {
  // Installed once for the whole app: the keyboard is a property of the
  // window, not of whichever field happens to be focused, and every sheet in
  // every tab needs the same answer about where it now ends.
  useKeyboardInset();

  // The tilt parallax behind every glass surface. One hook, root-level CSS
  // vars, two composited layers — see lib/use-liquid-glass.ts.
  useLiquidGlass();

  // Everything in this app lives on this one device, so the backup file is the
  // only copy that survives losing it. Burying the one control that writes it
  // three screens deep in Setup made the safest habit the least convenient
  // one; it is now two taps from wherever you are.
  const { busy: savingBackup, download: saveBackup } = useBackupDownload();

  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  useEdgeSwipe(openDrawer, ready && !drawerOpen);

  const hydrated = useSoma((s) => s.hydrated);
  // Resolved on the way out, not only in setTab: the last-open tab is restored
  // straight from storage on boot, so a phone closed on Body would otherwise
  // reopen to a tab that is no longer in the dock.
  const tab = useSoma((s) => resolveTab(s.tab));
  // The calendar lives here rather than inside WorkoutView so one instance
  // serves the header button on every tab. The swipe stays scoped to Train,
  // where it was asked for, and the 40px edge is wide enough for a thumb
  // coming in off the bezel.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const editingDashboard = useSoma((s) => s.editingDashboard);
  const setEditingDashboard = useSoma((s) => s.setEditingDashboard);

  // Measured rather than computed from an index, because the dock scrolls and
  // the tabs are not evenly spaced once it does.
  const dockRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ x: 0, w: 0 });

  /**
   * The dock's real height, published so the page can leave room for it.
   *
   * It used to be a fixed `pb-28`, which is right at one text size and wrong
   * at every other: the dock grows with the phone's text setting and with the
   * home-indicator inset, and once it is taller than 112px the last card on
   * every page sits behind it with no way to scroll further. Measured rather
   * than guessed, because the two things that change it are both outside this
   * app's control.
   */
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => {
      // offsetHeight, not getBoundingClientRect().height: the rect follows
      // the VISUAL viewport, which iOS moves while the URL bar collapses or
      // the keyboard opens — publishing it made --dock-h wobble and the page
      // reflow under the user's thumb. The layout box is stable.
      document.documentElement.style.setProperty(
        "--dock-h",
        `${Math.round(el.offsetHeight)}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--dock-h");
    };
  }, [ready]);

  /**
   * The selected tab is scrolled to the middle of the dock.
   *
   * Eleven tabs do not fit a phone, so the dock scrolls — and it used to open
   * at scrollLeft 0, which put Home 141px right of centre with Mind and
   * Projects occupying the middle. The app WAS opening on Home; it just did
   * not look like it, because the dock was showing somewhere else. Centring
   * the selected tab makes where you are and where the dock is the same
   * answer, on every tab rather than only the first.
   *
   * Instant on the first pass and smooth afterwards: an animation on boot is
   * the app appearing to slide somewhere before you have touched it.
   */
  const centred = useRef(false);
  useEffect(() => {
    const move = () => {
      const el = tabRefs.current[tab];
      const dock = dockRef.current;
      if (!el || !dock) return;
      // Offset within the scrollable content, so the pill stays under its tab
      // when the dock is scrolled rather than drifting with the viewport.
      setPill({ x: el.offsetLeft, w: el.offsetWidth });

      const want = el.offsetLeft + el.offsetWidth / 2 - dock.clientWidth / 2;
      const max = Math.max(0, dock.scrollWidth - dock.clientWidth);
      const to = Math.max(0, Math.min(max, want));
      if (Math.abs(dock.scrollLeft - to) > 1) {
        dock.scrollTo({ left: to, behavior: centred.current ? "smooth" : "auto" });
      }
      centred.current = true;
    };
    move();
    // Fonts and layout settle a frame later; without this the pill lands at
    // the previous tab's width on first paint.
    const id = requestAnimationFrame(move);
    window.addEventListener("resize", move);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", move);
    };
  }, [tab, ready]);
  useRightEdgeSwipe(
    () => setCalendarOpen(true),
    ready && !drawerOpen && !calendarOpen && tab === "workout",
    40,
  );
  const setTab = useSoma((s) => s.setTab);

  /**
   * The page-wide tab swipe is gone.
   *
   * It fired from anywhere on the screen, which meant every horizontal drag
   * that was not caught by a no-swipe zone — a mis-aimed swipe-to-delete, a
   * finger sliding while scrolling a long diary — changed tab under you. The
   * two edge gestures (drawer, calendar) still work, and the dock is the way
   * between tabs. A navigation gesture that fires by accident is worse than no
   * gesture, because you lose your place and have to find it again.
   */

  const settings = useSoma((s) => s.settings);
  const activeDate = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const ensureSeed = useSoma((s) => s.ensureSeed);
  const mergeCustomFoods = useSoma((s) => s.mergeCustomFoods);
  const hydratePrograms = useSoma((s) => s.hydratePrograms);
  const refreshScheduledDay = useSoma((s) => s.refreshScheduledDay);
  const normalizeLive = useSoma((s) => s.normalizeLive);
  const rollDayIfNeeded = useSoma((s) => s.rollDayIfNeeded);
  const markHydrated = useSoma((s) => s.markHydrated);

  useEffect(() => {
    const result = useSoma.persist.rehydrate();
    void Promise.resolve(result).then(() => {
      ensureSeed();
      // Runs every boot, not only on a fresh install, so foods added to the
      // seed later still reach an app that was seeded long ago.
      mergeCustomFoods();
      hydratePrograms();
      // Before refreshScheduledDay, not after: normalizeLive is what throws
      // away a sheet left over from another day, and refreshScheduledDay
      // refuses to touch a finished one — so in the other order yesterday's
      // saved session survived the boot and became today's Train screen.
      normalizeLive();
      // Programmes load after the store rehydrates, so an untouched session
      // restored from a previous launch can still be carrying the split it was
      // created under. Re-derive once they are in — this only replaces a
      // session with nothing logged in it, so no work is ever discarded.
      refreshScheduledDay();
      // Ask the browser to stop treating this data as disposable. Safari grants
      // it to home-screen apps and usually refuses a plain tab; either way the
      // answer is informational, so nothing here depends on it.
      void requestPersistence();
      // A one-time cleanup, recorded in settings so it never runs twice.
      const purgedAt = useSoma.getState().settings.nutritionPurgedBefore;
      if (purgedAt !== NUTRITION_KEEP_FROM) {
        const gone = useSoma.getState().purgeNutritionBefore(NUTRITION_KEEP_FROM);
        if (gone) toast(`Cleared ${gone} nutrition days from before September`);
      }
      markHydrated();
      setReady(true);
    });
  }, [
    ensureSeed, mergeCustomFoods, hydratePrograms, refreshScheduledDay, markHydrated,
    normalizeLive,
  ]);

  /**
   * Rolls onto a new sheet at midnight. A phone left on the Fuel tab overnight
   * would otherwise keep logging breakfast into yesterday.
   *
   * Polled once a minute rather than scheduled for the exact moment, because a
   * backgrounded tab has its timers throttled and iOS suspends them entirely —
   * so the visibility change is what actually catches it after a night asleep.
   */
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (rollDayIfNeeded()) toast("New day — yesterday is saved in Logged days");
    };
    const id = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [ready, rollDayIfNeeded]);

  useEffect(() => {
    if (!hydrated) return;
    const accent = normalizeAccent(settings.accent);
    const theme = resolveTheme(settings.theme);
    const root = document.documentElement;
    root.setAttribute("data-soma-theme", theme);
    root.style.setProperty("--color-accent", accent);
    root.style.setProperty("--color-accent-ink", accentInk(accent));
    root.style.setProperty("--color-accent-text", accentText(accent, theme));
    root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${accent} 16%, transparent)`);
    root.style.setProperty("--color-accent-line", `color-mix(in srgb, ${accent} 38%, transparent)`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f4f6f9" : "#0b0c10");
  }, [settings.accent, settings.theme, hydrated]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="font-display text-2xl font-bold tracking-tight text-fg">SOMA</div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-1/2 animate-pulse bg-accent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-dvh max-w-lg bg-bg pb-[calc(var(--dock-h,7rem)+0.75rem)] lg:flex lg:max-w-none lg:gap-6 lg:pb-0 lg:pl-0">
      {/* The ambient light behind every glass surface. Fixed, pointer-dead,
          and the only layer the tilt parallax moves — the glass refracts it,
          the content never does. It sits at z-0; the rail and the content
          column stack above it in order, so overlay sheets always cover the
          rail on desktop. */}
      <div aria-hidden className="soma-ambient" />
      {/* The dock becomes a rail. On a phone the bottom edge is where the thumb
          is; on a desktop it is the furthest point from where anyone is looking,
          and a pill floating there is a phone app in a window. The rail is the
          same TAB_ORDER, so the two can never disagree. */}
      <nav className="glass-rail sticky top-0 z-[1] hidden h-dvh shrink-0 flex-col gap-1 border-r border-border p-3 lg:flex lg:w-[13.5rem]">
        <div className="mb-3 px-2 pt-2">
          <div className="font-display text-lg font-extrabold leading-tight tracking-tight text-fg">
            SOMA
          </div>
          <div className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-faint">
            Smart Coach
          </div>
        </div>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors",
                active
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="soma-desk relative z-[2] min-w-0 flex-1 lg:mx-auto lg:pb-10">
      {/* The native webview fills the screen including the area behind the
          status bar, so without the safe-area inset the clock, wifi and battery
          sit on top of the header. Harmless in a browser, where the inset is 0. */}
      {/* Wraps rather than overflowing. Four controls and a wordmark fit a
          393px phone at the default text size and do not fit a 320px one at
          the largest — and a header that cannot wrap does not clip itself, it
          widens the PAGE, which is what put every screen slightly off to the
          left with the Calendar button hanging past the edge. A media query
          cannot see this coming, because the trigger is the text size rather
          than the viewport. */}
      <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* The swipe is not discoverable on its own, so the drawer also has
              a visible control. */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open logged days"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted"
          >
            <PanelLeft className="size-4" />
          </button>
          {/* The rail carries the lockup on a desktop, so the header says where
              you are instead of repeating the app's own name at you. */}
          <div className="hidden min-w-0 lg:block">
            <div className="font-display text-lg font-extrabold leading-tight tracking-tight text-fg">
              {TAB_META[tab].label}
            </div>
          </div>
          {/* No tagline. The row now carries three controls and "Smart Coach"
              was the only thing without a job, so it was the thing that got
              truncated to "SMART …" to make room — which reads as a layout
              bug rather than as branding. The name stays; the phone's home
              screen has already said the rest. */}
          {/* shrink-0: four characters have no sensible truncation, and the
              flex row was clipping the last one by a pixel on a 360px phone. */}
          <div className="min-w-0 lg:hidden">
            <div className="truncate font-display text-lg font-extrabold leading-tight tracking-tight text-fg">
              SOMA
            </div>
          </div>
        </div>
        {/* Was a static "Local" badge, which said something the user already
            knew and did nothing. The calendar is the thing worth reaching from
            every screen. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Only on the page it edits. A control that does nothing on ten of
              eleven tabs is worse than no control: you learn to ignore it, and
              then you cannot find it on the one tab where it works. */}
          {isArrangeable(tab) && (
            <button
              type="button"
              onClick={() => setEditingDashboard(!editingDashboard)}
              aria-label={editingDashboard ? "Finish editing the layout" : "Edit the layout"}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider",
                editingDashboard
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-2 text-muted active:bg-surface-3",
              )}
            >
              {editingDashboard ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
              {editingDashboard ? "Done" : "Edit"}
            </button>
          )}
          {/* Icon only. The header already carries two labelled controls and a
              third word would push the row into wrapping on a small phone —
              and unlike those two this one needs no explanation once found,
              because pressing it hands you a file. */}
          <button
            type="button"
            onClick={() => void saveBackup()}
            disabled={savingBackup}
            aria-label={savingBackup ? "Building the backup file" : "Save a backup file"}
            title="Save a backup file"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted active:bg-surface-3 disabled:opacity-60"
          >
            {savingBackup ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            aria-label="Open training calendar"
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted active:bg-surface-3"
          >
            <CalendarDays className="size-3.5" />
            Calendar
          </button>
        </div>
      </header>

      <TrainCalendar open={calendarOpen} onClose={() => setCalendarOpen(false)} />

      {/* Selecting a past day changes what every tab reads. Without a standing
          indicator that is invisible, and the app looks like it ignored the tap. */}
      {activeDate !== getLocalDateKey() && (
        <button
          type="button"
          onClick={() => setActiveDate(getLocalDateKey())}
          className="sticky top-0 z-20 flex w-full items-center justify-between gap-2 border-b border-warn/30 bg-warn/15 px-4 py-1.5 text-[0.68rem] font-bold text-warn"
        >
          <span className="truncate">Viewing {activeDate}</span>
          <span className="shrink-0 underline">Back to today</span>
        </button>
      )}

      <DateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main key={tab} className="soma-scroll px-4 pt-4 soma-view soma-stagger">
        {tab === "dashboard" && <DashboardView />}
        {tab === "money" && <MoneyView />}
        {tab === "mind" && <MindView />}
        {tab === "projects" && <ProjectsView />}
        {tab === "looks" && <LooksView />}
        {tab === "workout" && <WorkoutView />}
        {tab === "nutrition" && <NutritionView />}
        {tab === "habits" && <HabitsView />}
        {tab === "time" && <TimeView />}
        {tab === "body" && <BodyView />}
        {tab === "insights" && <InsightsView />}
        {tab === "estimates" && <EstimatesView />}
        {tab === "settings" && <SettingsView />}
      </main>

      {/* soma-dock is the hook the keyboard rules use to fade this out: it
          sits under the keys while one is open, where it cannot be tapped and
          only gives the browser one more fixed element to fight with. */}
      {/* The inset is the home-indicator zone, not a wall: the indicator is a
          thin line in the middle of it, so clearing the whole 34px left the
          dock visibly stranded above the bottom of the screen. Sixteen less
          puts it where a floating bar belongs and still never touches it. */}
      <nav
        ref={navRef}
        className="soma-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(10px,calc(env(safe-area-inset-bottom)-16px))] transition-opacity duration-150 lg:hidden"
      >
        {/* Scrollable: seven tabs no longer fit at a legible size, and
            shrinking them further would make the labels unreadable before it
            made them fit. snap-x keeps a tab from ending up half off-screen. */}
        <div
          ref={dockRef}
          data-no-swipe-nav
          className="glass-dock pointer-events-auto relative flex w-full max-w-lg snap-x items-center gap-1 overflow-x-auto rounded-full border border-border-strong p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* One pill that travels, rather than each tab painting its own
              background. Colour swapping between two elements reads as a
              blink; a single element moving reads as the selection sliding.

              Transform-only on purpose: translateX runs on the compositor at
              the display's refresh rate, while a width transition would put
              layout on the main thread every frame. The tabs are all the same
              fixed width, so the pill's width is set once and never animates. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1.5 rounded-full bg-accent transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] will-change-transform"
            style={{
              width: pill.w,
              height: "calc(100% - 0.75rem)",
              transform: `translateX(${pill.x}px)`,
              opacity: pill.w ? 1 : 0,
            }}
          />
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                onClick={() => setTab(t.id)}
                className={cn(
                  // No background of its own: the travelling pill is the only
                  // thing that paints the selection, so the highlight slides
                  // between tabs instead of blinking off one and on another.
                  "relative z-10 flex min-h-11 w-[4.2rem] shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 text-[0.58rem] font-bold leading-none transition-colors duration-200",
                  active ? "text-accent-ink" : "text-faint hover:text-muted",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
                <span className="w-full truncate text-center">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      </div>
      <Toaster position="top-center" theme={settings.theme === "light" ? "light" : "dark"} />
    </div>
  );
}
