import { useEffect, useState } from "react";
import { getLocalDateKey } from "@/lib/soma/dates";
import { loadDevices, thisDevice } from "./app";
import { outdatedDevices, type DeviceInfo } from "./side";

export const DEVICE_LABEL: Record<DeviceInfo["kind"], string> = { phone: "iPhone", desktop: "Windows app", browser: "Browser" };

/** The synced devices, and the ones running an older version than this one. */
export function useSyncDevices(): { me: DeviceInfo | null; devices: DeviceInfo[]; outdated: DeviceInfo[] } {
  const read = () => {
    const me = thisDevice();
    const devices = loadDevices();
    return { me, devices, outdated: me ? outdatedDevices(devices, me.id, me.schema, getLocalDateKey()) : [] };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("soma-sync-meta", on);
    return () => window.removeEventListener("soma-sync-meta", on);
  }, []);
  return v;
}
