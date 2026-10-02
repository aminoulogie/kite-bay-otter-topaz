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
  errors?: string[];
}

const Health = registerPlugin<{
  available(): Promise<{ available: boolean }>;
  connect(): Promise<{ ok: boolean; error: string }>;
  day(o: { date: string }): Promise<HealthDay>;
}>("Health");

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
