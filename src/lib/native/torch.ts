import { Capacitor, registerPlugin } from "@capacitor/core";

/** The back camera's LED, in Swift (ios/App/App/MainViewController.swift). */
const Torch = registerPlugin<{ set(o: { on: boolean }): Promise<{ ok: boolean; on: boolean }> }>("Torch");

/** False off the native iOS build, or when the phone refuses. */
export async function setNativeTorch(on: boolean): Promise<boolean> {
  if (Capacitor.getPlatform() !== "ios") return false;
  try {
    const r = await Torch.set({ on });
    return r.ok && r.on === on;
  } catch {
    return false;
  }
}
