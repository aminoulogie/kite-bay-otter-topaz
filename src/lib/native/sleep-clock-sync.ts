import { Capacitor, registerPlugin } from "@capacitor/core";
import { toast } from "sonner";
import { nightFrom, replayTaps, type Night, type Tap } from "@/lib/sleep-clock";
import { useSoma } from "@/lib/store";

/**
 * The sleep clock across the app and its widget.
 *
 * The app keeps the running night in settings.sleepStart; the widget keeps
 * its own copy in the shared container (WidgetBridgePlugin takeSleep /
 * setSleep). Taps made on the widget are taken when the app opens and
 * replayed here, and every tap made in the app is mirrored to the widget, so
 * the two never disagree about whether you are asleep.
 */
const Bridge = registerPlugin<{
  takeSleep(): Promise<{ events: Tap[]; asleepSince?: number }>;
  setSleep(o: { asleepSince?: number }): Promise<{ ok: boolean }>;
}>("WidgetBridge");

const onPhone = () => Capacitor.getPlatform() === "ios";

function mirror(asleepSince: number | undefined) {
  if (!onPhone()) return;
  void Bridge.setSleep(asleepSince != null ? { asleepSince } : {}).catch(() => {});
}

function logNight(n: Night) {
  const s = useSoma.getState();
  s.ensureDay(n.date);
  const prev = s.nutrition[n.date]?.sleep;
  s.patchDay(n.date, { sleep: { ...(prev ?? {}), hours: n.hours, start: n.start, end: n.end } });
}

export function goToSleep(): void {
  const now = Date.now();
  useSoma.getState().patchSettings({ sleepStart: now });
  mirror(now);
  toast("Good night — tap I'm up when you wake");
}

export function wakeUp(): void {
  const s = useSoma.getState();
  const start = s.settings.sleepStart;
  s.patchSettings({ sleepStart: undefined });
  mirror(undefined);
  if (start == null) return;
  const n = nightFrom(start, Date.now());
  if ("error" in n) {
    toast.error(n.error);
    return;
  }
  logNight(n);
  toast.success(`Slept ${n.hours} h — logged`);
}

/** Take what was tapped on the widget while the app was closed. */
export async function takeWidgetTaps(): Promise<void> {
  if (!onPhone()) return;
  let got: { events: Tap[]; asleepSince?: number };
  try {
    got = await Bridge.takeSleep();
  } catch {
    return; // an install without the sleep widget
  }
  const s = useSoma.getState();
  const r = replayTaps(s.settings.sleepStart, got.events ?? []);
  for (const n of r.nights) logNight(n);
  // The widget's own state wins when no taps explain it.
  const asleep = (got.events?.length ? r.asleepSince : got.asleepSince ?? s.settings.sleepStart) ?? undefined;
  if (asleep !== s.settings.sleepStart) s.patchSettings({ sleepStart: asleep });
  if (r.nights.length) {
    const last = r.nights[r.nights.length - 1]!;
    toast.success(`Slept ${last.hours} h — logged from the widget`);
  }
  for (const e of r.refused) toast.error(e);
}

export function startSleepClock(): () => void {
  if (!onPhone()) return () => {};
  void takeWidgetTaps();
  // The widget's state, in case the app tapped while it was out of step.
  mirror(useSoma.getState().settings.sleepStart);
  const onVisible = () => {
    if (document.visibilityState === "visible") void takeWidgetTaps();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}
