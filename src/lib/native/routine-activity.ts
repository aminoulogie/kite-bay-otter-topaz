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
  status(): Promise<{ extension: boolean; activitiesEnabled: boolean; notifications: boolean }>;
}>("RoutineActivity");

export interface LockScreenStatus {
  extension: boolean;
  activitiesEnabled: boolean;
  notifications: boolean;
}

/** Why the lock screen timer would or would not show, asked of the phone. */
export async function lockScreenStatus(): Promise<LockScreenStatus | null> {
  if (Capacitor.getPlatform() !== "ios") return null;
  try {
    return await RoutineActivity.status();
  } catch {
    return null;
  }
}

/** Set when the lock screen refused the routine, so the app can say why once. */
let told = false;
export let lastRefusal: string | null = null;

let last = "";

export async function showRoutineActivity(state: ActivityState | null): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") return;
  const key = state ? JSON.stringify(state) : "";
  if (key === last) return;
  last = key;
  try {
    if (state) {
      const r = await RoutineActivity.update(state);
      lastRefusal = r.live ? null : (r.reason ?? "Live Activities are unavailable");
      if (lastRefusal && !told) {
        told = true;
        const { toast } = await import("sonner");
        toast.error(`Lock screen timer: ${lastRefusal}`);
      }
    }
    else await RoutineActivity.end();
  } catch {
    // A build without the plugin: the routine still runs in the app.
  }
}
