/**
 * The native Train page (NativeTrain.swift).
 *
 * WorkoutView stays the brain: it computes the targets, ratings and burn as
 * it always has, and when the native page is up it also publishes a snapshot
 * of the live session plus the functions that act on it. Native taps come
 * back as "train" actions and run those same functions, so set logging
 * behaves exactly as on the web page.
 */
import { chromeSetTrain } from "@/lib/native/chrome";

export type TrainHandler = (args: Record<string, unknown>) => void;

let handlers: Record<string, TrainHandler> = {};
let enabled = false;
let repaint: (() => void) | null = null;

/** The page on screen registers how to re-render itself, so turning the
 * native page on publishes straight away rather than at the next change. */
export function registerRepaint(fn: (() => void) | null): void {
  repaint = fn;
}

export function setNativeTrainEnabled(on: boolean): void {
  enabled = on;
  if (on) repaint?.();
}

export function nativeTrainEnabled(): boolean {
  return enabled;
}

/** Called by WorkoutView after each render; null when it is showing another screen. */
export function publishTrain(payload: object | null, next: Record<string, TrainHandler>): void {
  if (!enabled) return;
  handlers = next;
  chromeSetTrain(JSON.stringify(payload ?? { visible: false }));
}

export function runTrainAction(op: string, args: Record<string, unknown>): void {
  handlers[op]?.(args);
}

/** The rating colour as a hex the native side can use. */
export function toneHex(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 85) return "#34d399";
  if (score >= 72) return "#d3fd50";
  if (score >= 58) return "#38bdf8";
  if (score >= 42) return "#fbbf24";
  return "#fb923c";
}
