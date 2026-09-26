/**
 * The lock screen and the Dynamic Island, reached from a web view.
 *
 * rest-alarm.ts is right that a Live Activity cannot be drawn from
 * JavaScript: it is a WidgetKit extension written in Swift. What JavaScript
 * CAN do is ask native code to start one, and that is all this file is — a
 * thin, typed door onto `SomaFocusPlugin` (ios/App/App/SomaFocusPlugin.swift),
 * a plugin that lives inside this app's own Xcode project rather than in
 * node_modules. It does two jobs:
 *
 *   1. The Live Activity: start, update, end. The countdown on the lock screen
 *      is drawn by the system from the step's end time, so this is called on
 *      meaningful changes (a new step, a pause, the end), never once a second.
 *   2. A scheduled local notification for "this step's time is up". That is
 *      the lock-screen alert for phones without Live Activities (anything
 *      before iOS 16.1, or with them switched off in Settings), and the thing
 *      the rest timer always said the native build would do.
 *
 * In a browser, or in a native build whose Xcode project does not yet
 * include the plugin, every call here is a quiet no-op that reports false.
 * Nothing pretends a Live Activity exists when it does not; the in-app runner
 * is the whole experience there.
 */

import { registerPlugin } from "@capacitor/core";
import { canSchedule } from "./rest-alarm.ts";
import type { LiveSnapshot } from "./focus.ts";

interface AlertOptions {
  id: string;
  /** Epoch ms. */
  at: number;
  title: string;
  body: string;
}

interface SomaFocusPlugin {
  isAvailable(): Promise<{ liveActivities: boolean; notifications: boolean }>;
  startOrUpdate(options: LiveSnapshot): Promise<{ active: boolean }>;
  end(options: { dismissAfterSeconds?: number }): Promise<void>;
  scheduleAlert(options: AlertOptions): Promise<{ scheduled: boolean }>;
  cancelAlert(options: { id: string }): Promise<void>;
}

const SomaFocus = registerPlugin<SomaFocusPlugin>("SomaFocus");

/**
 * Whether the native plugin is compiled into this build.
 *
 * Checked on every call rather than cached: it is a property lookup, and
 * caching a "no" from before the bridge was ready would switch the feature
 * off for the whole session.
 */
export function hasNativeFocus(): boolean {
  if (!canSchedule()) return false;
  const cap = (globalThis as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } }).Capacitor;
  return typeof cap?.isPluginAvailable === "function" && cap.isPluginAvailable("SomaFocus");
}

export async function liveAvailability(): Promise<{ liveActivities: boolean; notifications: boolean }> {
  if (!hasNativeFocus()) return { liveActivities: false, notifications: false };
  try {
    return await SomaFocus.isAvailable();
  } catch {
    return { liveActivities: false, notifications: false };
  }
}

/**
 * Start the Live Activity, or update the one already showing.
 *
 * One call for both on purpose. The system can end an activity on its own —
 * the user swipes it away, or it outlives the eight hours iOS allows — and
 * the app is not told. Sending every change through "start or update" means
 * the next change simply brings it back, with nothing to reconcile.
 */
export async function showLive(snapshot: LiveSnapshot): Promise<boolean> {
  if (!hasNativeFocus()) return false;
  try {
    const r = await SomaFocus.startOrUpdate(snapshot);
    return !!r?.active;
  } catch {
    return false;
  }
}

/** End it. A finished run lingers a few seconds so "All done" is seen. */
export async function endLive(dismissAfterSeconds = 0): Promise<void> {
  if (!hasNativeFocus()) return;
  try {
    await SomaFocus.end({ dismissAfterSeconds });
  } catch {
    /* nothing to end is not an error */
  }
}

/** A lock-screen notification at `at`, replacing any earlier one with this id. */
export async function scheduleAlert(options: AlertOptions): Promise<boolean> {
  if (!hasNativeFocus()) return false;
  if (!(options.at > Date.now())) return false;
  try {
    const r = await SomaFocus.scheduleAlert(options);
    return !!r?.scheduled;
  } catch {
    return false;
  }
}

export async function cancelAlert(id: string): Promise<void> {
  if (!hasNativeFocus()) return;
  try {
    await SomaFocus.cancelAlert({ id });
  } catch {
    /* already gone */
  }
}
