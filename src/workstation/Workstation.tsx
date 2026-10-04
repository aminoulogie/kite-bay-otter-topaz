import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Activity, BrainCircuit, Clock, Dumbbell, FolderKanban, Gauge, LayoutGrid, LayoutPanelLeft, Plus, RefreshCw,
  ScanFace, Search, Settings as SettingsIcon, TrendingUp, Utensils, Wallet,
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
import { projectStats } from "./metrics";
import "./ws.css";

type Icon = ComponentType<{ className?: string }>;
export type PageId =
  | "overview" | "projects" | "tasks" | "money"
  | "home" | "train" | "fuel" | "looks" | "mind" | "body" | "stats" | "settings";

interface PageDef {
  id: PageId;
  label: string;
  icon: Icon;
  group: "Workspace" | "Personal";
}

const PAGES: PageDef[] = [
  { id: "overview", label: "Overview", icon: Gauge, group: "Workspace" },
  { id: "projects", label: "Projects", icon: FolderKanban, group: "Workspace" },
  { id: "tasks", label: "Tasks & calendar", icon: Clock, group: "Workspace" },
  { id: "money", label: "Money", icon: Wallet, group: "Workspace" },
  { id: "home", label: "Today", icon: LayoutGrid, group: "Personal" },
  { id: "train", label: "Training", icon: Dumbbell, group: "Personal" },
  { id: "fuel", label: "Nutrition", icon: Utensils, group: "Personal" },
  { id: "body", label: "Body", icon: Activity, group: "Personal" },
  { id: "looks", label: "Looks", icon: ScanFace, group: "Personal" },
  { id: "mind", label: "Mind", icon: BrainCircuit, group: "Personal" },
  { id: "stats", label: "Stats", icon: TrendingUp, group: "Personal" },
];

const CLASSIC: Partial<Record<PageId, ComponentType>> = {
  tasks: TimeView,
  money: MoneyView,
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
                <button key={p.id} type="button" aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)}>
                  <p.icon />
                  {p.label}
                  {p.id === "projects" && stats.active > 0 && <span className="ws-count">{stats.active}</span>}
                  {p.id === "overview" && stats.overdue > 0 && <span className="ws-count ws-red">{stats.overdue}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="ws-side-foot">
          <button type="button" aria-current={page === "settings" ? "page" : undefined} onClick={() => go("settings")}>
            <SettingsIcon /> Settings
          </button>
          <button type="button" onClick={() => patchSettings({ workstation: false })} title="Switch this device back to the phone-style layout">
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
          <button type="button" className="ws-btn primary" onClick={() => newProject()}>
            <Plus /> New project
          </button>
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
          {page === "projects" && <ProjectsPage openId={openProject} onOpen={setOpenProject} />}
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
  onClose, onGo, onProject, onNew,
}: {
  onClose: () => void;
  onGo: (p: PageId) => void;
  onProject: (id: string) => void;
  onNew: (name: string) => void;
}) {
  const projects = useSoma((s) => s.projects);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const items = useMemo<Cmd[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: Cmd[] = [];
    for (const p of PAGES) if (match(p.label)) out.push({ id: `page-${p.id}`, label: p.label, hint: "Go to", icon: p.icon, run: () => onGo(p.id) });
    if (match("Settings")) out.push({ id: "page-settings", label: "Settings", hint: "Go to", icon: SettingsIcon, run: () => onGo("settings") });
    for (const p of projects) {
      if (match(p.name) || match(p.client ?? "")) {
        out.push({ id: `pj-${p.id}`, label: p.name, hint: p.client ? `Project · ${p.client}` : "Project", icon: FolderKanban, run: () => onProject(p.id) });
      }
    }
    out.push({ id: "new", label: needle ? `New project “${q.trim()}”` : "New project", hint: "Create", icon: Plus, run: () => onNew(q.trim() || "Untitled project") });
    return out.slice(0, 40);
  }, [q, projects, onGo, onProject, onNew]);

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
            <li key={it.id} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onMouseDown={() => it.run()}>
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
