import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  BrainCircuit,
  Briefcase,
  LogIn,
  LogOut,
  Coffee,
  ChevronDown,
  CalendarDays,
  Clock,
  FileText,
  PiggyBank,
  Timer,
  Dumbbell,
  FolderKanban,
  HeartPulse,
  Gauge,
  LayoutGrid,
  LayoutPanelLeft,
  Plus,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  Search,
  Settings as SettingsIcon,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";
import { BodyView } from "@/components/views/BodyView";
import { DashboardView } from "@/components/views/DashboardView";
import { InsightsView } from "@/components/views/InsightsView";
import { LooksView } from "@/components/views/LooksView";
import { MindView } from "@/components/views/MindView";
import { MoneyView } from "@/components/views/MoneyView";
import { NutritionView } from "@/components/views/NutritionView";
import { SettingsView } from "@/components/views/SettingsView";
import { TimeView } from "@/components/views/TimeView";
import { WorkoutView } from "@/components/views/WorkoutView";
import { PROJECT_COLORS } from "@/lib/projects";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { syncEngine } from "@/lib/sync/app";
import type { SyncMeta } from "@/lib/sync/engine";
import { Overview } from "./Overview";
import { ProjectsPage } from "./ProjectsPage";
import { TasksPage } from "./TasksPage";
import { MoneyPage } from "./MoneyPage";
import { TimePage } from "./TimePage";
import { ReportsPage } from "./ReportsPage";
import { FindingsPage } from "./FindingsPage";
import { HealthPage } from "./HealthPage";
import { useClients } from "./use-clients";
import { TopClock, TopTimer } from "./Timer";
import { WorkLogPage } from "./WorkLogPage";
import { openShift, onBreak } from "@/lib/worklog";
import { projectStats } from "./metrics";

type Icon = ComponentType<{ className?: string }>;
export type PageId =
  | "overview"
  | "worklog"
  | "projects"
  | "tasks"
  | "tracking"
  | "reports"
  | "findings"
  | "health"
  | "time"
  | "money"
  | "moneyClassic"
  | "home"
  | "train"
  | "fuel"
  | "looks"
  | "mind"
  | "body"
  | "stats"
  | "settings";

interface PageDef {
  id: PageId;
  label: string;
  icon: Icon;
  group: "Workspace" | "Personal";
}

const PAGES: PageDef[] = [
  { id: "overview", label: "Overview", icon: Gauge, group: "Workspace" },
  { id: "worklog", label: "Work log", icon: Briefcase, group: "Workspace" },
  { id: "projects", label: "Projects", icon: FolderKanban, group: "Workspace" },
  { id: "findings", label: "Findings", icon: ShieldAlert, group: "Workspace" },
  { id: "tasks", label: "Tasks & calendar", icon: Clock, group: "Workspace" },
  { id: "tracking", label: "Time tracking", icon: Timer, group: "Workspace" },
  { id: "money", label: "Money", icon: Wallet, group: "Workspace" },
  { id: "reports", label: "Reports", icon: FileText, group: "Workspace" },
  { id: "time", label: "Day planner", icon: CalendarDays, group: "Personal" },
  { id: "moneyClassic", label: "Money goals & insights", icon: PiggyBank, group: "Personal" },
  { id: "health", label: "Health", icon: HeartPulse, group: "Personal" },
  { id: "home", label: "Today", icon: LayoutGrid, group: "Personal" },
  { id: "train", label: "Training", icon: Dumbbell, group: "Personal" },
  { id: "fuel", label: "Nutrition", icon: Utensils, group: "Personal" },
  { id: "body", label: "Body", icon: Activity, group: "Personal" },
  { id: "looks", label: "Looks", icon: ScanFace, group: "Personal" },
  { id: "mind", label: "Mind", icon: BrainCircuit, group: "Personal" },
  { id: "stats", label: "Stats", icon: TrendingUp, group: "Personal" },
];

const CLASSIC: Partial<Record<PageId, ComponentType>> = {
  time: TimeView,
  moneyClassic: MoneyView,
  home: DashboardView,
  train: WorkoutView,
  fuel: NutritionView,
  body: BodyView,
  looks: LooksView,
  mind: MindView,
  stats: InsightsView,
  settings: SettingsView,
};

const PAGE_KEY = "soma-ws-page";

function loadPage(): PageId {
  try {
    const p = localStorage.getItem(PAGE_KEY) as PageId | null;
    return p && (PAGES.some((x) => x.id === p) || p === "settings") ? p : "overview";
  } catch {
    return "overview";
  }
}

function useSyncMeta(): SyncMeta | null {
  const [meta, setMeta] = useState(() => syncEngine.meta());
  useEffect(() => {
    const on = () => setMeta(syncEngine.meta());
    window.addEventListener("soma-sync-meta", on);
    return () => window.removeEventListener("soma-sync-meta", on);
  }, []);
  return meta;
}

/**
 * SOMA at a desk.
 *
 * Its own layout and look rather than the phone app stretched: a sidebar of
 * workspaces, a top bar with a command palette, and pages built for a mouse
 * and a keyboard. Projects and the Overview are desktop-first; the personal
 * pages host the phone app's own views until each gets a desktop version.
 */
export function Workstation() {
  const settings = useSoma((s) => s.settings);
  const projects = useSoma((s) => s.projects);
  const patchSettings = useSoma((s) => s.patchSettings);
  const addProject = useSoma((s) => s.addProject);
  const [page, setPageState] = useState<PageId>(loadPage);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [createMenu, setCreateMenu] = useState(false);
  const addShift = useSoma((s) => s.addShift);
  const addFinding = useSoma((s) => s.addFinding);
  const shifts = useSoma((s) => s.shifts);
  const live = openShift(shifts);
  const [palette, setPalette] = useState(false);
  const sync = useSyncMeta();
  const today = getLocalDateKey();
  const stats = useMemo(() => projectStats(projects, today), [projects, today]);

  const go = useCallback((p: PageId) => {
    setPageState(p);
    try {
      localStorage.setItem(PAGE_KEY, p);
    } catch {
      /* per-device convenience only */
    }
  }, []);

  const openProjectById = useCallback(
    (id: string) => {
      setOpenProject(id);
      go("projects");
    },
    [go],
  );

  const openShiftById = useCallback(
    (id: string) => {
      setOpenShiftId(id);
      go("worklog");
    },
    [go],
  );

  const newProject = useCallback(
    (name = "Untitled project") => {
      const id = addProject(name, PROJECT_COLORS[projects.length % PROJECT_COLORS.length]!);
      openProjectById(id);
    },
    [addProject, projects.length, openProjectById],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const def = PAGES.find((p) => p.id === page);
  const Classic = CLASSIC[page];
  const theme = settings.theme === "light" ? "light" : "dark";

  return (
    <div className="ws" data-theme={theme}>
      <aside className="ws-side">
        <div className="ws-brand">
          <div className="ws-logo">S</div>
          <div>
            <b>SOMA</b>
            <small>Workstation</small>
          </div>
        </div>
        <nav className="ws-nav">
          {(["Workspace", "Personal"] as const).map((g) => (
            <div key={g}>
              <h6>{g}</h6>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-current={page === p.id ? "page" : undefined}
                  onClick={() => go(p.id)}
                >
                  <p.icon />
                  {p.label}
                  {p.id === "projects" && stats.active > 0 && (
                    <span className="ws-count">{stats.active}</span>
                  )}
                  {p.id === "worklog" && live && (
                    <span className="ws-count ws-live">{onBreak(live) ? "Break" : "On"}</span>
                  )}
                  {p.id === "overview" && stats.overdue > 0 && (
                    <span className="ws-count ws-red">{stats.overdue}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="ws-side-foot">
          <button
            type="button"
            aria-current={page === "settings" ? "page" : undefined}
            onClick={() => go("settings")}
          >
            <SettingsIcon /> Settings
          </button>
          <button
            type="button"
            onClick={() => patchSettings({ workstation: false })}
            title="Switch this device back to the phone-style layout"
          >
            <LayoutPanelLeft /> Classic layout
          </button>
        </div>
      </aside>

      <div className="ws-main">
        <div className="ws-top">
          <div className="ws-crumb">
            {def?.group ?? "SOMA"} <span>/</span> <b>{def?.label ?? "Settings"}</b>
          </div>
          <button type="button" className="ws-search" onClick={() => setPalette(true)}>
            <Search size={14} /> Search or jump to…
            <span style={{ marginLeft: "auto" }}>
              <kbd>Ctrl</kbd> <kbd>K</kbd>
            </span>
          </button>
          <TopClock onOpenShift={openShiftById} />
          <TopTimer />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="ws-btn primary"
              onClick={() => setCreateMenu((v) => !v)}
            >
              <Plus /> Create <ChevronDown />
            </button>
            {createMenu && (
              <>
                <div className="ws-pop-bg" onMouseDown={() => setCreateMenu(false)} />
                <div className="ws-menu" style={{ width: 240 }}>
                  <ul style={{ marginTop: 0 }}>
                    <li
                      onMouseDown={() => {
                        setCreateMenu(false);
                        newProject();
                      }}
                    >
                      <FolderKanban size={14} /> Project
                    </li>
                    <li
                      onMouseDown={() => {
                        setCreateMenu(false);
                        const today = new Date();
                        today.setHours(9, 0, 0, 0);
                        const id = addShift({
                          client: shifts[shifts.length - 1]?.client ?? "Client",
                          start: today.getTime(),
                          end: today.getTime() + 8 * 3600_000,
                          breaks: [],
                          activities: [],
                        });
                        openShiftById(id);
                      }}
                    >
                      <Briefcase size={14} /> Shift I forgot to clock
                    </li>
                    <li
                      onMouseDown={() => {
                        setCreateMenu(false);
                        const id = addFinding({
                          projectId: projects[0]?.id ?? "",
                          title: "New finding",
                          severity: "medium",
                          status: "open",
                        });
                        setOpenFinding(id);
                        go("findings");
                      }}
                    >
                      <ShieldAlert size={14} /> Finding
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="ws-sync ws-btn ghost"
            onClick={() => (sync ? void syncEngine.sync() : go("settings"))}
            title={sync ? "Sync now" : "Set up device sync"}
          >
            <span className={`ws-dot ${sync ? (sync.lastError ? "err" : "ok") : ""}`} />
            {sync
              ? sync.lastError
                ? "Sync issue"
                : sync.lastSync
                  ? `Synced ${new Date(sync.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Syncing…"
              : "Not synced"}
            {sync && <RefreshCw size={12} />}
          </button>
        </div>

        <div className="ws-body">
          {page === "overview" && <Overview onOpenProject={openProjectById} onGo={go} />}
          {page === "worklog" && <WorkLogPage openId={openShiftId} onOpen={setOpenShiftId} />}
          {page === "projects" && <ProjectsPage openId={openProject} onOpen={setOpenProject} />}
          {page === "tasks" && <TasksPage />}
          {page === "money" && <MoneyPage />}
          {page === "tracking" && <TimePage />}
          {page === "reports" && <ReportsPage />}
          {page === "health" && <HealthPage onGo={go} />}
          {page === "findings" && <FindingsPage openId={openFinding} onOpen={setOpenFinding} />}
          {Classic && (
            <div className="ws-classic soma-main">
              <Classic />
            </div>
          )}
        </div>
      </div>

      {palette && (
        <Palette
          onClose={() => setPalette(false)}
          onGo={(p) => {
            go(p);
            setPalette(false);
          }}
          onProject={(id) => {
            openProjectById(id);
            setPalette(false);
          }}
          onNew={(name) => {
            newProject(name);
            setPalette(false);
          }}
          onShift={(id) => {
            openShiftById(id);
            setPalette(false);
          }}
        />
      )}
    </div>
  );
}

interface Cmd {
  id: string;
  label: string;
  hint: string;
  icon: Icon;
  run: () => void;
}

function Palette({
  onClose,
  onGo,
  onProject,
  onNew,
  onShift,
}: {
  onClose: () => void;
  onGo: (p: PageId) => void;
  onProject: (id: string) => void;
  onNew: (name: string) => void;
  onShift: (id: string) => void;
}) {
  const projects = useSoma((s) => s.projects);
  const shifts = useSoma((s) => s.shifts);
  const clockIn = useSoma((s) => s.clockIn);
  const clockOut = useSoma((s) => s.clockOut);
  const toggleBreak = useSoma((s) => s.toggleBreak);
  const clients = useClients();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const items = useMemo<Cmd[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: Cmd[] = [];
    const live = openShift(shifts);
    if (live) {
      if (match("clock out"))
        out.push({
          id: "out",
          label: `Clock out of ${live.client}`,
          hint: "Work log",
          icon: LogOut,
          run: () => {
            const id = clockOut();
            if (id) onShift(id);
          },
        });
      if (match("break"))
        out.push({
          id: "brk",
          label: onBreak(live) ? "End the break" : "Take a break",
          hint: "Work log",
          icon: Coffee,
          run: () => {
            toggleBreak();
            onClose();
          },
        });
    } else {
      for (const c of clients)
        if (match(`clock in ${c}`) || match(c))
          out.push({
            id: `in-${c}`,
            label: `Clock in for ${c}`,
            hint: "Work log",
            icon: LogIn,
            run: () => {
              clockIn(c);
              onClose();
            },
          });
      if (
        needle.startsWith("clock in ") &&
        q.trim().slice(9).trim() &&
        !clients.some((c) => c.toLowerCase() === needle.slice(9).trim())
      )
        out.push({
          id: "in-new",
          label: `Clock in for ${q.trim().slice(9).trim()}`,
          hint: "New client",
          icon: LogIn,
          run: () => {
            clockIn(q.trim().slice(9).trim());
            onClose();
          },
        });
    }
    for (const p of PAGES)
      if (match(p.label))
        out.push({
          id: `page-${p.id}`,
          label: p.label,
          hint: "Go to",
          icon: p.icon,
          run: () => onGo(p.id),
        });
    if (match("Settings"))
      out.push({
        id: "page-settings",
        label: "Settings",
        hint: "Go to",
        icon: SettingsIcon,
        run: () => onGo("settings"),
      });
    for (const p of projects) {
      if (match(p.name) || match(p.client ?? "")) {
        out.push({
          id: `pj-${p.id}`,
          label: p.name,
          hint: p.client ? `Project · ${p.client}` : "Project",
          icon: FolderKanban,
          run: () => onProject(p.id),
        });
      }
    }
    out.push({
      id: "new",
      label: needle ? `New project “${q.trim()}”` : "New project",
      hint: "Create",
      icon: Plus,
      run: () => onNew(q.trim() || "Untitled project"),
    });
    return out.slice(0, 40);
  }, [
    q,
    projects,
    onGo,
    onProject,
    onNew,
    shifts,
    clients,
    clockIn,
    clockOut,
    toggleBreak,
    onShift,
    onClose,
  ]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div className="ws-palette-bg" onMouseDown={onClose}>
      <div className="ws-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          placeholder="Search pages and projects, or type a name to create…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") items[sel]?.run();
          }}
        />
        <ul ref={list} role="listbox">
          {items.map((it, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onMouseDown={() => it.run()}
            >
              <it.icon />
              {it.label}
              <small>{it.hint}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
