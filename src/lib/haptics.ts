/**
 * Haptics, where the platform allows them.
 *
 * iOS Safari and WKWebView expose no vibration API at all — navigator.vibrate
 * is absent, not merely ignored. The native build goes through the Capacitor
 * haptics plugin instead (below); the PWA on iPhone stays silent.
 *
 * Every call is guarded, because a missing API here must never break a set
 * being logged.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

type Pattern = number | number[];

const Tick = registerPlugin<{
  tick(o: { style: string; intensity?: number }): Promise<void>;
  prepare(): Promise<void>;
  diagnose(): Promise<Record<string, unknown>>;
}>("Tick");

/**
 * Which road to the Taptic Engine this phone actually plays, picked in
 * Settings from the vibration test. Every haptic in the app goes through it:
 *
 * - "tick"    — the app's own prepared UIFeedbackGenerator
 * - "plugin"  — the packaged Capacitor haptics plugin
 * - "system"  — Peek/Pop system sounds, straight to the Taptic Engine
 * - "core"    — Core Haptics, the games engine
 * - "vibrate" — the full classic vibration; too long for ticks, so only
 *               confirmations and alarms use it
 *
 * UIFeedbackGenerator (the first two) is muted by iOS when Settings ›
 * Sounds & Haptics › System Haptics is off; the others take other roads.
 */
export type TickWay = "tick" | "plugin" | "system" | "core" | "vibrate";
const WAYS: TickWay[] = ["tick", "plugin", "system", "core", "vibrate"];
const WAY_KEY = "soma.tickWay";
export function tickWay(): TickWay {
  try {
    const v = localStorage.getItem(WAY_KEY) as TickWay | null;
    return v && WAYS.includes(v) ? v : "core";
  } catch {
    return "core";
  }
}
export function setTickWay(way: TickWay): void {
  try {
    localStorage.setItem(WAY_KEY, way);
  } catch {
    /* private mode: the default stays */
  }
}

/** The kinds of feedback in the app, lightest first. */
type Feel = "tick" | "light" | "medium" | "success" | "warn" | "alarm";

const CORE_INTENSITY: Record<Feel, number> = {
  tick: 0.45, light: 0.6, medium: 0.85, success: 1, warn: 1, alarm: 1,
};

function playNative(feel: Feel, way: TickWay): void {
  const fail = () => {};
  switch (way) {
    case "plugin":
      if (feel === "success") void Haptics.notification({ type: NotificationType.Success }).catch(fail);
      else if (feel === "warn" || feel === "alarm") void Haptics.notification({ type: NotificationType.Warning }).catch(fail);
      else void Haptics.impact({ style: feel === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }).catch(fail);
      return;
    case "tick":
      void Tick.tick({ style: feel === "tick" ? "selection" : feel === "light" ? "light" : "medium" }).catch(fail);
      return;
    case "system":
      void Tick.tick({ style: feel === "tick" || feel === "light" ? "system" : "system-strong" }).catch(fail);
      return;
    case "core":
      void Tick.tick({ style: "core", intensity: CORE_INTENSITY[feel] }).catch(fail);
      return;
    case "vibrate":
      // A half-second buzz on every tick would be unbearable: only the
      // moments that are worth being interrupted for.
      if (feel === "medium" || feel === "success" || feel === "warn" || feel === "alarm") {
        void Tick.tick({ style: "vibrate" }).catch(fail);
      }
      return;
  }
}

function feel(kind: Feel, pattern: Pattern): void {
  try {
    if (Capacitor.getPlatform() === "ios") {
      playNative(kind, tickWay());
      return;
    }
    if (Capacitor.isNativePlatform()) {
      if (kind === "success") void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      else if (kind === "warn" || kind === "alarm") void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
      else void Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
      return;
    }
  } catch {
    /* fall through to the web */
  }
  buzz(pattern);
}

function buzz(pattern: Pattern): void {
  try {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === "function") nav.vibrate(pattern);
  } catch {
    /* haptics are a nicety; never let one break the action it accompanies */
  }
}

/** Selection: a tap that changed something. Deliberately very short. */
export const tapLight = () => feel("light", 8);

/** A detent: the tick of a picker wheel or carousel passing each value. */
export const tapTick = (): void => feel("tick", 4);

/** A set marked done, a habit ticked. */
export const tapMedium = () => feel("medium", 14);

/** A personal record. Felt as an event rather than a tap. */
export const tapSuccess = () => feel("success", [12, 40, 22]);

/** Something refused — a warning, not a punishment. */
export const tapWarn = () => feel("warn", [18, 60, 18]);

/**
 * Rest is over. Always the full vibration on the phone, whatever the chosen
 * way — a tap is easy to miss in a gym, and this is the one that must land —
 * plus the chosen way's own success feel.
 */
export const tapAlarm = (): void => {
  try {
    if (Capacitor.getPlatform() === "ios") {
      void Tick.tick({ style: "vibrate" }).catch(() => {});
      if (tickWay() !== "vibrate") playNative("alarm", tickWay());
      return;
    }
  } catch {
    /* fall through */
  }
  feel("alarm", [120, 60, 120]);
};

/**
 * For Settings: fire one road once and remember it, so the one that is felt
 * is the one the whole app uses from then on.
 */
export async function testHaptics(which: TickWay): Promise<string> {
  try {
    if (Capacitor.getPlatform() !== "ios") return "Only on the iPhone app";
    if (which === "plugin") await Haptics.impact({ style: ImpactStyle.Heavy });
    else if (which === "core") await Tick.tick({ style: "core", intensity: 1 });
    else if (which === "system") await Tick.tick({ style: "system-strong" });
    else if (which === "vibrate") await Tick.tick({ style: "vibrate" });
    else await Tick.tick({ style: "medium" });
    setTickWay(which);
    return `${WAY_NAMES[which]} sent — the whole app uses it now`;
  } catch (err) {
    return err instanceof Error ? `Failed: ${err.message}` : "Failed";
  }
}

export const WAY_NAMES: Record<TickWay, string> = {
  tick: "Tick", plugin: "Standard", system: "System", core: "Core", vibrate: "Vibrate",
};
export const ALL_WAYS = WAYS;

/** What the phone reports about haptics, as one readable line. */
export async function diagnoseHaptics(): Promise<string> {
  try {
    if (Capacitor.getPlatform() !== "ios") return "Only on the iPhone app";
    const d = await Tick.diagnose();
    const parts = [
      `iOS ${String(d.ios)}`,
      d.supportsHaptics ? "haptics hardware ✓" : "NO haptics hardware",
      d.lowPower ? "Low Power Mode ON" : "Low Power off",
      `audio: ${String(d.category).replace("AVAudioSessionCategory", "")}`,
      d.otherAudio ? "other audio playing" : "",
      d.engineError ? `engine: ${String(d.engineError)}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  } catch (err) {
    return err instanceof Error ? `Diagnose failed: ${err.message} (reinstall needed?)` : "Diagnose failed";
  }
}

/** Get the Taptic Engine ready before a run of ticks (a scrub starting). */
export const tickReady = (): void => {
  try {
    if (Capacitor.getPlatform() === "ios" && tickWay() === "tick") void Tick.prepare().catch(() => {});
  } catch {
    /* nothing to prepare off the phone */
  }
};

/**
 * Whether motion should be minimised.
 *
 * Checked at call time rather than cached: the setting can change while the
 * app is open, and a cached value would keep animating for someone who has
 * just asked it to stop.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
