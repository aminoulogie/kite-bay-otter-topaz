/**
 * The native Fuel page's core (NativeFuel.swift): today's totals, macros,
 * water, adding food and the diary. NutritionView publishes a snapshot and its
 * own functions, exactly as WorkoutView does for Train; the bridge merges it
 * with the other cards' glances. Taps come back as "fuel" actions.
 */
export type FuelHandler = (args: Record<string, unknown>) => void;

let handlers: Record<string, FuelHandler> = {};
let core: object | null = null;
let enabled = false;
let repaint: (() => void) | null = null;

/** The page on screen registers how to re-render itself, so turning the
 * native page on publishes straight away rather than at the next change. */
export function registerRepaint(fn: (() => void) | null): void {
  repaint = fn;
}
const listeners = new Set<() => void>();

export function setNativeFuelEnabled(on: boolean): void {
  enabled = on;
  if (on) repaint?.();
}

export function nativeFuelEnabled(): boolean {
  return enabled;
}

export function publishFuel(snapshot: object | null, next: Record<string, FuelHandler>): void {
  if (!enabled) return;
  handlers = next;
  core = snapshot;
  for (const l of listeners) l();
}

export function fuelCore(): object | null {
  return core;
}

export function onFuelCore(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function runFuelAction(op: string, args: Record<string, unknown>): void {
  handlers[op]?.(args);
}
