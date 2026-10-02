import { Capacitor } from "@capacitor/core";
import { HealthNative, healthCanWrite, healthDay } from "@/lib/native/health";
import { planHealthSync } from "@/lib/health-sync-plan";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * Apple Health, both ways, while the app is open.
 *
 * Out: a saved workout, a night's sleep and a weigh-in go to Health (and so to
 * Fitness, whose history lists workouts from Health). In: today's sleep and
 * weight come from Health when SOMA has none, which is how a night the watch
 * recorded fills itself in.
 *
 * Only the last two weeks are ever sent, so connecting does not pour years of
 * old sessions into Health. Everything sent is remembered by signature in
 * settings.healthSynced; anything imported is recorded there too, so it is not
 * sent straight back.
 */
const WINDOW_DAYS = 14;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDateKey(d);
};

let running = false;

async function importFromHealth(): Promise<Record<string, string>> {
  const today = getLocalDateKey(new Date());
  const day = await healthDay(today);
  if (!day) return {};
  const s = useSoma.getState();
  const logged = s.nutrition[today];
  const marked: Record<string, string> = {};
  const patch: { sleep?: { hours: number }; bodyWeight?: number } = {};
  if (day.sleepHours && day.sleepHours > 1 && logged?.sleep?.hours == null) {
    const hours = Math.round(day.sleepHours * 10) / 10;
    patch.sleep = { hours };
    marked[`sleep:${today}`] = String(hours);
  }
  if (day.weightKg && day.weightDate === today && !logged?.bodyWeight) {
    const kg = Math.round(day.weightKg * 10) / 10;
    patch.bodyWeight = kg;
    marked[`weight:${today}`] = String(kg);
  }
  if (Object.keys(patch).length) {
    s.ensureDay(today);
    s.patchDay(today, patch);
  }
  return marked;
}

async function pushToHealth(): Promise<Record<string, string>> {
  const s = useSoma.getState();
  const items = planHealthSync({
    history: s.history,
    nutrition: s.nutrition,
    synced: s.settings.healthSynced ?? {},
    since: daysAgo(WINDOW_DAYS - 1),
  });
  if (!items.length) return {};
  const can = await healthCanWrite();
  const done: Record<string, string> = {};
  for (const it of items) {
    try {
      let r: { ok: boolean } | null = null;
      if (it.kind === "workout" && can.workouts) {
        r = await HealthNative.saveWorkout({ id: it.id, start: it.start, end: it.end, kcal: it.kcal, title: it.title });
      } else if (it.kind === "sleep" && can.sleep) {
        r = await HealthNative.saveSleep({ id: it.id, start: it.start, end: it.end });
      } else if (it.kind === "weight" && can.weight) {
        r = await HealthNative.saveWeight({ id: it.id, at: it.at, kg: it.kg });
      }
      if (r?.ok) done[it.key] = it.sig;
    } catch {
      /* one failed item never stops the rest */
    }
  }
  return done;
}

/** One pass: take in what Health has, then send what SOMA has. */
export async function syncHealthNow(): Promise<number> {
  if (running || Capacitor.getPlatform() !== "ios") return 0;
  running = true;
  try {
    const marked = { ...(await importFromHealth()), ...(await pushToHealth()) };
    const n = Object.keys(marked).length;
    if (n) {
      const s = useSoma.getState();
      s.patchSettings({ healthSynced: { ...(s.settings.healthSynced ?? {}), ...marked } });
    }
    return n;
  } finally {
    running = false;
  }
}

/** Installed once at the shell. Returns the teardown. */
export function startHealthSync(): () => void {
  if (Capacitor.getPlatform() !== "ios") return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const on = () => !!useSoma.getState().settings.healthSync;
  const schedule = (ms = 2500) => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncHealthNow().catch(() => {}), ms);
  };
  const unsub = useSoma.subscribe((now, prev) => {
    if (!now.settings.healthSync) return;
    if (now.history !== prev.history || now.nutrition !== prev.nutrition) schedule();
  });
  const onVisible = () => {
    if (document.visibilityState === "visible" && on()) schedule(500);
  };
  document.addEventListener("visibilitychange", onVisible);
  if (on()) schedule(1500);
  return () => {
    clearTimeout(timer);
    unsub();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
