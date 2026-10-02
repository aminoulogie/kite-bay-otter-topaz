import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Apple Health, read-only, through the HealthPlugin in MainViewController.swift.
 *
 * iOS hides whether a read was refused: a refused type simply comes back
 * empty. So the honest states are "the permission sheet was offered" and
 * "here is what Health returned", never "access granted".
 */
export interface HealthDay {
  steps?: number;
  activeKcal?: number;
  sleepHours?: number;
  weightKg?: number;
  weightDate?: string;
  restingHR?: number;
  errors?: string[];
}

export interface HealthWrite {
  workouts: boolean;
  energy: boolean;
  sleep: boolean;
  weight: boolean;
}

type Saved = Promise<{ ok: boolean; error: string }>;

const Health = registerPlugin<{
  available(): Promise<{ available: boolean }>;
  connect(): Promise<{ ok: boolean; error: string }>;
  day(o: { date: string }): Promise<HealthDay>;
  canWrite(): Promise<HealthWrite>;
  saveWorkout(o: { id: string; start: number; end: number; kcal: number; title: string }): Saved;
  saveSleep(o: { id: string; start: number; end: number }): Saved;
  saveWeight(o: { id: string; at: number; kg: number }): Saved;
}>("Health");

export { Health as HealthNative };

/** Which writes Health allows. All false off the phone or on an old build. */
export async function healthCanWrite(): Promise<HealthWrite> {
  const none = { workouts: false, energy: false, sleep: false, weight: false };
  if (!onPhone()) return none;
  try {
    return await Health.canWrite();
  } catch {
    return none;
  }
}

const onPhone = () => Capacitor.getPlatform() === "ios";

export async function healthAvailable(): Promise<boolean> {
  if (!onPhone()) return false;
  try {
    return (await Health.available()).available;
  } catch {
    // An install without the plugin, or without the HealthKit entitlement.
    return false;
  }
}

export async function connectHealth(): Promise<string> {
  if (!onPhone()) return "Only on the iPhone app";
  try {
    const r = await Health.connect();
    if (r.ok) return "Asked. If no permission screen appeared, this install has no HealthKit access.";
    // The usual one on a sideloaded build: the signer dropped the entitlement.
    if (/entitlement/i.test(r.error)) return `HealthKit was removed when the app was signed (${r.error}).`;
    return `Not connected: ${r.error || "unknown"}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /not implemented|unimplemented/i.test(msg)
      ? "This install has no Health plugin — it is an older build."
      : `Failed: ${msg}`;
  }
}

export async function healthDay(date: string): Promise<HealthDay | null> {
  if (!onPhone()) return null;
  try {
    return await Health.day({ date });
  } catch {
    return null;
  }
}
