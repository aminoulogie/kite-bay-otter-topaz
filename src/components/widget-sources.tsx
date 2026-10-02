import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Which component draws each page's widget grid.
 *
 * A widget brought onto another page from the widget store is not a copy: the
 * page it belongs to is mounted out of sight and its grid hands over just that
 * one card (see WidgetGrid). So every page with a grid needs an entry here.
 *
 * Lazy, because every view imports WidgetGrid and WidgetGrid needs these — a
 * plain import would be a cycle — and because a page nobody borrows from
 * should cost nothing.
 */
type Source = LazyExoticComponent<ComponentType>;

const v = <T,>(load: () => Promise<T>, pick: (m: T) => ComponentType) =>
  lazy(async () => ({ default: pick(await load()) }));

const views = () => import("@/components/views/NutritionView");
const mind = () => import("@/components/views/MindView");
const money = () => import("@/components/views/MoneyView");
const insights = () => import("@/components/views/InsightsView");

export const WIDGET_SOURCES: Record<string, Source> = {
  dashboard: v(() => import("@/components/views/DashboardView"), (m) => m.DashboardView),
  time: v(() => import("@/components/views/TimeView"), (m) => m.TimeView),
  body: v(() => import("@/components/views/BodyView"), (m) => m.BodyView),
  workout: v(() => import("@/components/views/WorkoutView"), (m) => m.WorkoutView),
  "money-dash": v(money, (m) => () => <m.MoneyView initialPage="dash" />),
  "money-tx": v(money, (m) => () => <m.MoneyView initialPage="tx" />),
  "money-budgets": v(money, (m) => () => <m.MoneyView initialPage="budgets" />),
  "money-insights": v(money, (m) => () => <m.MoneyView initialPage="insights" />),
  "money-goals": v(money, (m) => () => <m.MoneyView initialPage="goals" />),
  "money-trade": v(() => import("@/components/views/TradingView"), (m) => m.TradingView),
  looks: v(() => import("@/components/views/LooksView"), (m) => m.LooksView),
  habits: v(() => import("@/components/views/HabitsView"), (m) => m.HabitsView),
  projects: v(() => import("@/components/views/ProjectsView"), (m) => m.ProjectsBoard),
  "projects-goals": v(() => import("@/components/views/GoalsView"), (m) => m.GoalsView),
  estimates: v(() => import("@/components/views/EstimatesView"), (m) => m.EstimatesView),
  settings: v(() => import("@/components/views/SettingsView"), (m) => m.SettingsView),
  "insights-overview": v(insights, (m) => m.OverviewPanel),
  "insights-strength": v(insights, (m) => m.StrengthPanel),
  "insights-heatmap": v(insights, (m) => m.HeatmapPanel),
  "nutrition-dash": v(views, (m) => () => <m.NutritionView initialSub="dash" />),
  "nutrition-week": v(views, (m) => () => <m.NutritionView initialSub="week" />),
  "nutrition-log": v(views, (m) => () => <m.NutritionView initialSub="log" />),
  "nutrition-weight": v(views, (m) => () => <m.NutritionView initialSub="weight" />),
  "mind-book": v(mind, (m) => () => <m.MindView initialKind="book" />),
  "mind-language": v(mind, (m) => () => <m.MindView initialKind="language" />),
  "mind-idea": v(mind, (m) => () => <m.MindView initialKind="idea" />),
  "mind-research": v(mind, (m) => () => <m.MindView initialKind="research" />),
};

/** What the widget store calls each page. */
export const PAGE_NAMES: Record<string, string> = {
  dashboard: "Home",
  time: "Time",
  body: "Body",
  workout: "Train",
  "money-dash": "Money · Dashboard",
  "money-tx": "Money · Transactions",
  "money-budgets": "Money · Budgets",
  "money-insights": "Money · Insights",
  "money-goals": "Money · Goals",
  "money-trade": "Money · Trading",
  looks: "Looks",
  habits: "Habits",
  projects: "Projects",
  "projects-goals": "Goals",
  estimates: "Ahead",
  settings: "Settings",
  "insights-overview": "Stats · Overview",
  "insights-strength": "Stats · Strength",
  "insights-heatmap": "Stats · Heatmap",
  "nutrition-dash": "Fuel · Today",
  "nutrition-week": "Fuel · Week",
  "nutrition-log": "Fuel · Log",
  "nutrition-weight": "Fuel · Weight",
  "mind-book": "Mind · Reading",
  "mind-language": "Mind · Language",
  "mind-idea": "Mind · Ideas",
  "mind-research": "Mind · Research",
};
