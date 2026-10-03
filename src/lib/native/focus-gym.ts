import { Capacitor, registerPlugin } from "@capacitor/core";
import { toast } from "sonner";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * Deep Work Focus sessions and gym arrivals, recorded by the native side
 * while SOMA was closed (the Focus filter, the gym region) and taken here
 * when it opens.
 */
const Bridge = registerPlugin<{
  takeFocus(): Promise<{ sessions: { start: number; end: number }[]; activeSince?: number; gymArrivedAt?: number }>;
}>("WidgetBridge");

const Gym = registerPlugin<{
  setHere(): Promise<{ ok: boolean; lat?: number; lon?: number; always?: boolean; error?: string }>;
  clear(): Promise<{ ok: boolean }>;
  status(): Promise<{ set: boolean; always: boolean; lat?: number; lon?: number }>;
}>("Gym");

const onPhone = () => Capacitor.getPlatform() === "ios";

/** Minutes of a session, split at midnight so each day gets its own share. */
export function splitByDay(start: number, end: number): Record<string, number> {
  const out: Record<string, number> = {};
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(end, next);
    const key = getLocalDateKey(d);
    out[key] = (out[key] ?? 0) + (stop - t) / 60_000;
    t = stop;
  }
  return out;
}

export async function takeFocusAndGym(): Promise<void> {
  if (!onPhone()) return;
  let got: Awaited<ReturnType<typeof Bridge.takeFocus>>;
  try {
    got = await Bridge.takeFocus();
  } catch {
    return; // an older install
  }
  const s = useSoma.getState();
  const byDay = { ...(s.settings.focusByDay ?? {}) };
  for (const sess of got.sessions ?? []) {
    for (const [day, min] of Object.entries(splitByDay(sess.start, sess.end))) {
      byDay[day] = Math.round((byDay[day] ?? 0) + min);
    }
  }
  const patch: Record<string, unknown> = {};
  if ((got.sessions ?? []).length) patch.focusByDay = byDay;
  if ((got.activeSince ?? undefined) !== s.settings.focusActiveSince) patch.focusActiveSince = got.activeSince ?? undefined;
  if (Object.keys(patch).length) s.patchSettings(patch);

  // Arrived at the gym within the last three hours, and nothing lifted yet:
  // open Train on today's session.
  const at = got.gymArrivedAt;
  const today = getLocalDateKey(new Date());
  if (at && Date.now() - at < 3 * 3_600_000 && !s.history[today]) {
    s.setTab("workout");
    toast.success(`At the gym — ${s.live.split} is ready`);
  }
}

export function startFocusGym(): () => void {
  if (!onPhone()) return () => {};
  void takeFocusAndGym();
  const onVisible = () => {
    if (document.visibilityState === "visible") void takeFocusAndGym();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}

export async function setGymHere(): Promise<string> {
  if (!onPhone()) return "Only on the iPhone app";
  try {
    const r = await Gym.setHere();
    if (!r.ok) return r.error ?? "Could not get your location";
    return r.always
      ? "Gym saved — you'll get a nudge when you arrive"
      : "Gym saved. For arrivals while SOMA is closed, allow Location › Always (iOS will ask).";
  } catch (err) {
    return err instanceof Error ? `Failed: ${err.message}` : "Failed";
  }
}

export async function clearGym(): Promise<void> {
  if (onPhone()) await Gym.clear().catch(() => {});
}

export async function gymStatus(): Promise<{ set: boolean; always: boolean } | null> {
  if (!onPhone()) return null;
  try {
    return await Gym.status();
  } catch {
    return null;
  }
}
