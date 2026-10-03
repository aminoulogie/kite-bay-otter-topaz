import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The native Liquid Glass bars (ios/App/App/NativeChrome.swift).
 *
 * When they are up, the page hides its own header and dock and answers the
 * bars' taps instead. Everything here no-ops on a build without the plugin —
 * a live update lands on older installs too — and on the web.
 */
export interface ChromeState {
  tab: string;
  title: string;
  date: string;
  isToday: boolean;
  canEdit: boolean;
  editing: boolean;
  accent: string;
  theme: string;
  dockTransparency: number;
  dockScale: number;
}

export type ChromeAction =
  | { type: "tab"; tab: string }
  | { type: "habits" | "calendar" | "charts" | "edit" | "backup" }
  | { type: "date"; date: string }
  | { type: "step"; by: number }
  | { type: "insets"; top: number; bottom: number; safeTop?: number; safeBottom?: number }
  | { type: "habitsOpen"; open: boolean }
  | { type: "home"; op: "open"; id: string }
  | HabitAction;

/** What the native Habits panel asks the page to do. */
export type HabitAction = {
  type: "habit";
  op: "toggle" | "step" | "amount" | "add" | "preset" | "remove" | "color" | "note" | "unnote" | "autoOn" | "setup" | "photo" | "photos" | "tickDay";
  id?: string;
  stepId?: string;
  value?: number | null;
  name?: string;
  color?: string;
  text?: string;
  noteId?: string;
  date?: string;
};

interface NativeChromePlugin {
  ready(): Promise<{ active: boolean; habits?: boolean; home?: boolean }>;
  setHome(o: { json: string }): Promise<void>;
  setHabits(o: { json: string }): Promise<void>;
  openHabits(o: { open: boolean }): Promise<void>;
  setState(s: ChromeState): Promise<void>;
  setTabs(o: { tabs: { id: string; title: string; icon: string }[] }): Promise<void>;
  setHidden(o: { hidden: boolean }): Promise<void>;
  addListener(event: "action", cb: (a: ChromeAction) => void): Promise<PluginListenerHandle>;
}

const NativeChrome = registerPlugin<NativeChromePlugin>("NativeChrome");

export const chromeAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NativeChrome");

export async function chromeReady(): Promise<{ active: boolean; habits: boolean; home: boolean }> {
  if (!chromeAvailable()) return { active: false, habits: false, home: false };
  try {
    const r = await NativeChrome.ready();
    return { active: !!r.active, habits: !!r.habits, home: !!r.home };
  } catch {
    return { active: false, habits: false, home: false };
  }
}

let lastHome = "";
export function chromeSetHome(json: string): void {
  if (json === lastHome) return;
  lastHome = json;
  const probe = (window as unknown as { __somaHomeProbe?: (j: string) => void }).__somaHomeProbe;
  if (probe) probe(json);
  void NativeChrome.setHome({ json }).catch(() => {});
}

let lastHabits = "";
export function chromeSetHabits(json: string): void {
  if (json === lastHabits) return;
  lastHabits = json;
  void NativeChrome.setHabits({ json }).catch(() => {});
}

export function chromeOpenHabits(open: boolean): void {
  void NativeChrome.openHabits({ open }).catch(() => {});
}

export function chromeListen(cb: (a: ChromeAction) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let alive = true;
  void NativeChrome.addListener("action", cb).then((h) => {
    if (alive) handle = h;
    else void h.remove();
  });
  return () => {
    alive = false;
    void handle?.remove();
  };
}

let lastState = "";
export function chromeSetState(s: ChromeState): void {
  const key = JSON.stringify(s);
  if (key === lastState) return;
  lastState = key;
  void NativeChrome.setState(s).catch(() => {});
}

let lastHidden: boolean | null = null;
export function chromeSetHidden(hidden: boolean): void {
  if (hidden === lastHidden) return;
  lastHidden = hidden;
  void NativeChrome.setHidden({ hidden }).catch(() => {});
}

/**
 * Whether a web panel or sheet is covering the page, so the bars can fade
 * out from over it. Read off the DOM rather than tracked per component: any
 * full-screen overlay, dialog or side panel that is on screen counts.
 */
export function overlayOpen(): boolean {
  const els = document.querySelectorAll<HTMLElement>(
    '.fixed.inset-0, [role="dialog"], aside[aria-label="Habits"]',
  );
  const w = window.innerWidth;
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (Number(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40 || r.right <= 1 || r.left >= w - 1) continue;
    // A scrim that lets touches through is a closed drawer's, or one mid-drag;
    // a mid-drag panel is caught by its own rect above.
    if (cs.pointerEvents === "none" && el.tagName !== "ASIDE" && el.getAttribute("role") !== "dialog") continue;
    return true;
  }
  return false;
}

/** Watch the DOM and keep the bars' visibility in step with web overlays. */
export function watchOverlays(): () => void {
  let frame = 0;
  const check = () => {
    frame = 0;
    chromeSetHidden(overlayOpen());
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-hidden"],
  });
  schedule();
  return () => {
    mo.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

/** A lucide icon as a 66 px PNG (22 pt at 3x), black on clear, for the native dock to tint. */
export async function iconPng(Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>): Promise<string> {
  const svg = renderToStaticMarkup(createElement(Icon, { size: 66, strokeWidth: 2, color: "#000" }));
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 66;
  c.height = 66;
  c.getContext("2d")?.drawImage(img, 0, 0, 66, 66);
  return c.toDataURL("image/png");
}

/** Every tab, in dock order, with SOMA's own icons. */
export async function chromeSetTabs(
  tabs: { id: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }> }[],
): Promise<void> {
  const out = await Promise.all(
    tabs.map(async (t) => ({ id: t.id, title: t.label, icon: await iconPng(t.icon).catch(() => "") })),
  );
  await NativeChrome.setTabs({ tabs: out }).catch(() => {});
}
