import { useEffect, useMemo, useState } from "react";
import { Check, Dumbbell, Moon, Pill, Scale, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { MoneySheet } from "@/components/money/money-ui";
import { parseDecimal } from "@/components/ui/decimal-input";
import { CHECKIN_FROM_HOUR, checkinFor, openCount } from "@/lib/checkin";
import { tapLight, tapMedium, tapSuccess } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import { healthDay } from "@/lib/native/health";
import { useSoma } from "@/lib/store";
import type { ScoreLine } from "@/lib/day-score";
import { cn } from "@/lib/utils";

/**
 * The evening check-in: everything still open about today, on one screen.
 *
 * Sleep, weight, creatine, the habits not yet ticked, the foods still grayed
 * out, and whether today's workout happened — each answered in a tap or two,
 * with the day's score at the bottom moving as they are. The things a day
 * ends half-logged without, and a half-logged day is a wrong score.
 */
function useCheckin(isTrainingDay: boolean) {
  const nutrition = useSoma((s) => s.nutrition);
  const habits = useSoma((s) => s.habits);
  const history = useSoma((s) => s.history);
  const restDays = useSoma((s) => s.restDays);
  const date = getLocalDateKey(new Date());
  return useMemo(
    () =>
      checkinFor({
        date,
        nutrition,
        habits,
        session: history[date],
        restSaved: !!restDays[date],
        isTrainingDay,
      }),
    [date, nutrition, habits, history, restDays, isTrainingDay],
  );
}

/** The moon button on Home: shown in the evening while something is open. */
export function CheckInButton({
  isTrainingDay, score, lines,
}: {
  isTrainingDay: boolean;
  score: number;
  lines: ScoreLine[];
}) {
  const state = useCheckin(isTrainingDay);
  const [open, setOpen] = useState(false);
  const activeDate = useSoma((s) => s.activeDate);
  const today = getLocalDateKey(new Date());
  const left = openCount(state);
  const evening = new Date().getHours() >= CHECKIN_FROM_HOUR;
  const show = (evening && left > 0 && (activeDate || today) === today) || open;
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-3xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-left active:scale-[0.99]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300">
          <Moon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-extrabold">Evening check-in</span>
          <span className="block text-xs text-muted">
            {left} {left === 1 ? "thing" : "things"} still open · about 20 seconds
          </span>
        </span>
        <span className="font-display text-lg font-extrabold tabular text-indigo-300">{score}</span>
      </button>
      {open && (
        <EveningCheckIn isTrainingDay={isTrainingDay} score={score} lines={lines} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function EveningCheckIn({
  isTrainingDay, score, lines, onClose,
}: {
  isTrainingDay: boolean;
  score: number;
  lines: ScoreLine[];
  onClose: () => void;
}) {
  const state = useCheckin(isTrainingDay);
  const nutrition = useSoma((s) => s.nutrition);
  const logSleep = useSoma((s) => s.logSleep);
  const logWeight = useSoma((s) => s.logWeight);
  const addCreatine = useSoma((s) => s.addCreatine);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const confirmPlanned = useSoma((s) => s.confirmPlanned);
  const removePlanned = useSoma((s) => s.removePlanned);
  const logRestDay = useSoma((s) => s.logRestDay);
  const setTab = useSoma((s) => s.setTab);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const today = getLocalDateKey(new Date());
  const day = nutrition[today];

  const [sleepDraft, setSleepDraft] = useState("");
  /** Last night as Apple Health recorded it, offered rather than copied in. */
  const [healthSleep, setHealthSleep] = useState<number | null>(null);
  const healthOn = useSoma((s) => !!s.settings.healthSync);
  useEffect(() => {
    if (!healthOn) return;
    let alive = true;
    void healthDay(today).then((d) => {
      if (alive && d?.sleepHours && d.sleepHours > 1) setHealthSleep(Math.round(d.sleepHours * 10) / 10);
    });
    return () => {
      alive = false;
    };
  }, [healthOn, today]);
  const [weightDraft, setWeightDraft] = useState("");

  // Every action below writes to the active date; make sure that is today.
  const onToday = () => {
    if (useSoma.getState().activeDate !== today) setActiveDate(today);
  };

  const saveSleep = (h: number) => {
    onToday();
    logSleep(h);
    tapLight();
  };
  const saveWeight = () => {
    const kg = parseDecimal(weightDraft);
    if (kg == null || kg <= 0) return;
    onToday();
    logWeight(kg);
    setWeightDraft("");
    tapLight();
  };

  const left = openCount(state);
  const missing = lines.filter((l) => l.earned === null).map((l) => l.label);

  return (
    <MoneySheet title="Evening check-in" onClose={onClose}>
      <div className="space-y-3">
        <Row icon={Moon} color="#5e5ce6" title="Sleep last night" done={!state.sleep}
          value={day?.sleep?.hours != null ? `${day.sleep.hours} h` : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {healthSleep != null && day?.sleep?.hours == null && (
              <Chip onClick={() => saveSleep(healthSleep)}>
                <span className="text-[#ff375f]">♥</span> {healthSleep}h from Apple Health
              </Chip>
            )}
            {[5, 6, 7, 7.5, 8, 9].map((h) => (
              <Chip key={h} onClick={() => saveSleep(h)}>{h}h</Chip>
            ))}
            <input
              inputMode="decimal"
              value={sleepDraft}
              onChange={(e) => setSleepDraft(e.target.value)}
              onKeyDown={(e) => {
                const h = parseDecimal(sleepDraft);
                if (e.key === "Enter" && h != null && h > 0) {
                  saveSleep(h);
                  setSleepDraft("");
                }
              }}
              placeholder="other"
              className="h-8 w-16 rounded-full border border-border bg-surface-2 px-2 text-center text-xs font-bold outline-none"
              aria-label="Hours slept"
            />
          </div>
        </Row>

        <Row icon={Scale} color="#64d2ff" title="Weight" hint="optional" done={!state.weight}
          value={day?.bodyWeight ? `${day.bodyWeight} kg` : undefined}>
          <div className="flex gap-1.5">
            <input
              inputMode="decimal"
              value={weightDraft}
              onChange={(e) => setWeightDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveWeight()}
              placeholder="kg"
              className="h-9 w-24 rounded-xl border border-border bg-surface-2 px-3 text-sm font-bold outline-none"
              aria-label="Weight in kg"
            />
            <Chip onClick={saveWeight}>Save</Chip>
          </div>
        </Row>

        <Row icon={Pill} color="#ff9f0a" title="Creatine" done={!state.creatine}
          value={day?.creatine ? `${day.creatine} g` : undefined}>
          <Chip onClick={() => { onToday(); addCreatine(5); tapLight(); }}>Took 5 g</Chip>
        </Row>

        <Row icon={Check} color="#30d158" title="Habits" done={state.habits.length === 0}
          value={state.habits.length === 0 ? "all done" : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {state.habits.map((h) => (
              <Chip
                key={h.id}
                onClick={() => {
                  onToday();
                  toggleHabit(h.id, today);
                  tapMedium();
                }}
              >
                <span className="size-2 rounded-full" style={{ background: h.color }} /> {h.name}
              </Chip>
            ))}
          </div>
        </Row>

        {state.planned > 0 && (
          <Row icon={Utensils} color="#ff375f" title="Food still grayed out" done={false}>
            <div className="space-y-1.5">
              {(day?.planned ?? []).map((it, idx) => (
                <div key={`${it.name}-${idx}`} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">
                    {it.name} <span className="font-normal text-faint">· {Math.round(it.cals)} kcal</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { confirmPlanned(idx, today); tapLight(); }}
                    className="rounded-full bg-accent px-2.5 py-1 text-[0.7rem] font-extrabold text-accent-ink"
                  >
                    Ate it
                  </button>
                  <button
                    type="button"
                    onClick={() => { removePlanned(idx, today); tapLight(); }}
                    aria-label={`Didn't eat ${it.name}`}
                    className="grid size-7 place-items-center rounded-full border border-border text-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Row>
        )}

        {state.workout && (
          <Row icon={Dumbbell} color="#bf5af2" title="Today was a training day" done={false}>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                onClick={() => {
                  onClose();
                  setTab("workout");
                }}
              >
                I trained — log it
              </Chip>
              <Chip onClick={() => { logRestDay(today, true); tapLight(); }}>I rested</Chip>
            </div>
          </Row>
        )}

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted">Today's score</span>
            <span className="font-display text-3xl font-extrabold tabular">{score}</span>
          </div>
          {missing.length > 0 && (
            <p className="mt-1 text-[0.7rem] text-faint">Not logged: {missing.join(", ")}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            tapSuccess();
            toast.success(left === 0 ? `Day closed — ${score}` : `Saved — ${left} still open`);
            onClose();
          }}
          className="h-12 w-full rounded-2xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.99]"
        >
          {left === 0 ? "Close the day" : "Done for now"}
        </button>
      </div>
    </MoneySheet>
  );
}

function Row({
  icon: Icon, color, title, hint, value, done, children,
}: {
  icon: typeof Moon;
  color: string;
  title: string;
  hint?: string;
  value?: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-3", done && "opacity-70")}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid size-8 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
          <Icon className="size-4" />
        </span>
        <span className="flex-1 text-sm font-bold">
          {title}
          {hint && <span className="ml-1.5 text-[0.65rem] font-normal text-faint">{hint}</span>}
        </span>
        {value && <span className="text-xs font-bold tabular text-muted">{value}</span>}
        {done && <Check className="size-4 text-accent" />}
      </div>
      {!done || title === "Weight" || title === "Sleep last night" ? children : null}
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-xs font-bold active:scale-95"
    >
      {children}
    </button>
  );
}
