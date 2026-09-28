import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ActivityState } from "@/lib/routine-activity";

/**
 * The running routine on the lock screen and in the Dynamic Island
 * (ios/App/App/RoutineActivityPlugin.swift), plus the "time's up" alert at the
 * end of each step. Off the iOS build this does nothing.
 */
const RoutineActivity = registerPlugin<{
  update(s: ActivityState): Promise<{ ok: boolean; live: boolean; reason?: string }>;
  end(): Promise<void>;
}>("RoutineActivity");

let last = "";

export async function showRoutineActivity(state: ActivityState | null): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") return;
  const key = state ? JSON.stringify(state) : "";
  if (key === last) return;
  last = key;
  try {
    if (state) await RoutineActivity.update(state);
    else await RoutineActivity.end();
  } catch {
    // A build without the plugin: the routine still runs in the app.
  }
}
